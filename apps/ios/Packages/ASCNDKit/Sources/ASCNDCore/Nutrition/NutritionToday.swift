public import Foundation
public import Observation

/// Thẻ Dinh dưỡng hôm nay (#527, `(tabs)/nutrition` → `NutritionCard` của
/// `components/ascnd/dashboard-cards.tsx` @ fac9ac2): số và trạng thái, chữ là
/// việc của màn.
///
/// RN behavior (giữ nguyên):
/// - số của ngày đọc từ `daily_logs` hôm nay; ô trống / hỏng là 0 (`Number(x) || 0`),
///   calo làm tròn;
/// - mục tiêu: `calorieTargetFor` / `macroTargetsFor` (`MacroTargets.grams`);
/// - vòng calo kẹp ở 100 %, còn con số "% mục tiêu" thì không kẹp (111 % nói được
///   điều mà một vòng đầy không nói được);
/// - ba trạng thái của vòng: dưới mục tiêu, trong dải (tới +10 %), vượt dải;
/// - một dòng dưới mục tiêu: "Còn lại N", "Vừa đủ mục tiêu", hoặc "Thặng dư +N";
/// - mỗi ô macro: "đã ăn / mục tiêu g", chạm thẻ để đổi sang phần còn lại; vượt
///   thì ghi chú nói ngay "+N g vượt mục tiêu", vượt quá 10 % thì tô đỏ.
///
/// Golden: `nutrition-card-golden.json` (`gen-nutrition-card.mjs`).
public enum NutritionToday {
  /// `SURPLUS_ALLOWANCE`: dải "đúng nhịp" phía trên mục tiêu.
  public static let surplusAllowance = 0.1

  /// Năm con số của hôm nay.
  public struct Totals: Sendable, Hashable {
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double

    public static let zero = Totals(kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0)
  }

  /// `Number(x) || 0`.
  static func num(_ v: JSONValue?) -> Double {
    let n = JS.number(v ?? .null)
    return JS.truthy(n) ? n : 0
  }

  /// Hàng `daily_logs` hôm nay → năm con số; không có hàng là một ngày chưa ăn.
  public static func totals(_ row: JSONValue?) -> Totals {
    Totals(
      kcal: JS.round(num(row?["kcal"])), protein: num(row?["protein_g"]), carbs: num(row?["carbs_g"]),
      fat: num(row?["fat_g"]), fiber: num(row?["fiber_g"]))
  }

  /// `calorieTargetFor(profile)`.
  public static func calorieTarget(_ profile: Profile?) -> Double {
    let k = MacroTargets.stored(profile?.tdeeTargetKcal)
    return JS.round(k.map { $0 > 0 ? $0 : MacroTargets.defaultKcal } ?? MacroTargets.defaultKcal)
  }

  /// `macroTargetsFor(profile)`.
  public static func macroTargets(_ profile: Profile?) -> MacroTargets.Grams {
    MacroTargets.grams(
      tdeeKcal: profile?.tdeeTargetKcal, protein: profile?.macroProteinG, carbs: profile?.macroCarbsG,
      fat: profile?.macroFatG, fiber: profile?.macroFiberG)
  }

  public enum Band: Sendable, Hashable {
    /// Dưới mục tiêu — "đang đi".
    case under
    /// Từ mục tiêu tới +10 % — "đúng nhịp".
    case inBand
    /// Quá +10 % — "quá tay".
    case over
  }

  /// Dòng dưới mục tiêu.
  public enum Line: Sendable, Hashable {
    case remaining(Double)
    case onTarget
    case surplus(Double)
  }

  public struct Ring: Sendable, Hashable {
    /// Phần vòng được tô, 0…100.
    public let fill: Double
    /// "% mục tiêu", không kẹp.
    public let percentOfTarget: Double
    /// Vòng thứ hai khi vượt, 0…100.
    public let overFill: Double
    public let band: Band
    public let line: Line
  }

  public static func ring(kcal: Double, target: Double) -> Ring {
    let base = target != 0 ? target : 1
    let delta = kcal - target
    let overBudget = delta > target * surplusAllowance
    let inBand = !overBudget && kcal >= target
    let overFill = target > 0 ? Swift.min(Swift.max(delta, 0) / target * 100, 100) : 0
    return Ring(
      fill: Swift.min(kcal / base * 100, 100), percentOfTarget: JS.round(kcal / base * 100), overFill: overFill,
      band: overBudget ? .over : inBand ? .inBand : .under,
      line: delta == 0 ? .onTarget : delta > 0 ? .surplus(delta) : .remaining(target - kcal))
  }

  /// Chữ dưới số của ô khi đã lật (`dcMacroLeft` / `Done` / `Over`).
  public enum Word: Sendable, Hashable { case left, done, over }

  public struct Tile: Sendable, Hashable {
    public let current: Double
    public let target: Double
    /// Thanh tiến độ, 0…100.
    public let fill: Double
    /// Số đã ăn, làm tròn.
    public let eaten: Double
    /// Mục tiêu trừ đã ăn, làm tròn; âm là vượt.
    public let left: Double
    public let word: Word
    /// Quá mục tiêu hơn 10 % — tô đỏ.
    public let overHard: Bool

    public var over: Bool { left < 0 }
    /// `leftNum`: "+12" khi vượt, "58" khi còn.
    public var leftText: String { "\(over ? "+" : "")\(Units.text(abs(left)))" }
  }

  public static func tile(current: Double, target: Double) -> Tile {
    let left = JS.round(target - current)
    return Tile(
      current: current, target: target, fill: Swift.min(current / (target != 0 ? target : 1) * 100, 100),
      eaten: JS.round(current), left: left, word: left < 0 ? .over : left == 0 ? .done : .left,
      overHard: current > target * (1 + surplusAllowance))
  }

  /// Bốn ô theo thứ tự của RN: đạm, tinh bột, béo, chất xơ.
  public static func tiles(_ t: Totals, targets g: MacroTargets.Grams) -> [Tile] {
    [tile(current: t.protein, target: g.protein), tile(current: t.carbs, target: g.carbs),
     tile(current: t.fat, target: g.fat), tile(current: t.fiber, target: g.fiber)]
  }

  /// Hàng `daily_logs` của hôm nay.
  public static func query(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "kcal, protein_g, carbs_g, fat_g, fiber_g",
      filters: [.eq("user_id", .string(userId)), .eq("date", .string(today.description))], mode: .maybeSingle)
  }
}

/// Số dinh dưỡng hôm nay của MỘT người — thẻ trên tab Dinh dưỡng.
///
/// Như RN: đang tải là một trạng thái RIÊNG (không vẽ "0 / 2.200" tự tin trước
/// khi số về), đọc hỏng thì thẻ nhường chỗ cho lời báo lỗi có thử lại — một số
/// sai kèm cảnh báo vẫn là một số sai. Đọc lại hỏng khi đã có số thì giữ số.
@MainActor
@Observable
public final class NutritionTodayBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready(NutritionToday.Totals)
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var reloading = false

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

  public func load() async {
    guard !closed, !reloading else { return }
    reloading = true
    defer { reloading = false }
    let q = NutritionToday.query(userId: userId, today: LocalDate(clock.nowMillis(), in: timeZone))
    let store = self.store
    do {
      let rows = try await store.select(q)
      guard !closed else { return }
      phase = .ready(NutritionToday.totals(rows.first))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }
}
