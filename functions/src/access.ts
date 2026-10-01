// Access requests: anyone signed in without a workspace can ask for one, and
// the super user decides which workspace and role they get. Pure logic over
// small ports, like members.ts; index.ts binds the real ones.
//
// A request lives at accessRequests/{uid}, outside tenants/, because the
// person asking has no tenant yet. Keyed by uid, so an account has at most one
// request and cannot flood the queue. Only these Functions write it; the
// Security Rules let the requester read their own and the super user read all.
//
// Approving reuses the super user's invite into a named tenant (inviteMember
// with an admin-scoped caller), so claims are set the one way they always are,
// with the same guards: one workspace per person, no duplicate membership.
import { HttpsError } from 'firebase-functions/v2/https';
import { inviteMember, parseRole, type Ports } from './members';
import type { CallerAuth, Role } from './tenant';
import { superFromAuth } from './tenant';
import type { TenantsStore } from './tenants';

export type AccessRequestStatus = 'pending' | 'approved' | 'declined';

export type AccessRequest = {
  uid: string;
  email: string; // lowercase, from the verified token
  name: string;
  status: AccessRequestStatus;
  // Set when approved: where the person went and as what.
  tenantId: string | null;
  role: Role | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccessRequestsStore = {
  getRequest(uid: string): Promise<AccessRequest | null>;
  writeRequest(request: AccessRequest): Promise<void>;
};

export type AccessPorts = {
  members: Ports;
  requests: AccessRequestsStore;
  tenants: Pick<TenantsStore, 'getTenant'>;
};

export type RequestOutcome =
  | { status: 'member' } // already in a workspace; nothing to ask for
  | { status: 'requested'; request: AccessRequest };

const TENANT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

function hasWorkspace(claims: Record<string, unknown>): boolean {
  return typeof claims.tenantId === 'string' && Boolean(claims.tenantId) && (claims.role === 'admin' || claims.role === 'user');
}

// The one write a signed-in account without a workspace may make, besides
// claiming an invite. Asking again returns the request as it stands, so a
// declined request stays declined.
export async function requestAccess(ports: AccessPorts, auth: CallerAuth): Promise<RequestOutcome> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  if (hasWorkspace(auth.token)) {
    return { status: 'member' };
  }
  const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
  if (!email || auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'This account has no verified email address, so it cannot ask for access.');
  }
  const existing = await ports.requests.getRequest(auth.uid);
  if (existing) {
    return { status: 'requested', request: existing };
  }
  const account = await ports.members.auth.accountById(auth.uid);
  const now = ports.members.now();
  const request: AccessRequest = {
    uid: auth.uid,
    email,
    name: account?.name ?? (typeof auth.token.name === 'string' && auth.token.name ? auth.token.name : email),
    status: 'pending',
    tenantId: null,
    role: null,
    decidedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  await ports.requests.writeRequest(request);
  return { status: 'requested', request };
}

// The super user approves a request into a tenant with a role, or declines
// it. A declined request can still be approved later; an approved one is done.
export async function decideAccessRequest(ports: AccessPorts, auth: CallerAuth, data: unknown): Promise<AccessRequest> {
  const caller = superFromAuth(auth);
  const candidate = (data ?? {}) as { uid?: unknown; decision?: unknown; tenantId?: unknown; role?: unknown };
  if (typeof candidate.uid !== 'string' || !candidate.uid) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  if (candidate.decision !== 'approve' && candidate.decision !== 'decline') {
    throw new HttpsError('invalid-argument', 'The decision must be approve or decline.');
  }
  const request = await ports.requests.getRequest(candidate.uid);
  if (!request) {
    throw new HttpsError('not-found', 'There is no access request for that account.');
  }
  if (request.status === 'approved') {
    throw new HttpsError('failed-precondition', `${request.email} has already been approved.`);
  }
  const now = ports.members.now();

  if (candidate.decision === 'decline') {
    if (request.status === 'declined') return request;
    const declined: AccessRequest = { ...request, status: 'declined', decidedBy: caller.uid, updatedAt: now };
    await ports.requests.writeRequest(declined);
    return declined;
  }

  if (typeof candidate.tenantId !== 'string' || !TENANT_ID.test(candidate.tenantId)) {
    throw new HttpsError('invalid-argument', 'Pick the workspace to add them to.');
  }
  const tenantId = candidate.tenantId;
  const role = parseRole(candidate.role);
  if (!(await ports.tenants.getTenant(tenantId))) {
    throw new HttpsError('not-found', `There is no tenant "${tenantId}".`);
  }
  // The super user acting as an admin of that tenant for this one operation,
  // exactly as inviteScope scopes them for an invite.
  await inviteMember(ports.members, { uid: caller.uid, tenantId, role: 'admin' }, { email: request.email, role });
  const approved: AccessRequest = { ...request, status: 'approved', tenantId, role, decidedBy: caller.uid, updatedAt: now };
  await ports.requests.writeRequest(approved);
  return approved;
}
