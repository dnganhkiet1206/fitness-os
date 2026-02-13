/**
 * Safe wrapper around @lovable.dev/cloud-auth-js
 * Falls back to direct Supabase OAuth when running outside Lovable Cloud
 * (e.g., standalone iOS build via Capacitor where the auth bridge returns 404)
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

/**
 * Detect if we're running inside Lovable Cloud (web preview or published app)
 * vs standalone (Capacitor iOS/Android build or custom domain)
 */
function isLovableCloud(): boolean {
  const host = window.location.hostname;
  return host.includes('lovable.app') || host.includes('lovableproject.com');
}

export const lovableSafe = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions): Promise<SignInResult> => {
      // On Lovable Cloud domains, use the managed auth bridge
      if (isLovableCloud()) {
        const lovableAuth = await getLovableAuth();

        if (!lovableAuth) {
          return { error: new Error('OAuth is not available. Please use email/password login.') };
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
      }

      // Standalone / Capacitor / custom domain: use direct Supabase OAuth
      try {
        const redirectTo = opts?.redirect_uri || window.location.origin;

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: false,
          },
        });

        if (error) {
          return { error: error as Error };
        }

        // Supabase handles the redirect automatically
        if (data?.url) {
          window.location.href = data.url;
          return { redirected: true };
        }

        return { redirected: true };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};
