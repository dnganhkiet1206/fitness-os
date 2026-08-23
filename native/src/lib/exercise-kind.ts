/**
 * What kind of movement this is, and therefore what "better" means for it.
 *
 * ── why one progression rule cannot cover all of them ──
 *
 * A lateral raise and a squat are not the same question. Squat progress is a
 * load question and an estimated one-rep-max is a reasonable way to compare
 * 100×5 against 90×8. A lateral raise one-rep-max is a number nobody has ever
 * lifted or ever will, and computing one would be inventing a fact. A pull-up
 * done at bodyweight and a pull-up done with a 10 kg belt are the same movement
 * at two different loads, and the load is not in the `weight` field. A plank
 * has no reps at all.
 *
 * So the kind decides which metric the trend engine reads, and every kind has
 * exactly one primary index — see `exercise-trend.ts`.
 *
 * ── where the answer comes from, in order ──
 *
 * 1. `exercises.exercise_kind`, when the exercise can be resolved. Authoritative
 *    because a person said it.
 * 2. Inferred from the sets themselves.
 *
 * Two is not a fallback for tidiness; it is the ordinary case. `day-plan.tsx`
 * writes `exerciseId: ''` for every set it saves, and `log-workout.tsx` fills it
 * in only when a row was picked out of the library rather than typed. Most
 * logged sets therefore have no exercise to resolve, which is the same reason
 * `personal-record.ts` matches on the name and not the id.
 *
 * ── what inference will and will not claim ──
 *
 * It will claim `bodyweight` and `timed`, because both are visible in the data:
 * a movement never loaded is bodyweight work, and a set with a duration and no
 * reps is a hold.
 *
 * It will NOT claim `isolation`. Nothing in a set of numbers distinguishes a
 * curl from a row, and guessing would decide whether an estimated one-rep-max
 * gets computed for a movement — a number shown or withheld on the strength of
 * a guess. Loaded work with no stated kind is treated as `compound`, which is
 * the kind that computes the most and is therefore the one whose mistakes are
 * visible rather than silent.
 */

/** The four progression strategies V1 knows how to run. */
export type ExerciseKind = 'compound' | 'isolation' | 'bodyweight' | 'timed';

export const EXERCISE_KINDS: readonly ExerciseKind[] = [
  'compound',
  'isolation',
  'bodyweight',
  'timed',
] as const;

export const isExerciseKind = (v: unknown): v is ExerciseKind =>
  typeof v === 'string' && (EXERCISE_KINDS as readonly string[]).includes(v);

/** What one set of a movement looks like once parsed. Only the fields used here. */
export interface KindSet {
  weight: number;
  reps: number;
  durationSec?: number | null;
}

/**
 * The kind, from a declaration if there is one and from the sets if there is not.
 *
 * `declared` is `exercises.exercise_kind` for the matching library row, or
 * `null`/`undefined` when the exercise was typed rather than picked — which is
 * most of the time.
 */
export function resolveKind(declared: unknown, sets: readonly KindSet[]): ExerciseKind {
  if (isExerciseKind(declared)) return declared;

  const real = sets.filter((s) => Number.isFinite(s.weight) && s.weight >= 0);
  if (real.length === 0) return 'compound';

  /* A hold: time recorded, and no repetitions to count. Checked before the
     bodyweight test, because a plank also carries no load and would otherwise
     be read as bodyweight work with zero reps — a movement the rep-based
     strategy can say nothing at all about. */
  const timed = real.filter((s) => Number(s.durationSec) > 0);
  if (timed.length > 0 && timed.every((s) => !(Number(s.reps) > 0))) return 'timed';

  /*
    ── half the sets carrying no external load ──

    Not "every set", which was the first rule and which broke the case this
    distinction exists for. A pull-up history of 0, 0, 10, 10 — two sessions at
    bodyweight, then two with a ten-kilo belt — has a loaded set in it, so
    "every" classified it as `compound`; the compound index is an estimated
    one-rep-max, `estimate1rm` refuses a load of zero, and both unbelted
    sessions vanished from the trend. Four sessions of real training came out as
    INSUFFICIENT_DATA.

    Not "any set at zero" either, which fails the other way and worse: one
    forgotten weight box on a squat would reclassify the whole squat history as
    bodyweight, and every session's index would then be measured as the person's
    body plus the bar — numbers wrong by a factor rather than absent.

    So: half. A movement you do at bodyweight for half your sets is a bodyweight
    movement that you sometimes add a belt to. A loaded movement with the odd
    blank box is not.

    This is a heuristic and it is the weakest thing in this file, which is
    exactly why `exercises.exercise_kind` exists and is checked first. Where
    somebody has said what a movement is, none of the above runs.
  */
  const unloaded = real.filter((s) => s.weight === 0).length;
  if (unloaded * 2 >= real.length) return 'bodyweight';

  return 'compound';
}

/**
 * Whether an estimated one-rep-max means anything for this kind.
 *
 * `isolation` is excluded on purpose and it is the entire reason the kind
 * exists as a separate value: a one-rep-max for a cable fly is not a smaller
 * version of a squat's, it is a category error.
 */
export const usesE1rm = (kind: ExerciseKind): boolean =>
  kind === 'compound' || kind === 'bodyweight';
