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
 * **Fails open when the RPC is missing.** The migration that creates it may
 * not have been applied to the project yet, and an unapplied migration must
 * not take the AI offline. The gate above is what stops the anonymous case;
 * this only bounds an authenticated one. If quota is meant to be enforced,
 * confirm `claim_ai_call` exists on the live project — see
 * `native/docs/PRE_RELEASE.md` §2e.
 */
export async function claimCall(supabase: SupabaseClient, kind: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_ai_call", { p_kind: kind });
  if (error) {
    console.warn(`claim_ai_call unavailable (${error.message}) — allowing ${kind}`);
    return true;
  }
  return data !== false;
}

/** The reply for a caller who has used the day up. */
export const quotaExceeded = () =>
  json({ error: "Đã dùng hết lượt AI hôm nay. Vui lòng thử lại vào ngày mai." }, 429);
