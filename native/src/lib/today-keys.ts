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
    /*
      Hai con số nuôi thẻ Hoạt động trên Hôm nay, và chúng KHÔNG được
      `workout_sessions` ở trên bao lấy.

      ── lỗi, và ai tìm ra ──

      Chủ dự án: "thẻ hoạt động ở dashboard hiện dữ liệu từ việc log bị chậm,
      bắt buộc phải refresh thì mới hiện". Đúng như thế, và lý do không nằm ở
      mạng: hai khoá này xuất hiện đúng MỘT lần mỗi cái trong cả kho — ở chỗ
      khai báo — nên không một lượt ghi nào trong app làm chúng cũ đi. Chúng
      chỉ đổi khi React Query tự nạp lại lúc mount hoặc khi người dùng kéo để
      làm mới. Mà dashboard thì đang mở sẵn lúc buổi tập được ghi, nên "lúc
      mount" không bao giờ tới.

      `['workout_sessions', userId]` không cứu được: khớp tiền tố của React
      Query so từng PHẦN TỬ của mảng, nên một khoá tên khác là một khoá khác,
      dù hai truy vấn đọc cùng một bảng.

      Đây là lần thứ ba đúng cái lỗi mà khối chú thích đầu tệp này kể — một
      truy vấn dẫn xuất từ dữ liệu hôm nay mà không có mặt trong danh sách.
      Lần trước là chuỗi ngày.

      ── vì sao KHÔNG mang `dateStr` ──

      Cùng lý do như `mascot_streak` bên dưới: hai truy vấn này khoá theo HÔM
      NAY (`localDateStr()` trong chính `queryFn`), còn `dateStr` ở đây là ngày
      vừa bị ghi, có thể là thứ Ba tuần trước. Ghép vào thì ra một khoá không
      observer nào mang. Bỏ đoạn cuối đi thì nó thành tiền tố và bắt được.

      `today_active_kcal` còn mang thêm một `profile` ở đoạn thứ ba, nên tiền
      tố hai đoạn cũng là cách duy nhất bắt được nó mà không phải dựng lại cái
      hồ sơ ấy ở đây.
    */
    ['today_training_minutes', userId],
    ['today_active_kcal', userId],
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
