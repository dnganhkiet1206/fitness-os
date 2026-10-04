/**
 * A write that changed nothing is not a write that succeeded.
 *
 * ── the shape this exists for ──
 *
 * PostgREST answers an `UPDATE` or `DELETE` that matched **no rows** exactly the
 * way it answers one that matched five: `error: null`, and nothing else. There
 * were thirty-three of them in this app and not one asked how many rows it had
 * touched.
 *
 * So every one of these ends with a success toast and no change:
 *
 *   · a profile edit whose `user_id` no longer matches (a stale session, an
 *     account switched on another device) — "Saved", and every field snaps back
 *     to the old number on the next read;
 *   · deleting a workout that another device already deleted — the row
 *     disappears optimistically, the refetch brings it back, and the app looks
 *     broken rather than out of date;
 *   · the weekly-challenge write failing — which does not merely lose progress,
 *     it leaves `completed` false in the database, so the *next* pass finds the
 *     same challenge freshly finished and celebrates it again.
 *
 * None of these throws. There is no failure mode to catch, because as far as
 * the client is concerned nothing failed.
 *
 * ── why a wrapper and not `.select()` at each call site ──
 *
 * The fix is one word — `.select('id')` makes PostgREST return the affected
 * rows — but the *check* is four lines, and four lines copied thirty-three
 * times is a rule that will be right thirty times. This repository has been
 * bitten by that specific arithmetic six times now.
 *
 * So the call sites keep reading as one statement, and the sentence that
 * reaches the person comes from the caller, because only the caller knows what
 * did not happen.
 *
 * ── and there is deliberately only one function here ──
 *
 * A second one shipped alongside this and lasted about a minute: `writeTouched`,
 * returning a boolean for the writes that may legitimately match nothing —
 * clearing an equipped flag on a slot that might be empty, a background sync
 * nobody is waiting for. `tools/linked.mjs` reported it unused on the first
 * run, and it was right to.
 *
 * Those writes are already accounted for: `tools/write-confirmed.mjs` names
 * every one of them with the sentence that makes it correct, and checks that
 * the list does not outlive its entries. Two ways to say "this one is allowed
 * to touch nothing" is two places to keep in agreement, and this repository has
 * spent six rounds fixing exactly that arithmetic.
 */

/**
 * The shape every PostgREST update/delete builder has once `.select()` is
 * chained onto it. Deliberately structural rather than an import from
 * `@supabase/postgrest-js`: this file has no business depending on the client's
 * generic machinery to ask "did it touch anything".
 */
interface Confirmable {
  select: (columns: string) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
}

/**
 * Thrown when a write matched no rows.
 *
 * A distinct class because callers treat it differently from a transport
 * failure: a refused request is worth retrying, while "the row you were editing
 * is not there any more" is worth *refetching*. Same reason
 * `DailyLogRebuildError` exists.
 *
 * The sentence rides as an i18n KEY, not as words: `confirmWrite` throws with
 * `msgKey` (`nCxNothingWritten*`), and `failureKeyFor` (lib/error-copy.ts)
 * returns it, so `toast.fail` shows the toast host's rendering in the reader's
 * language. A direct `new NothingWrittenError(sentence)` — the community
 * unblock path, owned by A — keeps working with the raw sentence and no key;
 * then the key is absent and the sentence shows verbatim, as before.
 */
export class NothingWrittenError extends Error {
  readonly msgKey?: string;
  constructor(what: string, msgKey?: string) {
    super(what);
    this.name = 'NothingWrittenError';
    this.msgKey = msgKey;
  }
}

/**
 * Run an update or delete and insist it touched something.
 *
 * @param builder the query, **without** `.select()` — this adds it
 * @param key a column the table REALLY has — `id` by default. Four community
 *   tables are keyed by a PAIR and have no `id` at all (`community_likes`,
 *   `community_saves`, `community_follows`, `community_challenge_members`), and
 *   `select=id` becomes `RETURNING id`, which PostgreSQL refuses with 42703:
 *   unlike, unsave, unfollow and leaving a challenge never once worked against
 *   a real server. The web harness did not notice because its fake REST returns
 *   rows without checking columns. `tools/confirm-write-cols.mjs` now reads
 *   every call against `types.ts`.
 * @param msgKey i18n key naming what did not happen — `nCxNothingWritten*`,
 *   resolved at RENDER by `NeonToastHost` (via `toast.fail` → `failureKeyFor`),
 *   so the reader sees their own language. Not a table name: the sentence is
 *   read by somebody who has never heard of `workout_sessions`. The key doubles
 *   as the error's message; it is never shown raw while the key resolves, which
 *   the i18n gate guarantees across vi/en/es.
 */
export async function confirmWrite(builder: Confirmable, msgKey: string, key = 'id'): Promise<void> {
  const { data, error } = await builder.select(key);
  /* The server's error AS IS — never `new Error(error.message)`. Wrapping it
     dropped `code` and turned the server's sentence into an `Error`, which
     `classifyError` reads as app-authored: every UPDATE/DELETE in the app that
     failed on RLS (42501), a duplicate (23505) or a 5xx showed the database's
     raw English instead of the translated copy (#31, found live: unliking a
     post against a 500 still printed "server error"). */
  if (error) throw error;
  if (!data || data.length === 0) throw new NothingWrittenError(msgKey, msgKey);
}
