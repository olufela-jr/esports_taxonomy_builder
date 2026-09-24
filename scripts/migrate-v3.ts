// One-off migration of the pre-v3 /rulesets collection into a single first
// tenant (spec v3, O15). Idempotent: rerunning writes the same documents.
//
//   pnpm migrate:v3 --tenant <id> --name "<display name>" --dry-run
//   pnpm migrate:v3 --tenant <id> --name "<display name>"
//   pnpm migrate:v3 --tenant <id> --delete-legacy      (a later, explicit step)
//
// Every run first writes a JSON backup of /rulesets to backups/. The legacy
// collection is left in place (the v3 Security Rules deny all access to it)
// until --delete-legacy, which refuses to delete anything not present under
// the tenant.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Firestore } from 'firebase-admin/firestore';
import type { RuleSet, Tenant } from '../apps/web/src/data/types';
import { connect, defaultProjectId, fail } from './lib/admin';
import { collectDatasets, tenantDocument, transformRuleSet, verifyRuleSet, type LegacyRuleSet } from './lib/v3-transform';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string' },
    name: { type: 'string' },
    project: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'delete-legacy': { type: 'boolean', default: false },
  },
});

const tenantId = values.tenant;
if (!tenantId || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
  fail('Pass --tenant <id>: lowercase letters, digits and hyphens, 2 to 63 characters.');
}

const projectId = values.project ?? defaultProjectId();
const db = connect(projectId);
console.log(`Project ${projectId}, tenant "${tenantId}"${values['dry-run'] ? ' (dry run, nothing written)' : ''}.`);

async function readLegacy(): Promise<LegacyRuleSet[]> {
  const snapshot = await db.collection('rulesets').get();
  return snapshot.docs.map((item) => item.data() as LegacyRuleSet);
}

function backup(ruleSets: LegacyRuleSet[]): string {
  mkdirSync('backups', { recursive: true });
  const file = `backups/rulesets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(ruleSets, null, 2));
  return file;
}

async function readTenant(): Promise<Tenant | undefined> {
  const snapshot = await db.doc(`tenants/${tenantId}`).get();
  return snapshot.exists ? (snapshot.data() as Tenant) : undefined;
}

async function migrate(): Promise<void> {
  const legacy = await readLegacy();
  console.log(`Read ${legacy.length} Rule Set(s) from /rulesets; backup at ${backup(legacy)}.`);
  if (legacy.length === 0) fail('Nothing to migrate.');

  const existing = await readTenant();
  const name = values.name ?? existing?.name;
  if (!name) fail(`Tenant "${tenantId}" does not exist yet: pass --name "<display name>" to create it.`);

  // Transform and verify before anything is written.
  const migrated = legacy.map(transformRuleSet);
  let problems = 0;
  for (const ruleSet of migrated) {
    const issues = verifyRuleSet(ruleSet);
    const entries = ruleSet.rules.flatMap((rule) => rule.segments).filter((segment) => segment.kind === 'enum').reduce((sum, segment) => sum + (segment.kind === 'enum' ? segment.allowedValues.length : 0), 0);
    console.log(`  ${ruleSet.id}  "${ruleSet.name}"  ${ruleSet.rules.length} Rule(s), ${entries} enum entr${entries === 1 ? 'y' : 'ies'}, createdBy ${ruleSet.createdBy}${issues.length ? `  ISSUES: ${issues.join(' ')}` : ''}`);
    problems += issues.length;
  }
  if (problems > 0) fail(`${problems} issue(s) found; nothing written. Fix the source documents or the transform first.`);

  const now = new Date().toISOString();
  const allowedDatasets = [...new Set([...(existing?.config.allowedDatasets ?? []), ...collectDatasets(migrated)])].sort();
  const tenant: Tenant = existing
    ? { ...existing, name, config: { ...existing.config, allowedDatasets }, updatedAt: now }
    : tenantDocument(tenantId!, name, allowedDatasets, now);
  console.log(`Tenant document: name "${tenant.name}", allowedDatasets [${allowedDatasets.join(', ')}]${existing ? ' (existing, updated)' : ' (new)'}.`);

  if (values['dry-run']) {
    console.log('Dry run complete.');
    return;
  }

  await writeAll(db, tenant, migrated);
  await verifyWritten(migrated.length);
}

async function writeAll(store: Firestore, tenant: Tenant, ruleSets: RuleSet[]): Promise<void> {
  // Firestore batches take up to 500 writes; one tenant plus its Rule Sets is far below that.
  let batch = store.batch();
  let pending = 0;
  const flush = async () => { await batch.commit(); batch = store.batch(); pending = 0; };

  batch.set(store.doc(`tenants/${tenantId}`), tenant);
  pending += 1;
  for (const ruleSet of ruleSets) {
    batch.set(store.doc(`tenants/${tenantId}/rulesets/${ruleSet.id}`), ruleSet);
    pending += 1;
    if (pending >= 400) await flush();
  }
  if (pending > 0) await flush();
  console.log(`Wrote the tenant document and ${ruleSets.length} Rule Set(s) under tenants/${tenantId}/rulesets.`);
}

async function verifyWritten(expected: number): Promise<void> {
  const snapshot = await db.collection(`tenants/${tenantId}/rulesets`).get();
  const stored = snapshot.docs.map((item) => item.data() as RuleSet);
  let problems = 0;
  for (const ruleSet of stored) {
    const issues = verifyRuleSet(ruleSet);
    if (issues.length) {
      problems += issues.length;
      console.log(`  ${ruleSet.id}: ${issues.join(' ')}`);
    }
  }
  if (stored.length < expected) fail(`Verification: expected at least ${expected} Rule Set(s) under the tenant, found ${stored.length}.`);
  if (problems > 0) fail(`Verification: ${problems} issue(s) in the stored documents.`);
  console.log(`Verified ${stored.length} Rule Set(s) under the tenant: every enum value is a label/code entry and every document passes checkRuleSet.`);
  console.log('Next: provision the first admin (pnpm provision:user), deploy the rules and hosting, then sign out and in.');
}

async function deleteLegacy(): Promise<void> {
  const legacy = await readLegacy();
  console.log(`Read ${legacy.length} Rule Set(s) from /rulesets; backup at ${backup(legacy)}.`);
  const tenantSnapshot = await db.collection(`tenants/${tenantId}/rulesets`).get();
  const migratedIds = new Set(tenantSnapshot.docs.map((item) => item.id));
  const missing = legacy.filter((ruleSet) => !migratedIds.has(ruleSet.id)).map((ruleSet) => ruleSet.id);
  if (missing.length > 0) fail(`Refusing to delete: ${missing.length} legacy Rule Set(s) are not under tenants/${tenantId}/rulesets: ${missing.join(', ')}.`);
  if (values['dry-run']) {
    console.log(`Dry run: would delete ${legacy.length} document(s) from /rulesets.`);
    return;
  }
  const batch = db.batch();
  for (const ruleSet of legacy) batch.delete(db.doc(`rulesets/${ruleSet.id}`));
  await batch.commit();
  console.log(`Deleted ${legacy.length} document(s) from /rulesets.`);
}

(values['delete-legacy'] ? deleteLegacy() : migrate()).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
