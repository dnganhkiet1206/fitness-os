/**
 * Safe wrapper around @lovable.dev/cloud-auth-js
 * Returns a no-op fallback when running outside Lovable Cloud (e.g., standalone iOS build)
 */

import { supabase } from '@/integrations/supabase/client';

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SignInResult = {
  redirected?: boolean;
  error?: Error;
  tokens?: any;
};

async function createSafeLovableAuth() {
  try {
    const mod = await import('@lovable.dev/cloud-auth-js');
    return mod.createLovableAuth();
  } catch {
    console.warn('[ASCND] Lovable Cloud Auth not available — running in standalone mode');
    return null;
  }
}

let lovableAuthPromise: Promise<any> | null = null;

function getLovableAuth() {
  if (!lovableAuthPromise) {
    lovableAuthPromise = createSafeLovableAuth();
  }
  return lovableAuthPromise;
}

export const lovableSafe = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions): Promise<SignInResult> => {
      const lovableAuth = await getLovableAuth();

      if (!lovableAuth) {
        return { error: new Error('OAuth is not available in standalone mode. Please use email/password login.') };
      }

      try {
        const result = await lovableAuth.signInWithOAuth(provider, {
          redirect_uri: opts?.redirect_uri,
          extraParams: { ...opts?.extraParams },
        });

        if (result.redirected) return result;
        if (result.error) return result;

        try {
          await supabase.auth.setSession(result.tokens);
        } catch (e) {
          return { error: e instanceof Error ? e : new Error(String(e)) };
        }
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};