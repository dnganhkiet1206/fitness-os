/**
 * What this person's body actually spends, as opposed to what a formula guessed.
 *
 * ── the gap this closes ──
 *
 * `tdee_target_kcal` comes from `calcTDEE(bmr, activityLevel)`: Mifflin-St Jeor
 * multiplied by one of five numbers between 1.2 and 1.9, chosen once during
 * onboarding from a list of descriptions. Everything nutritional in the app
 * hangs off it — the daily target, the macro split, the "còn lại" figure on the
 * home screen.
 *
 * Nobody re-picks it. Somebody who chose "ít vận động" and then started
 * training four days a week carries a target several hundred kcal too low, and
 * the app tells them every single evening that they went over. Somebody who
 * chose "vận động viên" and stopped training carries one too high, gains
 * weight, and is congratulated for staying under.
 *
 * The app measures the contradiction every day — `daily_logs.kcal` on one side,
 * `weight_logs` on the other — and never mentions it.
 *
 * ── the method, and why this one ──
 *
 * The energy-balance identity, which is what MacroFactor and the other adaptive
 * trackers use:
 *
 *     TDEE ≈ mean daily intake − (weekly weight change × 7700 / 7)
 *
 * 7700 kcal ≈ 1 kg of body mass (3500 ≈ 1 lb). Losing 0.3 kg a week on 1,800
 * kcal implies about 2,130 kcal of expenditure.
 *
 * It is worth preferring to the multiplier because it is a *measurement of this
 * person*, not a population average — it silently includes NEAT, training,
 * thermogenesis and whatever their metabolism is actually doing.
 *
 * ── what it must not do ──
 *
 * **Never change the target on its own.** The number somebody eats to is theirs,
 * a target that moves by itself is one nobody can plan against, and this
 * estimate is wrong in exactly the situations where it looks most confident:
 * a week of water retention, a fortnight of forgotten meals, a holiday. It
 * produces a sentence, and the person decides.
 *
 * ── why it refuses so often ──
 *
 * Every guard below exists because the arithmetic is trivially computable from
 * garbage. Two weight readings and three logged days will produce a number, and
 * that number will be confidently wrong by a thousand kcal. Refusing is the
 * common case and the correct one.
 */

/** kcal per kg of body mass. 7700 is the figure the adaptive trackers use. */
export const KCAL_PER_KG = 7700;

/** Days of history the estimate is built from. Two weeks is the documented floor. */
export const WINDOW_DAYS = 14;

/**
 * How much of that window has to be logged.
 *
 * The mean intake is the whole left-hand side of the identity. Ten of fourteen
 * days keeps it honest without demanding perfection; below that, one forgotten
 * dinner moves the answer more than a real change in metabolism would.
 */
export const MIN_LOGGED_DAYS = 10;

/** Weigh-ins needed, and how far apart the first and last must be. */
export const MIN_WEIGH_INS = 6;
export const MIN_SPAN_DAYS = 10;

/**
 * How far apart the two numbers must be before it is worth saying anything.
 *
 * Under this, the difference is noise: a 0.1 kg error in the trend over two
 * weeks is already ±55 kcal/day, and logged intake is systematically
 * under-reported by more than that in every study of self-reported diet. A
 * sentence about 80 kcal would be false precision dressed as insight.
 */
export const MIN_GAP_KCAL = 200;

export interface DayIntake {
  /** local date, YYYY-MM-DD */
  date: string;
  kcal: number;
}

export interface WeighIn {
  /** local date, YYYY-MM-DD */
  date: string;
  kg: number;
}

export type AdaptiveResult =
  | { ok: false; reason: 'not-enough-intake' | 'not-enough-weight' | 'span-too-short' }
  | {
      ok: true;
      /** kcal/day the energy balance implies */
      measured: number;
      /** mean logged intake across the window */
      meanIntake: number;
      /** kg per week, negative when losing */
      kgPerWeek: number;
      loggedDays: number;
      weighIns: number;
    };

/**
 * Least-squares slope of weight against day number, in kg per day.
 *
 * A regression rather than last-minus-first, because body weight swings a kilo
 * on water alone: two readings chosen by where the window happens to fall can
 * disagree about the *direction* of a real trend. Every point pulls on the line,
 * so one bad morning cannot decide the answer.
 */
function kgPerDay(points: { t: number; kg: number }[]): number {
  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanW = points.reduce((s, p) => s + p.kg, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.kg - meanW);
    den += (p.t - meanT) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * Estimate expenditure from what was eaten and what the scale did.
 *
 * `intake` and `weights` are whatever the window holds; filtering, ordering and
 * every refusal happen here so no caller has to remember the rules.
 */
export function adaptiveTDEE(intake: DayIntake[], weights: WeighIn[]): AdaptiveResult {
  /* A day with no meals logged is a day with no information, not a day of
     eating nothing — the same distinction the readiness score gets wrong when
     it treats a missing night as zero minutes of sleep. */
  const days = intake.filter((d) => d.kcal > 0);
  if (days.length < MIN_LOGGED_DAYS) return { ok: false, reason: 'not-enough-intake' };

  const points = weights
    .filter((w) => w.kg > 0)
    .map((w) => ({ t: dayNumber(w.date), kg: w.kg }))
    .sort((a, b) => a.t - b.t);
  if (points.length < MIN_WEIGH_INS) return { ok: false, reason: 'not-enough-weight' };

  const span = points[points.length - 1].t - points[0].t;
  if (span < MIN_SPAN_DAYS) return { ok: false, reason: 'span-too-short' };

  const meanIntake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
  const perDay = kgPerDay(points);

  return {
    ok: true,
    measured: Math.round(meanIntake - perDay * KCAL_PER_KG),
    meanIntake: Math.round(meanIntake),
    kgPerWeek: Math.round(perDay * 7 * 100) / 100,
    loggedDays: days.length,
    weighIns: points.length,
  };
}

/**
 * Is the difference worth telling somebody about?
 *
 * Separate from the arithmetic so the threshold is one decision in one place,
 * and so a caller cannot accidentally show a 40 kcal "insight".
 */
export function worthMentioning(measured: number, target: number): boolean {
  return Math.abs(measured - target) >= MIN_GAP_KCAL;
}
