import { supabase } from '@/integrations/supabase/client';
import { EDGE_FUNCTIONS, type EdgeFunction } from '@/lib/backend';

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

export type AiFailure =
  /** no function by that name in this project — deploy it */
  | 'not-deployed'
  /** the function ran and failed; usually a missing model key on a new project */
  | 'provider-error'
  /** not signed in, or the session expired */
  | 'unauthorised'
  /** never reached the server */
  | 'offline'
  /** reached it, came back in a shape we do not understand */
  | 'unknown';

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: AiFailure; fn: EdgeFunction; raw: string };

/** Message keys, so a caller that shows something shows the right something. */
export const AI_FAILURE_KEY: Record<AiFailure, 'aiNotDeployed' | 'aiProviderError' | 'aiSignedOut' | 'aiOffline' | 'aiUnknown'> = {
  'not-deployed': 'aiNotDeployed',
  'provider-error': 'aiProviderError',
  unauthorised: 'aiSignedOut',
  offline: 'aiOffline',
  unknown: 'aiUnknown',
};

/**
 * Pull a status code out of whatever the client handed back.
 *
 * `FunctionsHttpError` carries a `Response`; `FunctionsFetchError` carries
 * nothing because there was no response. Neither is guaranteed by a type, so
 * this reads defensively and falls through to `unknown` rather than asserting
 * a shape it cannot check.
 */
function statusOf(err: unknown): number | null {
  const ctx = (err as { context?: { status?: number } } | null)?.context;
  if (ctx && typeof ctx.status === 'number') return ctx.status;
  const status = (err as { status?: number } | null)?.status;
  return typeof status === 'number' ? status : null;
}

function classify(err: unknown): AiFailure {
  const status = statusOf(err);
  if (status === 404) return 'not-deployed';
  if (status === 401 || status === 403) return 'unauthorised';
  if (status !== null && status >= 500) return 'provider-error';
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  // Nothing came back at all — `FunctionsFetchError`, or a bare TypeError from
  // fetch. Both mean the request never landed.
  if (/failed to (send|fetch)|network|fetch failed/i.test(msg)) return 'offline';
  return 'unknown';
}

/**
 * Call an edge function.
 *
 * The auth token is read here rather than passed in. Four call sites each got
 * the session their own way — one from a hook, one from `getSession()`, one
 * conditionally — and a call that silently omits the header comes back 401,
 * which used to be indistinguishable from every other failure.
 */
export async function callAi<T>(
  fn: EdgeFunction,
  body: Record<string, unknown>,
): Promise<AiResult<T>> {
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
      return { ok: false, failure: classify(error), fn, raw: String(error?.message ?? error) };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, failure: classify(e), fn, raw: String((e as Error)?.message ?? e) };
  }
}

/** Re-exported so call sites name functions from the checklist, not by string. */
export { EDGE_FUNCTIONS };
