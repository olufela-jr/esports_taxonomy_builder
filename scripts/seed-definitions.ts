// Writes demonstration shared definitions into a tenant's Dictionary (v3
// phase 2), so the live workspace has values to illustrate the repository
// before the client's own conventions are entered. Skips any definition whose
// id already exists, so it can be rerun safely and never overwrites an edit.
//
//   pnpm seed:definitions --tenant esports --as misterfela@gmail.com [--dry-run]
//
// --as names the admin recorded as creator; the account must exist in Auth.
import { parseArgs } from 'node:util';
import { getAuth } from 'firebase-admin/auth';
import { checkDefinition, type Definition as EngineDefinition } from '@taxo/shared';
import type { Definition } from '../apps/web/src/data/types';
import { connect, defaultProjectId, fail } from './lib/admin';

const demo: EngineDefinition[] = [
  { id: 'demo-market', name: 'Market', platforms: [], entries: [
    { label: 'United Kingdom', code: 'uk' }, { label: 'United States', code: 'us' }, { label: 'Germany', code: 'de' }, { label: 'France', code: 'fr' },
  ] },
  { id: 'demo-objective', name: 'Campaign objective', platforms: [], entries: [
    { label: 'Awareness', code: 'AWA' }, { label: 'Consideration', code: 'CON' }, { label: 'Conversion', code: 'CNV' },
  ] },
  { id: 'demo-funnel', name: 'Funnel stage', platforms: ['meta', 'tiktok', 'snapchat'], entries: [
    { label: 'Top of funnel', code: 'tof' }, { label: 'Mid funnel', code: 'mof' }, { label: 'Bottom of funnel', code: 'bof' },
  ] },
  { id: 'demo-match-type', name: 'Match type', platforms: ['google'], entries: [
    { label: 'Broad', code: 'brd' }, { label: 'Phrase', code: 'phr' }, { label: 'Exact', code: 'exa' },
  ] },
];

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

for (const definition of demo) {
  const errors = checkDefinition(definition);
  if (errors.length > 0) fail(`Demo definition "${definition.name}" is invalid: ${errors.join(' ')}`);
}

const projectId = values.project ?? defaultProjectId();
const db = connect(projectId);

async function seed(): Promise<void> {
  const tenantRef = db.doc(`tenants/${tenantId}`);
  if (!(await tenantRef.get()).exists) fail(`Tenant "${tenantId}" does not exist.`);
  const admin = await getAuth().getUserByEmail(email!).catch(() => fail(`No Auth account for ${email}.`));
  const now = new Date().toISOString();

  for (const definition of demo) {
    const ref = db.doc(`tenants/${tenantId}/definitions/${definition.id}`);
    if ((await ref.get()).exists) {
      console.log(`Skip "${definition.name}" (${definition.id}): already exists.`);
      continue;
    }
    const document: Definition = { ...definition, createdBy: admin.uid, updatedBy: admin.uid, createdAt: now, updatedAt: now };
    if (values['dry-run']) {
      console.log(`Would write "${definition.name}" (${definition.id}): ${definition.entries.length} values, platforms [${definition.platforms.join(', ') || 'all'}].`);
      continue;
    }
    await ref.set(document);
    console.log(`Wrote "${definition.name}" (${definition.id}): ${definition.entries.length} values, platforms [${definition.platforms.join(', ') || 'all'}].`);
  }
}

seed().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
