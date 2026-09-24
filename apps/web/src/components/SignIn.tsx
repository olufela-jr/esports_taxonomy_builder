import { useState } from 'react';
import { LogIn } from 'lucide-react';
import type { AuthSession } from '@/data/auth';
import { buttonPrimary } from './styles';

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
          {kind === 'firebase'
            ? 'Use your Google account. Anyone signed in can read every Rule Set; only its owner can change one.'
            : 'Local draft mode: there is no account to check. Continue as the local user.'}
        </p>
        {error && <div role="alert" className="mt-4 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" data-testid="status-sign-in-error">{error}</div>}
        <button type="button" className={`${buttonPrimary} mt-6 w-full`} onClick={() => void signIn()} disabled={busy} data-testid="button-sign-in">
          <LogIn className="h-4 w-4" /> {kind === 'firebase' ? 'Sign in with Google' : 'Continue as local user'}
        </button>
      </div>
    </div>
  );
}
