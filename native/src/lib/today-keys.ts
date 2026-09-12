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
    ['profile', userId],
    /* Lifetime counters — they drive the mascot unlocks, so a fresh log can pop
       the unlock celebration straight away. */
    ['mascot_unlock_stats', userId],
    /*
      The streak, and the freezes that cover it. Derived from `daily_logs`, so
      the first log of the day is exactly when it becomes wrong — see above.

      ── KHÔNG mang `dateStr`, và đó là cả điểm ──

      Truy vấn chuỗi ngày khoá theo `localDateStr()` — HÔM NAY, luôn luôn, dù
      dữ liệu vừa đổi là của ngày nào (`use-mascot-room.ts`). Còn `dateStr` ở
      đây là ngày VỪA BỊ GHI, và từ khi có màn `/diary` nó có thể là thứ Ba
      tuần trước.

      Ghép hai thứ ấy lại thành `['mascot_streak', userId, '2026-09-02']`, một
      khoá không observer nào mang — nên xoá bữa cuối cùng của một ngày cũ sẽ
      bẻ chuỗi ngày trong cơ sở dữ liệu mà ngọn lửa trên màn hình vẫn cháy tới
      lần khởi động lại sau. Đúng cái lỗi mà khối chú thích đầu tệp này kể, chỉ
      lệch đi một tầng: khoá có trong danh sách, nhưng khớp 0 thứ.

      Bỏ đoạn cuối đi thì nó thành TIỀN TỐ, và `invalidateQueries` khớp theo
      tiền tố — nên nó bắt được truy vấn ấy ở bất kỳ ngày nào. Cùng dạng mà
      `use-mascot-room.ts` đã tự dùng ở hai chỗ khác.
    */
    ['mascot_streak', userId],
    /* The wallet: quests pay out on the same transitions, and a balance that
       lags makes the shop refuse something already earned. */
    ['mascot_wallet', userId],
  ];
}
