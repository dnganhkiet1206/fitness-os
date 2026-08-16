/**
 * How much a session cost the person who did it.
 *
 * ── the hole this fills, and how wide it was ──
 *
 * Training load in this app was tonnage: `Σ (weight × reps)`, computed
 * identically in `log-workout.tsx` and `use-fitness-data.ts` and applied to
 * every session regardless of what was in it. For a barbell session that is a
 * reasonable external-load measure. For everything else it is zero:
 *
 *   · a session of pull-ups, press-ups and dips → **0**;
 *   · a run imported from a watch → **0**, and that one is deliberate —
 *     `use-health-sync.ts` explains at length that a run has no tonnage and
 *     inventing one would corrupt the very number this feeds.
 *
 * Zero is not a small number here. It is the input to a chain:
 *
 *     volume_load 0
 *       → daily-log-service: trainingLoad7d / trainingLoad28d = 0
 *       → readiness-engine: `if (load28d <= 0) return null`
 *       → the readiness score loses its training dimension entirely
 *       → daily_logs.acwr = null
 *       → user-state: `overreaching` can never fire
 *       → load-progression: the one safety gate that refuses to say
 *         "add load" to somebody already in a load spike never closes
 *
 * So the population that trains without a barbell was invisible to the fitness
 * system, and it was the only population whose load-increase advice had no
 * guardrail behind it.
 *
 * ── why session-RPE, and why times reps ──
 *
 * The session-RPE method quantifies **internal** training load — what the work
 * cost this body rather than what was moved — as intensity × volume. It is the
 * standard tool for exactly this problem: it generalises across modalities in a
 * way tonnage and heart rate do not. For resistance work the established
 * variant multiplies the session RPE by the **total number of repetitions**,
 * which is what this computes.
 *
 * Both halves are already in the database and have been for a long time:
 * `workout_sessions.session_rpe` is asked once at the end of the sheet, and
 * `sets[].reps` is stored per set. Nothing new is collected and no migration is
 * needed — the app simply never multiplied them.
 *
 * ── `null` is the whole point of this file ──
 *
 * A session with no RPE returns `null`, not `0`. They are different claims:
 * `0` says *training happened and cost nothing*, `null` says *this cannot be
 * measured*. A watch import has no RPE and an empty `sets` array, so it lands
 * on `null` and is dropped from **both** sides of the acute:chronic ratio
 * rather than dragging the average down as a zero-cost session.
 *
 * This is the same rule the rest of the app has been fixed toward six times —
 * `acwr ?? 0`, `meals?.length ?? 0`, the unread day read as an empty one.
 */

/** One set as `workout_sessions.sets` stores it. Only the field that is used. */
export interface LoadSet {
  reps?: number | string | null;
}

export interface LoadSession {
  /** 6–10, as the sheet asks it once per session; `null` for imports */
  session_rpe?: number | string | null;
  /** the stored JSON array; anything else is treated as absent */
  sets?: unknown;
}

/**
 * The RPE scale the sheet offers, and the range this will accept.
 *
 * `log-workout.tsx` offers 6–10. A wider range is tolerated on the way in
 * because a row written by an older build, or by hand, is still real data — but
 * a value outside 1–10 is not on any RPE scale and is read as absent rather
 * than clamped, since clamping would invent an intensity nobody reported.
 */
export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Total repetitions in a session, or 0 when the array holds none. */
export function totalReps(sets: unknown): number {
  if (!Array.isArray(sets)) return 0;
  let n = 0;
  for (const s of sets as LoadSet[]) {
    const r = Number(s?.reps);
    /* A negative or non-finite rep count is a broken row, not a negative
       amount of work — it contributes nothing rather than subtracting. */
    if (Number.isFinite(r) && r > 0) n += r;
  }
  return n;
}

/**
 * Internal load for one session, in arbitrary units, or `null` when it cannot
 * be measured.
 *
 * Arbitrary units are the right answer and not a shortcoming: there is no
 * standardised classification of session load for resistance training, so the
 * number is only ever meaningful **against this person's own recent sessions** —
 * which is exactly and only how the acute:chronic ratio uses it.
 */
export function sessionLoad(session: LoadSession): number | null {
  const rpe = Number(session?.session_rpe);
  if (!Number.isFinite(rpe) || rpe < RPE_MIN || rpe > RPE_MAX) return null;

  const reps = totalReps(session?.sets);
  if (reps <= 0) return null;

  return rpe * reps;
}

/**
 * Total internal load across a window, counting only the sessions that can be
 * measured.
 *
 * ── it returns a number, and the first draft returned three ──
 *
 * That draft also handed back `measured` and `skipped`, with a paragraph
 * explaining that the caller needs them. The caller did not: `scoreLoad`
 * already refuses to score a load of zero, which covers a window where nothing
 * could be measured, and neither count was ever read. Two unused fields and a
 * comment asserting they were necessary — the same shape as `writeTouched`,
 * which `tools/linked.mjs` caught and which was deleted for the same reason.
 */
export function loadWindow(sessions: LoadSession[]): number {
  let load = 0;
  for (const s of sessions ?? []) {
    const v = sessionLoad(s);
    if (v != null) load += v;
  }
  return load;
}
