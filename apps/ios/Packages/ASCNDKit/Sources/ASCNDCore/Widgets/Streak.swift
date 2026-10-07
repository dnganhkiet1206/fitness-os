/// Chuỗi ngày — `lib/streak.ts` @ fac9ac2, nguyên văn (dùng chung với huy
/// chương ở RN). Golden: `streak-golden.json`, output của chính `streakFrom`.
public enum Streak {
  /// Số hàng `daily_logs` gần nhất được đọc (`STREAK_WINDOW`).
  public static let window = 400
  /// Ngày "có ghi" — cùng câu hỏi ở mọi chỗ đọc chuỗi (`LOGGED_DAY_FILTER`).
  public static let loggedDayFilter = "kcal.gt.0,workout_count.gt.0,sleep_duration_min.gt.0,supplement_taken.gt.0"

  public struct Value: Sendable, Hashable {
    public let count: Int
    public let loggedToday: Bool
  }

  /// `streakFrom(datesDesc, today, frozen)`: ngày `YYYY-MM-DD` mới trước; ngày
  /// đóng băng lấp chỗ trống (trừ hôm nay); chuỗi phải chạm hôm nay hoặc hôm qua.
  public static func from(_ datesDesc: [String], today: String, frozen: [String] = []) -> Value {
    let dates = datesDesc.filter { $0 <= today }
    let loggedToday = dates.first == today
    let covered =
      frozen.isEmpty
      ? dates
      : Array(Set(dates + frozen.filter { $0 != today && $0 <= today })).sorted(by: >)
    guard let first = covered.first else { return Value(count: 0, loggedToday: false) }
    let yesterday = dayBefore(today)
    if first != today && first != yesterday { return Value(count: 0, loggedToday: false) }
    var count = 1
    for i in 1..<covered.count {
      if gap(covered[i], covered[i - 1]) == 1 { count += 1 } else { break }
    }
    return Value(count: count, loggedToday: loggedToday)
  }

  /// `dayBefore`; ngày không đọc được giữ nguyên chuỗi "NaN-NaN-NaN" của JS.
  static func dayBefore(_ date: String) -> String {
    LocalDate(date).map { $0.adding(days: -1).description } ?? "NaN-NaN-NaN"
  }

  /// `dayGap(from, to)`: số ngày lịch; ngày hỏng → NaN (không bao giờ bằng 1).
  static func gap(_ from: String, _ to: String) -> Int? {
    guard let a = LocalDate(from), let b = LocalDate(to) else { return nil }
    return b.daysSinceEpoch - a.daysSinceEpoch
  }
}
