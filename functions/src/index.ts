// Callable Cloud Functions. Stage 2 fills in the BigQuery scan; in v3 phase 1
// scanCampaigns runs the tenant guard end to end (token claims, the Rule Set
// under the caller's tenant, the dataset whitelist, resolveRule) and then
// stops with `unimplemented`, so the guard is deployable and testable before
// any data is read.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { resolveRule, type RuleSet } from '@taxo/shared';
import { assertDatasetAllowed, readTenantConfig, tenantFromAuth } from './tenant';

initializeApp();

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

  // A stored child Rule is never validated directly (spec: Stage 2 scan).
  const resolved = resolveRule(rule, ruleSet);
  if (resolved.errors.length > 0) {
    throw new HttpsError('failed-precondition', resolved.errors.join(' '));
  }

  throw new HttpsError('unimplemented', 'The BigQuery scan arrives in Stage 2. The workspace and dataset checks passed.');
});
