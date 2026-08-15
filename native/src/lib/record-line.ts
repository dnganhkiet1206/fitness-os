import type { NativeStrings } from '@/lib/native-strings';
import type { PersonalRecord } from '@/lib/personal-record';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

/**
 * The sentence a personal record is announced with.
 *
 * ── why this is not in the celebration component ──
 *
 * It was, carrying a comment that said it was "exported and pure so
 * `tools/personal-record.mjs` can read every branch". It was not:
 * `grep recordLine tools/*.mjs` returned nothing. The comment described a test
 * that had never been written — a claim that the risky part was covered,
 * sitting directly above the risky part.
 *
 * Making the claim true meant loading the function, and loading it meant
 * dragging React, Reanimated and the whole mascot figure into a checker for the
 * sake of four string branches. So it lives here instead, next to
 * `lib/exercise-key.ts` and `lib/sleep-window.ts`, for the same reason both of
 * those were lifted out of their screens: a rule whose failures are all at the
 * edges has to be runnable.
 *
 * ── the branches, and why two of them exist ──
 *
 * Two of the four are there because a number that is genuinely zero must not be
 * printed as one:
 *
 *   · a bodyweight rep record must not say "ở 0 kg" — that reads as a broken
 *     app rather than as pull-ups;
 *   · the first time load is added to a bodyweight movement must not say
 *     "trước là 0 kg" — a sentence about a set nobody did.
 */
/**
 * One record, in words, in the reader's language and their own unit.
 *
 * Exported and pure so `tools/personal-record.mjs` can read every branch: the
 * bodyweight line and the first-time-loaded line are both cases where a number
 * that is really zero must not be printed as one.
 */
export function recordLine(
  r: PersonalRecord,
  i18n: NativeStrings,
  unit: WeightUnit,
): string {
  const kg = (v: number) => String(Math.round(displayWeight(v, unit) * 10) / 10);
  const wl = weightLabel(unit);

  if (r.kind === 'weight') {
    /* A previous best of zero is not a lighter lift, it is a movement that had
       never been loaded. "trước là 0 kg" would be a sentence about a set that
       does not exist. */
    const key = r.previous <= 0 ? i18n.nPrFirstLoad : i18n.nPrWeightLine;
    return key
      .replace('{ex}', r.exercise)
      .replace('{value}', kg(r.value))
      .replace('{unit}', wl)
      .replace('{prev}', kg(r.previous));
  }

  /* Reps at no load are pull-ups and press-ups. Printing "ở 0 kg" beside them
     reads as a bug in the app rather than as bodyweight work. */
  const bodyweight = (r.atWeight ?? 0) <= 0;
  const key = bodyweight ? i18n.nPrRepsBodyLine : i18n.nPrRepsLine;
  return key
    .replace('{ex}', r.exercise)
    .replace('{value}', String(r.value))
    .replace('{w}', kg(r.atWeight ?? 0))
    .replace('{unit}', wl)
    .replace('{prev}', String(r.previous));
}
