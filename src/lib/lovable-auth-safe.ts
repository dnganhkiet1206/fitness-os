/**
 * Safe wrapper around @lovable.dev/cloud-auth-js
 * Falls back to direct Supabase OAuth when running outside Lovable Cloud
 * Uses native Apple Sign In on iOS via Capacitor plugin
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

function isLovableCloud(): boolean {
  const host = window.location.hostname;
  return host.includes('lovable.app') || host.includes('lovableproject.com');
}

/**
 * Detect if running as a native Capacitor app
 */
function isNativePlatform(): boolean {
  try {
    // Capacitor injects this on native platforms
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function getNativePlatform(): string {
  try {
    return (window as any).Capacitor?.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
}

/**
 * Native Apple Sign In using Capacitor plugin
 * Returns the identity token to pass to Supabase signInWithIdToken
 */
async function nativeAppleSignIn(): Promise<SignInResult> {
  try {
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

    const nonce = crypto.randomUUID();

    const result = await SignInWithApple.authorize({
      clientId: 'app.lovable.65c5437d9de24fa18cee8272d57c94fc',
      redirectURI: '',
      scopes: 'email name',
      state: crypto.randomUUID(),
      nonce,
    });

    if (!result.response?.identityToken) {
      return { error: new Error('No identity token received from Apple') };
    }

    // Exchange the Apple identity token with Supabase
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.response.identityToken,
      nonce,
    });

    if (error) {
      return { error: error as Error };
    }

    return { tokens: data };
  } catch (e: any) {
    // User cancelled
    if (e?.message?.includes('cancel') || e?.message?.includes('Cancel') || e?.code === 1001) {
      return { error: new Error('Sign in cancelled') };
    }
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export const lovableSafe = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions): Promise<SignInResult> => {
      const isNative = isNativePlatform();

      // Native iOS: use native Apple Sign In for best UX
      if (isNative && provider === 'apple' && getNativePlatform() === 'ios') {
        return nativeAppleSignIn();
      }

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
