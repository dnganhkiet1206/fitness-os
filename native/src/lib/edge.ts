import { supabase } from '@/integrations/supabase/client';
import { EDGE_FUNCTIONS, type EdgeFunction } from '@/lib/backend';
import { AI_FAILURE_KEY, classify, type EdgeFailure } from '@/lib/edge-failure';

/**
 * One way to call an AI edge function, and one vocabulary for how it can fail.
 *
 * ── the problem this solves ──
 *
 * Every call site looked like this:
 *
 *     try { … } catch { Alert.alert('Failed to get suggestions') }
 *
 * The `catch` had no binding, so the reason was discarded at the moment it was
 * caught. That is fine while one project is wired up and everything works. It
 * is the worst possible behaviour on the day a *new* project is connected,
 * because every distinct problem produces the same sentence:
 *
 *   - the function was never deployed to this project        → 404
 *   - it is deployed but has no model API key configured     → 500 from inside
 *   - the user is not signed in, or the token expired        → 401
 *   - the phone has no signal                                → no response
 *
 * Four different jobs, one message. The person wiring it up has nothing to go
 * on and has to add logging to find out — which is the work this file does once
 * instead of four times.
 *
 * ── on classifying by status code ──
 *
 * A 404 from the functions host means "no function by that name here", which is
 * the same thing as "not deployed yet" for our purposes. A 5xx means the
 * function ran and fell over — almost always a missing provider key on a fresh
 * project, which is why that case names the function and says where to look.
 *
 * The classification is a hint, not a diagnosis: a proxy can turn anything into
 * anything. So `raw` is kept on the result. It is never shown to a user and it
 * is exactly what you want in a bug report.
 *
 * ── why a result and not a throw ──
 *
 * Callers have to decide between "tell the user" and "quietly do nothing" —
 * `ai-smart-nudges` failing should not interrupt anybody, while a food scan
 * failing must. A thrown error pushes both into a `catch` that has already lost
 * the distinction. A returned union makes the caller state which it is.
 */

export type { EdgeFailure };
/** AI-facing copy for each failure. Account deletion has its own set — reusing
 *  these would put "This AI feature is not set up" on a deletion failure. */
export { AI_FAILURE_KEY };

export type EdgeResult<T> =
  | { ok: true; data: T }
  /**
   * `body` is what the function itself said, when it said anything.
   *
   * `functions.invoke` reports a non-2xx as a `FunctionsHttpError` and puts the
   * response on `error.context` — so the JSON a function deliberately returned
   * alongside its status was, until this field existed, unreachable at every
   * call site. `delete-account` needs it: its failure carries `partial: true`
   * once photos have actually been destroyed, and the difference between
   * "nothing was deleted" and "your photos are gone but your account is not" is
   * the whole message.
   */
  | { ok: false; failure: EdgeFailure; fn: EdgeFunction; raw: string; body?: unknown };

/**
 * Call an edge function.
 *
 * The auth token is read here rather than passed in. Four call sites each got
 * the session their own way — one from a hook, one from `getSession()`, one
 * conditionally — and a call that silently omits the header comes back 401,
 * which used to be indistinguishable from every other failure.
 */
export async function callEdge<T>(
  fn: EdgeFunction,
  body: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { ok: false, failure: 'unauthorised', fn, raw: 'no access token' };
    }

    const { data, error } = await supabase.functions.invoke(fn, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      /* The body the function chose to send with its status. `context` is a
         `Response` on `FunctionsHttpError` and absent on the others, and a
         failure to parse it is not itself worth reporting — the classification
         below stands either way. */
      let replied: unknown;
      const res = (error as { context?: unknown }).context;
      if (res instanceof Response) {
        try {
          replied = await res.clone().json();
        } catch {
          // not JSON, or already consumed; `raw` still carries the message
        }
      }
      return {
        ok: false,
        failure: classify(error),
        fn,
        raw: String(error?.message ?? error),
        body: replied,
      };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, failure: classify(e), fn, raw: String((e as Error)?.message ?? e) };
  }
}

/** Re-exported so call sites name functions from the checklist, not by string. */
export { EDGE_FUNCTIONS };
