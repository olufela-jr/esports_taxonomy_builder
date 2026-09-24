import { useState } from 'react';
import { LogIn, LogOut, RefreshCw, UserX } from 'lucide-react';
import type { AuthSession, User } from '@/data/auth';
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

// Signed in, but the account carries no tenant or role claim yet: the Security
// Rules would refuse every read, so the shell is not shown. Retry fetches a
// fresh token once an admin has provisioned the account.
export function NoWorkspace({ user, onRetry, onSignOut }: { user: User; onRetry: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border/30 bg-card p-8 shadow-sm" data-testid="screen-no-workspace">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground"><UserX className="h-5 w-5" /></div>
        <h1 className="mt-4 font-display text-3xl font-medium tracking-tight text-foreground">No workspace yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {user.email ?? user.name} is signed in but is not a member of any workspace. Ask your workspace admin to add you, then retry.
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" className={`${buttonPrimary} flex-1`} onClick={() => void retry()} disabled={busy} data-testid="button-retry-claims"><RefreshCw className="h-4 w-4" /> Retry</button>
          <button type="button" className={buttonQuiet} onClick={() => void onSignOut()} data-testid="button-sign-out"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </div>
    </div>
  );
}
