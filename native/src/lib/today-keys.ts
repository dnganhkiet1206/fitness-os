/**
 * Everything that changes when today changes — in one list.
 *
 * ── why one list and not two ──
 *
 * There were two. `useInvalidateToday` is a hook and cannot be called from
 * inside a mutation callback, so `use-nutrition` kept a second copy of the same
 * keys, with a comment admitting the risk: *"if one list grows a member the
 * other has to as well, which is exactly how the diary came to not refresh
 * after a meal was logged."*
 *
 * It happened again, and worse. The streak query is derived from `daily_logs`
 * and was on **neither** list, so logging the first thing of the day left
 * `mascot_streak` stale: the flame in the header stayed grey, and Koa kept the
 * worried face all evening, for somebody who had already logged. The number was
 * right in the database and wrong on the screen — the exact failure this app
 * treats as the serious kind, because the user's only sane response is to log
 * the meal they already logged.
 *
 * A list that has to be maintained in two places is a list that will be
 * maintained in one. So: one function, no hooks in it, both callers map over it.
 *
 * ── what belongs here ──
 *
 * Anything whose answer is a function of *today's* logged data. Not the things
 * that only change when the user edits settings, and not lifetime aggregates
 * that no screen re-reads — those cost a request each for nothing.
 */
export function todayKeys(userId: string | undefined, dateStr: string): unknown[][] {
  return [
    ['daily_log', userId, dateStr],
    ['today_meals', userId, dateStr],
    ['today_meals_detail', userId, dateStr],
    ['today_sleep', userId, dateStr],
    ['today_bio', userId, dateStr],
    ['today_water', userId, dateStr],
    ['recent_workouts', userId],
    ['workout_sessions', userId],
    ['readiness_history', userId],
    ['recent_foods', userId],
    ['nudges', userId],
    ['profile', userId],
    /* Lifetime counters — they drive the mascot unlocks, so a fresh log can pop
       the unlock celebration straight away. */
    ['mascot_unlock_stats', userId],
    /* The streak, and the freezes that cover it. Derived from `daily_logs`, so
       the first log of the day is exactly when it becomes wrong — see above. */
    ['mascot_streak', userId, dateStr],
    /* The wallet: quests pay out on the same transitions, and a balance that
       lags makes the shop refuse something already earned. */
    ['mascot_wallet', userId],
  ];
}
