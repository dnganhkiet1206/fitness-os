public import Foundation
public import Observation

extension MacroTargets {
  /// Bốn mục tiêu gam / ngày (`macroTargetsFor`, `lib/macro-targets.ts`).
  public struct Grams: Sendable, Hashable {
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double
  }

  /// `stored`: số hữu hạn ≥ 0, không thì "chưa đặt".
  static func stored(_ v: Double?) -> Double? {
    guard let v, v.isFinite, v >= 0 else { return nil }
    return v
  }

  /// `macroTargetsFor(profile)`: đủ bốn số đã đặt thì dùng nguyên; thiếu số nào
  /// thì suy từ calo (`calorieTargetFor`, mặc định 2200): đạm 27 % / 4, béo
  /// 25 % / 9, tinh bột = phần còn lại / 4 (không âm), chất xơ 14 g / 1000 kcal.
  public static func grams(
    tdeeKcal: Double?, protein: Double?, carbs: Double?, fat: Double?, fiber: Double?
  ) -> Grams {
    let k = stored(tdeeKcal)
    let kcal = JS.round(k.map { $0 > 0 ? $0 : defaultKcal } ?? defaultKcal)
    let p = stored(protein), c = stored(carbs), f = stored(fat), fb = stored(fiber)
    if let p, let c, let f, let fb { return Grams(protein: p, carbs: c, fat: f, fiber: fb) }
    let pg = p ?? JS.round(kcal * 0.27 / 4)
    let fg = f ?? JS.round(kcal * FitnessCalc.fatTargetFraction / 9)
    let cg = Swift.max(JS.round((kcal - pg * 4 - fg * 9) / 4), 0)
    return Grams(protein: pg, carbs: cg, fat: fg, fiber: fb ?? JS.round(kcal / 1000 * 14))
  }
}

/// Dinh dưỡng 7 ngày (#527 Phase 3 · 3.6) — `app/nutrition-insights.tsx` +
/// `useNutritionHistory` (`hooks/use-today-data.ts`) + `macroTargetsFor`.
///
/// RN behavior (giữ nguyên):
/// - đọc `daily_logs` (`date, kcal, protein_g, carbs_g, fat_g, fiber_g`) của
///   người, xếp theo ngày tăng; ô hỏng / trống là 0;
/// - số to: đạm trung bình / ngày; cột đạm từng ngày so với đường mục tiêu
///   (đạt mục tiêu tô xanh); trục cao nhất = max(mục tiêu × 1,15, ngày cao nhất);
/// - nhận xét: thiếu đạm > 10 g so với mục tiêu → "thiếu"; không thì đạt ≥ 5
///   ngày → "giữ vững"; chất xơ trung bình < 60 % mục tiêu → "thấp";
/// - không có ngày nào → "Chưa có dữ liệu"; đọc hỏng → lỗi có thử lại.
///
/// Khác RN: RN đọc `date >= hôm nay − 7`, tức TÁM ngày lịch dưới nhãn "7 ngày"
/// (`hôm nay − 7 … hôm nay`). Native đọc đúng bảy (`hôm nay − 6 … hôm nay`).
public enum NutritionInsights {
  public static let days = 7

  public struct Day: Sendable, Hashable, Identifiable {
    public let date: LocalDate
    public let protein: Double
    public let fiber: Double
    public let kcal: Double
    public var id: LocalDate { date }
  }

  public struct Stats: Sendable, Hashable {
    public let avgProtein: Double
    public let avgFiber: Double
    public let proteinDays: Int
    public let n: Int
  }

  public enum Insight: Sendable, Hashable {
    /// Trung bình, thiếu bao nhiêu, mục tiêu (đã làm tròn).
    case proteinGap(avg: Int, gap: Int, target: Int)
    /// Số ngày đạt / số ngày có dữ liệu.
    case proteinHit(days: Int, of: Int)
    /// Trung bình, mục tiêu.
    case fiberLow(avg: Int, target: Int)
  }

  /// `daily_logs` của 7 ngày địa phương tới hôm nay.
  public static func query(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, kcal, protein_g, carbs_g, fat_g, fiber_g",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(today.adding(days: -(days - 1)).description))],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  /// Hàng → ngày; hàng không có ngày đọc được bị bỏ.
  public static func rows(_ rows: [JSONValue]) -> [Day] {
    rows.compactMap { r in
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { return nil }
      return Day(
        date: d, protein: MealDiary.num(r["protein_g"]), fiber: MealDiary.num(r["fiber_g"]),
        kcal: MealDiary.num(r["kcal"]))
    }
  }

  public static func stats(_ days: [Day], proteinTarget: Double) -> Stats? {
    guard !days.isEmpty else { return nil }
    let n = Double(days.count)
    return Stats(
      avgProtein: days.reduce(0) { $0 + $1.protein } / n, avgFiber: days.reduce(0) { $0 + $1.fiber } / n,
      proteinDays: days.filter { $0.protein >= proteinTarget }.count, n: days.count)
  }

  public static func insights(_ s: Stats?, targets: MacroTargets.Grams) -> [Insight] {
    guard let s else { return [] }
    var out: [Insight] = []
    let gap = targets.protein - s.avgProtein
    if gap > 10 {
      out.append(.proteinGap(avg: Int(JS.round(s.avgProtein)), gap: Int(JS.round(gap)), target: Int(JS.round(targets.protein))))
    } else if s.proteinDays >= 5 {
      out.append(.proteinHit(days: s.proteinDays, of: s.n))
    }
    if targets.fiber > 0 && s.avgFiber < targets.fiber * 0.6 {
      out.append(.fiberLow(avg: Int(JS.round(s.avgFiber)), target: Int(JS.round(targets.fiber))))
    }
    return out
  }

  /// Trục cao nhất của biểu đồ.
  public static func maxProtein(_ days: [Day], target: Double) -> Double {
    days.reduce(target * 1.15) { Swift.max($0, $1.protein) }
  }
}

/// Bảy ngày dinh dưỡng của MỘT người.
@MainActor
@Observable
public final class NutritionInsightsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([NutritionInsights.Day])
  }

  public let userId: String
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var closed = false

  public init(userId: String, store: any RowStore, clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current) {
    self.userId = userId
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
  }

  public func close() { closed = true }

  /// Đọc lại. Hỏng khi đã có số thì giữ số.
  public func load() async {
    guard !closed else { return }
    let q = NutritionInsights.query(userId: userId, today: LocalDate(clock.nowMillis(), in: timeZone))
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      phase = .ready(NutritionInsights.rows(rows))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }
}
