// The tenant guard every Callable runs first. The tenant and role come from
// the verified ID token only; nothing in the request body is trusted for
// either. Pure functions apart from readTenantConfig, so the unit tests need
// no emulator.
import { HttpsError } from 'firebase-functions/v2/https';

export type Role = 'admin' | 'user';

export type Caller = {
  uid: string;
  tenantId: string;
  role: Role;
};

// The tenant document's config, as written by the provisioning script
// (apps/web/src/data/types.ts documents the full document).
export type TenantConfig = {
  allowedDatasets: string[];
  platforms: string[];
};

// What a Callable receives as request.auth: the uid and the decoded token.
// Declared structurally so tests can build one without the SDK's types.
export type CallerAuth = {
  uid: string;
  token: Record<string, unknown>;
} | undefined;

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user';
}

export function tenantFromAuth(auth: CallerAuth): Caller {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const { tenantId, role } = auth.token;
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new HttpsError('permission-denied', 'This account is not a member of any workspace.');
  }
  if (!isRole(role)) {
    throw new HttpsError('permission-denied', 'This account has no role in its workspace.');
  }
  return { uid: auth.uid, tenantId, role };
}

// The super user (a separate `superuser` claim, set only by the provisioning
// script) sees every tenant and creates tenants, but writes inside a tenant
// only where they also hold the admin role there (D35: no rules bypass).
export function isSuperuser(auth: CallerAuth): boolean {
  return Boolean(auth) && auth?.token.superuser === true;
}

export function superFromAuth(auth: CallerAuth): { uid: string } {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  if (!isSuperuser(auth)) {
    throw new HttpsError('permission-denied', 'Only the super user can manage tenants.');
  }
  return { uid: auth.uid };
}

const TENANT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

// Who may invite into a tenant: an admin of their own tenant, or the super
// user into any tenant they name (their own by default). The result reads as
// an admin caller for that tenant, for the one operation at hand.
export function inviteScope(auth: CallerAuth, requestedTenantId: unknown): Caller {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  if (isSuperuser(auth) && typeof requestedTenantId === 'string' && requestedTenantId) {
    if (!TENANT_ID.test(requestedTenantId)) {
      throw new HttpsError('invalid-argument', 'That is not a valid tenant id.');
    }
    return { uid: auth.uid, tenantId: requestedTenantId, role: 'admin' };
  }
  const caller = tenantFromAuth(auth);
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only a workspace admin can manage members.');
  }
  return caller;
}

// A scan may only read a dataset the tenant has whitelisted. No config, or an
// empty list, allows nothing.
export function assertDatasetAllowed(config: TenantConfig | undefined, dataset: string): void {
  const allowed = config?.allowedDatasets ?? [];
  if (!allowed.includes(dataset)) {
    throw new HttpsError('permission-denied', `Dataset "${dataset}" is not in this workspace's allowed datasets.`);
  }
}

// The slice of the Admin SDK Firestore the guard needs, so a test can fake it.
export type DocumentReader = {
  doc(path: string): { get(): Promise<{ exists: boolean; data(): unknown }> };
};

function isTenantConfig(value: unknown): value is TenantConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TenantConfig>;
  return Array.isArray(candidate.allowedDatasets) && Array.isArray(candidate.platforms);
}

// The tenant's config, or undefined when the tenant document or its config is
// missing or malformed (which then allows no dataset).
export async function readTenantConfig(db: DocumentReader, tenantId: string): Promise<TenantConfig | undefined> {
  const snapshot = await db.doc(`tenants/${tenantId}`).get();
  if (!snapshot.exists) return undefined;
  const data = snapshot.data() as { config?: unknown } | undefined;
  return isTenantConfig(data?.config) ? data.config : undefined;
}
