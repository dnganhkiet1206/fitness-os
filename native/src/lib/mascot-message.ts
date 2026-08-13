/**
 * What Koa says, and the reason it is not a list of things you failed to do.
 *
 * ── what this replaced ──
 *
 * A ladder of four reproaches and one compliment:
 *
 *     morning and no sleep logged  → "log it"
 *     after 11 and no meals        → "fuel up and log it"
 *     after 14 and under half water→ "hydration check"
 *     16–21 and no workout         → "great window for a workout"
 *     otherwise, if you did things → "you're crushing it today"
 *
 * Four of the six outcomes are a reminder that you have not done something, the
 * fifth is one generic sentence that is the same whatever you actually did, and
 * the character saying it is the app's companion. A companion that mostly
 * notices absences is a nag, and a nag is the one thing a mascot must not be —
 * the whole mechanism, as Duolingo's own designers describe it, is that you do
 * not want to *disappoint* the character, and that only works if the character
 * is visibly pleased when there is something to be pleased about.
 *
 * ── the shape now ──
 *
 * Koa names what you did before naming what is left, and names it specifically.
 * Three outcomes:
 *
 *   - nothing done yet, something worth asking for → ask, as before. There is
 *     nothing to acknowledge and pretending otherwise is worse than asking.
 *   - something done and something left → **both, in that order**: "Tập xong
 *     rồi 💪 — ghi bữa ăn nữa nhé". This is the case the old ladder could not
 *     express at all, and it is the common one.
 *   - nothing left → praise.
 *
 * ── and it goes quiet rather than guessing ──
 *
 * `null` for every field means today could not be read — a failed query, a
 * cold start before the first fetch. The old version could not tell that from a
 * day with nothing on it, so a dropped request made Koa tell you to log the
 * meal you had already logged. Absence of data is not absence of behaviour, and
 * the fix is the app's standing one: say nothing rather than say something
 * false.
 */

/** The four things Koa watches. Order is the order they are worth mentioning. */
export type MascotThing = 'sleep' | 'meal' | 'water' | 'workout';

export interface MascotDay {
  /** minutes slept last night; `null` when the day could not be read */
  sleepMin: number | null;
  /** meals logged today */
  meals: number | null;
  /** share of the water target, 0–100+ */
  waterPct: number | null;
  /** workouts logged today */
  workouts: number | null;
  /** local hour, 0–23 */
  hour: number;
}

export type MascotLine =
  /** today is unreadable — the bubble hides rather than inventing a state */
  | { kind: 'silent' }
  /** nothing done yet: ask for the one thing that makes sense at this hour */
  | { kind: 'ask'; gap: MascotThing }
  /** the common case: name the win, then the one thing still open */
  | { kind: 'notice'; win: MascotThing; gap: MascotThing }
  /** nothing left to ask for */
  | { kind: 'praise' };

/**
 * Water counts as done at half the target, not at the whole thing.
 *
 * The old rule nagged below 50% and said nothing above it, so 50% was already
 * the line this app drew between "behind" and "fine". Keeping the same number
 * means the change of voice is not also a quiet change of standard.
 */
const WATER_DONE_PCT = 50;

/**
 * When each gap is worth raising.
 *
 * Unchanged from the ladder this replaces — these hours were chosen once and
 * re-choosing them here would be an undiscussed change riding along with a
 * change about tone. Sleep is a morning question; nobody has missed lunch at
 * nine; water accumulates; an evening with no session still has an evening left
 * in it.
 */
const GAP_HOURS: Record<MascotThing, (hour: number) => boolean> = {
  sleep: (h) => h >= 6 && h < 11,
  meal: (h) => h >= 11,
  water: (h) => h >= 14,
  workout: (h) => h >= 16 && h < 21,
};

/** Priority when several things are open or several are done. */
const ORDER: MascotThing[] = ['workout', 'meal', 'sleep', 'water'];

export function mascotLine(day: MascotDay): MascotLine {
  const known =
    day.sleepMin != null && day.meals != null && day.waterPct != null && day.workouts != null;
  if (!known) return { kind: 'silent' };

  const done: Record<MascotThing, boolean> = {
    sleep: (day.sleepMin ?? 0) > 0,
    meal: (day.meals ?? 0) > 0,
    water: (day.waterPct ?? 0) >= WATER_DONE_PCT,
    workout: (day.workouts ?? 0) > 0,
  };

  const wins = ORDER.filter((t) => done[t]);
  const gaps = ORDER.filter((t) => !done[t] && GAP_HOURS[t](day.hour));

  if (gaps.length === 0) return wins.length > 0 ? { kind: 'praise' } : { kind: 'silent' };
  if (wins.length === 0) return { kind: 'ask', gap: gaps[0] };
  return { kind: 'notice', win: wins[0], gap: gaps[0] };
}
