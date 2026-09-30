import { type FormEvent, useState } from 'react';
import { Mail, Send, Trash2, UserPlus, Users } from 'lucide-react';
import type { Role, User } from '@/data/auth';
import type { MembersService } from '@/data/members';
import type { Invite, Store, TenantUser } from '@/data/store';
import { PageHeading } from './PageHeading';
import { buttonDanger, buttonPrimary, buttonQuiet, cardClass, inputClass, tableBody, tableCard, tableClass, tableHead, tableHeadCell, tableRow, tableWrap } from './styles';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

type MembersProps = {
  user: User;
  members: TenantUser[];
  invites: Invite[];
  service: MembersService;
  storeKind: Store['kind'];
};

// The admin section: who is in this workspace and with which role, the
// invites waiting for a first sign-in, and a form to invite by email. Every
// change goes through the members service, which sets the claims server-side;
// the lists refresh from the store when the mirror documents change.
export function Members({ user, members, invites, service, storeKind }: MembersProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [busy, setBusy] = useState<string | null>(null); // the row or form at work
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = invites.filter((invite) => invite.status === 'pending');
  const decided = invites.filter((invite) => invite.status !== 'pending');

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      setNotice(await action());
    } catch (cause) {
      setError(message(cause, 'That did not work.'));
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = (event: FormEvent) => {
    event.preventDefault();
    void run('invite', async () => {
      const outcome = await service.invite(email, role);
      setEmail('');
      return outcome.status === 'active'
        ? `${outcome.member.email ?? outcome.member.name} already had an account and is now a ${outcome.member.role} here. They sign out and in to pick it up.`
        : `${outcome.invite.email} is invited as ${outcome.invite.role}. Their first Google sign-in joins them to this workspace.`;
    });
  };

  return (
    <div>
      <PageHeading eyebrow="Admin" title="Members" description="Who is in this workspace and what they can do. Admins author Rule Sets and the Dictionary; users build and check." />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-6">
          <section className={tableCard} data-testid="section-members">
            <div className="flex items-center justify-between px-5 pt-5 pb-3"><div className="flex items-center gap-2 font-display text-xl font-medium text-foreground"><Users className="h-4 w-4 text-muted-foreground" /> Members</div><span className="text-[11px] font-bold text-muted-foreground" data-testid="text-member-count">{members.length} member{members.length === 1 ? '' : 's'}</span></div>
            <div className={tableWrap}>
              <table className={tableClass}>
                <thead className={tableHead}><tr><th className={tableHeadCell}>Person</th><th className={tableHeadCell}>Role</th><th className={tableHeadCell}>Updated</th><th className={tableHeadCell}></th></tr></thead>
                <tbody className={tableBody}>
                  {members.map((member) => {
                    const self = member.uid === user.uid;
                    return (
                      <tr key={member.uid} className={tableRow} data-testid={`row-member-${member.uid}`}>
                        <td className="px-5 py-3"><div className="font-semibold text-foreground">{member.name}{self && <span className="ml-2 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">You</span>}</div>{member.email && <div className="text-[11px] text-muted-foreground">{member.email}</div>}</td>
                        <td className="px-5 py-3">
                          <select className={`${inputClass} w-28`} value={member.role} disabled={busy !== null} onChange={(event) => void run(member.uid, async () => { const updated = await service.setRole(member.uid, event.target.value as Role); return `${updated.name} is now ${updated.role === 'admin' ? 'an admin' : 'a user'}.${self ? ' Sign out and in to pick up your new role.' : ''}`; })} aria-label={`Role of ${member.name}`} data-testid={`select-member-role-${member.uid}`}>
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                          </select>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{formatDate(member.updatedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <button type="button" className={buttonDanger} disabled={busy !== null || self} title={self ? 'You cannot remove yourself.' : undefined} onClick={() => { if (window.confirm(`Remove ${member.name} from this workspace?`)) void run(member.uid, async () => { await service.remove(member.uid); return `${member.name} no longer has access.`; }); }} data-testid={`button-remove-member-${member.uid}`}><Trash2 className="h-4 w-4" /> Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={tableCard} data-testid="section-invites">
            <div className="flex items-center justify-between px-5 pt-5 pb-3"><div className="flex items-center gap-2 font-display text-xl font-medium text-foreground"><Mail className="h-4 w-4 text-muted-foreground" /> Invites</div><span className="text-[11px] font-bold text-muted-foreground" data-testid="text-invite-count">{pending.length} pending</span></div>
            {invites.length === 0 ? <p className="px-5 pb-5 text-xs font-semibold text-muted-foreground" data-testid="text-no-invites">No invites yet. Invite someone by email on the right.</p> : (
              <div className={tableWrap}>
                <table className={tableClass}>
                  <thead className={tableHead}><tr><th className={tableHeadCell}>Email</th><th className={tableHeadCell}>Role</th><th className={tableHeadCell}>Status</th><th className={tableHeadCell}>Sent</th><th className={tableHeadCell}></th></tr></thead>
                  <tbody className={tableBody}>
                    {[...pending, ...decided].map((invite) => (
                      <tr key={invite.id} className={tableRow} data-testid={`row-invite-${invite.id}`}>
                        <td className="px-5 py-3 font-semibold text-foreground">{invite.email}</td>
                        <td className="px-5 py-3 capitalize">{invite.role}</td>
                        <td className="px-5 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${invite.status === 'pending' ? 'border-amber-300 bg-amber-50 text-amber-900' : invite.status === 'accepted' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`} data-testid={`text-invite-status-${invite.id}`}>{invite.status}</span></td>
                        <td className="px-5 py-3 text-muted-foreground">{formatDate(invite.createdAt)}</td>
                        <td className="px-5 py-3 text-right">{invite.status === 'pending' && <button type="button" className={buttonQuiet} disabled={busy !== null} onClick={() => void run(invite.id, async () => { await service.revoke(invite.id); return `The invite for ${invite.email} is revoked.`; })} data-testid={`button-revoke-invite-${invite.id}`}>Revoke</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="self-start xl:sticky xl:top-[92px]">
          <form onSubmit={sendInvite} className={cardClass} data-testid="form-invite">
            <div className="flex items-center gap-2 font-display text-xl font-medium text-foreground"><UserPlus className="h-4 w-4 text-muted-foreground" /> Invite someone</div>
            <p className="mt-1.5 text-[13px] font-bold text-muted-foreground">They sign in with the Google account for this email. {storeKind === 'firestore' ? 'If the account already exists it is added at once; otherwise the invite waits for their first sign-in.' : 'In local draft mode every invite waits.'}</p>
            <label className="mt-5 block text-[13px] font-bold text-foreground">Email<input type="email" className={`${inputClass} mt-2`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="off" data-testid="input-invite-email" /></label>
            <label className="mt-4 block text-[13px] font-bold text-foreground">Role<select className={`${inputClass} mt-2`} value={role} onChange={(event) => setRole(event.target.value as Role)} data-testid="select-invite-role"><option value="user">User: build and check</option><option value="admin">Admin: author, approve, manage members</option></select></label>
            <button type="submit" className={`${buttonPrimary} mt-5 w-full`} disabled={busy !== null || !email.trim()} data-testid="button-send-invite"><Send className="h-4 w-4" /> {busy === 'invite' ? 'Inviting' : 'Invite'}</button>
          </form>
          {notice && <div className="mt-4 rounded-[4px] border border-primary/30 bg-primary/10 px-4 py-3 text-[13px] font-semibold text-foreground" role="status" data-testid="text-members-notice">{notice}</div>}
          {error && <div className="mt-4 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-[13px] font-semibold text-destructive" role="alert" data-testid="text-members-error">{error}</div>}
        </section>
      </div>
    </div>
  );
}

// What a standard user sees at /members.
export function MembersAdminsOnly() {
  return (
    <div>
      <PageHeading eyebrow="Admin" title="Members" description="Only a workspace admin can see and manage members." />
    </div>
  );
}
