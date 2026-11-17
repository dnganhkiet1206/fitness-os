import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type AppleSignInConfig,
  revokeAppleTokens,
} from "./apple-signin.ts";

/**
 * The revocation helper, against a stub `fetch` — Apple is never called.
 * The signing key is generated per run: no real credential anywhere near
 * a test. Run with `deno test` from this directory (no CI runs it yet).
 */

async function testKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let s = "";
  for (const x of pkcs8) s += String.fromCharCode(x);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(s)}\n-----END PRIVATE KEY-----`;
}

async function testConfig(): Promise<AppleSignInConfig> {
  return {
    teamId: "TEAMID1234",
    keyId: "KEYID12345",
    privateKey: await testKeyPem(),
    clientId: "com.ascnd.fitnessos",
  };
}

function b64urlDecode(s: string): Record<string, unknown> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}

interface SeenCall {
  url: string;
  form: URLSearchParams;
}

function stubFetch(
  handler: (url: string, form: URLSearchParams) => Response,
  seen: SeenCall[],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const form = new URLSearchParams(String(init?.body ?? ""));
    seen.push({ url, form });
    return handler(url, form);
  }) as typeof fetch;
}

Deno.test("unconfigured secrets: skipped, Apple never called", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { refreshToken: "rt" },
    { config: null, fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "not_configured");
  assertEquals(seen.length, 0);
});

Deno.test("no token and no code: skipped, Apple never called", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    {},
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "no_token");
  assertEquals(seen.length, 0);
});

Deno.test("refresh token: one revoke call, client_secret carries the Sign in with Apple claims", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { refreshToken: "rt-secret" },
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "revoked");
  assertEquals(seen.length, 1);
  assertEquals(seen[0].url, "https://appleid.apple.com/auth/revoke");
  assertEquals(seen[0].form.get("client_id"), "com.ascnd.fitnessos");
  assertEquals(seen[0].form.get("token"), "rt-secret");
  assertEquals(seen[0].form.get("token_type_hint"), "refresh_token");

  const jwt = seen[0].form.get("client_secret")!;
  const [h, p, s] = jwt.split(".");
  assertEquals(b64urlDecode(h), { alg: "ES256", kid: "KEYID12345", typ: "JWT" });
  const claims = b64urlDecode(p);
  assertEquals(claims.iss, "TEAMID1234");
  assertEquals(claims.aud, "https://appleid.apple.com");
  assertEquals(claims.sub, "com.ascnd.fitnessos");
  assert((claims.exp as number) - (claims.iat as number) === 300);
  assert(s.length > 0);
});

Deno.test("authorization code: exchanged, then the refresh token is revoked", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de" },
    {
      config: await testConfig(),
      fetchImpl: stubFetch((url, form) => {
        if (url.endsWith("/auth/token")) {
          assertEquals(form.get("grant_type"), "authorization_code");
          assertEquals(form.get("code"), "c0de");
          return new Response(JSON.stringify({ refresh_token: "rt-fresh" }), { status: 200 });
        }
        assertEquals(form.get("token"), "rt-fresh");
        return new Response(null, { status: 200 });
      }, seen),
    },
  );
  assertEquals(out.status, "revoked");
  assertEquals(seen.map((c) => c.url), [
    "https://appleid.apple.com/auth/token",
    "https://appleid.apple.com/auth/revoke",
  ]);
});

Deno.test("code exchange failure: failed, no revoke call, no throw", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "stale" },
    {
      config: await testConfig(),
      fetchImpl: stubFetch(
        () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
        seen,
      ),
    },
  );
  assertEquals(out.status, "failed");
  assertEquals(seen.length, 1);
});

Deno.test("Apple refuses the revocation: failed with Apple's error code, no throw", async () => {
  const out = await revokeAppleTokens(
    { refreshToken: "rt" },
    {
      config: await testConfig(),
      fetchImpl: stubFetch(
        () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
        [],
      ),
    },
  );
  assertEquals(out, { status: "failed", detail: "invalid_client" });
});

Deno.test("network failure: failed, no throw", async () => {
  const out = await revokeAppleTokens(
    { refreshToken: "rt" },
    {
      config: await testConfig(),
      fetchImpl: (() => Promise.reject(new Error("network dropped"))) as typeof fetch,
    },
  );
  assertEquals(out, { status: "failed", detail: "thrown" });
});
