import { estimatedMinutes } from './prescription';

/**
 * What the three activity rings are, and where each number came from.
 *
 * ── why this is a file and not three props ──
 *
 * The card drew three rings from `daily_logs.active_kcal`, `active_minutes`
 * and `steps`. Two of those three columns are written by nothing: search the
 * app for `active_kcal` and the only hits are the type definitions, the
 * migration that created it, and the one line on Today that reads it. So two
 * of the three rings had been at exactly zero since the day the card shipped,
 * and no amount of animation fixes a ring whose value is zero.
 *
 * They are real now — Apple Health reports both, and the sync writes them —
 * but that leaves a second question this file answers: what the card shows to
 * somebody with no watch, who trains anyway and logs it. Nothing measures
 * their active calories, and there is no honest way to invent that number from
 * a set list. Their *training time* is a different matter: the app knows every
 * set they did, and how long a set takes is the same arithmetic the plan
 * screen already uses to say "≈ 45 phút" before they start.
 *
 * So each ring carries where its number came from, and the card is required to
 * show the difference. An estimate presented as a measurement is the one
 * outcome worse than an empty ring.
 */

/** A ring's number is measured, worked out from what was logged, or absent. */
export type RingSource = 'measured' | 'estimated' | 'none';

export type RingKey = 'move' | 'exercise' | 'steps';

export interface RingModel {
  key: RingKey;
  current: number;
  target: number;
  source: RingSource;
  /** current/target, uncapped — a ring may legitimately be past 1 */
  pct: number;
}

/**
 * Apple's own daily defaults, and the reason they are named rather than typed
 * into the card: 600 and 30 were two bare numbers in the middle of Today's
 * JSX, where nobody reading the card could tell whether they were a setting, a
 * placeholder, or a guess.
 */
export const MOVE_TARGET_KCAL = 600;
export const EXERCISE_TARGET_MIN = 30;

export interface LoggedSet {
  reps?: number | null;
  restSeconds?: number | null;
}

/**
 * How long a list of logged sets took, in minutes.
 *
 * The same arithmetic `estimatedMinutes` does for a *plan* — three seconds a
 * rep plus the rest that follows it — applied to what was actually recorded,
 * because a set that has happened takes as long as a set that is going to.
 * Calling that function rather than restating it is the point: two formulas
 * for one quantity drift, and the drift shows up as a plan that promises 45
 * minutes and a diary that reports 38 for the identical workout.
 *
 * Zero sets is zero minutes, not the one minute `estimatedMinutes` floors at.
 * That floor is right for a plan — a workout you are about to do is not an
 * instant — and wrong here, where "no sets" means the day has not happened
 * yet and a ring showing 1/30 would be a lie about a rest day.
 */
export function trainingMinutes(sets: LoggedSet[]): number {
  const real = sets.filter((s) => Number(s.reps) > 0);
  if (real.length === 0) return 0;
  return estimatedMinutes(
    real.map((s) => ({
      sets: 1,
      reps: Number(s.reps),
      restSeconds: s.restSeconds != null ? Number(s.restSeconds) : undefined,
    })),
  );
}

export interface ActivityInput {
  /** daily_logs.active_kcal — null when Health has never written it */
  moveKcal: number | null;
  /** daily_logs.active_minutes — null when Health has never written it */
  healthMinutes: number | null;
  /** worked out from today's logged sets; 0 when nothing was logged */
  loggedMinutes: number;
  steps: number;
  stepsTarget: number;
}

export interface ActivityModel {
  rings: RingModel[];
  /** how many rings are at or past their target */
  closed: number;
  /** false when every ring is empty — the card has nothing to draw */
  hasAny: boolean;
}

/**
 * The three rings, from everything that could feed them.
 *
 * ── the exercise ring prefers the measurement ──
 *
 * When Health has a number, that number wins, even if today's logged sets work
 * out to more. It is tempting to take the larger of the two — both are lower
 * bounds on time spent training, and Apple's exercise minutes famously miss
 * most of a lifting session — but "the bigger of a measurement and an
 * estimate" is a rule nobody can hold in their head, and a ring that silently
 * switches which kind of number it is showing cannot be labelled honestly.
 * Measurement first, estimate as the fallback, and the card says which.
 *
 * A measured zero is still a measurement, and it still loses to a logged
 * workout: `healthMinutes: 0` means Health watched you sit still, which is not
 * a claim about the barbell session it never saw. Only a positive reading
 * displaces the estimate.
 */
export function activityModel(input: ActivityInput): ActivityModel {
  const move = Number(input.moveKcal) || 0;
  const health = Number(input.healthMinutes) || 0;
  const logged = Math.max(0, Math.round(input.loggedMinutes));
  const steps = Math.max(0, Math.round(input.steps));

  const exercise = health > 0 ? health : logged;
  const exerciseSource: RingSource =
    health > 0 ? 'measured' : logged > 0 ? 'estimated' : 'none';

  const stepsTarget = input.stepsTarget > 0 ? input.stepsTarget : 10000;

  const rings: RingModel[] = [
    {
      key: 'move',
      current: Math.round(move),
      target: MOVE_TARGET_KCAL,
      source: move > 0 ? 'measured' : 'none',
      pct: move / MOVE_TARGET_KCAL,
    },
    {
      key: 'exercise',
      current: exercise,
      target: EXERCISE_TARGET_MIN,
      source: exerciseSource,
      pct: exercise / EXERCISE_TARGET_MIN,
    },
    {
      key: 'steps',
      current: steps,
      target: stepsTarget,
      source: steps > 0 ? 'measured' : 'none',
      pct: steps / stepsTarget,
    },
  ];

  return {
    rings,
    closed: rings.filter((r) => r.pct >= 1).length,
    hasAny: rings.some((r) => r.current > 0),
  };
}
