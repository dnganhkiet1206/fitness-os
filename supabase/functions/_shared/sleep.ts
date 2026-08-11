/**
 * How long a night was, for the functions that tell a model about it.
 *
 * ── the bug ──
 *
 * `ai-coach` handed the model `{ date, deep_min, rem_min, light_min, quality }`
 * and nothing else — no bedtime, no waketime, no total. `ai-smart-nudges`
 * computed a total as `deep + rem + light`.
 *
 * Both are only correct for a night that came from HealthKit. A night somebody
 * typed into `log-sleep` has a bedtime and a waketime and leaves the three
 * stage boxes empty, and empty is written as `0`. So for every hand-logged
 * night the coach was either told nothing about duration at all, or told the
 * person slept **zero minutes** — and then asked to give advice about their
 * recovery.
 *
 * That is the same zero-standing-in-for-absence this project has now removed
 * from the readiness score twice, arriving by a third route.
 *
 * ── this must agree with the client ──
 *
 * `native/src/lib/daily-log-service.ts` has `asleepMinutes`, which is the app's
 * single definition of how long a night was: HealthKit's `asleep_min` when it
 * exists, because it excludes the awake stretches inside the night, and the
 * span between bedtime and waketime otherwise, because that is all a typed
 * night knows.
 *
 * Deno functions and the React Native bundle share no module, so this is a
 * second copy of that rule and there is no way around it. What there is a way
 * around is the two copies drifting: `native/tools/health-source.mjs` reads
 * both and fails if they stop agreeing.
 */
export interface SleepRow {
  bedtime: string;
  waketime: string;
  asleep_min?: number | null;
}

/** Minutes actually asleep, or `null` when the row cannot say. */
export function asleepMinutes(sleep: SleepRow): number | null {
  if (sleep.asleep_min != null && sleep.asleep_min > 0) return Math.round(sleep.asleep_min);
  if (!sleep.bedtime || !sleep.waketime) return null;
  const bed = new Date(sleep.bedtime).getTime();
  const wake = new Date(sleep.waketime).getTime();
  if (!Number.isFinite(bed) || !Number.isFinite(wake) || wake <= bed) return null;
  return Math.round((wake - bed) / 60000);
}

/** The columns every caller of `asleepMinutes` has to select. */
export const SLEEP_COLUMNS = 'bedtime, waketime, asleep_min';

/**
 * The hour of day where the person is standing, or `null` when the request did
 * not say.
 *
 * `new Date().getHours()` on a Deno host is the hour in **UTC**. Two prompts
 * branch on it — `ai-smart-nudges` is told "if evening: remind to sleep early;
 * if morning: remind water + protein" — so at UTC+7 a person got the
 * water-and-protein nudge at eight in the evening and was told to go to bed at
 * lunchtime.
 *
 * `tzOffset` is `Date.prototype.getTimezoneOffset()` from the client: minutes
 * *behind* UTC, so UTC+7 sends −420. Same convention `ai-coach` already uses
 * for the calendar date.
 *
 * When it is missing the answer is `null`, not a UTC hour. A prompt that
 * branches on time of day is better off knowing it does not know than being
 * confidently seven hours out.
 */
export function localHour(tzOffset: unknown): number | null {
  if (!Number.isFinite(tzOffset as number)) return null;
  const off = Number(tzOffset);
  if (Math.abs(off) > 900) return null; // beyond ±15h is not a real zone
  return new Date(Date.now() - off * 60_000).getUTCHours();
}
