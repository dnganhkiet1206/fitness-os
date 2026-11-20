/**
 * Taking back a Sign in with Apple grant when its account is deleted.
 *
 * ── why this exists ──
 *
 * App Store Review Guideline 5.1.1(v) requires an app that offers Sign in
 * with Apple to call Apple's token revocation API when the account is
 * deleted. Deleting the Supabase user alone leaves Apple's grant standing:
 * Apple keeps issuing tokens for an account this project has forgotten.
 * `delete-account` calls this before it deletes anything, and a failure
 * here never blocks the deletion — losing the account is the thing the
 * person asked for, and revocation can be retried from the log.
 *
 * ── a different key from the App Store Server API ──
 *
 * `_shared/apple.ts` signs with an App Store Connect API key (Users and
 * Access → Keys). This flow needs a key with the Sign in with Apple
 * capability enabled (Certificates, Identifiers & Profiles → Keys) — a
 * different key, a different key id, a different JWT audience. Sharing one
 * credential across the two would silently fail against one of the two
 * APIs, so the four values below are separate secrets:
 *
 *   APPLE_SIGNIN_TEAM_ID      the 10-character Team ID
 *   APPLE_SIGNIN_KEY_ID       the Key ID of the Sign in with Apple key
 *   APPLE_SIGNIN_PRIVATE_KEY  the `.p8` contents, PEM with headers
 *   APPLE_SIGNIN_CLIENT_ID    the client id the grant was issued for —
 *                             the bundle id for the native flow
 *                             (`com.ascnd.fitnessos`), the Service ID for
 *                             the web OAuth flow
 *
 * Any of them missing means revocation is skipped, loudly, and deletion
 * proceeds. That is deliberate: the button is currently hidden in the
 * native app, so most deletions have no Apple grant at all, and a missing
 * secret must never turn into a failed deletion.
 *
 * ── where the token comes from ──
 *
 * Apple revokes a *refresh token* (or, failing that, an access token). The
 * server does not hold one: Supabase keeps the provider tokens from the
 * sign-in, and the admin API does not hand them back. So the client sends
 * one of two things in the delete-account body, and the server uses
 * whichever arrives:
 *
 *   · `apple_refresh_token` — revoked directly;
 *   · `apple_authorization_code` — a fresh code from re-authenticating with
 *     Apple at deletion time, exchanged here for a refresh token and then
 *     revoked. Codes are single-use and expire in minutes, so only a code
 *     minted for this deletion works.
 *
 * Neither is sent by the client today: the client half (re-authenticate
 * with Apple inside the delete flow, send the code) is follow-up work,
 * recorded in CONSTRAINTS_AND_DEFERRED.md. Until it lands, deletions of
 * Apple-linked accounts log `no_token` and proceed — visible, not silent.
 *
 * ── what is never logged ──
 *
 * Tokens and codes are secrets. Logs carry only the outcome and Apple's
 * error code (`invalid_grant`, `invalid_client`, …), never token material,
 * never the client secret.
 */

const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

export interface AppleSignInConfig {
  teamId: string;
  keyId: string;
  /** PEM contents of the `.p8`, headers included. */
  privateKey: string;
  clientId: string;
}

/** The four secrets above, or `null` when any is missing. */
export function appleSignInConfig(): AppleSignInConfig | null {
  const teamId = Deno.env.get("APPLE_SIGNIN_TEAM_ID");
  const keyId = Deno.env.get("APPLE_SIGNIN_KEY_ID");
  const privateKey = Deno.env.get("APPLE_SIGNIN_PRIVATE_KEY");
  const clientId = Deno.env.get("APPLE_SIGNIN_CLIENT_ID");
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  return { teamId, keyId, privateKey, clientId };
}

export type AppleRevokeOutcome =
  | { status: "revoked" }
  | { status: "not_configured" }
  | { status: "no_token" }
  | { status: "failed"; detail: string };

/* `Uint8Array<ArrayBuffer>`, not bare `Uint8Array`: Web Crypto's
   `BufferSource` requires an `ArrayBuffer`-backed view, and the bare
   type widens to `ArrayBufferLike` (which admits `SharedArrayBuffer`),
   so `importKey` below would not type-check. The bytes were always
   `ArrayBuffer`-backed — `new Uint8Array(n)` allocates one — so this
   annotation changes no runtime behavior. */
function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The `client_secret` Apple wants: ES256, signed with the Sign in with
 * Apple key, valid for a few minutes.
 *
 * The claims are the ones Apple's token endpoint requires — `iss` is the
 * Team ID, `aud` is `https://appleid.apple.com`, `sub` is the client id
 * the grant was issued for — and they are *not* the App Store Server API
 * claims in `_shared/apple.ts` (issuer id, `appstoreconnect-v1` audience,
 * bundle id). Same signing mechanics, different identity.
 */
async function signInClientSecret(cfg: AppleSignInConfig): Promise<string> {
  const pem = cfg.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64ToBytes(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: cfg.keyId, typ: "JWT" };
  const claims = {
    iss: cfg.teamId,
    iat: now,
    exp: now + 300,
    aud: "https://appleid.apple.com",
    sub: cfg.clientId,
  };
  const enc = new TextEncoder();
  const signingInput =
    bytesToB64url(enc.encode(JSON.stringify(header))) +
    "." +
    bytesToB64url(enc.encode(JSON.stringify(claims)));

  /* Web Crypto's ECDSA output is raw r‖s, which is exactly the 64 bytes JWS
     ES256 wants — no DER unwrapping, which is the step people get wrong. */
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );
  return `${signingInput}.${bytesToB64url(sig)}`;
}

/** Apple's error code from a failed token/revoke call, or the HTTP status. */
async function appleError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* Not JSON — fall through to the status. */
  }
  return `http_${res.status}`;
}

/** Exchange a fresh authorization code for a refresh token, or `null`. */
async function exchangeAuthorizationCode(
  code: string,
  cfg: AppleSignInConfig,
  clientSecret: string,
  doFetch: typeof fetch,
): Promise<string | null> {
  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const res = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) {
    console.error("apple-signin-revoke: code exchange failed", await appleError(res));
    return null;
  }
  const body = await res.json();
  return typeof body?.refresh_token === "string" ? body.refresh_token : null;
}

/**
 * Revoke the Apple grant for one deletion.
 *
 * Never throws: every failure — unconfigured secrets, no token, a network
 * error, an Apple error — comes back as an outcome, and the caller deletes
 * the account regardless. Every outcome is logged, so a skipped revocation
 * is visible in the function logs rather than silent.
 *
 * `deps` exists for tests: pass a config and a stub `fetch` instead of
 * reading secrets and calling Apple.
 */
export async function revokeAppleTokens(
  input: { refreshToken?: string; authorizationCode?: string },
  deps: { config?: AppleSignInConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<AppleRevokeOutcome> {  const cfg = deps.config === undefined ? appleSignInConfig() : deps.config;
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    if (!cfg) {
      console.error(
        "apple-signin-revoke: skipped, APPLE_SIGNIN_TEAM_ID / APPLE_SIGNIN_KEY_ID / " +
          "APPLE_SIGNIN_PRIVATE_KEY / APPLE_SIGNIN_CLIENT_ID not all configured",
      );
      return { status: "not_configured" };
    }

    let refreshToken = input.refreshToken;
    if (!refreshToken && input.authorizationCode) {
      refreshToken = (await exchangeAuthorizationCode(
        input.authorizationCode,
        cfg,
        await signInClientSecret(cfg),
        doFetch,
      )) ?? undefined;
      if (!refreshToken) {
        return { status: "failed", detail: "code_exchange_failed" };
      }
    }
    if (!refreshToken) {
      console.error(
        "apple-signin-revoke: skipped, no apple_refresh_token or apple_authorization_code " +
          "supplied — the client must send a fresh authorization code at deletion time",
      );
      return { status: "no_token" };
    }

    const form = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: await signInClientSecret(cfg),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    const res = await doFetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) {
      const detail = await appleError(res);
      console.error("apple-signin-revoke: Apple refused the revocation", detail);
      return { status: "failed", detail };
    }
    console.log("apple-signin-revoke: revoked");
    return { status: "revoked" };
  } catch (e) {
    console.error("apple-signin-revoke: threw, deletion continues", e);
    return { status: "failed", detail: "thrown" };
  }
}

/**
 * The smallest slice of the Supabase admin client this helper needs: the
 * one call that lists a user's identities. Kept structural so tests can
 * pass a stub and the handler can pass its real client.
 */
export interface AppleIdentityAdmin {
  auth: {
    admin: {
      getUserById(userId: string): Promise<{
        data: { user: { identities?: Array<{ provider?: string }> | null } | null };
        error: { message: string } | null;
      }>;
    };
  };
}

/**
 * Revoke the Apple grant for one deletion, if the account has one — and
 * never fail the deletion for it.
 *
 * The two stages are separated on purpose, because they fail differently:
 *
 *   1. Listing identities. A failure here means "unknown", and "unknown"
 *      is treated as "no Apple identity": logged, no revocation
 *      attempted, deletion continues. Returning an error to the caller
 *      would block the deletion over a lookup the deletion does not
 *      need, and the account is the thing the person asked to lose.
 *   2. Revocation itself, for Apple-linked accounts only. Handled inside
 *      `revokeAppleTokens`, which never throws and reports every outcome.
 *
 * This lives here, not in `delete-account`, because the deployable gate
 * requires every `error` branch in the handler to answer 4xx/5xx — the
 * right rule for a deletion step, the wrong answer for a best-effort
 * preamble whose failure must never change the response. The fence is
 * structural: this function returns `void` and cannot throw, so the
 * handler has no error branch here to get wrong. `deps` exists for
 * tests, as on `revokeAppleTokens`.
 */
export async function revokeAppleGrantIfLinked(
  admin: AppleIdentityAdmin,
  userId: string,
  input: { refreshToken?: string; authorizationCode?: string },
  deps: { config?: AppleSignInConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  let identities: Array<{ provider?: string }> | null | undefined;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      console.error("apple-signin-revoke: could not list identities", error.message);
      return;
    }
    identities = data.user?.identities;
  } catch (e) {
    /* Revocation must never fail a deletion. Logged, then forgotten. */
    console.error("apple-signin-revoke: skipped after an error", e);
    return;
  }
  if (!(identities ?? []).some((i) => i.provider === "apple")) return;
  await revokeAppleTokens(input, deps);
}
