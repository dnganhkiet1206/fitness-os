/**
 * Whether a number a person just typed could have come from a person.
 *
 * ── why this exists ──
 *
 * Every manual health input in this app accepted anything. `log-biometrics`
 * checked `isNaN`; `log-measurement` checked `isNaN`; the weight tile on Today
 * checked `isNaN(val) || val <= 0`. That was the whole of it. A resting heart
 * rate of 600, an SpO₂ of 970, a body fat of 500% and a weight of 7,500 kg were
 * all saved without complaint.
 *
 * The app's existing answer to a typo was to let you delete it afterwards —
 * `useDeleteWeight` exists for exactly that, and its own comment says a slip of
 * 75 → 175 "sets the chart's scale, the change stat and the BMI reading, so one
 * wrong number makes every weight around it unreadable". That is a cure, and
 * only for the case somebody notices.
 *
 * Most of these do not announce themselves:
 *
 *   - `hr_bpm` becomes a 28-day resting-heart-rate baseline. One 600 sits in
 *     that window for four weeks, and the readiness score (0.20 of it) is wrong
 *     the whole time, with nothing on screen saying why.
 *   - `hrv_rmssd_ms` becomes a robust z-score against a 28-day MAD baseline —
 *     0.30 of readiness, the largest single term.
 *   - `weight_kg` feeds `adaptiveTDEE`, which is a **least-squares regression**
 *     and has no defence against an outlier at all. That regression now sets a
 *     suggested calorie target. A mistyped weight therefore ends as a wrong
 *     diet, several screens away from where it was typed.
 *
 * ── what these bounds are, and are not ──
 *
 * They reject the **impossible**, not the unusual. An app that refuses a real
 * reading from an unusual person is worse than one that accepts a typo: the
 * typo can be corrected, the refusal cannot be argued with. So every bound
 * below is set outside the most extreme value a human being is known to have
 * produced, and the comment on each says which value it has to keep accepting.
 *
 * That also means there is a whole class of error these cannot catch. 175 kg
 * for a 75 kg person is a plausible weight; nothing here will stop it. Catching
 * that needs a comparison against the person's own history, with a threshold
 * that has to widen as the gap between readings widens — and no published rule
 * says what that threshold should be. Guessing one would trade a bug that is
 * visible for a rule that silently refuses real data, so it is not guessed
 * here. Range checks catch the fat-finger; the delete button still exists for
 * the rest.
 */

export type Quantity =
  | 'hr_bpm'
  | 'hrv_ms'
  | 'spo2_pct'
  | 'vo2max_mlkgmin'
  | 'resp_rpm'
  | 'weight_kg'
  | 'body_fat_pct'
  | 'circumference_cm'
  | 'sleep_stage_min'
  | 'sleep_duration_min'
  | 'meal_kcal'
  | 'macro_g'
  | 'lift_kg'
  | 'set_reps';

export interface Bound {
  min: number;
  max: number;
  /** shown next to the numbers when a value is refused */
  unit: string;
}

export const BOUNDS: Record<Quantity, Bound> = {
  /*
    Lowest resting heart rate on record is 27 bpm (Martin Brady, Guinness World
    Records, 2005), so the floor has to sit under that. At the top, the AV
    node's refractory period caps conduction at roughly 300 bpm and no wearable
    reports anywhere near it for a person entering a number by hand; 250 is
    above any exercise reading and nowhere near a mistyped 600.
  */
  hr_bpm: { min: 20, max: 250, unit: 'bpm' },

  /*
    RMSSD and SDNN both live here. Adults sit around 10–100 ms and well-trained
    people go past 200; 500 is beyond anything reported. The floor is 1 rather
    than 0 because 0 ms is not a measurement, it is a missing one — and this
    project has spent a long time removing zeros that stood in for absence.
  */
  hrv_ms: { min: 1, max: 500, unit: 'ms' },

  /*
    100 is the definition, not a judgement — saturation is a percentage of
    haemoglobin binding sites, and this is the bound that catches a typed 970.
    Pulse oximeters are only validated down to 70%; 50 is far below anything
    somebody is typing into a phone about themselves.
  */
  spo2_pct: { min: 50, max: 100, unit: '%' },

  /*
    Must still accept 97.5 ml/kg/min — Oskar Svendsen, 2012, the highest value
    ever recorded. The floor is where severe heart failure tests.
  */
  vo2max_mlkgmin: { min: 10, max: 100, unit: 'ml/kg/min' },

  /* Normal adults breathe 12–20 a minute. 4 is profound respiratory depression and 60 is severe distress; both ends are real, anything outside is not. */
  resp_rpm: { min: 4, max: 60, unit: 'rpm' },

  /*
    Generous at both ends on purpose: the point is to catch a decimal slipped or
    a unit confused, not to have an opinion about anybody's body. 400 kg is past
    the heaviest weight a person has been recorded at.
  */
  weight_kg: { min: 20, max: 400, unit: 'kg' },

  /*
    ACE puts essential body fat at 2–5% for men and 10–13% for women, so 2 is
    the floor — competitive bodybuilders genuinely test there and being told the
    number is impossible would be wrong. The ceiling is past the highest figures
    reported in severe obesity.
  */
  body_fat_pct: { min: 2, max: 75, unit: '%' },

  /** Waist, hip, arm, thigh, chest. Wide enough to cover every one of them on every body. */
  circumference_cm: { min: 10, max: 300, unit: 'cm' },

  /*
    The load on the bar — not the person on the scale, which is `weight_kg`.

    This was the one numeric input in the app with no bound at all, and it was
    the most expensive one to leave open. A mistyped 700 kg bench does three
    things at once: it inflates `volume_load`, which feeds training load, which
    feeds the readiness score; it is picked up by `lib/personal-record.ts` as a
    **personal record**, so the app celebrates the typo; and it then becomes the
    baseline every later set is measured against, so nothing is ever a record
    again. Deleting the session is the only cure.

    501 kg is Hafthór Björnsson's deadlift, the heaviest lift ever recorded by
    anybody. 600 leaves room above it and still catches a decimal slipped or a
    unit confused — the same job the ceiling does on `weight_kg`. Zero is a
    real, common value: bodyweight work is logged with no load.
  */
  lift_kg: { min: 0, max: 600, unit: 'kg' },

  /*
    Reps in one set. High-rep sets are real training — 100-rep squat sets are a
    named protocol — and endurance records go into the hundreds, so the ceiling
    is generous. What it catches is a rep count that has swallowed a weight, or
    a set that says 5000.
  */
  set_reps: { min: 1, max: 500, unit: 'reps' },

  /** A single sleep stage cannot outlast the day it happened in. */
  sleep_stage_min: { min: 0, max: 1440, unit: 'min' },

  /*
    The night itself, which had no bound at all — and the stages did, which made
    the gap easy to miss.

    It mattered because `sleep_duration_min` is the heaviest single input to the
    readiness score (weight 0.30) and the app derives it from two time pickers,
    so an impossible night is two taps away rather than a typo. A 26-hour
    "night" scored 100/100 and, through the 7-day average, wiped a real week of
    sleep debt.

    Floor at 10 rather than 0: under ten minutes is not a sleep record, and 0
    would let a reversed pair through as "fine". Ceiling at 960 (16 h) — long
    enough for genuine recovery sleep and for the long end of a sick day, short
    enough that a day-length span cannot be one night.
  */
  sleep_duration_min: { min: 10, max: 960, unit: 'min' },

  /** Per food item, not per day. 10,000 kcal in one item is a mistyped number, not a meal. */
  meal_kcal: { min: 0, max: 10000, unit: 'kcal' },

  /** Per food item. 2,000 g of one macronutrient is 2 kg of pure protein. */
  macro_g: { min: 0, max: 2000, unit: 'g' },
};

/*
  ── water is deliberately not in this table ──

  `water.tsx` already has `MAX_ONE_GO`, which is tighter than anything that
  would fit here (2 litres in a single entry) and argued from the three presets
  on that screen rather than from physiology. A second, looser bound in this
  file would not be consulted by anything and would sit there looking like the
  authority. One rule, in the place that uses it.
*/

/**
 * `true` when `v` is a number a body could have produced.
 *
 * `null`/`undefined`/`''` are **plausible** — they mean the field was left
 * blank, which is not an error. Only a value that is present and outside its
 * range is refused. NaN is refused, since something was typed and it was not a
 * number.
 */
export function plausible(q: Quantity, v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (!Number.isFinite(v)) return false;
  const b = BOUNDS[q];
  return v >= b.min && v <= b.max;
}

/** Parses a text field the way the screens do, then checks it. `''` is blank, not zero. */
export function plausibleText(q: Quantity, text: string): boolean {
  const t = text.trim();
  if (t === '') return true;
  return plausible(q, Number(t));
}

/**
 * The sentence shown under a refused field, or `null` when there is nothing
 * wrong. `template` carries `{min}`, `{max}` and `{unit}`.
 */
export function outOfRangeMessage(q: Quantity, text: string, template: string): string | null {
  if (plausibleText(q, text)) return null;
  const b = BOUNDS[q];
  return template
    .replace('{min}', String(b.min))
    .replace('{max}', String(b.max))
    .replace('{unit}', b.unit);
}
