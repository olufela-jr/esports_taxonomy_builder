// ALL membership changes go through this module: inviting, changing a role,
// removing, revoking an invite, and claiming an invite on first sign-in.
// Claims can only be set server-side, so with the shared workspace every
// call is a Callable Function (functions/src/members.ts holds the rules);
// in memory mode a small double keeps the same guards so the Members screen
// behaves the same in development and Playwright.
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/lib/firebase';
import { newId } from '@/lib/ids';
import type { Role } from './auth';
import type { Mode } from './mode';
import type { Invite, Store, StoreSession, TenantUser } from './store';

export type InviteOutcome =
  | { status: 'active'; member: TenantUser } // the account existed and is provisioned
  | { status: 'invited'; invite: Invite };   // waiting for that person's first sign-in

export type AcceptOutcome = {
  status: 'member' | 'accepted' | 'none';
};

export type MembersService = {
  // tenantId: the super user inviting into a tenant that is not their own.
  invite(email: string, role: Role, tenantId?: string): Promise<InviteOutcome>;
  setRole(uid: string, role: Role): Promise<TenantUser>;
  remove(uid: string): Promise<void>;
  revoke(inviteId: string): Promise<Invite>;
};

// Used from the "No workspace yet" screen, before any store exists.
export type InviteClaimer = {
  accept(): Promise<AcceptOutcome>;
};

// ---- Shared workspace: the Callables ----------------------------------------------

function createFirestoreMembersService(): MembersService {
  const { functions } = getFirebase();
  const invite = httpsCallable<{ email: string; role: Role; tenantId?: string }, InviteOutcome>(functions, 'inviteMember');
  const setRole = httpsCallable<{ uid: string; role: Role }, TenantUser>(functions, 'setMemberRole');
  const remove = httpsCallable<{ uid: string }, { uid: string }>(functions, 'removeMember');
  const revoke = httpsCallable<{ inviteId: string }, Invite>(functions, 'revokeInvite');
  return {
    async invite(email, role, tenantId) { return (await invite(tenantId ? { email, role, tenantId } : { email, role })).data; },
    async setRole(uid, role) { return (await setRole({ uid, role })).data; },
    async remove(uid) { await remove({ uid }); },
    async revoke(inviteId) { return (await revoke({ inviteId })).data; },
  };
}

export function createInviteClaimer(mode: Mode): InviteClaimer {
  if (mode !== 'firestore') {
    // The local user always has a workspace; nothing to claim.
    return { async accept() { return { status: 'none' }; } };
  }
  const { functions } = getFirebase();
  const accept = httpsCallable<Record<string, never>, AcceptOutcome>(functions, 'acceptInvite');
  return {
    async accept() { return (await accept({})).data; },
  };
}

// ---- Memory mode: the same guards over the store's lists --------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createMemoryMembersService(store: Store, session: StoreSession): MembersService {
  const lists = store.memory;
  if (!lists) throw new Error('The in-memory members service needs the memory store.');
  const stamp = () => new Date().toISOString();
  const requireAdmin = () => {
    if (session.role !== 'admin') throw new Error('Only a workspace admin can manage members.');
  };
  // Inviting and revoking: an admin here, or the super user (readAll without the role).
  const requireInviter = () => {
    if (session.role !== 'admin' && !session.readAll) throw new Error('Only a workspace admin can manage members.');
  };
  const lastAdmin = (member: TenantUser, action: string) => {
    const admins = lists.members.getSnapshot().filter((item) => item.role === 'admin').length;
    if (member.role === 'admin' && admins <= 1) throw new Error(`${member.email ?? member.name} is the only admin; make someone else an admin before you ${action}.`);
  };
  const find = (uid: string) => {
    const member = lists.members.getSnapshot().find((item) => item.uid === uid);
    if (!member) throw new Error('That person is not a member of this workspace.');
    return member;
  };

  return {
    async invite(rawEmail, role, tenantId) {
      const email = rawEmail.trim().toLowerCase();
      if (!EMAIL.test(email)) throw new Error('Enter a valid email address.');
      if (tenantId && tenantId !== session.tenantId) {
        // The super user inviting into another memory tenant: nothing to show here.
        const now = stamp();
        return { status: 'invited', invite: { id: newId(), email, role, status: 'pending', invitedBy: session.uid, acceptedBy: null, createdAt: now, updatedAt: now } };
      }
      requireInviter();
      if (lists.members.getSnapshot().some((member) => member.email?.toLowerCase() === email)) throw new Error(`${email} is already a member of this workspace.`);
      if (lists.invites.getSnapshot().some((invite) => invite.status === 'pending' && invite.email === email)) throw new Error(`${email} already has a pending invite.`);
      // No Auth accounts exist in memory mode, so every invite waits.
      const now = stamp();
      const invite: Invite = { id: newId(), email, role, status: 'pending', invitedBy: session.uid, acceptedBy: null, createdAt: now, updatedAt: now };
      lists.invites.replace([invite, ...lists.invites.getSnapshot()]);
      return { status: 'invited', invite };
    },
    async setRole(uid, role) {
      requireAdmin();
      const member = find(uid);
      if (member.role === role) return member;
      if (role === 'user') lastAdmin(member, 'change this role');
      const updated: TenantUser = { ...member, role, updatedAt: stamp() };
      lists.members.replace(lists.members.getSnapshot().map((item) => (item.uid === uid ? updated : item)));
      return updated;
    },
    async remove(uid) {
      requireAdmin();
      if (uid === session.uid) throw new Error('You cannot remove yourself; ask another admin.');
      const member = find(uid);
      lastAdmin(member, 'remove them');
      lists.members.replace(lists.members.getSnapshot().filter((item) => item.uid !== uid));
    },
    async revoke(inviteId) {
      requireInviter();
      const invite = lists.invites.getSnapshot().find((item) => item.id === inviteId);
      if (!invite) throw new Error('That invite is not in this workspace.');
      if (invite.status !== 'pending') return invite;
      const revoked: Invite = { ...invite, status: 'revoked', updatedAt: stamp() };
      lists.invites.replace(lists.invites.getSnapshot().map((item) => (item.id === inviteId ? revoked : item)));
      return revoked;
    },
  };
}

export function createMembersService(mode: Mode, store: Store, session: StoreSession): MembersService {
  return mode === 'firestore' ? createFirestoreMembersService() : createMemoryMembersService(store, session);
}
