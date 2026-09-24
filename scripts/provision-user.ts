// Sets a user's tenant and role: the custom claims on their Auth account (the
// truth the Security Rules and the Function read) and the readable mirror at
// tenants/{tenantId}/users/{uid}. Manual provisioning by the project owner (O11).
//
//   pnpm provision:user --email <address> --tenant <id> --role admin|user
//   pnpm provision:user --email <address> --tenant <id> --role admin --tenant-name "<name>"
//
// The account must have signed in at least once (Google sign-in creates it).
// --tenant-name creates the tenant document when it does not exist yet; the
// migration script creates it for the first tenant, so this is for later ones.
// After provisioning the user signs out and in, or presses Retry on the
// "No workspace yet" screen, to pick up the claims.
import { parseArgs } from 'node:util';
import { getAuth } from 'firebase-admin/auth';
import type { Tenant, TenantUser } from '../apps/web/src/data/types';
import { connect, defaultProjectId, fail } from './lib/admin';
import { tenantDocument } from './lib/v3-transform';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    tenant: { type: 'string' },
    role: { type: 'string' },
    'tenant-name': { type: 'string' },
    project: { type: 'string' },
  },
});

const { email, tenant: tenantId, role } = values;
if (!email || !tenantId || (role !== 'admin' && role !== 'user')) {
  fail('Pass --email <address> --tenant <id> --role admin|user.');
}
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
  fail('The tenant id is lowercase letters, digits and hyphens, 2 to 63 characters.');
}

const projectId = values.project ?? defaultProjectId();
const db = connect(projectId);

async function provision(): Promise<void> {
  const user = await getAuth().getUserByEmail(email!).catch(() => fail(`No Auth account for ${email}. The person must sign in to the app once first.`));

  const tenantRef = db.doc(`tenants/${tenantId}`);
  const tenantSnapshot = await tenantRef.get();
  const now = new Date().toISOString();
  if (!tenantSnapshot.exists) {
    if (!values['tenant-name']) fail(`Tenant "${tenantId}" does not exist. Run the migration for the first tenant, or pass --tenant-name "<name>" to create an empty one.`);
    const tenant: Tenant = tenantDocument(tenantId!, values['tenant-name'], [], now);
    await tenantRef.set(tenant);
    console.log(`Created tenant "${tenantId}" (${tenant.name}) with no allowed datasets yet.`);
  }

  const previous = (user.customClaims ?? {}) as { tenantId?: string; role?: string };
  if (previous.tenantId && previous.tenantId !== tenantId) {
    console.log(`Note: ${email} was in tenant "${previous.tenantId}"; a user has one tenant, so that membership is replaced.`);
  }
  await getAuth().setCustomUserClaims(user.uid, { tenantId, role });

  const mirror: TenantUser = { uid: user.uid, email: user.email ?? null, role: role as TenantUser['role'], updatedAt: now };
  await db.doc(`tenants/${tenantId}/users/${user.uid}`).set(mirror);

  console.log(`${email} (${user.uid}) is now ${role} in tenant "${tenantId}". They must sign out and in, or press Retry, to pick up the claims.`);
}

provision().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
