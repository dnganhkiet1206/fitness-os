/**
 * The things that happen to a person, in the only vocabulary Koa hears.
 *
 * ── why events, when the app already has state ──
 *
 * Everything Koa reacted to until now was inferred by *polling*: a hook read
 * today's quests every render and compared them to what it saw last time. That
 * works for the five daily boxes and cannot see anything else. A personal
 * record, a level, a return after two weeks away — all of those already exist
 * in the app, none of them ever reached the character, and no amount of
 * comparing today's numbers to yesterday's would have found them.
 *
 * So the significant moments are announced rather than detected. The places
 * that already know — the medal engine, the quest watcher, the streak guard —
 * say what happened, once, and Koa decides what to do about it.
 *
 * ── magnitude is part of the event, not of the reaction ──
 *
 * `magnitude` is 0..1 and it answers *how big was this*, which is a question
 * about the person's life and not about the character's mood. A first workout
 * and a hundredth are the same event with different weight; a three-day streak
 * and a year are the same event with very different weight. Keeping it here
 * means the decision engine never has to know what a personal record *is* — it
 * only has to know how much of one this was.
 */

export type KoaEventKind =
  /** one of the five daily boxes went from undone to done */
  | 'quest_done'
  /** all five, today */
  | 'day_complete'
  /** a medal was granted just now — streak, workouts, PR, steps */
  | 'award_earned'
  /** a personal record was detected on a session */
  | 'personal_record'
  /** the buddy crossed a level */
  | 'level_up'
  /** a streak freeze covered a missed day */
  | 'streak_saved'
  /** they logged again after days away */
  | 'comeback'
  /** the streak is alive, unfed, and the person's own evening is running out */
  | 'streak_at_risk'
  /** they opened Koa's room, or tapped the figure */
  | 'koa_greeted';

export interface KoaEvent {
  kind: KoaEventKind;
  /** 0..1 — how big a deal this was *for this person* */
  magnitude: number;
  /** which of the five, when the event is about one of them */
  quest?: 'meal' | 'water' | 'workout' | 'sleep' | 'steps';
  /** days away, for `comeback`; days held, for `streak_saved` */
  days?: number;
  /** coins the moment earned, if any — shown beside the figure */
  coins?: number;
  /** free text the dialogue may quote back, e.g. a medal's title */
  label?: string;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * How big a streak milestone is, on the 0..1 scale.
 *
 * Deliberately not linear. The gap between 3 days and 7 is the difference
 * between trying and having started; the gap between 180 and 365 is two numbers
 * that both mean "this is who I am now". A log curve says that, and it also
 * stops a year-long streak from making every other event in the app look
 * trivial by comparison.
 */
export const streakMagnitude = (days: number): number =>
  clamp01(Math.log10(Math.max(days, 1)) / Math.log10(365));

/**
 * How big a comeback is.
 *
 * Rises fast — three days away and back is worth noticing, because the person
 * who returns on day three is the person who was about to stop. Past a
 * fortnight it flattens: at that point the size of the gap says nothing more,
 * and treating a two-month absence as a *bigger* celebration than a two-week
 * one would be congratulating somebody on having been away.
 */
export const comebackMagnitude = (days: number): number =>
  clamp01(Math.log10(Math.max(days, 1) + 1) / Math.log10(15));

/** Medals carry their tier, and the tier is the app's own answer to "how big". */
export const TIER_MAGNITUDE: Record<string, number> = {
  bronze: 0.35,
  silver: 0.55,
  gold: 0.75,
  platinum: 0.95,
};
