import type { ExerciseKind } from '@/lib/exercise-kind';
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
  /**
   * True when the bodyweight index fell back to a raw rep count because no
   * weigh-in was on record. Carried so the caller can lower its confidence and
   * say so, rather than presenting a rep count as if it were a load.
   */
  bodyweightUnknown: boolean;
}

/** Read a movement's recent history. Input must be oldest first. */
export function readTrend(history: readonly ExercisePerformance[]): TrendReading {
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

  const base = {
    sessions: points.length,
    unit,
    series,
    bodyweightUnknown,
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
export function confidenceFor(t: TrendReading): Confidence {
  if (t.sessions === 0) return 'none';
  if (t.sessions < MIN_SESSIONS) return 'low';
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
  | { kind: 'series'; unit: IndexUnit; values: number[] }
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
  | { kind: 'bodyweight-unknown' };

export interface ExerciseInsight {
  exerciseKey: string;
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

  const t = readTrend(history);
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
    evidence.push({ kind: 'series', unit: t.unit, values: t.series });
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
  if (t.bodyweightUnknown) evidence.push({ kind: 'bodyweight-unknown' });
  evidence.push({ kind: 'best-set', weightKg: last.bestWeightKg, reps: last.bestReps });
  const e1 = pick('bestE1rmKg');
  if (e1 !== null) evidence.push({ kind: 'e1rm', value: e1 });

  return {
    exerciseKey: last.exerciseKey,
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
  return out.sort((a, b) => RANK[a.trend] - RANK[b.trend] || b.sessions - a.sessions);
}
