// Writes the demonstration Rule Set "Paid search (demo)" into a tenant, so the
// hierarchy, the definition-backed segments, the tracking URLs and both Check
// paths can be walked through end to end (`scripts/demo/paid-search.ts` holds
// the data and its test holds the expected numbers). Writes the "Game title"
// definition first if the tenant lacks it, then checks the Rule Set against the
// tenant's live definitions and refuses on any issue. Skips a Rule Set whose id
// already exists, so it can be rerun safely and never overwrites an edit.
//
//   pnpm seed:ruleset --tenant esports --as misterfela@gmail.com [--dry-run]
//
// --as names the admin recorded as creator; the account must exist in Auth.
import { parseArgs } from 'node:util';
import { getAuth } from 'firebase-admin/auth';
import { checkDefinition, checkRuleSetIssues, type Definition as EngineDefinition } from '@taxo/shared';
import type { Definition, RuleSet } from '../apps/web/src/data/types';
import { demoGame } from './demo/definitions';
import { paidSearchRuleSet } from './demo/paid-search';
import { connect, defaultProjectId, fail } from './lib/admin';

const { values } = parseArgs({
  options: {
    tenant: { type: 'string' },
    as: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    project: { type: 'string' },
  },
});

const { tenant: tenantId, as: email } = values;
if (!tenantId || !email) fail('Pass --tenant <id> --as <admin email>.');

const gameErrors = checkDefinition(demoGame);
if (gameErrors.length > 0) fail(`Demo definition "${demoGame.name}" is invalid: ${gameErrors.join(' ')}`);

const projectId = values.project ?? defaultProjectId();
const db = connect(projectId);
const dryRun = values['dry-run'];

function engineDefinition(document: Definition): EngineDefinition {
  return { id: document.id, name: document.name, platforms: document.platforms, entries: document.entries };
}

async function seed(): Promise<void> {
  const tenantRef = db.doc(`tenants/${tenantId}`);
  if (!(await tenantRef.get()).exists) fail(`Tenant "${tenantId}" does not exist.`);
  const admin = await getAuth().getUserByEmail(email!).catch(() => fail(`No Auth account for ${email}.`));
  const now = new Date().toISOString();
  const audit = { createdBy: admin.uid, updatedBy: admin.uid, createdAt: now, updatedAt: now };

  const definitionDocs = await db.collection(`tenants/${tenantId}/definitions`).get();
  const definitions = definitionDocs.docs.map((item) => engineDefinition(item.data() as Definition));

  if (definitions.some((definition) => definition.id === demoGame.id)) {
    console.log(`Skip "${demoGame.name}" (${demoGame.id}): already exists.`);
  } else {
    const document: Definition = { ...demoGame, ...audit };
    if (dryRun) {
      console.log(`Would write "${demoGame.name}" (${demoGame.id}): ${demoGame.entries.length} values.`);
    } else {
      await db.doc(`tenants/${tenantId}/definitions/${demoGame.id}`).set(document);
      console.log(`Wrote "${demoGame.name}" (${demoGame.id}): ${demoGame.entries.length} values.`);
    }
    definitions.push(demoGame);
  }

  const issues = checkRuleSetIssues(paidSearchRuleSet, definitions);
  const lines = [
    ...issues.ruleSet,
    ...Object.entries(issues.rules).flatMap(([ruleId, messages]) => messages.map((message) => `${ruleId}: ${message}`)),
  ];
  if (lines.length > 0) fail(`The demo Rule Set has issues against this tenant's definitions:\n  ${lines.join('\n  ')}`);

  const ref = db.doc(`tenants/${tenantId}/rulesets/${paidSearchRuleSet.id}`);
  if ((await ref.get()).exists) {
    console.log(`Skip "${paidSearchRuleSet.name}" (${paidSearchRuleSet.id}): already exists.`);
    return;
  }
  const document: RuleSet = { ...paidSearchRuleSet, ...audit };
  const summary = `"${paidSearchRuleSet.name}" (${paidSearchRuleSet.id}): ${paidSearchRuleSet.rules.length} Rules, ${paidSearchRuleSet.rules.map((rule) => rule.name).join(' and ')}.`;
  if (dryRun) {
    console.log(`Would write ${summary}`);
    return;
  }
  await ref.set(document);
  console.log(`Wrote ${summary}`);
}

seed().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
