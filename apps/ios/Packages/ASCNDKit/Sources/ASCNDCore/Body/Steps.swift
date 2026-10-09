public import Foundation
public import Observation

/// Vận động (#527) — `app/steps.tsx`, `hooks/use-steps-goal.ts`,
/// `useStepsHistory` (`use-fitness-data.ts`) @ fac9ac2.
///
/// Như RN: 14 ngày `daily_logs.steps` (`Number(steps) || 0`); "hôm nay" là
/// hàng có đúng ngày hôm nay (không phải hàng cuối — hàng cuối là hôm qua khi
/// hôm nay chưa ghi); trung bình = 7 HÀNG cuối làm tròn; xu thế = 3 hàng cuối
/// so với 3 hàng trước đó (%); thanh tiến độ tối đa 100 %; mục tiêu mặc định
/// 10 000, đổi từng 500, kẹp 1 000…50 000.
///
/// Khác RN: mục tiêu nhớ THEO TÀI KHOẢN (khoá có `userId`) — RN một khoá
/// chung và phải xoá tay khi đổi người (`onUserScopedReset`).
public enum Steps {
  public struct Day: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let steps: Double
    public var id: LocalDate { date }

    public init(date: LocalDate, steps: Double) {
      self.date = date
      self.steps = steps
    }
  }

  public struct Stats: Sendable, Hashable {
    public let today: Double
    public let avg: Double
    public let last7: [Day]
    /// % (chưa làm tròn); màn làm tròn trước khi tô màu / vẽ mũi tên.
    public let trend: Double
  }

  /// `DEFAULT_GOAL`.
  public static let defaultGoal = 10_000
  /// Bước của nút ±.
  public static let goalStep = 500
  public static let historyDays = 14

  public static func query(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, steps",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(today.adding(days: -historyDays).description))],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  /// Hàng → ngày (`Number(d.steps) || 0`); hàng không có ngày đọc được bị bỏ.
  public static func history(_ rows: [JSONValue]) -> [Day] {
    rows.compactMap { r in
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { return nil }
      let v = JS.number(r["steps"])
      return Day(date: d, steps: JS.truthy(v) ? v : 0)
    }
  }

  /// `stats` của màn.
  public static func stats(_ h: [Day], today: LocalDate) -> Stats {
    let last7 = Array(h.suffix(7))
    let todaySteps = h.first { $0.date == today }?.steps ?? 0
    let avg = last7.isEmpty ? 0 : JS.round(last7.reduce(0) { $0 + $1.steps } / Double(last7.count))
    let recent3 = h.suffix(3).map(\.steps)
    let older3 = Array(h.dropLast(3).suffix(3)).map(\.steps)
    let avgR = recent3.isEmpty ? 0 : recent3.reduce(0, +) / Double(recent3.count)
    let avgO = older3.isEmpty ? 0 : older3.reduce(0, +) / Double(older3.count)
    let trend = avgO > 0 ? (avgR - avgO) / avgO * 100 : 0
    return Stats(today: todaySteps, avg: avg, last7: last7, trend: trend)
  }

  /// `Math.min(100, today / goal * 100)`.
  public static func percent(today: Double, goal: Int) -> Double { min(100, today / Double(goal) * 100) }

  /// `Math.max(GOAL, ...last7.steps)` — đỉnh của cột.
  public static func maxWeek(_ last7: [Day], goal: Int) -> Double {
    last7.reduce(Double(goal)) { max($0, $1.steps) }
  }

  /// `setStepsGoal`: làm tròn, kẹp 1 000…50 000.
  public static func clampGoal(_ value: Double) -> Int { Int(max(1000, min(50_000, JS.round(value)))) }

  /// `parse`: chỉ số dương mới là mục tiêu đã đặt.
  public static func parseGoal(_ stored: String?) -> Int? {
    guard let s = stored, let n = Double(s), n > 0, n.isFinite else { return nil }
    return Int(n)
  }

  static func goalKey(_ userId: String) -> String { "ascnd-steps-goal.\(userId)" }
}

/// Mục tiêu bước của MỘT tài khoản, trên máy (`KeyValueStore`).
public struct StepsGoalStore: Sendable {
  private let store: any KeyValueStore
  private let userId: String

  public init(store: any KeyValueStore, userId: String) {
    self.store = store
    self.userId = userId
  }

  public var goal: Int { Steps.parseGoal(store.string(forKey: Steps.goalKey(userId))) ?? Steps.defaultGoal }

  @discardableResult
  public func set(_ value: Double) -> Int {
    let g = Steps.clampGoal(value)
    store.set(String(g), forKey: Steps.goalKey(userId))
    return g
  }
}

/// Màn Vận động của MỘT tài khoản.
@MainActor @Observable
public final class StepsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready([Steps.Day])
  }

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var phase: Phase = .loading
  public private(set) var goal: Int

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let goals: StepsGoalStore
  @ObservationIgnored private var closed = false

  public init(userId: String, today: LocalDate, store: any RowStore, goals: StepsGoalStore) {
    self.userId = userId
    self.today = today
    self.store = store
    self.goals = goals
    self.goal = goals.goal
  }

  public func close() { closed = true }

  public var stats: Steps.Stats? {
    if case .ready(let h) = phase { return Steps.stats(h, today: today) }
    return nil
  }

  /// ±500 (`setGoal(GOAL ± 500)`).
  public func adjustGoal(by delta: Int) {
    goal = goals.set(Double(goal + delta))
  }

  public func move(to day: LocalDate) async {
    today = day
    await load()
  }

  /// Đọc 14 ngày. Đọc lại hỏng khi đã có số: giữ số.
  public func load() async {
    let q = Steps.query(userId: userId, today: today)
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      phase = .ready(Steps.history(rows))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }
}
