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

/**
 * Apple could not answer — as opposed to Apple answering "no such transaction".
 *
 * ── the two were the same value, and that cost a paying customer ──
 *
 * Both lookups below returned `null` for a 404 *and* for a 500, a 429 or a 503.
 * The callers read `null` as a fact about the purchase, and the two facts they
 * inferred were both wrong:
 *
 *   · the webhook answered `200 {"ignored":"not found"}` to a transient Apple
 *     failure. 2xx is how Apple is told a notification was delivered, so it
 *     stops resending — the renewal or the refund is gone for good. Measured:
 *
 *         Apple /transactions → 500   200  {"ok":true,"ignored":"not found"}
 *         Apple /transactions → 429   200  {"ok":true,"ignored":"not found"}
 *
 *   · `resolveEntitlementTransaction` fell back to the transaction the *event*
 *     named, which is the exact stale-period bug the subscription lookup exists
 *     to prevent. One 429 and a late notification downgrades an active
 *     subscriber. Measured, against a subscription Apple says is active:
 *
 *         late EXPIRED for period 1, healthy       200  max/future
 *         late EXPIRED for period 1, /subs 500     200  free/null   ← đây
 *         late EXPIRED for period 1, /subs 429     200  free/null
 *
 * A separate type so neither can be reached by accident: 404 still means "no
 * such thing", and anything else stops the request instead of answering it.
 */
export class AppleUnavailableError extends Error {
  constructor(where: string, status: number) {
    super(`App Store Server API ${where} answered ${status}`);
    this.name = "AppleUnavailableError";
  }
}

/**
 * Which of Apple's two worlds this deployment will accept an entitlement from.
 *
 * ── sandbox purchases are free, and they were granting real subscriptions ──
 *
 * `fetchTransaction` asked production and then, on a 404, sandbox — with no
 * condition attached. A sandbox transaction is minted by any sandbox tester or
 * TestFlight build at no cost, and the buyer chooses `appAccountToken`, so it
 * names whichever account it likes. Measured against both real handlers:
 *
 *     webhook, sandbox-only transaction         200  {"tier":"max"}
 *     verify-purchase, sandbox-only transaction 200  {"tier":"max"}
 *     → row: max, expires in 365 days, nothing paid
 *
 * The environment is not something this server can infer — a review build
 * really does buy in sandbox against the production backend — so it is a
 * deployment decision, and it is now made explicitly rather than silently as
 * "always yes". `APPLE_ENV` is `production` (the default), `sandbox`, or both
 * comma-separated. An unrecognised value is ignored rather than obeyed.
 */
export function appleEnvironments(): AppleEnv[] {
  const raw = Deno.env.get("APPLE_ENV");
  if (!raw) return ["production"];
  const wanted = raw.split(",").map((s) => s.trim().toLowerCase());
  const envs = (["production", "sandbox"] as const).filter((e) => wanted.includes(e));
  return envs.length ? [...envs] : ["production"];
}

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
  /**
   * Apple's own word for what kind of product this is — `"Auto-Renewable
   * Subscription"`, `"Non-Consumable"`, `"Consumable"`, `"Non-Renewing
   * Subscription"`.
   *
   * Modelled because it is the only thing that can tell a *lifetime purchase*
   * from a *subscription whose expiry did not arrive*, and those two produce
   * the same shape here: no `expiresDate`. Read `entitlementFrom` for what is
   * done with the distinction.
   */
  type?: string;
}

/** One entry of Apple's Get All Subscription Statuses response. */
interface SubscriptionStatus {
  originalTransactionId?: string;
  /** 1 active · 2 expired · 3 billing retry · 4 grace period · 5 revoked */
  status?: number;
  signedTransactionInfo?: string;
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
 * The environments consulted are the ones this deployment has opted into — see
 * `appleEnvironments`. `null` means every one of them said 404; a host that
 * could not answer throws instead, so "Apple is down" is never mistaken for
 * "this purchase does not exist".
 */
export async function fetchTransaction(transactionId: string): Promise<AppleTransaction | null> {
  const jwt = await appleJwt();

  for (const env of appleEnvironments()) {
    const res = await fetch(`${HOSTS[env]}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) {
      console.error("App Store Server API", env, res.status, await res.text());
      throw new AppleUnavailableError(`transactions/${env}`, res.status);
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

/**
 * The subscription's state **now**, rather than one period's.
 *
 * ── the bug this exists for ──
 *
 * `fetchTransaction` answers "what is the state of *this transaction*". For an
 * auto-renewable subscription that is the wrong question, and the difference is
 * a paying customer losing access.
 *
 * Every renewal mints a **new** `transactionId`; only `originalTransactionId`
 * names the subscription across its whole life. Apple retries a notification
 * for days, so one about period 1 can easily land after period 2 has started —
 * and looking up period 1 returns period 1: `expiresDate` in the past,
 * `entitlementFrom` returns null, and the handler writes `free` over an active
 * subscription. Measured against the real handlers:
 *
 *     1. webhook DID_RENEW cho kỳ 2        200  max exp=tương lai
 *     4. webhook CŨ của kỳ 1 tới muộn      200  free exp=null      ← đây
 *
 * Nothing re-checks afterwards, so the customer stays downgraded until the next
 * Apple event — up to a month — or until they think to press restore.
 *
 * ── Get All Subscription Statuses ──
 *
 * `/inApps/v1/subscriptions/{originalTransactionId}` returns the *latest*
 * transaction for each subscription in the group, whatever triggered the
 * lookup. That is the state this server should be writing down, and asking for
 * it makes the ordering of notifications stop mattering: every event, early,
 * late or duplicated, resolves to the same current answer.
 *
 * `status` is read only for the log. Whether a billing-retry or grace-period
 * subscription keeps paid access is a product decision nothing in this
 * repository has made, so the entitlement is still decided by the transaction's
 * own `revocationDate` and `expiresDate`, exactly as before — only the
 * transaction it decides on has changed.
 *
 * Returns `null` when the product is not a subscription at all (a lifetime
 * purchase has no subscription status), and the caller falls back to the
 * transaction it already has.
 */
export async function fetchSubscriptionState(
  originalTransactionId: string,
  env: AppleEnv,
): Promise<{ tx: AppleTransaction; status?: number } | null> {
  const jwt = await appleJwt();
  const res = await fetch(
    `${HOSTS[env]}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  /* 404 is an answer: this product has no subscription status, so it is not a
     subscription, and the caller falls back to the transaction it already has.
     Anything else is not an answer — falling back on it writes down a period
     Apple never said was current. */
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("App Store subscription status", env, res.status, await res.text());
    throw new AppleUnavailableError(`subscriptions/${env}`, res.status);
  }
  const body = await res.json();
  const groups: { lastTransactions?: SubscriptionStatus[] }[] = body?.data ?? [];
  for (const group of groups) {
    for (const entry of group.lastTransactions ?? []) {
      if (entry.originalTransactionId !== originalTransactionId) continue;
      const tx = decodeJwsPayloadUnverified<AppleTransaction>(entry.signedTransactionInfo ?? "");
      if (tx) return { tx: { ...tx, environment: env }, status: entry.status };
    }
  }
  return null;
}

/**
 * The transaction an entitlement should be decided from, given any transaction
 * id from any event.
 *
 * Two answers come back, and they are different on purpose:
 *
 *   · `identity` is the transaction that was actually asked about. Its
 *     `appAccountToken` is what proves whose purchase this is, and it is the
 *     one the caller compares against the signed-in user.
 *   · `current` is the subscription's latest state, which is what gets written
 *     down.
 *
 * For a lifetime purchase the two are the same object.
 */
export async function resolveEntitlementTransaction(
  transactionId: string,
): Promise<{ identity: AppleTransaction; current: AppleTransaction; status?: number } | null> {
  const identity = await fetchTransaction(transactionId);
  if (!identity) return null;
  const env = (identity.environment as AppleEnv) ?? "production";
  const latest = identity.originalTransactionId
    ? await fetchSubscriptionState(identity.originalTransactionId, env)
    : null;
  return { identity, current: latest?.tx ?? identity, status: latest?.status };
}

/**
 * Which product ids map to which tier. The only place that mapping exists.
 *
 * ── "not our product" and "we do not know our products" are not the same ──
 *
 * This returned `null` for both, and `entitlementFrom` turns `null` into *no
 * entitlement*, which the handlers write down as `free`. So a missing or
 * renamed `PRODUCT_ID_MAX` on the server did not fail loudly — it quietly
 * cancelled every paying subscriber the moment Apple sent their next renewal
 * notification, with a 200 and a cheerful log line. Measured:
 *
 *     PRODUCT_ID_MAX chưa cấu hình  →  200  ghi được: free
 *
 * `unconfigured` says which of the two happened, so a handler can refuse to
 * write anything rather than write a downgrade it has no basis for.
 */
export function tierFor(productId: string): "plus" | "max" | "unconfigured" | null {
  const plus = Deno.env.get("PRODUCT_ID_PLUS");
  const max = Deno.env.get("PRODUCT_ID_MAX");
  if (!plus && !max) return "unconfigured";
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
} | null | "unconfigured" {
  if (tx.revocationDate) return null;
  const tier = tierFor(tx.productId);
  if (tier === "unconfigured") return "unconfigured";
  if (!tier) return null;
  if (tx.expiresDate && tx.expiresDate <= Date.now()) return null;
  /*
    ── a subscription with no expiry is not a lifetime membership ──

    `expiresAt: null` means *forever* to `current_tier()`, which reads
    `expires_at IS NULL OR expires_at > now()`. That is correct for a
    non-consumable somebody bought outright, and it is the worst possible
    reading of an auto-renewable subscription whose `expiresDate` did not come
    back — one malformed response and the account is `max` for ever, with
    nothing in the app able to notice.

    Apple's own `type` is what separates the two, so the impossible state is
    refused rather than resolved in the customer's favour: the next
    notification, or a restore, writes the real answer.
  */
  if (!tx.expiresDate && tx.type === "Auto-Renewable Subscription") {
    console.error("subscription without expiresDate — refusing to grant forever", tx.transactionId);
    return null;
  }
  return {
    tier,
    expiresAt: tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null,
  };
}
