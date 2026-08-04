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
