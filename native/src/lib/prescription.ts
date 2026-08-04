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
 * anything you can count, it is a position on a ten-point scale of how close
 * the last rep should be to the last rep you *could* do.
 *
 * So both get spelled out where they are shown, and the effort gets the one
 * gloss that turns it into something countable: how many reps you should still
 * have left when you stop. That is the standard reading of the scale — effort
 * 8 is two reps in reserve, 9 is one, 10 is none — and it is the form people
 * can actually act on mid-set.
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
 * How many reps should be left in the tank at an effort of `rpe`.
 *
 * The builder's stepper runs 5–10, so this runs 5–0. Clamped anyway: templates
 * are stored as free JSON and a row written by an older version of the app, or
 * by hand, can hold anything at all. A negative "reps left" is not a number
 * anybody should be shown.
 */
export function repsInReserve(rpe: number): number {
  return Math.max(0, Math.min(5, Math.round(10 - rpe)));
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
