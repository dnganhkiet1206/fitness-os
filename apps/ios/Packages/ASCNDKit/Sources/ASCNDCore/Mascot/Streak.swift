/// Chuỗi ngày ghi (`native/src/lib/streak.ts` @ fac9ac2) — golden trong
/// `mascot-golden.json` (`streakCases`).
///
/// Một ngày "đã ghi" là một hàng `daily_logs` có `kcal`, `workout_count`,
/// `sleep_duration_min` hoặc `supplement_taken` > 0 (`LOGGED_DAY_FILTER` — lọc
/// ở server). Ngày đã dùng băng chuỗi (`streak_freezes.used_on`) tính như một
/// ngày đã ghi, trừ cho câu hỏi "hôm nay đã ghi chưa".
public enum StreakRules {
  /// `STREAK_WINDOW`: số ngày đọc lùi lại (và giới hạn vòng `missedDates`).
  public static let window = 400
  /// `LOGGED_DAY_FILTER` (cú pháp `or()` của PostgREST).
  public static let loggedDayFilter = "kcal.gt.0,workout_count.gt.0,sleep_duration_min.gt.0,supplement_taken.gt.0"

  public struct Streak: Sendable, Hashable {
    public let count: Int
    public let loggedToday: Bool

    public init(count: Int, loggedToday: Bool) {
      self.count = count
      self.loggedToday = loggedToday
    }
  }

  /// `streakFrom`: độ dài chuỗi kết thúc hôm nay hoặc hôm qua.
  ///
  /// - ngày TƯƠNG LAI bị bỏ (đồng hồ máy chạy nhanh không được xoá chuỗi);
  /// - ngày đã băng nhập vào danh sách (trừ hôm nay, trừ tương lai);
  /// - đầu danh sách không phải hôm nay / hôm qua → 0;
  /// - đếm các ngày liền nhau (cách đúng 1 ngày); trùng hay hở là dừng.
  public static func streak(datesDesc: [LocalDate], today: LocalDate, frozen: [LocalDate] = []) -> Streak {
    let logged = datesDesc.filter { $0 <= today }
    let loggedToday = logged.first == today
    var covered = logged
    if !frozen.isEmpty {
      covered = Array(Set(logged + frozen.filter { $0 != today && $0 <= today })).sorted(by: >)
    }
    guard let head = covered.first else { return Streak(count: 0, loggedToday: false) }
    guard head == today || head == today.adding(days: -1) else { return Streak(count: 0, loggedToday: false) }
    var count = 1
    for i in covered.indices.dropFirst() {
      if covered[i - 1].daysSinceEpoch - covered[i].daysSinceEpoch == 1 { count += 1 } else { break }
    }
    return Streak(count: count, loggedToday: loggedToday)
  }

  /// `missedDates`: các ngày trống liền trước hôm nay, từ hôm qua lùi tới ngày
  /// đầu tiên đã ghi (hoặc đã băng) — cũ → mới; tối đa `window` ngày. Chưa ghi
  /// ngày nào thì không có gì để bỏ lỡ.
  public static func missedDates(datesDesc: [LocalDate], today: LocalDate, frozen: [LocalDate] = []) -> [LocalDate] {
    guard !datesDesc.isEmpty else { return [] }
    let covered = Set(datesDesc + frozen)
    var out: [LocalDate] = []
    var cursor = today.adding(days: -1)
    var i = 0
    while i < window, !covered.contains(cursor) {
      out.append(cursor)
      cursor = cursor.adding(days: -1)
      i += 1
    }
    return out.reversed()
  }
}
