/**
 * Whether a set that was just logged beat anything that came before it.
 *
 * ── the column that was always false ──
 *
 * `workout_sessions.pr_detected` has existed since the first migration, and
 * every session ever written set it to the literal `false`. Nothing computed
 * it. Nothing could. Three separate things were reading it and therefore three
 * separate things were quietly dead:
 *
 *   · `first_pr` and `pr_5` — two medals on the Awards ladder, counted with
 *     `.eq('pr_detected', true)`, so **unearnable by construction**. They were
 *     drawn locked beside medals people do earn, which does not read as a bug
 *     in the app; it reads as a failure in the person looking at it.
 *   · the training card's "Kỷ lục mới" badge, which could never appear;
 *   · Koa's `personal_record` reaction — a face, an intensity and a line, all
 *     written, reachable only from a medal that could not be granted.
 *
 * A personal record is the single biggest moment a strength app has. This app
 * had one and had never once noticed it.
 *
 * ── what counts as a record, and what deliberately does not ──
 *
 * Two kinds, both of which are a plain fact about numbers and neither of which
 * needs a model of anything:
 *
 *   · **weight** — a heavier load than this exercise has ever been done with,
 *     for at least one rep;
 *   · **reps** — more repetitions at a load already lifted before.
 *
 * There is no estimated one-rep-max here on purpose. Epley and its cousins are
 * regressions fitted to low rep ranges, and past ten or twelve reps they
 * overstate badly — a set of twenty light reps would post a "record" strength
 * number nobody has ever lifted. This app does not get to invent a number and
 * then congratulate somebody on it.
 *
 * Three things that look like records and are not:
 *
 *   · **the first time an exercise is ever done.** Everything is a best when
 *     there is nothing to beat, so a first workout would post a record for
 *     every exercise in it and the moment would mean nothing afterwards. An
 *     exercise with no history is skipped.
 *   · **a new load with no history at that load.** Bench at 60 and at 80, then
 *     70 for ten today: 70 is not a rep record, because there is no ten to
 *     beat at 70. Without this every 2.5kg step on the way up would be a
 *     record.
 *   · **a set beating an earlier set of the same session.** A ramp of 60/70/80
 *     is one working set and two warm-ups, not three records. The whole session
 *     is judged against the history that existed before it, and reports at most
 *     one record per exercise — the best one.
 */

/** One completed set, as it is stored in `workout_sessions.sets`. */
export interface RecordSet {
  exerciseName: string;
  /** kilograms; 0 is bodyweight and is a real value, not a missing one */
  weight: number;
  reps: number;
}

/** The best that has ever been done for one exercise. */
export interface ExerciseBest {
  /** heaviest load moved for at least one rep — 0 for bodyweight-only work */
  topWeight: number;
  /** most reps ever done at each load, keyed by `weightKey` */
  repsAt: Record<string, number>;
}

export type Bests = Record<string, ExerciseBest>;

export type RecordKind = 'weight' | 'reps';

export interface PersonalRecord {
  /** the name as it was typed this session — for showing, not for matching */
  exercise: string;
  kind: RecordKind;
  /** the new number: kilograms for `weight`, repetitions for `reps` */
  value: number;
  /** the number it beat */
  previous: number;
  /** the load a rep record was set at */
  atWeight?: number;
}

/**
 * Exercises are matched by name, because that is the only thing that is always
 * there. `exerciseId` is filled in when a row was picked from the library and
 * left empty when the name was typed, which is most of the time — keying on it
 * would mean "Bench Press" typed on Monday and picked on Thursday are two
 * different exercises with two separate histories.
 */
export const exerciseKey = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Loads are compared at two decimals — the precision they are stored at. */
export const weightKey = (w: number): string => (Math.round(w * 100) / 100).toFixed(2);

const round2 = (w: number) => Math.round(w * 100) / 100;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** A set only counts once it has a rep in it; the rest is an unfinished row. */
const counts = (s: RecordSet): boolean =>
  Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.reps >= 1 && s.weight >= 0;

/** Fold every set ever logged into one best-per-exercise table. */
export function bestsFrom(sets: RecordSet[]): Bests {
  const out: Bests = {};
  for (const s of sets) {
    if (!counts(s)) continue;
    const key = exerciseKey(s.exerciseName);
    if (!key) continue;
    const w = round2(s.weight);
    const best = (out[key] ??= { topWeight: 0, repsAt: {} });
    if (w > best.topWeight) best.topWeight = w;
    const wk = weightKey(w);
    if (s.reps > (best.repsAt[wk] ?? 0)) best.repsAt[wk] = s.reps;
  }
  return out;
}

/** Records set by a session, at most one per exercise, best first. */
export function findRecords(sets: RecordSet[], bests: Bests): PersonalRecord[] {
  const out = new Map<string, PersonalRecord>();

  for (const s of sets) {
    if (!counts(s)) continue;
    const key = exerciseKey(s.exerciseName);
    if (!key) continue;

    /* No history for this exercise means nothing to beat. See the note above:
       this is the line that stops a first workout from posting a record for
       every movement in it. */
    const best = bests[key];
    if (!best) continue;

    const w = round2(s.weight);
    const found: PersonalRecord | null =
      w > 0 && w > best.topWeight
        ? { exercise: s.exerciseName.trim(), kind: 'weight', value: w, previous: best.topWeight }
        : (() => {
            const prev = best.repsAt[weightKey(w)];
            /* `undefined` is "this load has never been used", which is not a
               record. `0` cannot occur — a set with no reps never enters the
               table — but the check is written against the absence rather than
               against falsiness, because those two being confused is how a
               missing reading becomes a decision. */
            if (prev === undefined || s.reps <= prev) return null;
            return {
              exercise: s.exerciseName.trim(),
              kind: 'reps',
              value: s.reps,
              previous: prev,
              atWeight: w,
            };
          })();

    if (!found) continue;
    const held = out.get(key);
    if (!held || better(found, held)) out.set(key, found);
  }

  return [...out.values()].sort((a, b) => gainOf(b) - gainOf(a));
}

/** A heavier load outranks more reps; otherwise the bigger number wins. */
function better(next: PersonalRecord, held: PersonalRecord): boolean {
  if (next.kind !== held.kind) return next.kind === 'weight';
  return next.value > held.value;
}

/** How much better this was, as a fraction of what it beat. */
function gainOf(r: PersonalRecord): number {
  /* A previous best of zero is the first time load was ever added to a
     bodyweight movement. Real, but not divisible — it is given a fixed weight
     rather than an infinite one. */
  if (r.previous <= 0) return 0.1;
  return (r.value - r.previous) / r.previous;
}

/** The one worth putting in a sentence — the biggest improvement. */
export const headlineRecord = (records: PersonalRecord[]): PersonalRecord | null =>
  records[0] ?? null;

/**
 * How big a moment this was, on the 0..1 scale `koa-event` uses.
 *
 * Any record starts well above `SPEAK_ABOVE`, because beating yourself is
 * always worth saying out loud. What varies above that is how much better it
 * was and how many movements it happened on — and the ceiling is 0.9, below a
 * platinum medal, so a 2.5kg step never outshines a year-long streak.
 */
export function recordsMagnitude(records: PersonalRecord[]): number {
  if (records.length === 0) return 0;
  const gain = records.reduce((m, r) => Math.max(m, gainOf(r)), 0);
  return Math.min(
    clamp01(0.55 + Math.min(gain, 0.2) * 1.25 + Math.min(records.length - 1, 3) * 0.05),
    0.9,
  );
}

/**
 * Pull the sets out of a `workout_sessions.sets` value.
 *
 * The column is free JSONB: a row can hold anything, including not an array,
 * and rows written by older versions of this app and by the health sync are in
 * there too. Everything is coerced and anything that will not coerce is
 * dropped — a history query that throws would turn a saved workout into an
 * error message about a set from two years ago.
 */
export function setsFromJson(value: unknown): RecordSet[] {
  if (!Array.isArray(value)) return [];
  const out: RecordSet[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.exerciseName === 'string' ? r.exerciseName : '';
    const weight = Number(r.weight);
    const reps = Number(r.reps);
    if (!name.trim() || !Number.isFinite(weight) || !Number.isFinite(reps)) continue;
    out.push({ exerciseName: name, weight, reps });
  }
  return out;
}

/**
 * How far back a record is measured.
 *
 * Four hundred sessions is well over two years for anybody training three
 * times a week, and it is a bound rather than a policy: the alternative is
 * pulling every set of every session a long-time user has ever logged across
 * the wire on each save. It is stated here so that "your best ever" has a
 * definition somebody could read, rather than being whatever the query
 * happened to return.
 */
export const PR_HISTORY = 400;
