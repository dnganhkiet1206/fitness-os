import { localDateStr } from '@/lib/local-date';

/**
 * Which local days a health sync actually wrote to.
 *
 * ── why this is a file and not four lines inside the hook ──
 *
 * The same reason `step-days.ts` sits apart from `health.ts`: `use-health-sync`
 * imports React, `AppState` and the HealthKit module, so nothing in it can be
 * loaded in Node — and this rule is exactly the kind that is wrong in a way
 * reading it does not reveal.
 *
 * ── the bug it exists for ──
 *
 * The sync used to finish with `recomputeDailyLog(user.id, localDateStr())` —
 * today, and only today. The rows it writes are not all today's:
 * `getRecentWorkouts()` imports **seven days** of sessions and
 * `getLastNightSleep()` looks **36 hours** back. So a run the watch recorded on
 * Monday landed in `workout_sessions` on Monday while Thursday was the only day
 * rebuilt. Measured on PostgreSQL 16.13 with the real `recomputeDailyLog`, a
 * run on day −2 and meals on −3, −1 and today:
 *
 *     workout_sessions thật sự nằm ở: 2026-08-17
 *     daily_logs:  08-19 ✓  08-18 ✓  08-16 ✓  08-17 KHÔNG CÓ HÀNG NÀO
 *
 * Nothing repairs it — a later sync rebuilds its own day — so only an edit made
 * to that specific day corrects it. And `daily_logs` is what decides whether a
 * day counts: `LOGGED_DAY_FILTER` asks `kcal>0 OR workout_count>0 OR …`, so the
 * streak read
 *
 *     ngày được tính là hoạt động: 08-19, 08-18, 08-16
 *
 * A day the person genuinely trained is invisible, the streak breaks at it, and
 * the medals granted from that streak are withheld.
 *
 * ── the rules, each of which was a way to get it wrong ──
 *
 * **A night is filed under the day it ended.** `recomputeDailyLog` selects
 * `sleep_logs` by `waketime` inside the day window, so anything else here would
 * rebuild a day that does not contain the night. Opening the app at half past
 * midnight is enough to make those two different dates.
 *
 * **A workout is filed under its own `date_time`,** in local time — the same
 * window `recomputeDailyLog` reads it back with.
 *
 * **Biometrics are today's,** because `getLatestBiometrics()` returns the most
 * recent reading and the sync files it under the current day.
 *
 * **Sorted, and unique.** Sorted so a run is deterministic and reads oldest
 * first; unique because two workouts on one day are one day to rebuild, and
 * rebuilding a day twice in a row is two rebuilds racing each other.
 */
export interface SyncedDaysInput {
  /** a biometric reading arrived */
  bio?: unknown;
  /** last night, if Health had one */
  sleep?: { waketime: string } | null;
  /** every session imported this run */
  workouts?: readonly { date_time: string }[];
}

export function touchedDays(input: SyncedDaysInput, today: string = localDateStr()): string[] {
  const days = new Set<string>();
  if (input.bio) days.add(today);
  /*
    A timestamp that does not parse is skipped rather than turned into
    `Invalid Date`, whose `getFullYear()` is `NaN` — that would produce
    `NaN-NaN-NaN` and send a rebuild at a date the database cannot even compare.
  */
  if (input.sleep?.waketime) {
    const w = new Date(input.sleep.waketime);
    if (!Number.isNaN(+w)) days.add(localDateStr(w));
  }
  for (const w of input.workouts ?? []) {
    const t = new Date(w.date_time);
    if (!Number.isNaN(+t)) days.add(localDateStr(t));
  }
  return [...days].sort();
}
