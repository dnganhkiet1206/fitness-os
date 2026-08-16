/**
 * One pass over one weekly challenge: what to store, and what just happened.
 *
 * ── why this is a function and not three lines inside the mutation ──
 *
 * The progress pass runs from Today's `useFocusEffect`, so it fires on **every
 * return to the tab** — from a meal sheet, a workout sheet, a weigh-in, or just
 * switching tabs. Most of those passes find nothing changed. That is fine and
 * intended; what it means is that anything in the pass which is not carefully
 * gated on a *transition* happens over and over.
 *
 * It already had happened. The coin payment was gated on
 * `isCompleted && !completed` — the pass on which a challenge stops being
 * unfinished — while the celebration beside it was gated on `isCompleted`
 * alone. So finishing one challenge on Monday queued a full-screen award
 * animation on every single return to Today for the rest of the week. The one
 * property a celebration depends on is being rare, and this was the most
 * repeated animation in the app.
 *
 * Both answers now come from the same place, and that place can be **run**:
 * `tools/challenge-reward.mjs` plays a week of passes through it and asserts
 * that the second pass over a finished challenge is silent. A rule about "what
 * happens the second time" cannot be checked by reading the first time.
 */

export interface ChallengeRow {
  /** progress stored on the last pass */
  current_value: number;
  target_value: number;
  /** what the last pass concluded */
  completed: boolean;
}

export interface ChallengeStep {
  /** what to store — never above the target, so a bar cannot overfill */
  value: number;
  completed: boolean;
  /**
   * True on the one pass where this stopped being unfinished.
   *
   * The only thing allowed to pay a reward or start a celebration. Everything
   * else about a finished challenge is a fact, not an event.
   */
  justCompleted: boolean;
  /**
   * Nothing moved — do not write.
   *
   * An unconditional update is three wasted round trips on most passes, and it
   * rewrites `completed_at` each time, quietly moving the moment a challenge
   * was finished to whenever the person last opened the tab.
   */
  unchanged: boolean;
}

export function challengeStep(row: ChallengeRow, newValue: number): ChallengeStep {
  const target = Number(row.target_value) || 0;
  const measured = Number.isFinite(newValue) ? newValue : 0;

  /* Clamped at both ends. The top so the stored progress cannot exceed the
     target a bar is drawn against; the bottom because a negative count is not a
     thing a person did, and a bad read must not be storable as one. */
  const value = Math.max(0, Math.min(measured, target));
  const completed = measured >= target;
  const was = row.completed === true;

  return {
    value,
    completed,
    justCompleted: completed && !was,
    unchanged: value === Number(row.current_value) && completed === was,
  };
}
