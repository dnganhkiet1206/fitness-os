import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  type AppleTransaction,
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
    const body = await req.json();
    const signed = typeof body?.signedPayload === "string" ? body.signedPayload : "";
    if (!signed) return json({ ok: true, ignored: "no signedPayload" });

    /* Unverified on purpose — see the note above. This is used to find *which*
       transaction to go and ask about, and for nothing else. */
    const payload = decodeJwsPayloadUnverified<NotificationPayload>(signed);
    const txHint = payload?.data?.signedTransactionInfo
      ? decodeJwsPayloadUnverified<AppleTransaction>(payload.data.signedTransactionInfo)
      : null;

    const transactionId = txHint?.transactionId;
    if (!transactionId) {
      console.warn("webhook without a transaction id", payload?.notificationType);
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
    const { identity, current, status } = resolved;

    const userId = identity.appAccountToken?.toLowerCase();
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
        store: "apple",
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
    console.error("store-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
