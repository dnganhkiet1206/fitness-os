import type { ExerciseKind } from '@/lib/exercise-kind';
import { localDateStr } from '@/lib/local-date';
import type { ExercisePerformance } from '@/lib/exercise-performance';
import { MIN_SESSIONS } from '@/lib/load-progression';
import type { Confidence } from '@/lib/user-state';

/**
 * Whether one movement is getting better, and whether it is ready for more.
 *
 * ── the index, and why it is one number per session ──
 *
 * A trend needs a scalar. Each kind has exactly one, chosen so that it moves
 * when performance moves and stays still when only the bookkeeping changes:
 *
 *   compound   · best estimated one-rep-max, so 60×6 and 55×10 are comparable
 *   isolation  · best single set's tonnage, because a curl one-rep-max is not
 *                a number that exists
 *   bodyweight · best single set's tonnage counting the body as the load, so a
 *                belt and a lighter person both register
 *   timed      · longest hold
 *
 * All four read the BEST SET and none reads the session total. Doing four sets
 * instead of three moves session tonnage by a third with nothing else changed,
 * and an engine that read it would report that as progress.
 *
 * ── best-of-half, not a regression line ──
 *
 * The window is split down the middle and the best of the recent half is
 * compared to the best of the earlier half.
 *
 * A least-squares slope was the first build. Both were measured against the
 * same histories rather than argued about, and on the specification's own
 * plateau example — 60×6, 6, 6, 5, 6 — they agree: best-of-half reads 0.0% and
 * the regression reads −1.4%, and with a three per cent band both land on
 * PLATEAU. That example does not separate them, and an earlier version of this
 * comment claimed it did.
 *
 * Where they separate is one bad day after real progress. 55 kg × 8, 9, 10,
 * then 5 while ill:
 *
 *     index      69.67   71.50   73.33   64.17
 *     best-of-half   +2.6%   → PLATEAU
 *     regression     −8.4%   → DECLINING
 *
 * The person set the best session of the block one session ago and then had one
 * bad night. A mean-based line is dragged by the last point and reports that
 * they are going backwards; the best of each half cannot be, because a bad
 * session is simply not the best of anything. Neither method calls this
 * improving and neither should — but "you are declining" and "you are holding"
 * are different things to be told after your best week.
 *
 * The comparison is also the evidence. "Your best recently against your best
 * before" is a sentence somebody can check against their own logbook, which a
 * regression coefficient is not.
 */

export type Trend =
  | 'IMPROVING'
  | 'STABLE'
  | 'PLATEAU'
  | 'DECLINING'
  | 'INSUFFICIENT_DATA';

export type Readiness = 'NOT_READY' | 'MAINTAIN' | 'READY_TO_PROGRESS';

/**
 * The fewest sessions that can support any verdict at all.
 *
 * Three, and imported rather than restated: `load-progression.ts` already
 * settled this number for the same reason — "two can be one good week and one
 * bad one". Two engines disagreeing about how much evidence is enough is the
 * shape of bug this repository keeps finding, so there is one answer.
 */
export { MIN_SESSIONS };

/**
 * The fewest sessions before the app may say somebody is stuck.
 *
 * Four, one more than it takes to say they are improving, and the asymmetry is
 * deliberate. "You are improving" is wrong in a way the person can simply
 * disagree with. "You have plateaued" is a claim about them that arrives
 * unasked, and being told it on the strength of three sessions — one of which
 * might have been a bad night — is how a training app becomes something people
 * stop opening. The expensive error gets the higher bar.
 */
export const PLATEAU_SESSIONS = 4;

/**
 * How much change counts as change.
 *
 * Three per cent. The smallest genuine step available to most people is one
 * extra repetition on their best set, or the smallest plate on the rack:
 *
 *   · 55 kg × 8 → 55 kg × 9 moves the isolation index by 12.5%
 *   · 60 kg → 62.5 kg at the same reps moves it by 4.2%
 *   · 100 kg × 5 → 100 kg × 6 moves the compound index by 2.8%
 *
 * So three per cent sits just under the smallest real move on a heavy compound
 * lift and well under everything else, while staying above the only noise this
 * measurement has: kilogram/pound round-tripping, which `personal-record.ts`
 * measured at under 0.03 kg — four hundredths of a per cent on a 60 kg lift.
 *
 * The number is not a preference. Lower it much and a rounding artefact becomes
 * a trend; raise it much and a genuine 2.5 kg step on a big lift reads as
 * standing still.
 */
export const MEANINGFUL_CHANGE = 0.03;

/**
 * How many sessions back a trend looks.
 *
 * Six. Long enough to hold both halves of a comparison with room for a bad day
 * in each, short enough that a movement somebody has trained for two years is
 * judged on this training block rather than on all of it. A trend over a whole
 * history is not a trend, it is a biography.
 */
export const TREND_WINDOW = 6;

/**
 * When a reading stops being about the training somebody is doing now.
 *
 * ── the claim this stops the app making ──
 *
 * The engine had no notion of time at all. Six sessions in three weeks and six
 * sessions in three years produced the same verdict, so a lift somebody
 * abandoned in March came back in August reading IMPROVING · READY_TO_PROGRESS
 * — a forward-looking instruction about a movement they have not touched.
 *
 * ── what the evidence does and does not say ──
 *
 * It is deliberately NOT a claim that they got weaker. The detraining
 * literature is clear that strength is the resilient part: gains are largely
 * retained through 16–24 weeks of complete cessation, with muscle size going
 * first and meaningful strength loss only beyond that
 * (mdpi.com/2813-0413/1/1/1; PMC4748325). So a stale reading is probably still
 * roughly true about what the person can lift.
 *
 * What it is not true about is what they should do next, which is what
 * `READY_TO_PROGRESS` is for. "Add load to your bench" and "you have not
 * benched since March" cannot both be the right thing to say.
 *
 * ── the threshold is relative to them, with a floor ──
 *
 * A fixed number would be wrong in both directions: 21 days is a long absence
 * for somebody who benches twice a week and an ordinary interval for somebody
 * who deadlifts once a month. So the test is against their OWN cadence for that
 * movement — twice the median gap between their sessions — and 21 days is a
 * floor under it, not the rule.
 *
 * 21 rather than `training-card.ts`'s `STALE_AFTER_DAYS = 7`: that seven is the
 * acute window of the load ratio, where a week of nothing is genuinely the
 * signal. Here a week is a normal gap between two sessions of the same lift,
 * and flagging it would mean flagging almost everybody almost always.
 */
export const STALE_FLOOR_DAYS = 21;

export type IndexUnit = 'kg' | 'kg-rep' | 'sec';

/** Which number this movement's trend is measured on, and in what. */
export function indexUnit(kind: ExerciseKind): IndexUnit {
  if (kind === 'timed') return 'sec';
  if (kind === 'compound') return 'kg';
  return 'kg-rep';
}

/**
 * The one number for one session of one movement, or `null` when this session
 * cannot be placed on the scale at all.
 *
 * `null` is not zero and the difference is the point: a session with no
 * eligible set is dropped from both halves of the comparison rather than
 * entering it as a bad one. That is the same rule `session-load.ts` states for
 * its own `null`, for the same reason.
 */
export function performanceIndex(
  p: ExercisePerformance,
  /**
   * Whether the bodyweight scale is available for the WHOLE series this
   * performance belongs to.
   *
   * ── the +7,100% this parameter exists for ──
   *
   * A bodyweight movement has two possible indexes and they are not the same
   * size: body-times-reps is in the hundreds, a bare rep count is in single
   * figures. Which one a session got used to depend on whether a weigh-in
   * existed on or before that day — decided per session.
   *
   * So a history that crossed the first weigh-in mixed them. Measured on four
   * identical sessions of eight pull-ups with a weigh-in appearing halfway:
   *
   *     8, 8, 576, 576   →   IMPROVING
   *
   * Nothing about the training changed. Stepping onto a scale had become the
   * largest improvement that person had ever made.
   *
   * The scale is therefore decided once, for the series, by `readTrend`: if any
   * comparable session lacks a bodyweight, every session is read in reps.
   * Coarser, and the same coarseness the whole way along.
   *
   * Required, with no default. A default of `true` is the shape of the original
   * bug: a caller mapping this over a history one session at a time gets the
   * mixed scale back, and it reads perfectly well. Making the caller answer the
   * question is what stops the question being skipped.
   */
  bodyweightScale: boolean,
): number | null {
  switch (p.kind) {
    case 'timed':
      return p.bestDurationSec ?? null;
    case 'compound':
      /* No fallback to raw weight. A compound session where every set ran past
         ten reps has no estimate, and substituting the bar weight would put a
         twenty-rep set and a triple on the same axis — the exact confusion the
         rep cap exists to prevent. */
      return p.bestE1rmKg ?? null;
    case 'bodyweight': {
      if (p.bestReps === null) return null;
      /* Body plus belt when the body is known, and reps alone when it is not.
         The two are different scales, so a history that crosses between them is
         reported at lower confidence — see `confidenceFor`. */
      if (!bodyweightScale || p.bodyweightKg === null) return p.bestReps;
      return round2((p.bodyweightKg + (p.bestWeightKg ?? 0)) * p.bestReps);
    }
    case 'isolation':
      if (p.bestReps === null || p.bestWeightKg === null) return null;
      return round2(p.bestWeightKg * p.bestReps);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TrendReading {
  trend: Trend;
  /**
   * Days since the most recent comparable session, or `null` when there is
   * none. A plain fact, reported whether or not it crosses the line below.
   */
  lastTrainedDays: number | null;
  /**
   * True when the reading describes a block the person has left — see
   * `STALE_FLOOR_DAYS`. The trend itself is still reported: it is what
   * happened, and it did happen.
   */
  stale: boolean;
  /** sessions that could be placed on the scale */
  sessions: number;
  /** best of the recent half */
  current: number | null;
  /** best of the earlier half */
  previous: number | null;
  /** `(current − previous) / previous`, or null when there is nothing to divide */
  changePct: number | null;
  unit: IndexUnit;
  /** the index of each comparable session, oldest first — the evidence */
  series: number[];
  /** the local day of each of those sessions, same order and same length */
  dates: string[];
  /**
   * True when the bodyweight index fell back to a raw rep count because no
   * weigh-in was on record. Carried so the caller can lower its confidence and
   * say so, rather than presenting a rep count as if it were a load.
   */
  bodyweightUnknown: boolean;
}

/**
 * The middle gap between sessions, in days.
 *
 * The median rather than the mean, because one long break — a holiday, an
 * injury — would drag a mean far enough to make everything after it look
 * normal, which is the opposite of what this is for.
 */
function medianGapDays(dates: readonly string[]): number | null {
  if (dates.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a = new Date(`${dates[i - 1]}T00:00:00`).getTime();
    const b = new Date(`${dates[i]}T00:00:00`).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) gaps.push((b - a) / 86_400_000);
  }
  if (gaps.length === 0) return null;
  gaps.sort((x, y) => x - y);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/** Read a movement's recent history. Input must be oldest first. */
export function readTrend(
  history: readonly ExercisePerformance[],
  now: Date = new Date(),
): TrendReading {
  const kind = history[history.length - 1]?.kind ?? 'compound';
  const unit = indexUnit(kind);

  const window = history.slice(-TREND_WINDOW);

  /*
    One scale for the whole window, decided before any session is placed on it.
    A session with no measurable set is left out of this — it is not going on
    the scale either way, so it cannot be the reason everybody else drops to a
    coarser one.
  */
  const measurable = window.filter((p) => performanceIndex(p, false) !== null);
  const bodyweightUnknown =
    kind === 'bodyweight' && measurable.some((p) => p.bodyweightKg === null);
  const bodyweightScale = !bodyweightUnknown;

  const points: { p: ExercisePerformance; v: number }[] = [];
  for (const p of window) {
    const v = performanceIndex(p, bodyweightScale);
    if (v !== null && Number.isFinite(v)) points.push({ p, v });
  }
  const series = points.map((q) => q.v);
  const seriesDates = points.map((q) => q.p.date);

  /*
    Measured from the most recent session that could be PLACED on the scale, not
    from the most recent session in the history. A session the verdict ignored
    cannot be the thing that keeps the verdict fresh.
  */
  const dates = points.map((q) => q.p.date);
  const last = dates[dates.length - 1];
  const lastTrainedDays =
    last === undefined
      ? null
      : Math.max(
          0,
          Math.floor(
            (new Date(`${localDateStr(now)}T00:00:00`).getTime() -
              new Date(`${last}T00:00:00`).getTime()) /
              86_400_000,
          ),
        );
  const gap = medianGapDays(dates);
  const stale =
    lastTrainedDays !== null &&
    lastTrainedDays > Math.max(STALE_FLOOR_DAYS, gap === null ? 0 : gap * 2);

  const base = {
    sessions: points.length,
    unit,
    series,
    dates: seriesDates,
    bodyweightUnknown,
    lastTrainedDays,
    stale,
  };

  if (points.length < MIN_SESSIONS) {
    return { ...base, trend: 'INSUFFICIENT_DATA', current: null, previous: null, changePct: null };
  }

  /*
    An odd number of sessions drops the middle one.

    With five sessions the halves are the first two and the last two. Putting
    the middle session in one of them would make the verdict depend on which
    side it was assigned to, and there is no principled side: it is equally
    recent and equally old. Dropping it costs one data point and buys a
    comparison that does not change meaning with the parity of the count.
  */
  const half = Math.floor(points.length / 2);
  const previous = Math.max(...series.slice(0, half));
  const current = Math.max(...series.slice(series.length - half));
  const changePct = previous > 0 ? (current - previous) / previous : null;

  let trend: Trend;
  if (changePct === null) {
    /* Both halves at zero. Real for a hold nobody held and for a rep count of
       nothing, and not a direction. */
    trend = 'INSUFFICIENT_DATA';
  } else if (changePct >= MEANINGFUL_CHANGE) {
    trend = 'IMPROVING';
  } else if (changePct <= -MEANINGFUL_CHANGE) {
    trend = 'DECLINING';
  } else if (points.length >= PLATEAU_SESSIONS) {
    trend = 'PLATEAU';
  } else {
    trend = 'STABLE';
  }

  return { ...base, trend, current, previous, changePct };
}

/**
 * How much the app is entitled to act on this reading.
 *
 * The scale is `user-state.ts`'s, not a second one invented here: `none` means
 * behave as though nothing is known, and every caller already has a branch for
 * it.
 */
/**
 * The deepest a session fell below the best of everything before it, as a
 * fraction of that best.
 *
 * ── why session count was not enough on its own ──
 *
 * Four sessions of 55×10, 55×10, 55×9, 55×10 and four of 55×10, 55×3, 55×9,
 * 55×4 both scored `high`. The second person's numbers are all over the place —
 * something other than their programme is moving them, and a verdict read off
 * that is a verdict about noise.
 *
 * ── and why this measure and not spread ──
 *
 * The first version was mean absolute deviation, and measuring it decided the
 * question. Four cases, on the e1RM index:
 *
 *     steady        10, 10, 9, 10       MAD  0.9%   drawdown  2.5%
 *     noisy         10, 3, 9, 4         MAD  8.2%   drawdown 17.5%
 *     one bad day   8, 9, 10, 5         MAD  3.9%   drawdown 12.5%
 *     real progress 55×6 → 65×6         MAD  5.0%   drawdown  0.0%
 *
 * Spread around a mean scored a genuine five-session progression (5.0%) as
 * MORE volatile than a block with a bad day in it (3.9%) — it was measuring
 * movement, and movement is the thing this engine exists to reward. A drawdown
 * from the running best cannot do that: a series that only goes up has none.
 *
 * It is also a sentence somebody can check against their own logbook — "your
 * worst session was a fifth below your best" — which a deviation statistic is
 * not.
 */
export function worstDrawdown(series: readonly number[]): number {
  let best = -Infinity;
  let worst = 0;
  for (const v of series) {
    if (best > 0) worst = Math.max(worst, (best - v) / best);
    if (v > best) best = v;
  }
  return worst;
}

/**
 * The drawdown past which the sessions are not describing one thing.
 *
 * 15%, and the four measurements above are what places it: it sits above one
 * ordinary bad day (12.5%) and below a block that is genuinely all over the
 * place (17.5%). Somebody has bad days; somebody whose worst session is a fifth
 * under their best, repeatedly, is being moved by something other than their
 * programme.
 */
export const VOLATILE_ABOVE = 0.15;

export function confidenceFor(t: TrendReading): Confidence {
  if (t.sessions === 0) return 'none';
  if (t.sessions < MIN_SESSIONS) return 'low';
  /* A reading about a block they have left. It is not wrong about what
     happened; it is out of date about what is happening. */
  if (t.stale) return 'low';
  if (worstDrawdown(t.series) > VOLATILE_ABOVE) return 'low';
  /* A rep count standing in for a load is a real reading on a coarser scale —
     it cannot see a belt being added, so it can under-report progress. Enough
     to describe, not enough to act on. */
  if (t.bodyweightUnknown) return 'medium';
  return t.sessions >= PLATEAU_SESSIONS ? 'high' : 'medium';
}

/**
 * Whether this movement looks ready for more.
 *
 * ── what it is not ──
 *
 * It is not permission, and it is not systemic. `load-progression.ts` owns the
 * question of whether this *person* should be adding load at all — it holds the
 * gate that refuses to say "up" to somebody whose acute:chronic ratio is already
 * spiking, and that gate is not repeated here. This is a sentence about one
 * exercise, for the Adaptive Training Engine to combine with everything else.
 *
 * Nothing here writes to a template. V1 does not change anybody's programme.
 *
 * ── the three answers ──
 *
 * `READY_TO_PROGRESS` needs three things at once, and the third is what stops
 * it firing off the back of a peak that has already passed: the trend is up,
 * there is enough evidence to believe it, and the most recent session is the
 * best of the window. 55×8, 55×9, 55×10 satisfies all three.
 *
 * `NOT_READY` is for a movement going backwards, or one there is nothing to say
 * about. 60×5, 60×4, 60×5 is neither — it is `MAINTAIN`, which is the answer
 * that means "keep doing this", not "we don't know".
 */
export function readinessFor(t: TrendReading): Readiness {
  if (t.trend === 'INSUFFICIENT_DATA' || t.trend === 'DECLINING') return 'NOT_READY';
  /*
    A stale reading never says "add load". The trend still stands as a record of
    what happened — the person really was improving — but "ready for more" is an
    instruction about today, and the last thing this app should do is hand
    somebody a heavier bar on the basis of a block they left two months ago.

    `MAINTAIN` rather than `NOT_READY`: nothing here suggests they went
    backwards, and the detraining evidence says they probably did not.
  */
  if (t.stale) return 'MAINTAIN';
  if (t.trend !== 'IMPROVING') return 'MAINTAIN';
  if (confidenceFor(t) === 'low' || confidenceFor(t) === 'none') return 'NOT_READY';

  /*
    Read out of the series rather than recomputed from the history.

    Recomputing called `performanceIndex` with its default scale while the
    series had been built on whatever scale the window settled on — so for a
    bodyweight movement with a partial weigh-in history the two numbers were in
    different units, and "is the latest session the best one" compared 8 against
    576. The series already holds the answer, on the scale the verdict used.
  */
  const last = t.series[t.series.length - 1];
  if (last === undefined) return 'MAINTAIN';
  /* Strictly the best, within the same tolerance a change is measured at, so
     that finishing level with an earlier peak is not read as being on top of
     one. */
  const peak = Math.max(...t.series);
  return last >= peak * (1 - MEANINGFUL_CHANGE) ? 'READY_TO_PROGRESS' : 'MAINTAIN';
}

/**
 * Structured facts, never sentences.
 *
 * The engine says what happened in numbers and the UI decides the wording. The
 * alternative — an engine that returns "Bench Press improved 12%" — puts a
 * language, a unit and a rounding decision inside a calculation, and this app
 * shows kilograms or pounds by preference and speaks two languages.
 */
export type Evidence =
  /**
   * The index per comparable session, with the local day each one happened on.
   *
   * ── the dates are not decoration ──
   *
   * A sparkline drawn from `values` alone has to space them evenly, which says
   * the sessions were evenly spaced. They are not: somebody who trained three
   * times in a week and then once six weeks later has a shape that even spacing
   * hides completely.
   *
   * `LineChart` lays out by time when every date parses and falls back to even
   * spacing when they do not — silently, which is how the first version of this
   * screen came to be drawing an evenly-spaced chart while believing it was
   * drawing a time axis. It was passing `'00'`, `'01'`, `'02'` as dates; the
   * chart parses `` `${date}T00:00:00` ``, those are `NaN`, and the fallback
   * caught it. The picture was plausible and the reason for it was wrong.
   */
  | { kind: 'series'; unit: IndexUnit; values: number[]; dates: string[] }
  /**
   * The best set of each comparable session, in the person's own terms.
   *
   * ── why the index series is not enough to show ──
   *
   * `series` is what the verdict was computed from, and for a bodyweight
   * movement it is body-times-reps: a pull-up history rendered as
   * "655 · 582 · 582" with a kilogram label beside it. That is tonnage wearing
   * a weight's unit, and nobody's logbook contains it. The specification's own
   * example shows the pull-up series as `8 / 8 / 9 / 8` — repetitions, which is
   * what the person wrote down.
   *
   * So both travel: the index because it is the evidence for the arithmetic,
   * and this because it is the evidence a person can check. The screen shows
   * this one.
   */
  | {
      kind: 'best-sets';
      values: {
        weightKg: number | null;
        reps: number | null;
        durationSec: number | null;
        /** the body that did it, for movements where the body is the load */
        bodyweightKg: number | null;
      }[];
    }
  | { kind: 'best-set'; weightKg: number | null; reps: number | null }
  | { kind: 'e1rm'; value: number }
  | { kind: 'change'; from: number; to: number; unit: IndexUnit; pct: number }
  | { kind: 'no-upward-trend'; sessions: number }
  | { kind: 'too-few-sessions'; have: number; need: number }
  | { kind: 'bodyweight-unknown' }
  /** last trained N days ago, and whether that is out of step with their own cadence */
  | { kind: 'last-trained'; days: number; stale: boolean }
  /** the sessions disagree with each other more than a verdict can carry */
  | { kind: 'volatile'; spread: number }
  /**
   * A best set in this window that beat everything before it **in this window**.
   *
   * Not "personal record", and the wording matters: the window is ninety days
   * and a heavier lift from last winter is not in it. `personal-record.ts` owns
   * the all-time question and answers it at save time, against four hundred
   * sessions; this is the recent-form version of the same rules, replayed.
   */
  | {
      kind: 'window-best';
      of: 'weight' | 'reps';
      value: number;
      previous: number;
      atWeightKg: number | null;
      daysAgo: number | null;
    };

export interface ExerciseInsight {
  exerciseKey: string;
  lastTrainedDays: number | null;
  stale: boolean;
  exerciseName: string;
  kind: ExerciseKind;
  trend: Trend;
  readiness: Readiness;
  confidence: Confidence;
  sessions: number;
  current: number | null;
  previous: number | null;
  changePct: number | null;
  unit: IndexUnit;
  /** the best single set ever seen in the window, for showing */
  bestWeightKg: number | null;
  bestReps: number | null;
  bestE1rmKg: number | null;
  bestDurationSec: number | null;
  evidence: Evidence[];
  /** ISO instant, so a stale card can be recognised as stale */
  generatedAt: string;
}

/** One movement, read. `history` must be oldest first. */
export function insightFor(
  history: readonly ExercisePerformance[],
  now: Date = new Date(),
): ExerciseInsight | null {
  const last = history[history.length - 1];
  if (!last) return null;

  const t = readTrend(history, now);
  const confidence = confidenceFor(t);
  const readiness = readinessFor(t);
  const window = history.slice(-TREND_WINDOW);

  const pick = <K extends keyof ExercisePerformance>(k: K): number | null => {
    let best: number | null = null;
    for (const p of window) {
      const v = p[k];
      if (typeof v === 'number' && (best === null || v > best)) best = v;
    }
    return best;
  };

  const evidence: Evidence[] = [];
  if (t.sessions > 0) {
    evidence.push({ kind: 'series', unit: t.unit, values: t.series, dates: t.dates });
    /* Only the sessions that made it onto the scale, so the two series line up
       row for row — a readable series one longer than the one the verdict came
       from would be quietly showing a session the verdict ignored. */
    evidence.push({
      kind: 'best-sets',
      values: window
        /* `false` — "can this session be placed at all", which is the same
           question `readTrend` asks when it decides the scale. Asking it with
           the bodyweight scale on would drop a session that has reps but no
           weigh-in, and the two series would stop lining up. */
        .filter((p) => performanceIndex(p, false) !== null)
        .map((p) => ({
          weightKg: p.bestWeightKg,
          reps: p.bestReps,
          durationSec: p.bestDurationSec,
          bodyweightKg: p.kind === 'bodyweight' ? p.bodyweightKg : null,
        })),
    });
  }
  if (t.sessions < MIN_SESSIONS) {
    evidence.push({ kind: 'too-few-sessions', have: t.sessions, need: MIN_SESSIONS });
  }
  if (t.changePct !== null && t.current !== null && t.previous !== null) {
    evidence.push({
      kind: 'change',
      from: t.previous,
      to: t.current,
      unit: t.unit,
      pct: Math.round(t.changePct * 1000) / 1000,
    });
  }
  if (t.trend === 'PLATEAU') evidence.push({ kind: 'no-upward-trend', sessions: t.sessions });
  if (t.lastTrainedDays !== null) {
    evidence.push({ kind: 'last-trained', days: t.lastTrainedDays, stale: t.stale });
  }
  const spread = worstDrawdown(t.series);
  if (t.sessions >= MIN_SESSIONS && spread > VOLATILE_ABOVE) {
    evidence.push({ kind: 'volatile', spread: Math.round(spread * 1000) / 1000 });
  }
  if (t.bodyweightUnknown) evidence.push({ kind: 'bodyweight-unknown' });
  evidence.push({ kind: 'best-set', weightKg: last.bestWeightKg, reps: last.bestReps });
  const e1 = pick('bestE1rmKg');
  if (e1 !== null) evidence.push({ kind: 'e1rm', value: e1 });

  /*
    The most recent window-best, and only one of them.

    A movement that improved four sessions running set four of these, and a card
    listing all four would be a changelog rather than a fact worth reading. The
    newest is the one that is still true.
  */
  for (let i = window.length - 1; i >= 0; i--) {
    const r = window[i]!.records[0];
    if (!r) continue;
    const days =
      t.lastTrainedDays === null
        ? null
        : Math.round(
            (new Date(`${window[window.length - 1]!.date}T00:00:00`).getTime() -
              new Date(`${window[i]!.date}T00:00:00`).getTime()) /
              86_400_000,
          ) + t.lastTrainedDays;
    evidence.push({
      kind: 'window-best',
      of: r.kind,
      value: r.value,
      previous: r.previous,
      atWeightKg: r.atWeight ?? null,
      daysAgo: days,
    });
    break;
  }

  return {
    exerciseKey: last.exerciseKey,
    lastTrainedDays: t.lastTrainedDays,
    stale: t.stale,
    exerciseName: last.exerciseName,
    kind: last.kind,
    trend: t.trend,
    readiness,
    confidence,
    sessions: t.sessions,
    current: t.current,
    previous: t.previous,
    changePct: t.changePct,
    unit: t.unit,
    bestWeightKg: pick('bestWeightKg'),
    bestReps: pick('bestReps'),
    bestE1rmKg: e1,
    bestDurationSec: pick('bestDurationSec'),
    evidence,
    generatedAt: now.toISOString(),
  };
}

/**
 * Every movement in a history, most worth looking at first.
 *
 * The order is by how much the reading asks of the reader, not by how good it
 * is: something going backwards or stuck is why somebody opened this screen.
 */
export function insightsFrom(
  perfs: readonly ExercisePerformance[],
  now: Date = new Date(),
): ExerciseInsight[] {
  const byKey = new Map<string, ExercisePerformance[]>();
  for (const p of perfs) {
    const list = byKey.get(p.exerciseKey);
    if (list) list.push(p);
    else byKey.set(p.exerciseKey, [p]);
  }
  const out: ExerciseInsight[] = [];
  for (const history of byKey.values()) {
    const i = insightFor(history, now);
    if (i) out.push(i);
  }
  const RANK: Record<Trend, number> = {
    DECLINING: 0,
    PLATEAU: 1,
    IMPROVING: 2,
    STABLE: 3,
    INSUFFICIENT_DATA: 4,
  };
  /*
    Then stale ones, ahead of fresh ones with the same verdict.

    The ordering is by how much the reading asks of the reader, and a movement
    somebody has stopped doing asks more than one they are still doing well at.
    Two cards both saying IMPROVING are not equally worth reading when one of
    them is about a lift last touched in June — and that one was falling to the
    bottom of the list precisely because its verdict was good.
  */
  return out.sort(
    (a, b) =>
      RANK[a.trend] - RANK[b.trend] ||
      Number(b.stale) - Number(a.stale) ||
      b.sessions - a.sessions,
  );
}
