/**
 * A weekday slot that arrived from outside the app.
 *
 * ── what it guards ──
 *
 * `routine_days.day_of_week` is an integer 0–6, Monday first, with a unique
 * index on `(user_id, day_of_week)`. Two screens now receive one through a
 * route param — the builder is opened from Plan carrying the day to schedule
 * onto, and Plan itself is opened from the training tab carrying the day to
 * show — and a route param is a *string from outside the file*: a deep link, a
 * restored navigation state, a typo in a `router.push`.
 *
 * `Number(s)` on that is how a `NaN` or a `7` gets written to the column.
 * Neither errors and neither draws: a row filed under day 7 is invisible on a
 * strip that has seven cells numbered 0 to 6, so the workout is scheduled,
 * stored, and nowhere.
 *
 * ── why it is this strict ──
 *
 * `/^[0-6]$/` and nothing else. Not `parseInt`, which reads `"3abc"` as 3 and
 * `"0x3"` as 3; not `Number`, which reads `" 3"` and `"3.0"` and `"1e0"` as 3
 * and `""` as 0. Every one of those is a string that meant something else, and
 * there is no reading of any of them where silently continuing is better than
 * behaving exactly as the screen does with no param at all.
 *
 * Expo Router hands back `string | string[]`, so the array form is unwrapped
 * first: a URL can carry `?day=2&day=5`, and taking the first is the same
 * choice the router itself makes.
 */
export function weekDayParam(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !/^[0-6]$/.test(s)) return null;
  return Number(s);
}
