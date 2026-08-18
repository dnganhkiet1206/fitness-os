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
  /**
   * When this challenge was **first** finished, or null if it never has been.
   *
   * Write-once, and that is the point. `completed` is a statement about the
   * *current* reading and is allowed to go back to false — a meal deleted, a
   * workout removed, or a `daily_logs` row corrected all lower the count. So
   * `completed && !was` is not "finished for the first time", it is "finished
   * again", and it fired every time the condition came back:
   *
   *     v=4 → v=5 (justCompleted) → v=5 → v=4 → v=5 (justCompleted)
   *
   * Two celebrations for one weekly challenge. The coins were safe —
   * `challengeRefKey` is fixed for the week and `UNIQUE(user_id, ref_key)`
   * makes the repeat a no-op — but the full-screen award animation is the one
   * thing in this file that is supposed to be rare, and this is the same repeat
   * `challenge-reward.mjs` was written for, arriving through a different door.
   */
  completed_at?: string | null;
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
  /* Ever finished, not currently finished — see `completed_at`. */
  const everCompleted = !!row.completed_at;

  return {
    value,
    completed,
    justCompleted: completed && !was && !everCompleted,
    /* `completed_at` is written once and never cleared, so a challenge that
       dips below its target does not lose the moment it was won. Without that,
       the guard above would forget too and the celebration would come back. */
    unchanged: value === Number(row.current_value) && completed === was,
  };
}
