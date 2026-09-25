// Callable Cloud Functions (Stage 2, v3 phase 4). Every call runs the tenant
// guard first: the tenant comes from the token claims, the Rule Set from the
// caller's own tenant path, the dataset must be whitelisted in the tenant
// config, and a Rule is resolved (parents and shared definitions) before any
// name is judged. BigQuery is read-only, in this same project, with a bytes
// cap on every query.
import { BigQuery } from '@google-cloud/bigquery';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { definitionDependents, resolveRule, type Definition, type EnumEntry, type Rule, type RuleSet } from '@taxo/shared';
import { buildScanQuery, evaluateNames, impactOf, MAX_BYTES_BILLED, type NameReader } from './scan';
import { assertDatasetAllowed, readTenantConfig, tenantFromAuth, type TenantConfig } from './tenant';

initializeApp();

// The GCP project this Function runs in is where BigQuery lives (O2).
function projectId(): string {
  const id = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!id) throw new HttpsError('internal', 'The project id is not set.');
  return id;
}

function bigQueryReader(project: string): NameReader {
  const client = new BigQuery({ projectId: project });
  return {
    async distinctNames(scan) {
      const [rows] = await client.query({ query: scan.query, params: scan.params, maximumBytesBilled: String(MAX_BYTES_BILLED) });
      return (rows as Array<{ name: unknown }>).map((row) => String(row.name));
    },
  };
}

async function loadDefinitions(db: Firestore, tenantId: string): Promise<Definition[]> {
  const docs = await db.collection(`tenants/${tenantId}/definitions`).get();
  return docs.docs.map((item) => item.data() as Definition);
}

type ScanRequest = {
  ruleSetId: string;
  ruleId: string;
};

function parseScanRequest(data: unknown): ScanRequest {
  const candidate = (data ?? {}) as Partial<ScanRequest>;
  if (typeof candidate.ruleSetId !== 'string' || typeof candidate.ruleId !== 'string') {
    throw new HttpsError('invalid-argument', 'ruleSetId and ruleId are required.');
  }
  return { ruleSetId: candidate.ruleSetId, ruleId: candidate.ruleId };
}

// Same region as the Firestore database.
export const scanCampaigns = onCall({ region: 'asia-south1' }, async (request) => {
  // The tenant comes from the token, never from the body.
  const caller = tenantFromAuth(request.auth);
  const { ruleSetId, ruleId } = parseScanRequest(request.data);

  const db = getFirestore();
  const snapshot = await db.doc(`tenants/${caller.tenantId}/rulesets/${ruleSetId}`).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'That Rule Set is not in your workspace.');
  }
  const ruleSet = snapshot.data() as RuleSet;
  const rule = ruleSet.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new HttpsError('not-found', 'That Rule is not in the Rule Set.');
  }

  const config = await readTenantConfig(db, caller.tenantId);
  assertDatasetAllowed(config, rule.source.dataset);

  // A stored Rule is never validated directly: parent links and shared
  // definitions are resolved first, in one call (D46), from the tenant's own
  // definitions collection.
  const resolved = resolveRule(rule, ruleSet, await loadDefinitions(db, caller.tenantId));
  if (resolved.errors.length > 0) {
    throw new HttpsError('failed-precondition', resolved.errors.join(' '));
  }

  const project = projectId();
  const names = await bigQueryReader(project).distinctNames(buildScanQuery(project, rule.source));
  return { ruleId: rule.id, ...evaluateNames(resolved.rule, names) };
});

type ImpactRequest = {
  definitionId: string;
  entries: EnumEntry[];
};

function parseImpactRequest(data: unknown): ImpactRequest {
  const candidate = (data ?? {}) as Partial<ImpactRequest>;
  if (typeof candidate.definitionId !== 'string' || !Array.isArray(candidate.entries)) {
    throw new HttpsError('invalid-argument', 'definitionId and entries are required.');
  }
  const entries = candidate.entries.filter((entry): entry is EnumEntry => Boolean(entry) && typeof entry.label === 'string' && typeof entry.code === 'string');
  return { definitionId: candidate.definitionId, entries };
}

// D44: before an admin saves a change to a shared definition's codes, count
// the live names that pass today and would fail afterwards, per Rule that
// reads the definition. Synchronous with the Function's timeout (O16).
export const previewImpact = onCall({ region: 'asia-south1', timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const caller = tenantFromAuth(request.auth);
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only a workspace admin can preview a definition change.');
  }
  const { definitionId, entries } = parseImpactRequest(request.data);

  const db = getFirestore();
  const definitions = await loadDefinitions(db, caller.tenantId);
  const current = definitions.find((definition) => definition.id === definitionId);
  if (!current) {
    throw new HttpsError('not-found', 'That definition is not in your workspace.');
  }
  const proposedDefinitions = definitions.map((definition) => (definition.id === definitionId ? { ...definition, entries } : definition));
  const ruleSetDocs = await db.collection(`tenants/${caller.tenantId}/rulesets`).get();
  const ruleSets = ruleSetDocs.docs.map((item) => item.data() as RuleSet);
  const config: TenantConfig | undefined = await readTenantConfig(db, caller.tenantId);
  const project = projectId();
  const reader = bigQueryReader(project);

  const perRule: Array<{ ruleSetName: string; ruleName: string; scanned: number; wouldFail: number; examples: string[] }> = [];
  const skipped: Array<{ ruleName: string; reason: string }> = [];
  let total = 0;
  for (const dependent of definitionDependents(ruleSets, definitionId)) {
    const ruleSet = ruleSets.find((item) => item.id === dependent.ruleSetId);
    const rule: Rule | undefined = ruleSet?.rules.find((item) => item.id === dependent.ruleId);
    if (!ruleSet || !rule) continue;
    const currentResolved = resolveRule(rule, ruleSet, definitions);
    const proposedResolved = resolveRule(rule, ruleSet, proposedDefinitions);
    if (currentResolved.errors.length > 0 || proposedResolved.errors.length > 0) {
      skipped.push({ ruleName: rule.name, reason: [...currentResolved.errors, ...proposedResolved.errors][0] });
      continue;
    }
    try {
      assertDatasetAllowed(config, rule.source.dataset);
      const names = await reader.distinctNames(buildScanQuery(project, rule.source));
      const impact = impactOf(currentResolved.rule, proposedResolved.rule, names);
      perRule.push({ ruleSetName: ruleSet.name, ruleName: rule.name, ...impact });
      total += impact.wouldFail;
    } catch (cause) {
      skipped.push({ ruleName: rule.name, reason: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return { definitionId, total, perRule, skipped };
});
