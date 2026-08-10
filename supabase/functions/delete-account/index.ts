import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, json, requireUser } from "../_shared/guard.ts";

/**
 * Deleting an account, for real.
 *
 * ── why this is not optional ──
 *
 * App Store Review Guideline 5.1.1(v): *"If your app supports account creation,
 * you must also offer account deletion within the app."* Not advice — a
 * condition of shipping. The button has been in Settings all along, correctly
 * telling people the server has not been set up; this is the server.
 *
 * ── the identity comes from the token, never from the body ──
 *
 * `requireUser` reads the JWT out of the Authorization header. An id in the
 * request body would be an id anybody could send, and the endpoint would delete
 * whichever account was named. This is the one function in the project where
 * getting that wrong is unrecoverable for the person it happens to.
 *
 * ── storage first, because cascade does not reach it ──
 *
 * `auth.admin.deleteUser` removes rows through foreign keys. Objects in a
 * bucket are not rows in a table, so progress photos survive the account they
 * belonged to — still stored, still billed, still pictures of somebody who
 * asked to be forgotten. Ordering matters as well as inclusion: once the auth
 * user is gone there is no id left to enumerate their folder with.
 *
 * ── no hand-written list of tables ──
 *
 * All 31 tables reach `auth.users` by cascade, four of them through a parent.
 * A manual delete list is the thing that rots: the next table added and not
 * added to the list leaves data behind, silently, and nothing fails.
 *
 * This depends on `20260803120000_meal_plan_item_food_fk.sql` having been
 * pushed. Before it, `meal_plan_items.food_item_id` took the default NO ACTION,
 * and `DELETE FROM auth.users` failed outright with SQLSTATE 23503 for anybody
 * who had ever put a food in a meal plan.
 *
 * ── 2xx only when everything worked ──
 *
 * The app signs out and clears its cache on 2xx, and says **nothing has been
 * deleted** on anything else. A 200 after a partial failure turns that sentence
 * into a lie, on the one screen where a lie is least recoverable.
 */

const BUCKET = "progress-photos";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId } = caller;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /*
      Their folder, emptied first.

      `list` is paged — the default is 100 — and somebody who has logged a photo
      a week for two years has more than that. Looping until a page comes back
      short is what makes this delete *all* of them rather than the first
      hundred, which would look identical from the outside and leave the rest
      behind for ever.
    */
    for (;;) {
      const { data: files, error: listErr } = await admin.storage
        .from(BUCKET)
        .list(userId, { limit: 100 });
      if (listErr) {
        console.error("storage list failed", listErr.message);
        return json({ error: "Could not read stored files" }, 500);
      }
      if (!files || files.length === 0) break;

      const { error: rmErr } = await admin.storage
        .from(BUCKET)
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (rmErr) {
        console.error("storage remove failed", rmErr.message);
        return json({ error: "Could not delete stored files" }, 500);
      }
      if (files.length < 100) break;
    }

    /* Everything else goes with the auth row, through the cascades. */
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("deleteUser failed", delErr.message);
      return json({ error: "Could not delete the account" }, 500);
    }

    console.log("account deleted", userId);
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
