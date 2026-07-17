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
