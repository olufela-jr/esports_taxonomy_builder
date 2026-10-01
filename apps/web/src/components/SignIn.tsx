import { useEffect, useState } from 'react';
import { Hourglass, LogIn, LogOut, RefreshCw, Send, UserX } from 'lucide-react';
import type { AccessRequest, AccessRequester } from '@/data/access';
import type { AuthSession, User } from '@/data/auth';
import type { AcceptOutcome } from '@/data/members';
import { buttonPrimary, buttonQuiet } from './styles';

// Replaces the shell until someone is signed in. In memory mode there is nothing
// to authenticate against; the button simply restores the local user.
export function SignIn({ kind, onSignIn }: { kind: AuthSession['kind']; onSignIn: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      await onSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border/30 bg-card p-8 shadow-sm" data-testid="screen-sign-in">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">Campaign Naming</div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-foreground">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {kind === 'firestore'
            ? 'Use your Google account. Your workspace and role come with it: admins author Rule Sets, everyone in the workspace builds and checks.'
            : 'Local draft mode: there is no account to check. Continue as the local user.'}
        </p>
        {error && <div role="alert" className="mt-4 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" data-testid="status-sign-in-error">{error}</div>}
        <button type="button" className={`${buttonPrimary} mt-6 w-full`} onClick={() => void signIn()} disabled={busy} data-testid="button-sign-in">
          <LogIn className="h-4 w-4" /> {kind === 'firestore' ? 'Sign in with Google' : 'Continue as local user'}
        </button>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

// Signed in, but the account carries no tenant or role claim yet: the Security
// Rules would refuse every read, so the shell is not shown. On arrival, and on
// Retry, the app asks the membership Function to claim any invite waiting for
// this email, then fetches a fresh token. Without an invite the person asks
// for access, and this screen follows their request live: once the super user
// approves it (the Function sets the claims before marking it approved), a
// fresh token lets them straight in.
export function NoWorkspace({ user, requester, onAcceptInvite, onRetry, onSignOut }: { user: User; requester: AccessRequester; onAcceptInvite: () => Promise<AcceptOutcome>; onRetry: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(true);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  // The caller's own access request: undefined until first read, null when there is none.
  const [request, setRequest] = useState<AccessRequest | null | undefined>(undefined);
  // Approval opens the workspace once: idle, then opening (fresh token in flight), then tried.
  const [opening, setOpening] = useState<'idle' | 'opening' | 'tried'>('idle');

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      const outcome = await onAcceptInvite();
      if (outcome.status !== 'none') await onRetry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check for an invite.');
    } finally {
      setChecked(true);
      setBusy(false);
    }
  };
  useEffect(() => { void check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => requester.watch(user.uid, setRequest), [requester, user.uid]);

  // Approved while waiting: one fresh token, and the app re-renders into the shell.
  const approved = request?.status === 'approved';
  useEffect(() => {
    if (!approved || opening !== 'idle') return;
    setOpening('opening');
    onRetry()
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not open your workspace.'))
      .finally(() => setOpening('tried'));
  }, [approved, opening, onRetry]);

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      const outcome = await requester.request();
      if (outcome.status === 'member') await onRetry();
      else setRequest(outcome.request);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const who = user.email ?? user.name;
  const loading = !checked || request === undefined;
  let heading = 'No workspace yet';
  let text = `Checking whether ${who} has been invited to a workspace.`;
  if (!loading && request === null) text = `${who} is signed in but is not in a workspace yet. Request access and the administrator will add you.`;
  if (!loading && request?.status === 'pending') {
    heading = 'Access requested';
    text = `You asked for access on ${formatDate(request.createdAt)}. As soon as the administrator approves it, this page opens your workspace by itself.`;
  }
  if (!loading && approved) {
    heading = 'Access approved';
    // Still here after the fresh token: approved once, but the claims are gone (removed since).
    text = opening === 'tried' ? `Your access was approved, but ${who} is not in a workspace now. Ask the administrator to add you again.` : 'Opening your workspace.';
  }
  if (!loading && request?.status === 'declined') {
    heading = 'Access declined';
    text = 'Your request for access was declined. If you think that is a mistake, contact the person who sent you the link.';
  }
  const canAsk = !loading && request === null;
  const canRetry = request?.status !== 'declined';

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border/30 bg-card p-8 shadow-sm" data-testid="screen-no-workspace" data-status={loading ? 'loading' : request?.status ?? 'none'}>
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">{request?.status === 'pending' ? <Hourglass className="h-5 w-5" /> : <UserX className="h-5 w-5" />}</div>
        <h1 className="mt-4 font-display text-3xl font-medium tracking-tight text-foreground" data-testid="heading-no-workspace">{heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid="text-no-workspace">{text}</p>
        {error && <div role="alert" className="mt-4 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" data-testid="status-no-workspace-error">{error}</div>}
        {canAsk && <button type="button" className={`${buttonPrimary} mt-6 w-full`} onClick={() => void ask()} disabled={busy} data-testid="button-request-access"><Send className="h-4 w-4" /> {busy ? 'Sending' : 'Request access'}</button>}
        <div className={`${canAsk ? 'mt-3' : 'mt-6'} flex gap-3`}>
          {canRetry && <button type="button" className={`${canAsk ? buttonQuiet : buttonPrimary} flex-1`} onClick={() => void check()} disabled={busy} data-testid="button-retry-claims"><RefreshCw className="h-4 w-4" /> {busy && !canAsk ? 'Checking' : 'Retry'}</button>}
          <button type="button" className={`${buttonQuiet} ${canRetry ? '' : 'flex-1'}`} onClick={() => void onSignOut()} data-testid="button-sign-out"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </div>
    </div>
  );
}
