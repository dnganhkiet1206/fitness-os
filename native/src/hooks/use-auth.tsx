import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { cancelAllReminders } from '@/lib/notifications';
import { clearPersistedCache, clearUserScopedStorage } from '@/lib/query-client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithApple: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Everything that has to stop belonging to the previous account.
 *
 * ── it used to live only in `signOut` ──
 *
 * Which is to say: only behind the button in Settings. A session ends by
 * several other doors, and supabase-js reports all of them the same way — a
 * `SIGNED_OUT` event on `onAuthStateChange`:
 *
 *   · the refresh token is no longer valid (the app was left closed past the
 *     refresh window, or the token was reused and revoked),
 *   · the account was deleted — including by this app's own delete-account,
 *     run from the person's other phone,
 *   · sessions were revoked after a password change.
 *
 * Down every one of those the handler did nothing but `setUser(null)`. The
 * persisted query cache stayed on disk with the last account's meals, weights
 * and workouts in it; their goals, learned habits and reminder-plan signature
 * stayed in AsyncStorage; and up to a week of *their* notifications stayed
 * scheduled with the OS. The next person to sign in inherited the lot — the
 * exact outcome `clearUserScopedStorage` and `cancelAllReminders` were written
 * to prevent, reached by a door neither of them was behind.
 *
 * So the cleanup hangs off the event, which is the thing that actually means
 * "the session is over", and `signOut` calls it too: every step is idempotent,
 * and a button that finishes the job itself does not depend on an event
 * arriving.
 */
async function forgetPreviousAccount(): Promise<void> {
  // Drop cached data so the next account doesn't briefly see this one's
  await clearPersistedCache();
  /*
    And the preferences the cache does not cover.

    `clearPersistedCache` removes one key. The learned daily rhythm, the
    reminder-plan signature and the personal goals are separate ones, and
    leaving them behind is not merely untidy: the plan signature makes
    `use-reminders.ts` exit early, so a second account whose plan hashes the
    same never gets a single notification scheduled — permanently, with the
    switches still shown on.
  */
  await clearUserScopedStorage();
  /*
    And the notifications, which outlive the session by up to a week.

    Reminders are scheduled a horizon ahead — about fifty of them across seven
    days — and signing out cancelled none of them. So a phone that had been
    handed on, or signed into by somebody else, went on saying "time to drink
    water" on the previous account's schedule until the horizon ran out. The
    next person to sign in inherited a stranger's day.

    `cancelAllReminders` existed for exactly this and was called by nothing.
    Rescheduling happens on its own once a plan is read for whoever signs in
    next, so there is nothing to restore here.
  */
  await cancelAllReminders();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      /*
        Every way a session can end, not just the button — see
        `forgetPreviousAccount`. `INITIAL_SESSION` with no session is a launch
        that was never signed in and is deliberately not this event.

        Not awaited, because this callback must return promptly: supabase-js
        runs it inside its own lock, and blocking it is how sign-in deadlocks.
        Nothing in here calls back into supabase, so there is nothing to
        deadlock on either.
      */
      if (event === 'SIGNED_OUT') void forgetPreviousAccount();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: Linking.createURL('/'),
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signInWithApple = async () => {
    try {
      // Supabase expects the RAW nonce; Apple receives its SHA-256 hash.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        return { error: new Error('No identity token received from Apple') };
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      return { error: error as Error | null };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') {
        return { error: new Error('Sign in cancelled') };
      }
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    /* The event above will have fired this too. Both, because every step is
       idempotent and the caller navigates as soon as this resolves — waiting
       here is what makes "signed out" mean the cleanup has finished. */
    await forgetPreviousAccount();
  };


  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/auth?type=recovery'),
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithApple, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
