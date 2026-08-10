import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  type AppleTransaction,
  decodeJwsPayloadUnverified,
  entitlementFrom,
  fetchTransaction,
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

    // The only statement in this function whose answer is trusted.
    const tx = await fetchTransaction(transactionId);
    if (!tx) {
      console.warn("webhook transaction not found at Apple", transactionId);
      return json({ ok: true, ignored: "not found" });
    }

    const userId = tx.appAccountToken?.toLowerCase();
    if (!userId) {
      console.warn("webhook transaction has no appAccountToken", transactionId);
      return json({ ok: true, ignored: "unlinked purchase" });
    }

    const ent = entitlementFrom(tx);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: userId,
        tier: ent?.tier ?? "free",
        store: "apple",
        store_txn_id: tx.originalTransactionId,
        expires_at: ent?.expiresAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      /* A database fault is the one thing a retry can fix, so it is the one
         thing that gets a 500. */
      console.error("webhook upsert failed", error.message);
      return json({ error: "upsert failed" }, 500);
    }

    console.log("entitlement updated", payload?.notificationType, payload?.subtype, ent?.tier ?? "free");
    return json({ ok: true, tier: ent?.tier ?? "free" });
  } catch (e) {
    console.error("store-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
