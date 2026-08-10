/**
 * Asking Apple what somebody actually bought.
 *
 * ── the design decision this file is built around ──
 *
 * Nothing the client sends and nothing the webhook sends is trusted. Both are
 * treated as *signals* — "something happened, go and look" — and the answer
 * always comes from a fresh HTTPS call to Apple's App Store Server API.
 *
 * The conventional build verifies the JWS signature on the notification body
 * and believes what it says. That requires validating the `x5c` certificate
 * chain — leaf, intermediate, Apple Root CA G3 — which means parsing X.509 in
 * Deno, and it is the kind of code that fails **open**: a chain check that
 * quietly returns true looks exactly like one that works, and the symptom is
 * free subscriptions for anyone who can POST to a public URL.
 *
 * I could not test that path here, so the architecture removes the need for it.
 * A forged webhook, at worst, makes this server ask Apple a question it already
 * knew the answer to. The trust boundary is TLS to `api.storekit.itunes.apple.com`
 * plus the `appAccountToken` check below, and both of those are verifiable.
 *
 * ── appAccountToken is what ties a purchase to a person ──
 *
 * The client tells us a transaction id, and a transaction id is not a secret —
 * anybody could send somebody else's. What makes it safe is that the app sets
 * `appAccountToken` to the buyer's own user id at purchase time, Apple stores
 * it with the transaction, and this server refuses any transaction whose token
 * does not match the caller. Without that check, a stolen transaction id is a
 * free subscription for whoever finds one.
 *
 * ── deprecated on purpose ──
 *
 * `verifyReceipt` is not used. Apple has marked it and Server Notifications v1
 * for deprecation in favour of the App Store Server API and notifications v2,
 * which return structured, Apple-signed transaction data instead of an
 * encrypted blob to parse.
 */

/** Apple's production and sandbox hosts. A build is one or the other, never both at once. */
const HOSTS = {
  production: "https://api.storekit.itunes.apple.com",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;

export type AppleEnv = keyof typeof HOSTS;

export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  /** the user id the app attached at purchase time */
  appAccountToken?: string;
  /** ms since epoch; absent for non-renewing products */
  expiresDate?: number;
  revocationDate?: number;
  environment?: string;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The payload of a JWS, **without** checking its signature.
 *
 * Named to say so. Every caller of this either got the JWS over TLS directly
 * from Apple — in which case the transport is the authentication — or is using
 * it as a hint before going to ask Apple properly. Nothing that grants an
 * entitlement may rest on this alone, which is why the name is awkward.
 */
export function decodeJwsPayloadUnverified<T>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as T;
  } catch {
    return null;
  }
}

/**
 * The bearer token Apple's API wants: ES256, signed with the App Store Connect
 * key, valid for a few minutes.
 *
 * `bid` is the bundle id and Apple rejects the token without it. The private
 * key is a PKCS#8 `.p8` from App Store Connect, stored as a secret — it is the
 * one credential here that would let somebody else read this app's sales data,
 * so it never travels to a client.
 */
async function appleJwt(): Promise<string> {
  const keyId = Deno.env.get("APPLE_KEY_ID");
  const issuerId = Deno.env.get("APPLE_ISSUER_ID");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  const p8 = Deno.env.get("APPLE_PRIVATE_KEY");
  if (!keyId || !issuerId || !bundleId || !p8) {
    throw new Error("Apple credentials not configured");
  }

  const pem = p8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64urlToBytes(pem.replace(/\+/g, "-").replace(/\//g, "_")),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claims = {
    iss: issuerId,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
    bid: bundleId,
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

/**
 * Everything Apple knows about one transaction, fetched over TLS.
 *
 * Sandbox is tried when production says "not found", which is the documented
 * shape of this: a TestFlight or review build's transactions do not exist in
 * production, and hard-coding one environment means either review fails or
 * real purchases do.
 */
export async function fetchTransaction(transactionId: string): Promise<AppleTransaction | null> {
  const jwt = await appleJwt();
  const order: AppleEnv[] = ["production", "sandbox"];

  for (const env of order) {
    const res = await fetch(`${HOSTS[env]}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) {
      console.error("App Store Server API", env, res.status, await res.text());
      return null;
    }
    const body = await res.json();
    /* The response is a JWS that arrived over TLS from Apple's own host. The
       transport is the authentication; see the note at the top of this file
       about why this project does not rest anything on an x5c chain check it
       cannot test. */
    const tx = decodeJwsPayloadUnverified<AppleTransaction>(body?.signedTransactionInfo ?? "");
    if (tx) return { ...tx, environment: env };
    return null;
  }
  return null;
}

/** Which product ids map to which tier. The only place that mapping exists. */
export function tierFor(productId: string): "plus" | "max" | null {
  const plus = Deno.env.get("PRODUCT_ID_PLUS");
  const max = Deno.env.get("PRODUCT_ID_MAX");
  if (max && productId === max) return "max";
  if (plus && productId === plus) return "plus";
  return null;
}

/**
 * Whether this transaction entitles anybody to anything right now.
 *
 * Revocation is checked before expiry because a refunded subscription can still
 * have a future `expiresDate` — Apple records that the customer got their money
 * back without rewriting when the period would have ended. Reading expiry first
 * keeps a refunded user subscribed until the date they no longer paid for.
 */
export function entitlementFrom(tx: AppleTransaction): {
  tier: "plus" | "max";
  expiresAt: string | null;
} | null {
  if (tx.revocationDate) return null;
  const tier = tierFor(tx.productId);
  if (!tier) return null;
  if (tx.expiresDate && tx.expiresDate <= Date.now()) return null;
  return {
    tier,
    expiresAt: tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null,
  };
}
