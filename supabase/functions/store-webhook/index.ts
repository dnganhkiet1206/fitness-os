import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  type AppleTransaction,
  AppleUnavailableError,
  decodeJwsPayloadUnverified,
  entitlementFrom,
  resolveEntitlementTransaction,
} from "../_shared/apple.ts";
import { corsHeaders, json } from "../_shared/guard.ts";

/**
 * Apple telling us something changed — a renewal, a cancellation, a refund.
 *
 * ── this endpoint is unauthenticated, and that is fine ──
 *
 * It has to be: Apple's servers call it and they do not hold a user token. What
 * makes that safe is that **nothing in the request body is believed**. The
 * payload is opened only far enough to find a transaction id, and then the
 * actual state is fetched from Apple over TLS. A forged POST therefore achieves
 * one of two things: an error, or this server re-confirming an entitlement that
 * was already true.
 *
 * The alternative — verifying the JWS signature and trusting the decoded
 * payload — is the usual design and it needs `x5c` chain validation against
 * Apple Root CA G3. That is X.509 parsing in Deno, it is untestable from here,
 * and its failure mode is silent: a chain check that always returns true is
 * indistinguishable from one that works until somebody notices free
 * subscriptions. Re-asking Apple removes the need to get it right.
 *
 * ── what a notification can and cannot do ──
 *
 * It can move an entitlement to whatever Apple currently says, including down
 * to `free` on a refund. It cannot invent a user: the row is found by
 * `appAccountToken`, the id the app attached at purchase, and a notification
 * about a transaction with no token or an unknown one is logged and dropped.
 *
 * ── it answers 200 to almost everything ──
 *
 * Apple retries non-2xx for days. A notification this server cannot act on is
 * not a failure Apple can fix by sending it again, so it is acknowledged and
 * logged. Only a genuine internal fault returns 500, where a retry might work.
 */

/** The shape a `user_id` has to have to name a row in `entitlements`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What this endpoint will read before it stops reading.
 *
 * Every other function here stands behind `requireUser`, so the only bodies
 * they ever parse belong to somebody who signed in. This one is open to the
 * internet by design, and it had no bound of any kind: an 8 MiB `signedPayload`
 * was base64-decoded and JSON-parsed in full — measured at 63 ms of a single
 * worker — and any string at all was then spent on an authenticated call to
 * Apple's API, whose rate limit belongs to this app's key.
 *
 * Apple's notifications are a few kilobytes and its transaction ids are short;
 * 64 KiB and the 64 characters `verify-purchase` already enforces are both far
 * above anything real and far below anything worth sending.
 */
const MAX_PAYLOAD = 64 * 1024;
const MAX_TXN_ID = 64;

interface NotificationPayload {
  notificationType?: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    environment?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    /* A body that is not JSON did not come from Apple, and no number of retries
       will make it parse — so it is refused here rather than reaching the outer
       catch, which answers 500 and buys days of resends for a bad request. */
    let body: { signedPayload?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }

    const signed = typeof body?.signedPayload === "string" ? body.signedPayload : "";
    if (!signed) return json({ ok: true, ignored: "no signedPayload" });
    if (signed.length > MAX_PAYLOAD) {
      console.warn("webhook signedPayload too large", signed.length);
      return json({ error: "Payload too large" }, 413);
    }

    /* Unverified on purpose — see the note above. This is used to find *which*
       transaction to go and ask about, and for nothing else. */
    const payload = decodeJwsPayloadUnverified<NotificationPayload>(signed);
    const txHint = payload?.data?.signedTransactionInfo
      ? decodeJwsPayloadUnverified<AppleTransaction>(payload.data.signedTransactionInfo)
      : null;

    const transactionId = txHint?.transactionId;
    if (typeof transactionId !== "string" || !transactionId || transactionId.length > MAX_TXN_ID) {
      console.warn("webhook without a usable transaction id", payload?.notificationType);
      return json({ ok: true, ignored: "no transaction" });
    }

    /*
      The only statement in this function whose answer is trusted — and it asks
      about the *subscription*, not about the transaction the notification names.

      Apple retries for days, so a notification about last month's period can
      arrive after this month's renewal. Looking up that period returns that
      period: expired. Writing it down cancelled a paying customer.
      `resolveEntitlementTransaction` resolves through `originalTransactionId`
      to whatever Apple says is current, which makes the order notifications
      arrive in stop mattering — see `_shared/apple.ts`.
    */
    const resolved = await resolveEntitlementTransaction(transactionId);
    if (!resolved) {
      console.warn("webhook transaction not found at Apple", transactionId);
      return json({ ok: true, ignored: "not found" });
    }
    const { current, status } = resolved;

    /*
      The row belongs to whoever owns the state being written into it, and that
      is `current` — not `identity`, which is only the transaction the *event*
      happened to name.

      `appAccountToken` is set per purchase, so a subscription that was resumed
      while a different account was signed in carries a different token on its
      current period than on an older one. Taking the row from `identity` and
      the tier from `current` writes one person's subscription onto another
      person's account. Measured, with a late notification for period 1:

          notification names tx-1 (token ALPHA), Apple says current is tx-2 (token BRAVO)
          → ALPHA row: max, expires in 28 days   BRAVO row: nothing

      There is no fallback to `identity`'s token: a current period with no token
      is an unlinked purchase, which is exactly what the next branch says.
    */
    const userId = current.appAccountToken?.toLowerCase();
    if (!userId) {
      console.warn("webhook transaction has no appAccountToken", transactionId);
      return json({ ok: true, ignored: "unlinked purchase" });
    }
    /* A token that is not a uuid cannot name a row in `entitlements`, and no
       number of Apple retries will turn it into one. Acknowledged, not 500. */
    if (!UUID.test(userId)) {
      console.warn("webhook appAccountToken is not a user id", transactionId);
      return json({ ok: true, ignored: "token is not a user id" });
    }

    const ent = entitlementFrom(current);
    if (ent === "unconfigured") {
      /* No product ids on this server. Writing `free` here would cancel a
         paying subscriber because of a missing environment variable, so
         nothing is written — and 500 is right, because a retry after the
         config is fixed will work. */
      console.error("PRODUCT_ID_PLUS/PRODUCT_ID_MAX not configured — refusing to write");
      return json({ error: "product mapping not configured" }, 500);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: userId,
        tier: ent?.tier ?? "free",
        /* Which of Apple's worlds paid for this. A deployment that has opted
           into sandbox (`APPLE_ENV`) can still tell the two apart afterwards —
           `store` is the column kept so a support question can be answered, and
           "was this a real purchase" is the first such question. */
        store: current.environment === "sandbox" ? "apple-sandbox" : "apple",
        store_txn_id: current.originalTransactionId,
        expires_at: ent?.expiresAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      /* A foreign key violation means the account this purchase points at is
         gone — deleted, most likely. Apple will resend for days and the answer
         will not change, so it is acknowledged rather than retried. Everything
         else is a genuine fault a retry might get past. */
      if (error.code === "23503" || error.code === "22P02") {
        console.warn("webhook names an account that does not exist", userId, error.code);
        return json({ ok: true, ignored: "unknown account" });
      }
      console.error("webhook upsert failed", error.message);
      return json({ error: "upsert failed" }, 500);
    }

    console.log(
      "entitlement updated",
      payload?.notificationType,
      payload?.subtype,
      ent?.tier ?? "free",
      "status",
      status ?? "-",
    );
    return json({ ok: true, tier: ent?.tier ?? "free" });
  } catch (e) {
    /* Apple could not be reached or could not answer. Nothing has been written,
       and 503 is the one honest reply: it is not this notification's fault, and
       a resend is exactly what should happen. */
    if (e instanceof AppleUnavailableError) {
      console.error("store-webhook:", e.message);
      return json({ error: "Store unavailable" }, 503);
    }
    /* The detail goes to the log, not to the caller. Anyone on the internet can
       reach this handler, and `Apple credentials not configured` — which is
       what it answered with the private key missing — tells a stranger the
       state of this project's App Store setup for the price of one POST. */
    console.error("store-webhook error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
