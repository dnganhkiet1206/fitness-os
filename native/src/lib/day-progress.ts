/**
 * Reading a logged session back onto the day it belongs to.
 *
 * ── the contradiction this fixes ──
 *
 * A session can be recorded two ways. The week's day panel ticks sets and
 * presses "hoàn thành buổi tập"; the free-form sheet at `/log-workout` types
 * them in. Both write the same `workout_sessions` row through the same hook,
 * and the week already noticed one of them — log a workout from the sheet and
 * the day turns green on the strip, the panel shows the session card, and the
 * finish button reads "đã ghi".
 *
 * The tick marks did not notice at all. They live in `AsyncStorage`, they are
 * written only by the checkbox, and nothing outside that panel has ever set
 * one. So a day logged from the sheet said, on one screen, at the same time:
 *
 *   • strip: done, green
 *   • session card: 18:40 · 4,200 kg · RPE 8
 *   • finish button: đã ghi
 *   • header: **0/12 set**
 *   • progress bar: **empty**
 *   • every checkbox: **unticked**
 *
 * Three claims that it happened and three that it has not started. The person
 * reading that has no way to know which half to believe.
 *
 * ── why it matches by name and count ──
 *
 * A session's sets carry an exercise name, a weight and a rep count; they do
 * not carry which planned row they came from, because when they were typed
 * into the free-form sheet there was no planned row. So the mapping has to be
 * inferred, and the only honest inference is the coarse one: if the session
 * holds three sets of "Squat", then three rows of Squat in the plan happened.
 * Which three is not a question the data can answer, so it is not asked — the
 * first three are ticked, and the ordering within one exercise is not
 * information anybody acts on.
 *
 * What it deliberately does not do is match on weight or reps. A set logged at
 * 100kg × 8 against a row planned for 100kg × 10 is the *same set*, done two
 * reps short, which is the ordinary case and the entire reason for logging
 * what actually happened. Requiring the numbers to agree would tick nothing on
 * exactly the days the record matters most.
 */
import { exerciseKey } from '@/lib/exercise-key';


export interface PlanRow {
  key: string;
  exerciseName: string;
}

export interface SessionSet {
  exerciseName?: string | null;
}

/*
  Shared with `personal-record.ts`. This was a local `trim().toLowerCase()`
  while the record detector also collapsed runs of whitespace, so `"Bench
  Press"` with a doubled space was two exercises here and one there: the
  training week said the scheduled lift had not been done while the record sheet
  compared those same rows against each other. See `lib/exercise-key.ts`.
*/
const norm = exerciseKey;

/**
 * Which plan rows a set of logged sessions accounts for.
 *
 * Returns only the rows it can vouch for — never `false` for anything — so the
 * caller can merge it over the stored ticks without a derived blank erasing
 * something somebody ticked by hand.
 */
export function sessionTicks(rows: PlanRow[], sets: SessionSet[]): Record<string, boolean> {
  /* how many sets the session holds per exercise */
  const remaining = new Map<string, number>();
  for (const s of sets) {
    const name = norm(s.exerciseName);
    if (!name) continue; // a nameless set cannot be attributed to anything
    remaining.set(name, (remaining.get(name) ?? 0) + 1);
  }

  const ticks: Record<string, boolean> = {};
  for (const row of rows) {
    const name = norm(row.exerciseName);
    const left = remaining.get(name) ?? 0;
    if (left <= 0) continue;
    ticks[row.key] = true;
    remaining.set(name, left - 1);
  }
  return ticks;
}

/**
 * The day's tick state: what was stored, filled in by what the sessions prove.
 *
 * ── evidence fills blanks, it does not overrule a person ──
 *
 * A key *present* in `stored` is a decision somebody made with their thumb —
 * `true` when they ticked a set, `false` when they ticked it and changed their
 * mind. A key that is absent is no decision at all, and that is the only place
 * a logged session gets to speak.
 *
 * The direction is not cosmetic. Written the other way round — evidence
 * spread over the stored map — unticking a set on a day that has a session
 * would do nothing at all: the write would land in storage and be painted over
 * on the very next render by the session it came from. The checkbox would
 * simply stop working, on exactly the days it has the most to say.
 *
 * The result is never written back to storage. It is derived from rows that
 * already exist in the database, so persisting it would only create a second
 * copy that can go stale — and a copy that outlives the session it came from
 * is indistinguishable from a tick somebody made.
 */
export function mergeProgress(
  stored: Record<string, boolean>,
  rows: PlanRow[],
  sets: SessionSet[],
): Record<string, boolean> {
  const ticks = sessionTicks(rows, sets);
  if (Object.keys(ticks).length === 0) return stored;
  const out = { ...stored };
  for (const key of Object.keys(ticks)) {
    if (!(key in stored)) out[key] = true;
  }
  return out;
}
