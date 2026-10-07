/**
 * How a saved workout's rest and effort are read back.
 *
 * ── why these two are the awkward ones ──
 *
 * Sets, reps and load speak for themselves: `3 × 10 · 60 kg` needs no legend.
 * Rest and effort do not.
 *
 * `90` is a number of seconds and reads as a weight. `1:30` is unambiguous once
 * you know it is a duration and ambiguous until then. And an effort of 8 means
 * nothing at all to somebody who has not met the scale — it is not eight of
 * anything you can count, it is a position on a ten-point scale.
 *
 * So both get their word where they are shown, and that is where it stops. An
 * earlier version also spelled the effort out as reps in reserve — "2 reps
 * left" — which is the standard reading of the scale and is still a conclusion
 * *drawn* rather than a value stored. A card that reads back what the builder
 * saved has no business doing that: the derived figure and the stored one look
 * the same once they are on the same line, and the card can only stand behind
 * one of them.
 *
 * ── no React here ──
 *
 * Deliberately: the rules below have right answers, and a rule with a right
 * answer belongs somewhere a check can run it. `tools/prescription.mjs` does.
 */

/** What the builder writes when nothing was chosen — see `DEFAULTS` there. */
export const DEFAULT_REST = 90;
export const DEFAULT_RPE = 7;

/**
 * `90` → `1:30`, `45` → `45s`, `0` → `0s`.
 *
 * Under a minute stays in seconds, because `0:45` invites being read as
 * three-quarters of something. At and above a minute it is clock notation,
 * which is what a rest timer shows and therefore what people already read.
 */
export function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The one value every exercise agrees on, or `null` if they disagree.
 *
 * This is what decides whether rest and effort are stated once for the whole
 * workout or once per exercise. Most saved workouts never touch either — they
 * come out of the builder at 90 seconds and effort 7 across the board — and
 * printing the same two figures under six exercises is noise that hides the one
 * template where they *do* differ.
 *
 * `undefined` is not a third answer. A stored exercise from before these fields
 * existed, or one the builder wrote before its defaults were applied, has no
 * value at all — and it means the default, because that is what the app does
 * with it everywhere else. Treating it as "different" would split a perfectly
 * uniform workout onto six lines over a field nobody set.
 */
export function uniformValue<T>(
  items: T[],
  read: (item: T) => number | null | undefined,
  fallback: number,
): number | null {
  if (items.length === 0) return null;
  const first = read(items[0]) ?? fallback;
  return items.every((it) => (read(it) ?? fallback) === first) ? first : null;
}

/**
 * Roughly how long a workout runs, in minutes.
 *
 * Every set costs its reps at about three seconds each plus its rest, and that
 * is the whole model. It is deliberately crude — it knows nothing about walking
 * to the rack, loading plates, or the set you spent talking — so it is always
 * shown as an approximation and never as a schedule.
 *
 * It lives here because two screens need the same number: the builder, which
 * shows it while you are choosing, and the week, which shows it on the day the
 * workout is assigned to. Two copies of a formula this arbitrary would drift
 * within a week and neither would look wrong.
 *
 * Floored at one: a single set of one rep is not zero minutes of work.
 */
export function estimatedMinutes(items: { sets?: number; reps?: number; restSeconds?: number }[]): number {
  let seconds = 0;
  for (const it of items) {
    seconds += (it.sets ?? 0) * ((it.reps ?? 0) * 3 + (it.restSeconds ?? DEFAULT_REST));
  }
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * The effort a workout asks for: one number, or the two it runs between.
 *
 * A workout is one thing you decide to do or not do today, so it needs a single
 * reading of how hard it is going to be — and most workouts have one, because
 * most are built without touching the effort row.
 *
 * When they are not, the honest answer is the range and not the average. An
 * average is a number that appears in no set anywhere: a session of three easy
 * exercises and one all-out finisher does not "feel like 8". `7–10` says what
 * is actually written down, which is all this is entitled to say.
 */
export function effortRange(items: { rpe?: number }[]): [number, number] | null {
  if (items.length === 0) return null;
  const all = items.map((it) => it.rpe ?? DEFAULT_RPE);
  return [Math.min(...all), Math.max(...all)];
}
