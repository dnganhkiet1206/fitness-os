import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { entitlementFrom, resolveEntitlementTransaction } from "../_shared/apple.ts";
import { corsHeaders, json, requireUser } from "../_shared/guard.ts";

/**
 * The client says it bought something; this decides whether it did.
 *
 * ── the only two things that matter here ──
 *
 * 1. The transaction is real, because we ask Apple rather than the caller.
 * 2. The transaction is *this caller's*, because Apple stores the
 *    `appAccountToken` the app set at purchase time and we compare it to the
 *    authenticated user id.
 *
 * Without (2) the whole thing is theatre. A transaction id is not a secret —
 * it appears in receipts, in support emails, in anybody's own purchase history
 * — so "Apple confirms this transaction exists" would grant a subscription to
 * whoever pasted one in. The token is what makes the answer about a person
 * rather than about a purchase.
 *
 * ── no quota, deliberately ──
 *
 * Every other function here is behind `claimCall` because it spends money on a
 * model. This one costs an HTTPS call to Apple and is how somebody who has paid
 * gets what they paid for; a quota on it would mean "you have restored your
 * purchase too many times today", which is the worst possible thing to say to a
 * paying customer with a new phone.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId } = caller;

    const body = await req.json();
    const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
    if (!transactionId || transactionId.length > 64) {
      return json({ error: "transactionId required" }, 400);
    }

    /*
      Two answers: the transaction the caller named, which is what proves whose
      purchase this is, and the subscription's *current* state, which is what
      gets written down.

      They are not the same when the client sends an older transaction id — and
      it can, because restoring hands back the whole purchase history. Deciding
      on the named transaction meant a restore could downgrade the person doing
      it: measured against this handler, `verify-purchase` with last period's id
      wrote `free` over an active `max`. See `_shared/apple.ts`.
    */
    const resolved = await resolveEntitlementTransaction(transactionId);
    if (!resolved) return json({ error: "Transaction not found" }, 404);
    const { identity: tx, current } = resolved;

    /*
      The check the whole function exists for.

      Apple returns `appAccountToken` lower-cased; the comparison is
      case-insensitive so a UUID that round-tripped through StoreKit still
      matches. A transaction with no token at all is refused rather than
      trusted: it means the purchase was made without linking an account, and
      there is no way to tell whose it is.
    */
    const token = tx.appAccountToken?.toLowerCase();
    if (!token || token !== userId.toLowerCase()) {
      console.warn("appAccountToken mismatch", { userId, token: token ?? null });
      return json({ error: "This purchase belongs to another account" }, 403);
    }

    const ent = entitlementFrom(current);
    if (ent === "unconfigured") {
      /* Writing `free` because this server does not know its own product ids
         would cancel a subscription somebody is paying for. */
      console.error("PRODUCT_ID_PLUS/PRODUCT_ID_MAX not configured — refusing to write");
      return json({ error: "Store not configured" }, 500);
    }

    /* `entitlements` has no write policy for any user role — a client that
       could write it could grant itself the product. The service role is the
       only writer, and it lives here. */
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!ent) {
      /* Expired or refunded. Written down rather than ignored, so the row
         reflects Apple's answer instead of keeping yesterday's. */
      await admin.from("entitlements").upsert(
        { user_id: userId, tier: "free", store: "apple", store_txn_id: current.originalTransactionId, expires_at: null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      return json({ tier: "free" });
    }

    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: userId,
        tier: ent.tier,
        store: "apple",
        store_txn_id: current.originalTransactionId,
        expires_at: ent.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("entitlement upsert failed", error.message);
      return json({ error: "Could not save entitlement" }, 500);
    }

    return json({ tier: ent.tier, expires_at: ent.expiresAt });
  } catch (e) {
    console.error("verify-purchase error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
