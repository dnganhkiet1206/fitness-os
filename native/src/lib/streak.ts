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
 * What makes a `daily_logs` row a day the person actually logged.
 *
 * ── the bug this exists for ──
 *
 * The rule used to be *"a day with a `daily_logs` row"*, and that was true when
 * the only thing that created a row was `recomputeDailyLog` — which runs
 * because somebody logged a meal, a workout, a night's sleep or a reading.
 *
 * It stopped being true when the health sync began backfilling past days:
 * `use-health-sync` upserts `{ user_id, date, steps }` for up to thirteen days
 * of HealthKit step buckets, and an upsert **creates** the row when there is
 * none. So a phone that counted steps in a pocket manufactures days. Run
 * against the real `streakFrom`:
 *
 *     streakFromBackfillAlone: 13
 *
 * Thirteen days of streak on the first sync, for an account that has never
 * logged anything — past `streak_3` and `streak_7`, and those are granted into
 * `awards`, which nothing ever revokes.
 *
 * The same rule also counted a day whose every source record had been deleted:
 * Chain I proved the row survives with all its numbers at zero.
 *
 * ── and why these columns ──
 *
 * They are exactly the ones `recomputeDailyLog` writes, which is to say exactly
 * the ones derived from the person's own records. `steps`, `active_kcal` and
 * `active_minutes` are deliberately absent: those belong to the health sync,
 * which writes them for days nobody opened the app. Water is absent because it
 * was already absent — logging water does not rebuild the day, so a water-only
 * day never had a row to count.
 *
 * The filter is sent to the database rather than applied after the read, and
 * that is not an optimisation. `STREAK_WINDOW` is a `limit`: filtering
 * afterwards would fill those 400 rows with days that do not count and cap the
 * streak somewhere short of the truth, silently.
 */
export const LOGGED_DAY_FILTER =
  'kcal.gt.0,workout_count.gt.0,sleep_duration_min.gt.0,supplement_taken.gt.0';

/** Yesterday's date string, from today's. */
function dayBefore(date: string): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param datesDesc `YYYY-MM-DD` strings, newest first, as the query returns them
 * @param today today's local date string
 * @param frozen days a streak freeze has already been spent on — they count as
 *   present without being logged. Today is ignored even if listed: a day cannot
 *   be written off before it is over.
 */
export function streakFrom(
  datesDesc: readonly string[],
  today: string,
  frozen: readonly string[] = [],
): Streak {
  /*
    ── a day that has not happened yet is not a day in the run ──

    `datesDesc[0]` is the newest row, and the two guards below both read it as
    "where the run ends". A row dated in the future therefore ends the run
    *there*, and since it is neither today nor yesterday the whole streak reads
    zero. Measured with this function:

        ngày tương lai +30 rồi 2 ngày thật: 0
        chỉ 2 ngày thật                   : 2

    Nobody has to be attacking for that: a phone whose clock is a day fast
    writes tomorrow's `localDateStr()` into `daily_logs`, and the streak — plus
    every streak medal, which is granted from this number — silently goes to
    nothing. `training-card.ts` already drops future-dated sessions for exactly
    this reason; this is the same device and the same wrong clock.

    Dropped rather than clamped: a future row is not evidence about any day, so
    counting it as today would be inventing one.
  */
  datesDesc = datesDesc.filter((d) => d <= today);

  const loggedToday = datesDesc[0] === today;

  /* Merged and re-sorted rather than handled as a special case inside the loop.
     A frozen day *is* a day for every purpose except `loggedToday`, and the
     cheapest way to be sure of that is to make the list say so. */
  const covered =
    frozen.length === 0
      ? datesDesc
      : [...new Set([...datesDesc, ...frozen.filter((d) => d !== today)])].sort().reverse();

  if (covered.length === 0) return { count: 0, loggedToday: false };
  datesDesc = covered;

  const yesterday = dayBefore(today);

  // Ends neither today nor yesterday: the run is over, and its old length is
  // not something anybody should be shown.
  if (datesDesc[0] !== today && datesDesc[0] !== yesterday) {
    return { count: 0, loggedToday: false };
  }

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

/**
 * The days between the last logged day and today, exclusive — the gap a freeze
 * would have to cover.
 *
 * Empty when today or yesterday was logged: yesterday is not a gap yet, because
 * today is not over. Ordered oldest first, so freezes are spent in the order the
 * days happened.
 *
 * `frozen` days are already covered and are not returned again — otherwise every
 * launch would try to spend another freeze on the same Tuesday.
 */
export function missedDates(
  datesDesc: readonly string[],
  today: string,
  frozen: readonly string[] = [],
): string[] {
  if (datesDesc.length === 0) return [];
  const covered = new Set([...datesDesc, ...frozen]);
  const out: string[] = [];
  let cursor = dayBefore(today);
  /* Walk back from yesterday until a covered day is found. The bound is
     `STREAK_WINDOW` for the same reason the query has one: somebody returning
     after a year must not spin here. */
  for (let i = 0; i < STREAK_WINDOW && !covered.has(cursor); i++) {
    out.push(cursor);
    cursor = dayBefore(cursor);
  }
  return out.reverse();
}
