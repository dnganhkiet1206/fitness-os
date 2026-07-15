/**
 * Safe wrapper around @lovable.dev/cloud-auth-js
 * Falls back to direct Supabase OAuth when running outside Lovable Cloud
 * Uses native Apple Sign In on iOS via Capacitor plugin
 * Uses Capacitor Browser for Google OAuth on native platforms
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

/**
 * Native OAuth using Capacitor Browser plugin
 * Opens the OAuth URL in an external browser, then listens for the redirect back
 */
async function nativeOAuthWithBrowser(provider: "google" | "apple", redirectTo: string): Promise<SignInResult> {
  try {
    const { Browser } = await import('@capacitor/browser');
    const { App } = await import('@capacitor/app');

    // Get the OAuth URL without auto-redirecting
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      return { error: error as Error };
    }

    if (!data?.url) {
      return { error: new Error('No OAuth URL received') };
    }

    // Listen for the app being opened back via deep link
    return new Promise<SignInResult>((resolve) => {
      let resolved = false;
      let listenerHandle: any = null;

      const handleAppUrlOpen = async (event: { url: string }) => {
        if (resolved) return;

        // Check if this is our OAuth callback
        if (event.url.startsWith(redirectTo)) {
          resolved = true;
          listenerHandle?.remove();

          try {
            await Browser.close();
          } catch {
            // Browser might already be closed
          }

          // Extract tokens from the URL hash/query
          const url = new URL(event.url);
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              resolve({ error: sessionError as Error });
            } else {
              resolve({ tokens: sessionData });
            }
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              resolve({ tokens: session });
            } else {
              resolve({ error: new Error('No tokens received from OAuth callback') });
            }
          }
        }
      };

      // Set up the deep link listener
      App.addListener('appUrlOpen', handleAppUrlOpen).then(handle => {
        listenerHandle = handle;
      });

      // Open the OAuth URL in external browser
      Browser.open({ url: data.url, windowName: '_self' });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          listenerHandle?.remove();
          resolve({ error: new Error('OAuth sign-in timed out') });
        }
      }, 5 * 60 * 1000);
    });
  } catch (e) {
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

      // Native platforms: use Capacitor Browser for OAuth (avoids WebView 404 issues)
      if (isNative) {
        const redirectTo = opts?.redirect_uri || window.location.origin;
        return nativeOAuthWithBrowser(provider, redirectTo);
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

      // Standalone web: use direct Supabase OAuth
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
