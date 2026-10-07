// Membership of a tenant, managed from the app by its admins (v3 O11 revisited:
// provisioning moves from the owner's script into the interface). Claims can
// only be set server-side, so every change runs here. Pure logic over two
// small ports (Auth and the members store), so the unit tests need neither
// the emulator nor the Admin SDK; index.ts binds the real ones.
//
// Rules kept here, whatever the client sends:
// - only an admin of the caller's own tenant changes its membership;
// - a person belongs to one tenant: an account already in another tenant is
//   refused rather than moved;
// - a tenant always keeps at least one admin: the last one cannot be demoted
//   or removed, and nobody removes themselves;
// - an invite is claimed only by a signed-in account whose verified email
//   matches it.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Caller, CallerAuth, Role } from './tenant';

// tenants/{tenantId}/users/{uid}: the readable mirror of the claims.
export type Member = {
  uid: string;
  email: string | null;
  name: string;
  role: Role;
  updatedAt: string;
};

// tenants/{tenantId}/invites/{id}: an email an admin has invited, waiting for
// that person's first sign-in. Accepted and revoked invites stay as a record.
export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export type Invite = {
  id: string;
  email: string; // lowercase
  role: Role;
  status: InviteStatus;
  invitedBy: string;
  acceptedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// An Auth account as the module needs it.
export type Account = {
  uid: string;
  email: string | null;
  name: string;
  claims: Record<string, unknown>;
};

export type AuthPort = {
  accountByEmail(email: string): Promise<Account | null>;
  accountById(uid: string): Promise<Account | null>;
  // Replaces every custom claim; {} clears them.
  setClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
};

export type MembersStore = {
  listMembers(tenantId: string): Promise<Member[]>;
  writeMember(tenantId: string, member: Member): Promise<void>;
  deleteMember(tenantId: string, uid: string): Promise<void>;
  listInvites(tenantId: string): Promise<Invite[]>;
  writeInvite(tenantId: string, invite: Invite): Promise<void>;
  // Pending invites for one email across every tenant, oldest first.
  pendingInvitesFor(email: string): Promise<Array<{ tenantId: string; invite: Invite }>>;
};

export type Ports = {
  auth: AuthPort;
  store: MembersStore;
  now(): string;
  newId(): string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return email;
}

export function parseRole(value: unknown): Role {
  if (value !== 'admin' && value !== 'user') {
    throw new HttpsError('invalid-argument', 'The role must be admin or user.');
  }
  return value;
}

function requireAdmin(caller: Caller): void {
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only a workspace admin can manage members.');
  }
}

function tenantOf(claims: Record<string, unknown>): string | null {
  return typeof claims.tenantId === 'string' && claims.tenantId ? claims.tenantId : null;
}

function memberOf(account: Account, role: Role, now: string): Member {
  return { uid: account.uid, email: account.email, name: account.name, role, updatedAt: now };
}

export type InviteOutcome =
  | { status: 'active'; member: Member }
  | { status: 'invited'; invite: Invite };

// An admin adds someone by email (or the super user, into any tenant: the
// caller arrives already scoped by inviteScope). An existing account is
// provisioned at once; anyone else gets an invite that their first sign-in
// claims.
export async function inviteMember(ports: Ports, caller: Caller, data: unknown): Promise<InviteOutcome> {
  requireAdmin(caller);
  const candidate = (data ?? {}) as { email?: unknown; role?: unknown };
  const email = normalizeEmail(candidate.email);
  const role = parseRole(candidate.role);
  const now = ports.now();

  const members = await ports.store.listMembers(caller.tenantId);
  if (members.some((member) => member.email?.toLowerCase() === email)) {
    throw new HttpsError('already-exists', `${email} is already a member of this workspace.`);
  }

  const account = await ports.auth.accountByEmail(email);
  if (account) {
    const elsewhere = tenantOf(account.claims);
    if (elsewhere && elsewhere !== caller.tenantId) {
      throw new HttpsError('failed-precondition', `${email} belongs to another workspace; a person has one workspace.`);
    }
    await ports.auth.setClaims(account.uid, { tenantId: caller.tenantId, role });
    const member = memberOf(account, role, now);
    await ports.store.writeMember(caller.tenantId, member);
    return { status: 'active', member };
  }

  const invites = await ports.store.listInvites(caller.tenantId);
  if (invites.some((invite) => invite.status === 'pending' && invite.email === email)) {
    throw new HttpsError('already-exists', `${email} already has a pending invite.`);
  }
  const invite: Invite = { id: ports.newId(), email, role, status: 'pending', invitedBy: caller.uid, acceptedBy: null, createdAt: now, updatedAt: now };
  await ports.store.writeInvite(caller.tenantId, invite);
  return { status: 'invited', invite };
}

async function findMember(ports: Ports, tenantId: string, uid: unknown): Promise<{ members: Member[]; member: Member }> {
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  const members = await ports.store.listMembers(tenantId);
  const member = members.find((item) => item.uid === uid);
  if (!member) {
    throw new HttpsError('not-found', 'That person is not a member of this workspace.');
  }
  return { members, member };
}

function assertNotLastAdmin(members: Member[], member: Member, action: string): void {
  const admins = members.filter((item) => item.role === 'admin').length;
  if (member.role === 'admin' && admins <= 1) {
    throw new HttpsError('failed-precondition', `${member.email ?? member.name} is the only admin; make someone else an admin before you ${action}.`);
  }
}

export async function setMemberRole(ports: Ports, caller: Caller, data: unknown): Promise<Member> {
  requireAdmin(caller);
  const candidate = (data ?? {}) as { uid?: unknown; role?: unknown };
  const role = parseRole(candidate.role);
  const { members, member } = await findMember(ports, caller.tenantId, candidate.uid);
  if (member.role === role) return member;
  if (role === 'user') assertNotLastAdmin(members, member, 'change this role');

  await ports.auth.setClaims(member.uid, { tenantId: caller.tenantId, role });
  const updated: Member = { ...member, role, updatedAt: ports.now() };
  await ports.store.writeMember(caller.tenantId, updated);
  return updated;
}

export async function removeMember(ports: Ports, caller: Caller, data: unknown): Promise<{ uid: string }> {
  requireAdmin(caller);
  const candidate = (data ?? {}) as { uid?: unknown };
  if (candidate.uid === caller.uid) {
    throw new HttpsError('failed-precondition', 'You cannot remove yourself; ask another admin.');
  }
  const { members, member } = await findMember(ports, caller.tenantId, candidate.uid);
  assertNotLastAdmin(members, member, 'remove them');

  // Clearing the claims is what removes access; the mirror follows.
  await ports.auth.setClaims(member.uid, {});
  await ports.store.deleteMember(caller.tenantId, member.uid);
  return { uid: member.uid };
}

export async function revokeInvite(ports: Ports, caller: Caller, data: unknown): Promise<Invite> {
  requireAdmin(caller);
  const candidate = (data ?? {}) as { inviteId?: unknown };
  const invites = await ports.store.listInvites(caller.tenantId);
  const invite = invites.find((item) => item.id === candidate.inviteId);
  if (!invite) {
    throw new HttpsError('not-found', 'That invite is not in this workspace.');
  }
  if (invite.status !== 'pending') return invite;
  const revoked: Invite = { ...invite, status: 'revoked', updatedAt: ports.now() };
  await ports.store.writeInvite(caller.tenantId, revoked);
  return revoked;
}

export type AcceptOutcome =
  | { status: 'member'; tenantId: string; role: Role }   // already in a workspace
  | { status: 'accepted'; tenantId: string; role: Role } // claims just set
  | { status: 'none' };                                  // nothing waiting for this email

// A signed-in account with no workspace claims the invite waiting for its
// email, if any. Runs from the "No workspace yet" screen.
export async function acceptInvite(ports: Ports, auth: CallerAuth): Promise<AcceptOutcome> {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const current = tenantOf(auth.token);
  const currentRole = auth.token.role;
  if (current && (currentRole === 'admin' || currentRole === 'user')) {
    return { status: 'member', tenantId: current, role: currentRole };
  }
  const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
  if (!email || auth.token.email_verified !== true) {
    return { status: 'none' };
  }

  const waiting = await ports.store.pendingInvitesFor(email);
  if (waiting.length === 0) return { status: 'none' };
  const { tenantId, invite } = waiting[0];
  const now = ports.now();

  const account = await ports.auth.accountById(auth.uid);
  await ports.auth.setClaims(auth.uid, { tenantId, role: invite.role });
  await ports.store.writeMember(tenantId, {
    uid: auth.uid,
    email: account?.email ?? email,
    name: account?.name ?? (typeof auth.token.name === 'string' ? auth.token.name : email),
    role: invite.role,
    updatedAt: now,
  });
  await ports.store.writeInvite(tenantId, { ...invite, status: 'accepted', acceptedBy: auth.uid, updatedAt: now });
  return { status: 'accepted', tenantId, role: invite.role };
}
