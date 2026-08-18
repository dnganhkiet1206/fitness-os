/**
 * The gate every AI function stands behind.
 *
 * All five used to check the caller like this:
 *
 *     const { data } = await supabase.auth.getClaims(token);
 *     if (error || !data?.claims) return 401;
 *     const userId = data.claims.sub;
 *
 * which asks only *"is this a validly-signed token for this project?"* —
 * and the publishable anon key is exactly that. It is a project-signed JWT
 * whose claims are `{iss, ref, role: "anon", iat, exp}`, so `getClaims`
 * verified it, the check passed, and `userId` came out `undefined`. Since
 * nothing returned early between there and the gateway call, anyone holding
 * the anon key — which ships inside the app binary — could spend this
 * project's Lovable credits. `requireUser` asks the two further questions
 * that close it: is there a subject, and is the role `authenticated`.
 *
 * `verify_jwt = false` stays in config.toml: the functions read the header
 * themselves so they can forward the caller's token to PostgREST and keep
 * RLS in force. The platform gate would only duplicate this one.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface Caller {
  userId: string;
  supabase: SupabaseClient;
}

/**
 * Returns the caller, or the 401 to send back.
 *
 * The client is built on the anon key with the caller's token forwarded, so
 * every query it makes is still governed by RLS — this never runs as
 * `service_role`.
 */
export async function requireUser(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as { sub?: string; role?: string } | undefined;

  // `sub` is what the anon key lacks; `role` is what tells a user token from
  // a service one. Both, or nothing.
  if (error || !claims?.sub || claims.role !== "authenticated") {
    return json({ error: "Unauthorized" }, 401);
  }

  return { userId: claims.sub, supabase };
}

/**
 * One call's worth of this user's daily quota, or `false` if they are out.
 *
 * The ceilings live in the database (`public.claim_ai_call`), not here and
 * not in the client, so calling the RPC directly gains nothing — a user can
 * only burn their own allowance.
 *
 * ── it used to fail open, and that was the right call for a free app ──
 *
 * The reasoning was: the migration creating the RPC might not be applied yet,
 * and an unapplied migration must not take the AI offline. Under that rule an
 * error meant "allow".
 *
 * That trade stops being worth it the moment the app charges money. The thing
 * on the other side of this call is a paid gateway, and the failure mode of
 * failing open is an unbounded bill with no ceiling and no alert — a cost that
 * arrives as an invoice rather than as a bug report. Failing closed costs an
 * outage, which is loud, bounded, and fixed by applying a migration that is
 * already in the repository.
 *
 * So: no quota counter, no AI. If this ever starts returning 503 in production,
 * the fix is to apply `20260729120000_ai_usage_quota.sql`, not to soften this.
 */
export async function claimCall(supabase: SupabaseClient, kind: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_ai_call", { p_kind: kind });
  if (error) {
    console.error(`claim_ai_call failed (${error.message}) — refusing ${kind}`);
    return false;
  }
  return data !== false;
}

/**
 * A calendar date the caller sent, or `null` if they did not send a usable one.
 *
 * ── the same bug, in two functions that did not get the fix ──
 *
 * `ai-weekly-review` learned this the hard way: `week_start` was taken on trust
 * and handed to `new Date()`, and anything that is not a date makes an Invalid
 * Date whose `toISOString()` throws — a 500, **with the quota already claimed**.
 * It got a regex. `ai-coach` has one of its own. `ai-meal-suggest` and
 * `ai-smart-nudges` were left as `date ?? new Date()...`, and nudges does the
 * identical arithmetic:
 *
 *     date: "not-a-date"  →  RangeError: Invalid time value
 *                         →  HTTP 500, claim_ai_call already counted 1
 *
 * Measured by driving the real handler. So the check lives here now, once,
 * rather than as a fourth hand-written regex — a rule kept at the call sites is
 * a rule the next call site does not know about.
 *
 * `null` rather than a throw: an older client may send no date at all, and the
 * server's own UTC day is the established fallback for that. An unusable date
 * is the same situation as an absent one.
 */
export function localDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  /* The shape is not enough: `9999-99-99` matches it and is not a day. */
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

/**
 * One of a known set, or `null`.
 *
 * For request fields whose values the app itself chooses. `meal_type` is the
 * one that needed it: it was copied straight from the body into the prompt with
 * no length limit and no domain, so a 200,000-character `meal_type` produced a
 * **202,240-character** request to a paid gateway — measured — for one unit of
 * a quota that counts calls, not size. The client only ever sends one of seven
 * words, so a list is a tighter and more honest bound than a length cap.
 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** The reply for a caller who has used the day up. */
export const quotaExceeded = () =>
  json({ error: "Đã dùng hết lượt AI hôm nay. Vui lòng thử lại vào ngày mai." }, 429);
