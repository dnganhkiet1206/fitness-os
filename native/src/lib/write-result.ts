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
 */
export class NothingWrittenError extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'NothingWrittenError';
  }
}

/**
 * Run an update or delete and insist it touched something.
 *
 * @param builder the query, **without** `.select()` — this adds it
 * @param what what did not happen, in the person's language, ready to show:
 *   *"Không xoá được buổi tập — có thể nó đã bị xoá ở thiết bị khác"*. Not a
 *   table name: the message is read by somebody who has never heard of
 *   `workout_sessions`.
 */
export async function confirmWrite(builder: Confirmable, what: string): Promise<void> {
  const { data, error } = await builder.select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new NothingWrittenError(what);
}
