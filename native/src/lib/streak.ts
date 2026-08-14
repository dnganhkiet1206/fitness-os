import { parseLocalDate } from '@/lib/local-date';

/**
 * How long a run of logged days is, and whether today is in it.
 *
 * ── why this is not in either of the two places that needed it ──
 *
 * It was in both. `useDailyStreak` counted the run for Koa's room, and
 * `useCheckAwards` counted it again to decide which medals to grant, from its
 * own copy of the same query. Two copies of one rule is how the two disagree,
 * and they already had begun to: the awards version initialised the count to
 * **1** and then only ran the counting loop when the newest row was today or
 * yesterday, so a person who last logged a week ago came out with a streak of
 * one rather than none. Nothing broke — the smallest medal needs three — which
 * is exactly why it could sit there.
 *
 * ── the rule ──
 *
 * A streak is consecutive calendar days with a `daily_logs` row, ending today
 * **or yesterday**. Yesterday counts because the day is not over: somebody who
 * logged last night and has not eaten yet this morning has not lost anything,
 * and telling them they have is how an app teaches people that its streak is a
 * liar. `loggedToday` is what separates the two — safe, or still to do.
 *
 * Dates are compared through `parseLocalDate` so a run does not break at a
 * daylight-saving boundary, where two midnights are 23 or 25 hours apart.
 */
export interface Streak {
  count: number;
  /** today already has a row — the flame is lit rather than at risk */
  loggedToday: boolean;
}

/**
 * How many days back the streak can be seen at all.
 *
 * It is a `limit` on a query, so it is also a **cap on the longest streak that
 * can exist** anywhere downstream. That mattered the moment the medals went
 * past a month: the window was 35 while the ladder stopped at 30, and a 100-day
 * award added under that window could never have been granted to anyone.
 * `tools/streak.mjs` now fails the build for a milestone the window cannot
 * reach, because an unreachable award is worse than a missing one — it looks
 * like a bug in the person.
 *
 * 400 covers a year with room to spare, and it is one text column per row.
 */
export const STREAK_WINDOW = 400;

/**
 * @param datesDesc `YYYY-MM-DD` strings, newest first, as the query returns them
 * @param today today's local date string
 */
export function streakFrom(datesDesc: readonly string[], today: string): Streak {
  if (datesDesc.length === 0) return { count: 0, loggedToday: false };

  const loggedToday = datesDesc[0] === today;

  const y = parseLocalDate(today);
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(
    y.getDate(),
  ).padStart(2, '0')}`;

  // Ends neither today nor yesterday: the run is over, and its old length is
  // not something anybody should be shown.
  if (!loggedToday && datesDesc[0] !== yesterday) return { count: 0, loggedToday: false };

  let count = 1;
  for (let i = 1; i < datesDesc.length; i++) {
    const diff =
      (parseLocalDate(datesDesc[i - 1]).getTime() - parseLocalDate(datesDesc[i]).getTime()) /
      86_400_000;
    if (Math.round(diff) === 1) count++;
    else break;
  }
  return { count, loggedToday };
}
