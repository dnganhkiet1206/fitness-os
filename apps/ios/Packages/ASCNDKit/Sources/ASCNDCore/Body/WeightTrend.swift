public import Foundation
public import Observation

/// Thẻ Cân nặng của phân đoạn Cơ thể (#527, tab Tập luyện thiết kế lại 14/10)
/// — phần cân nặng của `components/ascnd/body-panel.tsx` + `useWeightHistory`
/// (`use-fitness-data.ts:884`) + `use-weight-goal.ts` @ fac9ac2.
///
/// Như RN:
/// - đọc `weight_logs` (`date, weight_kg`) cũ → mới; mọi số "của tab" (hiện
///   tại, mốc đầu, chênh lệch) tính trên 90 ngày; biểu đồ lọc từ toàn bộ lịch
///   sử theo khoảng Tuần / Tháng / Năm / Tất cả (mặc định Tất cả);
/// - chênh lệch "tốt" (tô xanh) chỉ khi đúng hướng mục tiêu (`bulk` tăng,
///   `cut` giảm);
/// - BMI từ chiều cao hồ sơ, bốn vùng WHO (< 18,5 · < 25 · < 30 · còn lại);
/// - cân mục tiêu lưu trên MÁY theo người dùng, kẹp 30…300 kg, làm tròn 0,01.
public enum WeightTrend {
  public struct Point: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let kg: Double
    public var id: LocalDate { date }
  }

  public enum Range: String, Sendable, Hashable, CaseIterable {
    case week, month, year, all
    /// `nil` = toàn bộ.
    public var days: Int? {
      switch self {
      case .week: 7
      case .month: 30
      case .year: 365
      case .all: nil
      }
    }
  }

  /// Ngày chuẩn của "toàn bộ lịch sử" (`useWeightHistory(3650)`).
  public static let allDays = 3650
  /// Cửa sổ của các số trên thẻ (`useWeightHistory(90)`).
  public static let summaryDays = 90

  public static func query(userId: String, from: LocalDate) -> RowQuery {
    RowQuery(
      table: "weight_logs", columns: "date, weight_kg",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(from.description))],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  /// `{ date, value: Number(weight_kg) }`; hàng hỏng (ngày / số) bị bỏ.
  public static func points(_ rows: [JSONValue]) -> [Point] {
    rows.compactMap { r in
      guard let d = r["date"]?.stringValue.flatMap({ LocalDate(String($0.prefix(10))) }) else { return nil }
      let kg = JS.number(r["weight_kg"])
      guard kg.isFinite, kg > 0 else { return nil }
      return Point(date: d, kg: kg)
    }
  }

  /// `chartPoints`: điểm từ `localDaysAgoStr(days)` trở đi.
  public static func filter(_ all: [Point], range: Range, today: LocalDate) -> [Point] {
    guard let days = range.days else { return all }
    let from = today.adding(days: -days)
    return all.filter { $0.date >= from }
  }

  /// Số trên thẻ, từ chuỗi 90 ngày.
  public struct Summary: Sendable, Hashable {
    public let currentKg: Double
    public let startKg: Double
    public var deltaKg: Double { currentKg - startKg }
  }

  public static func summary(_ last90: [Point]) -> Summary? {
    guard let first = last90.first, let last = last90.last else { return nil }
    return Summary(currentKg: last.kg, startKg: first.kg)
  }

  /// `deltaGood`: đúng hướng mục tiêu hồ sơ.
  public static func deltaGood(_ deltaKg: Double, goal: String?) -> Bool {
    (goal == "bulk" && deltaKg > 0) || (goal == "cut" && deltaKg < 0)
  }

  public enum BMIZone: Int, Sendable, Hashable, CaseIterable {
    case under, healthy, over, obese
  }

  public static func bmi(kg: Double, heightCm: Double?) -> Double? {
    guard let h = heightCm, h > 0 else { return nil }
    let m = h / 100
    return kg / (m * m)
  }

  public static func zone(_ bmi: Double) -> BMIZone {
    if bmi < 18.5 { return .under }
    if bmi < 25 { return .healthy }
    if bmi < 30 { return .over }
    return .obese
  }

  /// `bmiPos`: vị trí 0…1 trên thước 15 → 40 (đầu thước kẹp lại).
  public static func bmiPosition(_ bmi: Double) -> Double {
    max(0, min(1, (bmi - 15) / 25))
  }

  // MARK: - Danh sách lần cân

  /// Một lần cân, mới nhất trước, kèm chênh lệch so với lần cân TRƯỚC đó.
  public struct Entry: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let kg: Double
    /// `nil` cho lần cân đầu tiên.
    public let changeKg: Double?
    public var id: LocalDate { date }
  }

  public static func entries(_ all: [Point]) -> [Entry] {
    all.enumerated().map { i, p in
      Entry(date: p.date, kg: p.kg, changeKg: i > 0 ? p.kg - all[i - 1].kg : nil)
    }.reversed()
  }

  // MARK: - Cân mục tiêu (`use-weight-goal.ts`)

  /// Hướng của mục tiêu so với cân hiện tại (`weight-goal-dialog.tsx`):
  /// lệch < 0,05 kg là giữ cân.
  public enum Intent: Sendable, Hashable {
    case maintain
    case lose(Double)
    case gain(Double)
  }

  public static func intent(goalKg: Double, currentKg: Double) -> Intent {
    let d = goalKg - currentKg
    if abs(d) < 0.05 { return .maintain }
    return d < 0 ? .lose(-d) : .gain(d)
  }

  public static let goalRange = 30.0...300.0

  public static func goalKey(_ userId: String) -> String { "ascnd-weight-goal-kg:\(userId)" }

  /// Kẹp 30…300, làm tròn 0,01 (`setWeightGoalKg`).
  public static func clampGoal(_ kg: Double) -> Double {
    (min(goalRange.upperBound, max(goalRange.lowerBound, kg)) * 100).rounded() / 100
  }

  /// Giá trị đã lưu → kg; ngoài dải / hỏng → nil (`parse`).
  public static func parseGoal(_ stored: String?) -> Double? {
    guard let stored, let n = Double(stored), n.isFinite, goalRange.contains(n) else { return nil }
    return n
  }
}

/// Thẻ Cân nặng của MỘT tài khoản: lịch sử (toàn bộ) + cân mục tiêu trên máy.
@MainActor @Observable
public final class WeightTrendBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready([WeightTrend.Point])
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var goalKg: Double?

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let defaults: any KeyValueStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var closed = false

  public init(
    userId: String, store: any RowStore, defaults: any KeyValueStore, clock: any WallClock = SystemWallClock(),
    timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.store = store
    self.defaults = defaults
    self.clock = clock
    self.timeZone = timeZone
    goalKg = WeightTrend.parseGoal(defaults.string(forKey: WeightTrend.goalKey(userId)))
  }

  public var today: LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  public func close() { closed = true }

  /// Một lượt đọc toàn bộ (`useWeightHistory(3650)`); chuỗi 90 ngày lọc từ đó.
  /// Đọc hỏng khi đã có số thì giữ số.
  public func load() async {
    let rows: [JSONValue]
    do {
      rows = try await store.select(WeightTrend.query(userId: userId, from: today.adding(days: -WeightTrend.allDays)))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
      return
    }
    guard !closed else { return }
    phase = .ready(WeightTrend.points(rows))
  }

  public var all: [WeightTrend.Point] {
    if case .ready(let p) = phase { return p }
    return []
  }

  /// Số trên thẻ — chuỗi 90 ngày (`useWeightHistory(90)`).
  public var summary: WeightTrend.Summary? {
    WeightTrend.summary(all.filter { $0.date >= today.adding(days: -WeightTrend.summaryDays) })
  }

  public func setGoal(_ kg: Double?) {
    guard let kg else {
      goalKg = nil
      defaults.remove(WeightTrend.goalKey(userId))
      return
    }
    let v = WeightTrend.clampGoal(kg)
    goalKg = v
    defaults.set(String(v), forKey: WeightTrend.goalKey(userId))
  }
}
