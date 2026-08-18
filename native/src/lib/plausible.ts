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
  | 'height_cm'
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

  /*
    Standing height, which had no bound at all — and it is an input to almost
    every number the app gives back.

    `calcBMR` uses it linearly at 6.25 kcal per cm, so typing 175 as `69` takes
    **660 kcal** off the daily target: a person eating to a figure that is
    wrong by a third, in the direction that loses weight they may not want to
    lose.

    Worse is what happens just below the typo. `fitness-calc.ts` reads
    `height_cm < 100` as *"no height was given"* and silently falls back — so
    the BMI-30 ceiling on the protein reference weight stops applying and the
    water target reverts to a per-kg figure. The three macro rings can then sum
    past the calorie ring, which the comment in that file states as impossible.
    A single mistyped digit turns a guard off rather than tripping it.

    The range is the one `fitness-calc.ts` already uses for "is this a real
    height", so there is one opinion rather than two: a bound that disagreed
    with that guard would let through exactly the values that switch it off.
  */
  height_cm: { min: 100, max: 250, unit: 'cm' },

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

/**
 * Parses a text field the way the screens do, then checks it. `''` is blank,
 * not zero.
 *
 * Defined on `readStat` so there is one opinion about what a typed measurement
 * is — including the shape rule, which is why `0xAA` is not a sleep stage of
 * 170 minutes either.
 */
export function plausibleText(q: Quantity, text: string): boolean {
  return readStat(q, text, false).problem === null;
}

/** What is wrong with a stat somebody typed — nothing, nothing given, or not a body. */
export type StatProblem = 'missing' | 'out-of-range';

export interface StatReading {
  /**
   * The number to use, or `null`.
   *
   * Never a substitute. That is the whole point of this type existing rather
   * than the screens writing `Number(text) || 70`: a blank height field and a
   * height of 170 cm are different facts, and the second one is about a body.
   */
  value: number | null;
  problem: StatProblem | null;
}

/**
 * Read a typed stat without ever inventing one.
 *
 * ── the bug this exists for ──
 *
 * Onboarding computed the account's entire plan from
 *
 *     const w = Number(weightKg) || 70;
 *     const h = Number(heightCm) || 170;
 *
 * and stored the result with `onboarding_completed: true`. Two things followed
 * from that, both measured on the real `fitness-calc` chain:
 *
 *   - A cleared field became a 70 kg, 170 cm person. The screen showed an
 *     empty box; the database got a body.
 *   - Nothing checked the range, on the one screen where these numbers are
 *     first entered. A height typed as `17` produced a 1,500 kcal/day target —
 *     and worse, `proteinReferenceWeight` and `calcWaterTarget` both read
 *     `height_cm < 100` as *"no height given"*, so the mistyped digit switched
 *     two guards **off** instead of tripping anything. `edit-profile` had
 *     validated the identical two fields against the identical bounds since
 *     they were written.
 *
 * `required` is the difference between the two screens and is deliberate:
 * *Edit profile* may legitimately be opened on a profile that has no height
 * yet, and refusing to let somebody leave a field they never filled would be
 * inventing a different way to be wrong. Onboarding is the moment the plan is
 * built, so there it is required.
 */
/**
 * The shape a typed measurement has: digits, at most one decimal point, and a
 * sign that only ever gets as far as the bound that refuses it.
 *
 * ── why `Number()` is not enough ──
 *
 * `Number()` is a JavaScript-literal parser, not a number-entry parser, and it
 * accepts three radix prefixes and exponent notation. Measured on the shipped
 * reader:
 *
 *     readStat('height_cm', '0xAA')       → 170 cm, accepted
 *     readStat('height_cm', '0b10101010') → 170 cm, accepted
 *     readStat('height_cm', '0o252')      → 170 cm, accepted
 *     readStat('height_cm', '1e2')        → 100 cm, accepted
 *
 * None of those is a height somebody typed, and all four land **inside** the
 * bounds — which is the exact failure this whole round is about: a string that
 * is not a measurement becoming a valid-looking body measurement, silently.
 * `keyboardType` narrows the on-screen keys and nothing else; paste and a
 * hardware keyboard both go straight past it.
 *
 * `Infinity`, `NaN`, `1e400`, `1,70` and `170abc` were already refused, by the
 * range check rather than by shape. They still are.
 */
const DECIMAL_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function readStat(q: Quantity, text: string, required: boolean): StatReading {
  const t = text.trim();
  if (t === '') return { value: null, problem: required ? 'missing' : null };
  /* Shape first, so `0xAA` is refused for what it is rather than accidentally
     passing a range check it was never measured against. A leading `-` is
     allowed through on purpose: a negative weight should die at the bound that
     says what a weight is, not at a syntax rule. */
  if (!DECIMAL_TEXT.test(t)) return { value: null, problem: 'out-of-range' };
  const n = Number(t);
  if (!plausible(q, n)) return { value: null, problem: 'out-of-range' };
  return { value: n, problem: null };
}

/**
 * The sentence shown under a refused field, or `null` when there is nothing
 * wrong. `template` carries `{min}`, `{max}` and `{unit}`.
 *
 * Both problems get the same sentence, and that reads correctly for either: a
 * blank field and a 17 are both answered by "must be between 100 and 250 cm".
 */
export function statMessage(q: Quantity, problem: StatProblem | null, template: string): string | null {
  if (!problem) return null;
  const b = BOUNDS[q];
  return template
    .replace('{min}', String(b.min))
    .replace('{max}', String(b.max))
    .replace('{unit}', b.unit);
}

/**
 * The sentence shown under a refused field, or `null` when there is nothing
 * wrong. `template` carries `{min}`, `{max}` and `{unit}`.
 *
 * Blank is not refused here — see `readStat`'s `required`.
 */
export function outOfRangeMessage(q: Quantity, text: string, template: string): string | null {
  return statMessage(q, readStat(q, text, false).problem, template);
}
