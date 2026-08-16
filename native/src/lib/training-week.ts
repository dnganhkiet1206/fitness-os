/**
 * How many **days** of muscle-strengthening work a window of sessions holds.
 *
 * ── why this exists ──
 *
 * `goal-training.ts` states what each goal aims at, and the last round wired
 * exactly one of its three fields into anything: `rpeBand`, through
 * `goalRpeTarget`. `strengthDays` and `aerobicMin` were computed and read by
 * nobody — the WHO floor was a table, and the commit that introduced it claimed
 * the goal now "really reaches the engine". Half of it did.
 *
 * This is the measuring half for `strengthDays`: what the person actually did,
 * in the same unit the guideline is written in, so the two can be put side by
 * side without either one being reinterpreted.
 *
 * ── days, not sessions ──
 *
 * WHO's recommendation is muscle-strengthening activity on **two or more days a
 * week**. Two sessions on the same day is one day of it, and counting sessions
 * would let a Saturday double session read as having met a guideline about
 * spreading work across the week. The set below is keyed by date for that
 * reason and not as an incidental de-duplication.
 *
 * ── and the date has to be the person's own ──
 *
 * `date_time` is written as `toISOString()`, so it is UTC, and `.slice(0, 10)`
 * on it is the UTC date. For anybody east of Greenwich an early-morning session
 * carries the *previous* UTC date: at UTC+7, sessions at 06:00 and 20:00 on the
 * same Monday fall on two different UTC dates and would count as two days
 * towards a guideline about training on two separate days.
 *
 * The error only appears for people who train early, only in some time zones,
 * and only ever inflates the count — which is the direction that matters, since
 * the number is being compared against a floor. So the grouping goes through
 * `localDateStr`, the same function `use-fitness-data.ts` already uses to decide
 * which day a session belongs to when it invalidates that day's log.
 */
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { totalReps } from '@/lib/session-load';

/** Days in the window, and the unit the WHO recommendation is written in. */
export const WEEK_DAYS = 7;

export interface WeekSession {
  /** ISO timestamp as stored; anything unparseable is skipped */
  date_time?: string | null;
  /** the stored JSON array of sets */
  sets?: unknown;
}

/**
 * Distinct local days in `sessions` that contain resistance work.
 *
 * ── what counts as resistance work ──
 *
 * At least one repetition. That is deliberately the same test `sessionLoad`
 * uses, so the two never disagree about what a session is: a watch import has
 * `sets: []` and contributes nothing here, exactly as it contributes nothing to
 * internal load.
 *
 * A run is not muscle-strengthening work, so leaving it out is right rather
 * than a limitation — but it does mean this counts *logged* strength work, and
 * somebody who lifts without logging it is invisible. That is true of every
 * number in this app and is not something a different rule here could fix.
 *
 * Bodyweight sessions do count: reps are reps whether or not a barbell was
 * involved, which is the whole reason the test is repetitions and not tonnage.
 *
 * ── the window is seven days, not a hundred and sixty-eight hours ──
 *
 * The caller passes `useWorkoutSessions(7)`, which is everything since this
 * instant minus 7×24 hours. That span touches **eight** local dates whenever it
 * starts partway through a day — which is almost always — so somebody training
 * daily could be counted as having eight strength days out of seven.
 *
 * A rolling span of hours is the right window for summing load, and it is the
 * wrong one for counting days: the count is being held against "two or more
 * days a week", and a denominator the numerator can exceed is not a comparison.
 * So the days are bounded here, by date, to the last seven the person has
 * actually lived through — the same unit as the guideline and as the label.
 *
 * A date in the future is dropped for the same reason rather than counted: a
 * row written by a device with a wrong clock is not a training day, and it
 * could only ever push the count up, past a floor the person has not met.
 */
export function strengthDaysIn(
  sessions: readonly WeekSession[] | null | undefined,
  today: string = localDateStr(),
): number {
  /* Derived from `today` and not from the clock, so that passing a day makes
     the whole answer deterministic — otherwise a test could name the day it is
     asking about while the window silently came from the real date. */
  const start = parseLocalDate(today);
  start.setDate(start.getDate() - (WEEK_DAYS - 1));
  const earliest = localDateStr(start);
  const days = new Set<string>();
  for (const s of sessions ?? []) {
    if (totalReps(s?.sets) <= 0) continue;
    const raw = s?.date_time;
    if (!raw) continue;
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) continue;
    /* ISO dates are fixed-width, so lexical order is chronological order. */
    const day = localDateStr(when);
    if (day < earliest || day > today) continue;
    days.add(day);
  }
  return days.size;
}
