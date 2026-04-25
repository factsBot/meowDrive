import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseEnabled } from '../lib/storage/supabaseClient';

interface Props {
  children: (ownerId: string, signOut: () => Promise<void>) => ReactNode;
  localOnlyFallback?: ReactNode;
}

const LOCAL_OWNER_KEY = 'meowdrive:localOwnerId';

function getLocalOwnerId(): string {
  let id = window.localStorage.getItem(LOCAL_OWNER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(LOCAL_OWNER_KEY, id);
  }
  return id;
}

export function AuthGate({ children, localOnlyFallback }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled()) {
      setLoading(false);
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!supabaseEnabled()) {
    const ownerId = getLocalOwnerId();
    return (
      <>
        {localOnlyFallback}
        {children(ownerId, async () => {
          window.localStorage.removeItem(LOCAL_OWNER_KEY);
          location.reload();
        })}
      </>
    );
  }

  if (loading) {
    return <div className="empty">Checking session…</div>;
  }

  if (!session) {
    async function sendMagic(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const { error } = await supabase().auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (error) throw error;
        setSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }
    return (
      <div className="auth-card">
        <h2>meowDrive</h2>
        <p className="hint">
          Sign in with your email — we'll send a one-time link. Your time data
          syncs across devices once you're in.
        </p>
        {sent ? (
          <div className="empty">
            Check <b>{email}</b> for a sign-in link, then come back to this tab.
          </div>
        ) : (
          <form onSubmit={sendMagic} className="auth-form">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
            <button className="primary" disabled={busy} type="submit">
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
            {error && <div className="error">{error}</div>}
          </form>
        )}
      </div>
    );
  }

  const ownerId = session.user.id;
  return (
    <>
      {children(ownerId, async () => {
        await supabase().auth.signOut();
      })}
    </>
  );
}
