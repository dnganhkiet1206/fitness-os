import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type AppleIdentityAdmin,
  type AppleSignInConfig,
  appleSubjectsOf,
  revokeAppleGrantIfLinked,
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

function b64url(o: unknown): string {
  return btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** An `id_token` shaped like Apple's (unsigned — the helper never checks it, see appleSubject). */
function idToken(
  sub: string,
  over: { iss?: string; aud?: unknown } = {},
): string {
  const claims = {
    iss: over.iss ?? "https://appleid.apple.com",
    aud: over.aud ?? "com.ascnd.fitnessos",
    sub,
  };
  return `${b64url({ alg: "RS256", kid: "x" })}.${b64url(claims)}.sig`;
}

/**
 * Apple, stubbed: the token endpoint answers `tokenBody`, the revoke
 * endpoint answers `revoke`.
 */
function apple(
  tokenBody: Record<string, unknown>,
  seen: SeenCall[],
  revoke: () => Response = () => new Response(null, { status: 200 }),
): typeof fetch {
  return stubFetch((url) => {
    if (url.endsWith("/auth/token")) return new Response(JSON.stringify(tokenBody), { status: 200 });
    return revoke();
  }, seen);
}

const ME = "001234.abcdef.apple-me";
const SOMEONE_ELSE = "009999.ffffff.apple-other";

Deno.test("unconfigured secrets: skipped, Apple never called", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de", appleSubjects: [ME] },
    { config: null, fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "not_configured");
  assertEquals(seen.length, 0);
});

Deno.test("no code: skipped, Apple never called", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { appleSubjects: [ME] },
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "no_token");
  assertEquals(seen.length, 0);
});

Deno.test("a raw refresh token is no longer accepted (SEC-13)", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    // deno-lint-ignore no-explicit-any
    { refreshToken: "victim-rt", appleSubjects: [ME] } as any,
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(out.status, "no_token");
  assertEquals(seen.length, 0);
});

Deno.test("authorization code for this account: exchanged, then revoked; client_secret carries the Sign in with Apple claims", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de", appleSubjects: [ME] },
    { config: await testConfig(), fetchImpl: apple({ refresh_token: "rt-fresh", id_token: idToken(ME) }, seen) },
  );
  assertEquals(out.status, "revoked");
  assertEquals(seen.map((c) => c.url), [
    "https://appleid.apple.com/auth/token",
    "https://appleid.apple.com/auth/revoke",
  ]);
  assertEquals(seen[0].form.get("grant_type"), "authorization_code");
  assertEquals(seen[0].form.get("code"), "c0de");
  assertEquals(seen[1].form.get("client_id"), "com.ascnd.fitnessos");
  assertEquals(seen[1].form.get("token"), "rt-fresh");
  assertEquals(seen[1].form.get("token_type_hint"), "refresh_token");

  const jwt = seen[1].form.get("client_secret")!;
  const [h, p, s] = jwt.split(".");
  assertEquals(b64urlDecode(h), { alg: "ES256", kid: "KEYID12345", typ: "JWT" });
  const claims = b64urlDecode(p);
  assertEquals(claims.iss, "TEAMID1234");
  assertEquals(claims.aud, "https://appleid.apple.com");
  assertEquals(claims.sub, "com.ascnd.fitnessos");
  assert((claims.exp as number) - (claims.iat as number) === 300);
  assert(s.length > 0);
});

Deno.test("aud as an array that includes this client: revoked", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de", appleSubjects: [ME] },
    {
      config: await testConfig(),
      fetchImpl: apple({ refresh_token: "rt", id_token: idToken(ME, { aud: ["x", "com.ascnd.fitnessos"] }) }, seen),
    },
  );
  assertEquals(out.status, "revoked");
});

/* SEC-13: a code that is not this account's Apple ID never reaches /auth/revoke. */
for (
  const [label, tokenBody] of [
    ["the code belongs to another Apple ID", { refresh_token: "rt-other", id_token: idToken(SOMEONE_ELSE) }],
    ["id_token issued for another client", { refresh_token: "rt", id_token: idToken(ME, { aud: "com.other.app" }) }],
    ["id_token not issued by Apple", { refresh_token: "rt", id_token: idToken(ME, { iss: "https://evil.example" }) }],
    ["no id_token in Apple's answer", { refresh_token: "rt" }],
    ["id_token is not a JWT", { refresh_token: "rt", id_token: "garbage" }],
  ] as const
) {
  Deno.test(`${label}: identity_mismatch, nothing revoked`, async () => {
    const seen: SeenCall[] = [];
    const out = await revokeAppleTokens(
      { authorizationCode: "c0de", appleSubjects: [ME] },
      { config: await testConfig(), fetchImpl: apple(tokenBody, seen) },
    );
    assertEquals(out, { status: "failed", detail: "identity_mismatch" });
    assertEquals(seen.map((c) => c.url), ["https://appleid.apple.com/auth/token"]);
  });
}

Deno.test("account's Apple subject unknown: identity_unknown, Apple never called", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de", appleSubjects: [] },
    { config: await testConfig(), fetchImpl: apple({ refresh_token: "rt", id_token: idToken(ME) }, seen) },
  );
  assertEquals(out, { status: "failed", detail: "identity_unknown" });
  assertEquals(seen.length, 0);
});

Deno.test("code exchange failure: failed, no revoke call, no throw", async () => {
  const seen: SeenCall[] = [];
  const out = await revokeAppleTokens(
    { authorizationCode: "stale", appleSubjects: [ME] },
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
    { authorizationCode: "c0de", appleSubjects: [ME] },
    {
      config: await testConfig(),
      fetchImpl: apple(
        { refresh_token: "rt", id_token: idToken(ME) },
        [],
        () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
      ),
    },
  );
  assertEquals(out, { status: "failed", detail: "invalid_client" });
});

Deno.test("network failure: failed, no throw", async () => {
  const out = await revokeAppleTokens(
    { authorizationCode: "c0de", appleSubjects: [ME] },
    {
      config: await testConfig(),
      fetchImpl: (() => Promise.reject(new Error("network dropped"))) as typeof fetch,
    },
  );
  assertEquals(out, { status: "failed", detail: "thrown" });
});

Deno.test("appleSubjectsOf: Apple rows only, id and identity_data.sub, deduplicated", () => {
  assertEquals(
    appleSubjectsOf([
      { provider: "google", id: "g-1", identity_data: { sub: "g-1" } },
      { provider: "apple", id: ME, identity_data: { sub: ME } },
      { provider: "apple", identity_data: { sub: "second" } },
      { provider: "apple" },
    ]),
    [ME, "second"],
  );
});

function stubAdmin(
  getUserById: AppleIdentityAdmin["auth"]["admin"]["getUserById"],
): AppleIdentityAdmin {
  return { auth: { admin: { getUserById } } };
}

Deno.test("no Apple identity: Apple never called, no throw", async () => {
  const seen: SeenCall[] = [];
  await revokeAppleGrantIfLinked(
    stubAdmin(async () => ({
      data: { user: { identities: [{ provider: "google", id: "g-1" }] } },
      error: null,
    })),
    "user-1",
    { authorizationCode: "c0de" },
    { config: await testConfig(), fetchImpl: apple({ refresh_token: "rt", id_token: idToken(ME) }, seen) },
  );
  assertEquals(seen.length, 0);
});

Deno.test("Apple identity, code for it: the token is revoked", async () => {
  const seen: SeenCall[] = [];
  await revokeAppleGrantIfLinked(
    stubAdmin(async () => ({
      data: { user: { identities: [{ provider: "email", id: "e" }, { provider: "apple", id: ME }] } },
      error: null,
    })),
    "user-1",
    { authorizationCode: "c0de" },
    { config: await testConfig(), fetchImpl: apple({ refresh_token: "rt-secret", id_token: idToken(ME) }, seen) },
  );
  assertEquals(seen.length, 2);
  assertEquals(seen[1].url, "https://appleid.apple.com/auth/revoke");
  assertEquals(seen[1].form.get("token"), "rt-secret");
});

Deno.test("Apple identity, code for SOMEONE ELSE's Apple ID: nothing revoked (SEC-13)", async () => {
  const seen: SeenCall[] = [];
  await revokeAppleGrantIfLinked(
    stubAdmin(async () => ({
      data: { user: { identities: [{ provider: "apple", id: ME, identity_data: { sub: ME } }] } },
      error: null,
    })),
    "user-1",
    { authorizationCode: "victims-code" },
    { config: await testConfig(), fetchImpl: apple({ refresh_token: "victim-rt", id_token: idToken(SOMEONE_ELSE) }, seen) },
  );
  assertEquals(seen.map((c) => c.url), ["https://appleid.apple.com/auth/token"]);
});

Deno.test("identity lookup fails: no revoke attempted, no throw", async () => {
  const seen: SeenCall[] = [];
  await revokeAppleGrantIfLinked(
    stubAdmin(async () => ({ data: { user: null }, error: { message: "boom" } })),
    "user-1",
    { authorizationCode: "c0de" },
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(seen.length, 0);
});

Deno.test("identity lookup throws: no revoke attempted, no throw", async () => {
  const seen: SeenCall[] = [];
  await revokeAppleGrantIfLinked(
    stubAdmin(async () => {
      throw new Error("network dropped");
    }),
    "user-1",
    { authorizationCode: "c0de" },
    { config: await testConfig(), fetchImpl: stubFetch(() => new Response(null, { status: 200 }), seen) },
  );
  assertEquals(seen.length, 0);
});
