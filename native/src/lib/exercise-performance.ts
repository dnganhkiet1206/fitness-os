import {
  bestsFrom,
  exerciseKey,
  findRecords,
  setsFromJson,
  type PersonalRecord,
  type RecordSet,
} from '@/lib/personal-record';
import { localDateStr } from '@/lib/local-date';
import { resolveKind, usesE1rm, type ExerciseKind } from '@/lib/exercise-kind';

/**
 * What one exercise did in one session.
 *
 * ── the shape everything downstream reads ──
 *
 * The app stores sessions, not exercises. `workout_sessions.sets` is a flat
 * JSONB array of every set of every movement, which is right for writing a
 * workout down and useless for asking "how is my bench going" — nothing in the
 * app had ever grouped it the other way.
 *
 * This is that grouping and nothing else. It computes no verdicts; it produces
 * the facts a verdict could be built from, so that the trend engine has one
 * input shape and the arithmetic lives in one place rather than in each screen
 * that wants a number.
 *
 * ── best SET, not session total ──
 *
 * Every "best" here is the best single set, and the totals are carried
 * alongside rather than used as the headline. Session tonnage moves 33% when
 * somebody does four sets instead of three, with no change in what they can
 * lift, and a progress engine that reads it would call that progress. The best
 * set is also what a person means when they say how their bench is going.
 */

/** How far back a rep count can be trusted to an estimated one-rep-max. */
export const E1RM_MAX_REPS = 10;

/**
 * Epley, and the fence around it.
 *
 * ── this file overturns a decision, so here is the decision ──
 *
 * `personal-record.ts` refused to compute one of these, and said why: "Epley
 * and its cousins are regressions fitted to low rep ranges, and past ten or
 * twelve reps they overstate badly — a set of twenty light reps would post a
 * 'record' strength number nobody has ever lifted. This app does not get to
 * invent a number and then congratulate somebody on it."
 *
 * That reasoning is still correct and is still in force **for records**. What
 * changed is that this app now also has to answer a question records cannot:
 * whether 60 kg × 6 is better or worse than 55 kg × 10. Those are not
 * comparable on weight, not comparable on reps, and a person who did both wants
 * to know which was the better session.
 *
 * The fence is the rep cap. Above `E1RM_MAX_REPS` this returns `null` rather
 * than a number, which is the same rule the old comment asked for, stated as
 * code instead of as a refusal to have the function at all. A twenty-rep set
 * still cannot post a strength figure — it simply has no estimate, and the
 * trend engine reads the sets that do.
 *
 * It is an **estimate and never a maximum**: nothing here writes it to a record
 * table, and no personal record is derived from it. `findRecords` is untouched.
 */
export function estimate1rm(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return null;
  /* A single is its own estimate; the formula agrees, but saying so explicitly
     means a one-rep set does not depend on the coefficient being exactly right
     at its own boundary. */
  if (reps === 1) return round2(weightKg);
  return round2(weightKg * (1 + reps / 30));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One session's worth of one movement. */
export interface ExercisePerformance {
  exerciseKey: string;
  /** the name as most recently typed — for showing, never for matching */
  exerciseName: string;
  sessionId: string;
  /** the instant the session was recorded */
  at: string;
  /** the LOCAL calendar day it belongs to — see the note on `dayOf` */
  date: string;
  kind: ExerciseKind;
  /** working sets that carried a rep or a hold; warm-ups are already gone */
  setCount: number;
  totalReps: number;
  /** Σ(weight × reps) over working sets — the app's canonical volume */
  totalVolumeKg: number;
  /** heaviest EXTERNAL load moved for at least one rep; 0 means unloaded */
  bestWeightKg: number | null;
  bestReps: number | null;
  /** best estimate across eligible sets, or null when none qualify */
  bestE1rmKg: number | null;
  /** longest hold, for movements that are held */
  bestDurationSec: number | null;
  /**
   * Records this session set for this movement, judged against every session
   * before it **in the window this was built from**.
   *
   * ── why not the `pr_detected` column ──
   *
   * That column is the all-time answer and is computed at save time against
   * four hundred sessions, which is more history than this ever sees. It is
   * also per SESSION: it says a record happened, not which movement set it, so
   * a card about the bench press cannot use it.
   *
   * So the rules are replayed — `bestsFrom` and `findRecords`, unchanged, the
   * same functions the celebration uses. What comes out is "best in this
   * window", and the screen has to say so rather than saying "personal record":
   * a lift that was higher four months ago is not beaten by today, and this
   * cannot see four months ago.
   */
  records: PersonalRecord[];
  /**
   * The person's bodyweight on this day, when it is known.
   *
   * `null` is not zero. A pull-up at an unknown bodyweight is still a pull-up;
   * what is lost is the ability to compare it against one done ten kilos
   * lighter, and the trend engine drops to a rep-count index and lowers its
   * confidence rather than substituting a number.
   */
  bodyweightKg: number | null;
}

/** A session row as `useWorkoutSessions` selects it. */
export interface SessionRow {
  id?: string | null;
  date_time?: string | null;
  sets?: unknown;
}

/**
 * The local calendar day a session belongs to.
 *
 * ── why not `at.slice(0, 10)` ──
 *
 * `date_time` is a `timestamptz` and comes back as UTC. At UTC+7 a session
 * logged at 06:30 on Tuesday is `2026-08-24T23:30:00Z` — Monday, if you read
 * the first ten characters. Every early-morning session in Asia would be filed
 * under the previous day, which reverses the order of a Monday-evening and a
 * Tuesday-morning session and therefore reverses which one the trend engine
 * calls "recent".
 *
 * `localDateStr` is the app's own answer to this and is used everywhere else
 * that files something under a day. Daylight saving is handled by the same
 * route: the conversion goes through `Date`, which knows the offset in force at
 * that instant rather than the one in force now.
 */
export const dayOf = (at: string): string => localDateStr(new Date(at));

/** Bodyweight on a given day, from a history sorted however it arrives. */
export interface WeighIn {
  date: string;
  /** kilograms */
  value: number;
}

/**
 * The bodyweight to use for a session on `date`.
 *
 * The most recent weigh-in **at or before** that day, never a later one: using
 * a weight recorded after the session would credit today's pull-ups to a body
 * that did not exist yet, and would silently rewrite history every time
 * somebody stepped on a scale.
 *
 * `null` when nothing was recorded on or before the day. A weigh-in from six
 * months ago is accepted rather than discarded — a stale bodyweight is a worse
 * estimate than a fresh one but it is still a measurement, and the alternative
 * is telling somebody their pull-ups cannot be assessed because they stopped
 * weighing themselves.
 */
export function bodyweightOn(date: string, weighIns: readonly WeighIn[]): number | null {
  let best: WeighIn | null = null;
  for (const w of weighIns) {
    if (!w || typeof w.date !== 'string') continue;
    const v = Number(w.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (w.date > date) continue;
    if (!best || w.date > best.date) best = { date: w.date, value: v };
  }
  return best ? round2(best.value) : null;
}

/** A set that carried real work. Warm-ups are excluded by `setsFromJson`'s flag. */
const working = (s: RecordSet): boolean =>
  s.warmup !== true &&
  Number.isFinite(s.weight) &&
  s.weight >= 0 &&
  ((Number.isFinite(s.reps) && s.reps >= 1) || Number(s.durationSec) > 0);

/**
 * Every exercise in every session, grouped.
 *
 * `declaredKinds` maps an `exerciseKey` to `exercises.exercise_kind` for the
 * library rows that could be resolved. It is allowed to be empty and usually is
 * — see `exercise-kind.ts` on why most logged sets have no exercise id.
 */
export function performancesFrom(
  sessions: readonly SessionRow[],
  opts: {
    weighIns?: readonly WeighIn[];
    declaredKinds?: Readonly<Record<string, unknown>>;
  } = {},
): ExercisePerformance[] {
  const weighIns = opts.weighIns ?? [];
  const declared = opts.declaredKinds ?? {};

  /* The kind is a property of the movement, not of one session, so it is
     resolved from everything known about it before any session is judged.
     Asked per session, a day somebody happened to do bodyweight-only pull-ups
     would classify a weighted-pull-up history as bodyweight for that day and
     change which index its trend was measured on, mid-series. */
  const allSets = new Map<string, RecordSet[]>();
  for (const row of sessions) {
    for (const s of setsFromJson(row?.sets)) {
      const key = exerciseKey(s.exerciseName);
      if (!key || !working(s)) continue;
      const list = allSets.get(key);
      if (list) list.push(s);
      else allSets.set(key, [s]);
    }
  }
  const kindOf = new Map<string, ExerciseKind>();
  for (const [key, sets] of allSets) kindOf.set(key, resolveKind(declared[key], sets));

  /*
    Sessions in the order they happened, so "before this one" means something.

    The query hands them back newest first. Reading records off that order would
    compare every session against its own future, and the first session ever
    logged would hold every record in the window.
  */
  const ordered = [...sessions]
    .filter((r) => typeof r?.date_time === 'string' && !Number.isNaN(new Date(r.date_time).getTime()))
    .sort((a, b) => (a.date_time! < b.date_time! ? -1 : a.date_time! > b.date_time! ? 1 : 0));

  /** Every set of a movement seen so far, accumulated as the loop walks forward. */
  const prior = new Map<string, RecordSet[]>();

  const out: ExercisePerformance[] = [];
  for (const row of ordered) {
    const at = typeof row?.date_time === 'string' ? row.date_time : '';
    if (!at || Number.isNaN(new Date(at).getTime())) continue;
    const date = dayOf(at);
    const bodyweightKg = bodyweightOn(date, weighIns);

    const byExercise = new Map<string, RecordSet[]>();
    for (const s of setsFromJson(row.sets)) {
      const key = exerciseKey(s.exerciseName);
      if (!key || !working(s)) continue;
      const list = byExercise.get(key);
      if (list) list.push(s);
      else byExercise.set(key, [s]);
    }

    for (const [key, sets] of byExercise) {
      const kind = kindOf.get(key) ?? 'compound';
      /* Everything logged for this movement STRICTLY BEFORE this session. Read
         before the loop body so that the session being judged is never part of
         its own history — the same order `useLogWorkoutSession` is careful
         about, and for the same reason: every set would otherwise tie itself. */
      const priorSets = prior.get(key) ?? [];
      const records = priorSets.length > 0 ? findRecords(sets, bestsFrom(priorSets)) : [];
      let totalReps = 0;
      let totalVolumeKg = 0;
      let bestWeightKg: number | null = null;
      let bestReps: number | null = null;
      let bestE1rmKg: number | null = null;
      let bestDurationSec: number | null = null;

      for (const s of sets) {
        const reps = Number.isFinite(s.reps) && s.reps > 0 ? s.reps : 0;
        const w = round2(s.weight);
        totalReps += reps;
        totalVolumeKg += w * reps;
        if (reps > 0) {
          if (bestWeightKg === null || w > bestWeightKg) bestWeightKg = w;
          if (bestReps === null || reps > bestReps) bestReps = reps;
          if (usesE1rm(kind)) {
            /*
              Bodyweight movements are loaded by the body doing them. A pull-up
              at 53 kg and the same pull-up with a 10 kg belt are 53 and 63, and
              reading only the belt would call the first one weightless.

              And when the body is unknown there is no estimate, rather than an
              estimate of the belt. `(bodyweightKg ?? 0) + w` was the first
              version: a pull-up with a ten-kilo belt and no weigh-in on record
              came out at **11.67 kg**, printed on the card as this person's
              estimated one-rep-max. Not a rough figure — a figure about a
              different exercise, arrived at confidently.
            */
            const load = kind === 'bodyweight' ? (bodyweightKg === null ? null : bodyweightKg + w) : w;
            const e = load === null ? null : estimate1rm(load, reps);
            if (e !== null && (bestE1rmKg === null || e > bestE1rmKg)) bestE1rmKg = e;
          }
        }
        const d = Number(s.durationSec);
        if (Number.isFinite(d) && d > 0 && (bestDurationSec === null || d > bestDurationSec)) {
          bestDurationSec = d;
        }
      }

      out.push({
        exerciseKey: key,
        exerciseName: sets[sets.length - 1].exerciseName.trim(),
        sessionId: typeof row.id === 'string' ? row.id : '',
        at,
        date,
        kind,
        setCount: sets.length,
        totalReps,
        totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
        bestWeightKg,
        bestReps,
        bestE1rmKg,
        bestDurationSec,
        records,
        bodyweightKg,
      });
    }

    /*
      Fold this session in AFTER every movement in it has been judged.

      Inside the per-movement loop it would be right for the first movement and
      wrong for the rest of the same session: a squat and a bench pressed on the
      same day would have the squat in the bench's history. Sessions are the
      unit `personal-record.ts` judges against — "the whole session is judged
      against the history that existed before it".
    */
    for (const [key, sets] of byExercise) {
      const list = prior.get(key);
      if (list) list.push(...sets);
      else prior.set(key, [...sets]);
    }
  }

  /* Already oldest first, because the loop walks that way — but sorted again
     rather than assumed. Everything downstream talks about "earlier" and
     "recent", and getting that backwards would be invisible right up until
     every trend came out reversed. */
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out;
}

/** Just one movement's history, oldest first. */
export const historyOf = (
  perfs: readonly ExercisePerformance[],
  key: string,
): ExercisePerformance[] => perfs.filter((p) => p.exerciseKey === key);
