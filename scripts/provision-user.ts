// Sets a user's tenant and role: the custom claims on their Auth account (the
// truth the Security Rules and the Function read) and the readable mirror at
// tenants/{tenantId}/users/{uid}. Manual provisioning by the project owner (O11).
//
//   pnpm provision:user --email <address> --tenant <id> --role admin|user
//   pnpm provision:user --email <address> --tenant <id> --role admin --tenant-name "<name>"
//   pnpm provision:user --email <address> --tenant <id> --role admin --platforms google,meta
//   pnpm provision:user --email <address> --superuser            (grant; tenant claims untouched)
//   pnpm provision:user --email <address> --revoke-superuser
//
// The super user is a separate claim: it reads every tenant, creates tenants
// and invites their first admin from the Tenants screen; it writes inside a
// tenant only where it also holds the admin role. Grant it to the operator
// only.
//
// --platforms sets the tenant's platform list (the ids in PLATFORMS from
// @taxo/shared; v3 D38), replacing whatever the tenant document holds. Phase 2
// scopes shared definitions by it. Without the flag the list is left as it is.
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
import { parsePlatforms, tenantDocument } from './lib/v3-transform';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    tenant: { type: 'string' },
    role: { type: 'string' },
    'tenant-name': { type: 'string' },
    platforms: { type: 'string' },
    project: { type: 'string' },
    superuser: { type: 'boolean', default: false },
    'revoke-superuser': { type: 'boolean', default: false },
  },
});

const { email, tenant: tenantId, role } = values;
const superOnly = (values.superuser || values['revoke-superuser']) && !tenantId && !role;
if (!email || (!superOnly && (!tenantId || (role !== 'admin' && role !== 'user')))) {
  fail('Pass --email <address> --tenant <id> --role admin|user, or --email <address> --superuser | --revoke-superuser.');
}
if (tenantId && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) {
  fail('The tenant id is lowercase letters, digits and hyphens, 2 to 63 characters.');
}

let platforms: string[] | undefined;
try {
  platforms = values.platforms === undefined ? undefined : parsePlatforms(values.platforms);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const projectId = values.project ?? defaultProjectId();
const db = connect(projectId);

// Grants or revokes the superuser claim, leaving the tenant claims as they are.
async function toggleSuperuser(): Promise<void> {
  const user = await getAuth().getUserByEmail(email!).catch(() => fail(`No Auth account for ${email}. The person must sign in to the app once first.`));
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (values.superuser) claims.superuser = true; else delete claims.superuser;
  await getAuth().setCustomUserClaims(user.uid, claims);
  console.log(`${email} (${user.uid}) ${values.superuser ? 'is now the super user' : 'is no longer a super user'}; tenant claims unchanged. They sign out and in to pick it up.`);
}

async function provision(): Promise<void> {
  if (superOnly) return toggleSuperuser();
  const user = await getAuth().getUserByEmail(email!).catch(() => fail(`No Auth account for ${email}. The person must sign in to the app once first.`));

  const tenantRef = db.doc(`tenants/${tenantId}`);
  const tenantSnapshot = await tenantRef.get();
  const now = new Date().toISOString();
  if (!tenantSnapshot.exists) {
    if (!values['tenant-name']) fail(`Tenant "${tenantId}" does not exist. Run the migration for the first tenant, or pass --tenant-name "<name>" to create an empty one.`);
    const tenant: Tenant = tenantDocument(tenantId!, values['tenant-name'], [], now, platforms ?? []);
    await tenantRef.set(tenant);
    console.log(`Created tenant "${tenantId}" (${tenant.name}) with no allowed datasets yet; platforms [${tenant.config.platforms.join(', ')}].`);
  } else if (platforms) {
    const current = tenantSnapshot.data() as Tenant;
    await tenantRef.set({ ...current, config: { ...current.config, platforms }, updatedAt: now });
    console.log(`Tenant "${tenantId}" platforms set to [${platforms.join(', ')}].`);
  }

  const previous = (user.customClaims ?? {}) as { tenantId?: string; role?: string };
  if (previous.tenantId && previous.tenantId !== tenantId) {
    console.log(`Note: ${email} was in tenant "${previous.tenantId}"; a user has one tenant, so that membership is replaced.`);
  }
  // Tenant claims are replaced; a superuser claim, if any, is kept (or set with --superuser).
  const keep = (user.customClaims ?? {}) as Record<string, unknown>;
  const superuser = values['revoke-superuser'] ? false : values.superuser || keep.superuser === true;
  await getAuth().setCustomUserClaims(user.uid, superuser ? { tenantId, role, superuser: true } : { tenantId, role });

  const mirror: TenantUser = { uid: user.uid, email: user.email ?? null, name: user.displayName || user.email || user.uid, role: role as TenantUser['role'], updatedAt: now };
  await db.doc(`tenants/${tenantId}/users/${user.uid}`).set(mirror);

  console.log(`${email} (${user.uid}) is now ${role} in tenant "${tenantId}". They must sign out and in, or press Retry, to pick up the claims.`);
}

provision().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
