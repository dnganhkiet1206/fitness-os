/**
 * Calendar-date helpers in the device's local timezone.
 *
 * The web app derives "today" from toISOString(), i.e. the UTC date —
 * in UTC+7 that mislabels everything logged between midnight and 7am
 * as the previous day (and date pickers shifted DOBs a day back). The
 * native app is the shipping product, so it uses local dates: a meal
 * logged at 6am belongs to the morning's date the user sees.
 */

/** YYYY-MM-DD of a Date in local time (defaults to now) */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD of `days` days ago, local time */
export function localDaysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateStr(d);
}

/**
 * Parse a YYYY-MM-DD string as LOCAL midnight. Bare date strings fed to
 * new Date() parse as UTC midnight, which renders as the *previous* day
 * in negative-offset timezones (the Americas) — wrong weekday/date labels.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/**
 * UTC instants bounding a local calendar day — for range queries
 * against timestamptz columns (date_time, waketime, logged_at).
 */
export function localDayRangeISO(dateStr: string): { start: string; end: string } {
  // 'YYYY-MM-DDT00:00:00' without a zone parses as LOCAL midnight
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Which slot of the weekly routine a date falls in — Monday is 0.
 *
 * `routine_days.day_of_week` is stored Monday-first, because that is how the
 * screen lists the week and how most of the world writes a training split.
 * `Date.getDay()` is Sunday-first. The two are one `+ 6` apart and getting it
 * wrong shifts the entire routine by a day, which looks like the data being
 * wrong rather than the index.
 */
export function routineIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * The seven dates of the week `d` falls in, Monday first.
 *
 * Built by stepping the day number rather than by adding milliseconds. A day is
 * not always 86,400,000 ms — on the two days a year the clocks move it is an
 * hour more or less — so `+ i * 864e5` from a Monday lands on 23:00 the previous
 * Saturday in one direction and skips a day in the other. `setDate` is calendar
 * arithmetic and rolls months and years on its own.
 *
 * Local midnight, so the results compare cleanly against `localDateStr`.
 */
export function weekDates(d: Date = new Date()): Date[] {
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - routineIndex(monday));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

/**
 * The key a half-finished workout is stored under, and when to throw it away.
 *
 * ── what actually carries over a week, and what does not ──
 *
 * A day reading "done" is not a flag anybody stores. It is worked out on the
 * spot: the dates of *this* week against the dates of the sessions in the last
 * fortnight. Come Monday, `weekDates` returns seven new dates, last week's
 * sessions match none of them, and the week is empty again without anything
 * having been reset. That part takes care of itself.
 *
 * The tick marks do not. They are written to storage under the date they
 * belong to — which is what makes them safe, since Monday the 4th and Monday
 * the 11th are different keys and neither can show the other's ticks — and
 * nothing ever deleted them. Seven a week, fifty-two weeks, forever: a few
 * hundred entries of a few hundred bytes, growing for as long as the app is
 * installed.
 *
 * That is not a crash and it is not visible. It is the kind of thing that is
 * only ever fixed if somebody asks the question.
 */
export const DAY_PROGRESS_PREFIX = 'routine-day:';

export function dayProgressKey(dateStr: string, templateId: string): string {
  return `${DAY_PROGRESS_PREFIX}${dateStr}:${templateId}`;
}

/**
 * How long a resume point is worth keeping.
 *
 * Long enough to cover the case it exists for and then some: you train on
 * Sunday evening, do not finish, and come back to it. Two weeks is well past
 * any of that and still short enough that nothing accumulates.
 */
export const DAY_PROGRESS_KEEP = 14;

/**
 * Which stored resume points are stale, given everything in storage.
 *
 * Takes the whole key list rather than reading storage itself, so the rule can
 * be run against real inputs in a check instead of being reviewed by reading.
 *
 * Anything that is not one of ours is left alone — the same store holds the
 * query cache and the offline queue, and a prune that is even slightly loose
 * about what it owns is a prune that deletes somebody else's data.
 */
export function staleDayProgress(keys: readonly string[], today: string = localDateStr()): string[] {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - DAY_PROGRESS_KEEP);
  const oldest = localDateStr(cutoff);
  return keys.filter((k) => {
    if (!k.startsWith(DAY_PROGRESS_PREFIX)) return false;
    const date = k.slice(DAY_PROGRESS_PREFIX.length).split(':')[0];
    /*
      A key whose date does not parse is dropped, not kept.

      String comparison on `YYYY-MM-DD` is the whole test — it sorts the same
      way the calendar does — but only for strings that really are dates.
      Anything else came from a version of this app that wrote a different
      format, and there is no version of it that can still be resumed.
    */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
    /*
      `<=`, not `<`.

      `oldest` is today minus fourteen, and "keep fourteen days" means today
      and the thirteen behind it — so the day that *is* fourteen back is the
      first one outside the window, not the last one inside it. Written with
      `<` the window silently ran to fifteen days. The check caught it; reading
      it would not have, which is the entire argument for putting a boundary
      like this somewhere a test can stand on both sides of it.
    */
    return date <= oldest;
  });
}

/**
 * The Monday that starts `d`'s week, at local midnight.
 *
 * ── why this is shared ──
 *
 * There were three of these. Two agreed; the third was wrong in one place, and
 * that place was Sunday.
 *
 *     use-extras.ts     date - day + (day === 0 ? -6 : 1)   ✓
 *     weekly-review.tsx date - day + (day === 0 ? -6 : 1)   ✓
 *     smart-goals.tsx   date - day + 1                      ✗
 *
 * `Date.getDay()` is Sunday-first, so on a Sunday the third one computes
 * `date - 0 + 1` — **tomorrow**. Its "this week" therefore ran from tomorrow's
 * Monday to the following Sunday: entirely in the future, and empty. Every
 * Sunday the newest column of that screen was blank and the calorie advice
 * underneath it was reading a week-old window, and by Monday morning it looked
 * correct again so there was nothing to catch.
 *
 * Sunday is the one day of seven this class of expression gets wrong, which is
 * exactly why it survived: it is right 86% of the time, and wrong on the day
 * people sit down to look at their week.
 */
export function weekStartOf(d: Date = new Date()): Date {
  const out = new Date(d);
  const day = out.getDay();
  out.setDate(out.getDate() - day + (day === 0 ? -6 : 1));
  out.setHours(0, 0, 0, 0);
  return out;
}
