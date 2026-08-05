/**
 * What went wrong with an edge-function call, decided from the response alone.
 *
 * ── why this is its own file ──
 *
 * This is the logic that decides what a person is told on the day a new
 * Supabase project is connected — "not deployed" versus "no model key" versus
 * "signed out" — and it was unreachable by any test, because it lived beside
 * the Supabase client, which pulls in React Native and will not load in Node.
 *
 * Nothing here imports anything. `tools/edge-failure.mjs` compiles it and runs
 * the real function against the real status codes.
 *
 * ── on classifying by status code ──
 *
 * A 404 from the functions host means "no function by that name here", which
 * for our purposes is "not deployed yet". A 5xx means the function ran and fell
 * over — almost always a missing provider key on a fresh project. The
 * classification is a hint, not a diagnosis: a proxy can turn anything into
 * anything, which is why the caller keeps the raw message too.
 */

export type EdgeFailure =
  /** no function by that name in this project — deploy it */
  | 'not-deployed'
  /** the function ran and failed; usually a missing model key on a new project */
  | 'provider-error'
  /** not signed in, or the session expired */
  | 'unauthorised'
  /** too many requests: the day's own allowance, or the model provider's */
  | 'rate-limited'
  /** never reached the server */
  | 'offline'
  /** reached it, came back in a shape we do not understand */
  | 'unknown';

/** Message keys, so a caller that shows something shows the right something. */
export const AI_FAILURE_KEY: Record<
  EdgeFailure,
  'aiNotDeployed' | 'aiProviderError' | 'aiSignedOut' | 'aiOffline' | 'aiRateLimited' | 'aiUnknown'
> = {
  'not-deployed': 'aiNotDeployed',
  'provider-error': 'aiProviderError',
  unauthorised: 'aiSignedOut',
  offline: 'aiOffline',
  'rate-limited': 'aiRateLimited',
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
export function statusOf(err: unknown): number | null {
  const ctx = (err as { context?: { status?: number } } | null)?.context;
  if (ctx && typeof ctx.status === 'number') return ctx.status;
  const status = (err as { status?: number } | null)?.status;
  return typeof status === 'number' ? status : null;
}

export function classify(err: unknown): EdgeFailure {
  const status = statusOf(err);
  if (status === 404) return 'not-deployed';
  if (status === 401 || status === 403) return 'unauthorised';
  /*
    429 had no case, so it fell all the way through to `unknown` — and a person
    who had simply used the day's AI allowance was told "something went wrong".
    Nothing had gone wrong, and the one thing they could act on (wait) was the
    thing the message hid; the natural response is to press it again and reach
    the same dead end.

    Both senders mean the same thing to a reader. `_shared/guard.ts` returns 429
    when the caller's own daily quota is spent, and the functions relay the model
    provider's 429 when *it* is the one refusing. Either way the request was
    fine and the answer is to come back later, so they share one kind rather
    than splitting a distinction the user cannot use.
  */
  if (status === 429) return 'rate-limited';
  if (status !== null && status >= 500) return 'provider-error';
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  // Nothing came back at all — `FunctionsFetchError`, or a bare TypeError from
  // fetch. Both mean the request never landed.
  if (/failed to (send|fetch)|network|fetch failed/i.test(msg)) return 'offline';
  return 'unknown';
}

