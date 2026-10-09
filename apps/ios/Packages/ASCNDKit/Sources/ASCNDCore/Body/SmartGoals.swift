public import Foundation
public import Observation

/// Cơ thể người này thật sự tiêu bao nhiêu (#527) — `lib/adaptive-tdee.ts` @ fac9ac2.
///
/// Đẳng thức cân bằng năng lượng: TDEE ≈ trung bình ăn vào − (kg/ngày × 7700).
/// Từ chối là chuyện thường và là chuyện đúng: dưới 10 ngày có ăn, dưới 6 lần
/// cân, lần đầu – lần cuối cách nhau dưới 10 ngày, hay các lần cân dồn vào dưới
/// 5 ngày khác nhau thì phép tính chỉ cho ra một con số tự tin mà sai. Ngày
/// không ghi bữa nào là ngày không có thông tin, không phải ngày ăn 0 kcal.
/// Không bao giờ tự đổi mục tiêu — chỉ ra một câu, người dùng quyết.
///
/// Khác RN: một số ăn / cân là ±∞ cũng bị bỏ như số ≤ 0 (RN ra `Infinity` /
/// `NaN` kcal; ở Swift `Int(∞)` là sập app). Không có đường thật nào tới đó —
/// cột là `numeric`.
public enum AdaptiveTDEE {
  /// kcal cho mỗi kg khối lượng cơ thể.
  public static let kcalPerKg = 7700.0
  public static let windowDays = 14
  public static let minLoggedDays = 10
  public static let minWeighIns = 6
  public static let minSpanDays = 10
  /// Số NGÀY khác nhau, không phải số lần cân: sáu lần trên hai buổi sáng là
  /// hai điểm, và đường thẳng qua chúng là nước của hai buổi sáng ấy.
  public static let minDistinctDays = 5
  /// Dưới mức này chênh lệch là nhiễu.
  public static let minGapKcal = 200

  public struct DayIntake: Sendable, Hashable {
    /// `YYYY-MM-DD` địa phương.
    public let date: String
    public let kcal: Double
    public init(date: String, kcal: Double) {
      self.date = date
      self.kcal = kcal
    }
  }

  public struct WeighIn: Sendable, Hashable {
    public let date: String
    public let kg: Double
    public init(date: String, kg: Double) {
      self.date = date
      self.kg = kg
    }
  }

  public enum Refusal: String, Error, Sendable, Hashable {
    case notEnoughIntake = "not-enough-intake"
    case notEnoughWeight = "not-enough-weight"
    case spanTooShort = "span-too-short"
    case weighInsClustered = "weigh-ins-clustered"
  }

  public struct Estimate: Sendable, Hashable {
    /// kcal/ngày mà cân bằng năng lượng suy ra.
    public let measured: Int
    public let meanIntake: Int
    /// kg/tuần, âm khi đang giảm; hai chữ số lẻ.
    public let kgPerWeek: Double
    public let loggedDays: Int
    public let weighIns: Int
  }

  /// `adaptiveTDEE`: lọc, sắp, mọi lần từ chối đều ở đây.
  public static func estimate(intake: [DayIntake], weights: [WeighIn]) -> Result<Estimate, Refusal> {
    let days = intake.filter { $0.kcal > 0 && $0.kcal.isFinite }
    guard days.count >= minLoggedDays else { return .failure(.notEnoughIntake) }

    // Ngày không phải ngày lịch thật (`2024-02-30`, `""`) bị bỏ như cân ≤ 0.
    // Sắp theo ngày, cùng ngày giữ thứ tự đầu vào như `Array.sort` của JS.
    let points = weights.enumerated()
      .compactMap { i, w -> (t: Int, kg: Double, i: Int)? in
        guard w.kg > 0, w.kg.isFinite, let d = LocalDate(w.date) else { return nil }
        return (d.daysSinceEpoch, w.kg, i)
      }
      .sorted { ($0.t, $0.i) < ($1.t, $1.i) }
    guard points.count >= minWeighIns else { return .failure(.notEnoughWeight) }
    guard points[points.count - 1].t - points[0].t >= minSpanDays else { return .failure(.spanTooShort) }
    guard Set(points.map(\.t)).count >= minDistinctDays else { return .failure(.weighInsClustered) }

    let meanIntake = days.reduce(0) { $0 + $1.kcal } / Double(days.count)
    let perDay = kgPerDay(points.map { (t: Double($0.t), kg: $0.kg) })
    return .success(
      Estimate(
        measured: Int(JS.round(meanIntake - perDay * kcalPerKg)), meanIntake: Int(JS.round(meanIntake)),
        kgPerWeek: JS.round(perDay * 7 * 100) / 100, loggedDays: days.count, weighIns: points.count))
  }

  /// `worthMentioning`.
  public static func worthMentioning(_ measured: Double, _ target: Double) -> Bool {
    abs(measured - target) >= Double(minGapKcal)
  }

  /// Hệ số góc bình phương tối thiểu, kg/ngày.
  static func kgPerDay(_ points: [(t: Double, kg: Double)]) -> Double {
    let n = Double(points.count)
    let meanT = points.reduce(0) { $0 + $1.t } / n
    let meanW = points.reduce(0) { $0 + $1.kg } / n
    var num = 0.0
    var den = 0.0
    for p in points {
      num += (p.t - meanT) * (p.kg - meanW)
      den += (p.t - meanT) * (p.t - meanT)
    }
    return den == 0 ? 0 : num / den
  }
}

/// Hiệu chỉnh mục tiêu (#527) — `app/smart-goals.tsx` @ fac9ac2.
///
/// Như RN: 35 ngày cân (`weight_logs`), 14 ngày `daily_logs` (calo, đạm), hồ sơ
/// (mục tiêu, giới, mục tiêu calo, đạm). Bốn tuần Thứ Hai → Chủ Nhật
/// (`weekStartOf`: Chủ Nhật thuộc tuần ĐANG chạy), trung bình cân mỗi tuần, cần
/// ≥ 2 tuần có số và ≥ 3 lần cân. Thay đổi tuần = hai tuần có số cuối; dải đích
/// theo mục tiêu (tăng 0.25…0.5, giảm −0.75…−0.25, còn lại ±0.1 kg/tuần). Gợi
/// ý calo: có đo được TDEE (`AdaptiveTDEE`) thì nhân hệ số mục tiêu (qua sàn
/// calo) và chỉ nói khi lệch ≥ 200 kcal; không đo được thì luật cũ — hai tuần
/// liền lệch dải với tăng / giảm → ±250 hoặc ±150. Thẻ đạm: chỉ khi có ngày
/// mang dinh dưỡng (`nutritionDays`), mục tiêu `macro_protein_g || 150`, mỗi
/// bữa = /4, ngày thấp = đạm < 70 % mục tiêu trên các hàng đọc được.
public enum SmartGoals {
  public struct Week: Sendable, Hashable {
    /// `W1` … `W4` — nhãn giữ theo vị trí tuần, tuần trống thì bỏ cột.
    public let label: String
    public let kg: Double
  }

  public struct Analysis: Sendable, Hashable {
    public let weeks: [Week]
    /// kg/tuần.
    public let weeklyChange: Double
    public let onTrack: Bool
    public let targetMin: Double
    public let targetMax: Double
    public let goal: String
    public let currentCal: Int
    public let twoWeekDeviation: Bool
    public let calorieAdjustment: Int
    /// Gợi ý đến từ chính số ăn + số cân của người này.
    public let fromMeasurement: Bool
    public let measuredDays: Int
    public let estimate: Result<AdaptiveTDEE.Estimate, AdaptiveTDEE.Refusal>

    /// Có thẻ gợi ý calo không.
    public var suggests: Bool { twoWeekDeviation && calorieAdjustment != 0 }
  }

  public struct Protein: Sendable, Hashable {
    /// g/ngày.
    public let target: Double
    public let perMeal: Int
    public let lowDays: Int
    public let totalDays: Int
  }

  public static let weightDays = 35
  public static let dailyDays = 14
  public static let goals = ["bulk", "cut", "maintain", "recomp", "strength", "endurance"]

  public static func weightQuery(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "weight_logs", columns: "date, weight_kg",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(today.adding(days: -weightDays).description))],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  public static func dailyQuery(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, kcal, protein_g",
      filters: [.eq("user_id", .string(userId)), .gte("date", .string(today.adding(days: -dailyDays).description))],
      order: RowQuery.Order(column: "date", ascending: true))
  }

  public static func profileQuery(userId: String) -> RowQuery {
    RowQuery(
      table: "profiles", columns: "goal, sex, tdee_target_kcal, macro_protein_g, units_weight",
      filters: [.eq("user_id", .string(userId))], mode: .maybeSingle)
  }

  /// `weekStartOf`: Thứ Hai của tuần chứa `d`; Chủ Nhật là ngày cuối tuần.
  public static func weekStart(_ d: LocalDate) -> LocalDate {
    // 1970-01-01 là Thứ Năm; 0 = Chủ Nhật như `getDay()`.
    let dow = ((d.daysSinceEpoch + 4) % 7 + 7) % 7
    return d.adding(days: dow == 0 ? -6 : 1 - dow)
  }

  /// `profile.goal || 'maintain'`.
  public static func goal(_ profile: JSONValue?) -> String {
    let g = profile?["goal"]?.stringValue ?? ""
    return g.isEmpty ? "maintain" : g
  }

  /// `{ date, weight_kg: Number(d.weight_kg) }`.
  static func weighIns(_ rows: [JSONValue]) -> [AdaptiveTDEE.WeighIn] {
    rows.map { AdaptiveTDEE.WeighIn(date: $0["date"]?.stringValue ?? "", kg: JS.number($0["weight_kg"])) }
  }

  public static func analyse(weights rows: [JSONValue], daily: [JSONValue], profile: JSONValue?, today: LocalDate)
    -> Analysis?
  {
    let logs = weighIns(rows)
    guard logs.count >= 3, let profile, profile != .null else { return nil }
    let goal = Self.goal(profile)
    let sex = FitnessCalc.Sex(rawValue: profile["sex"]?.stringValue ?? "") ?? .other
    let currentCal = Int(MacroTargets.calorieTarget(text(profile["tdee_target_kcal"])))

    let monday = weekStart(today)
    var weeks: [Week] = []
    for i in stride(from: 3, through: 0, by: -1) {
      let start = monday.adding(days: -7 * i).description
      let end = monday.adding(days: -7 * i + 6).description
      let w = logs.filter { $0.date >= start && $0.date <= end }
      if !w.isEmpty { weeks.append(Week(label: "W\(4 - i)", kg: w.reduce(0) { $0 + $1.kg } / Double(w.count))) }
    }
    guard weeks.count >= 2 else { return nil }

    let weeklyChange = weeks[weeks.count - 1].kg - weeks[weeks.count - 2].kg
    let (targetMin, targetMax): (Double, Double) =
      switch goal {
      case "bulk": (0.25, 0.5)
      case "cut": (-0.75, -0.25)
      default: (-0.1, 0.1)
      }
    let onTrack = weeklyChange >= targetMin && weeklyChange <= targetMax

    let estimate = AdaptiveTDEE.estimate(
      intake: daily.map { d in
        let k = JS.number(d["kcal"])
        return AdaptiveTDEE.DayIntake(date: text(d["date"]), kcal: JS.truthy(k) ? k : 0)
      },
      weights: logs)

    var twoWeekDeviation = false
    var adjustment = 0
    var fromMeasurement = false
    var measuredDays = 0
    switch estimate {
    case .success(let m):
      let shouldBe = FitnessCalc.targetCalories(tdee: m.measured, goal: goal, sex: sex)
      if AdaptiveTDEE.worthMentioning(Double(shouldBe), Double(currentCal)) {
        twoWeekDeviation = true
        fromMeasurement = true
        measuredDays = m.loggedDays
        adjustment = shouldBe - currentCal
      }
    case .failure:
      if weeks.count >= 3 {
        let prevChange = weeks[weeks.count - 2].kg - weeks[weeks.count - 3].kg
        let bothOff =
          (goal == "bulk" && weeklyChange < targetMin && prevChange < targetMin)
          || (goal == "cut" && weeklyChange > targetMax && prevChange > targetMax)
        if bothOff {
          twoWeekDeviation = true
          if goal == "bulk" { adjustment = weeklyChange < 0 ? 250 : 150 }
          if goal == "cut" { adjustment = weeklyChange > 0 ? -250 : -150 }
        }
      }
    }
    return Analysis(
      weeks: weeks, weeklyChange: weeklyChange, onTrack: onTrack, targetMin: targetMin, targetMax: targetMax,
      goal: goal, currentCal: currentCal, twoWeekDeviation: twoWeekDeviation, calorieAdjustment: adjustment,
      fromMeasurement: fromMeasurement, measuredDays: measuredDays, estimate: estimate)
  }

  public static func protein(daily: [JSONValue], profile: JSONValue?) -> Protein? {
    let pos = { (x: Double) in x.isFinite && x > 0 }
    let withNutrition = daily.filter { pos(JS.number($0["kcal"])) || pos(JS.number($0["protein_g"])) }.count
    guard withNutrition > 0, let profile, profile != .null else { return nil }
    let set = JS.number(profile["macro_protein_g"])
    let target = JS.truthy(set) ? set : 150
    let low = daily.filter { JS.number($0["protein_g"]) < target * 0.7 }.count
    return Protein(target: target, perMeal: Int(JS.round(target / 4)), lowDays: low, totalDays: daily.count)
  }

  /// Số có dấu của ô chú thích: `+0.25`, `-0.10`, `0.00` — đơn vị hiển thị,
  /// hai chữ số lẻ (`toFixed(2)`).
  public static func signed(_ value: Double, unit: WeightUnit) -> String {
    let sign = value > 0 ? "+" : ""
    return sign + JS.fixed(unit.convert(value), 2)
  }

  /// `+250` / `-150`.
  public static func signed(_ kcal: Int) -> String { "\(kcal > 0 ? "+" : "")\(kcal)" }

  /// Đạm mục tiêu như RN in (`${target}g`): `150g`, `137.5g`.
  public static func grams(_ g: Double) -> String { "\(ReadinessEngine.jsString(g))g" }

  /// Chữ của một ô hồ sơ: số → `String(n)`, chuỗi giữ nguyên, còn lại rỗng.
  static func text(_ v: JSONValue?) -> String {
    switch v {
    case .number(let n)?: ReadinessEngine.jsString(n)
    case .string(let s)?: s
    default: ""
    }
  }
}

/// Màn Hiệu chỉnh mục tiêu của MỘT tài khoản.
@MainActor @Observable
public final class SmartGoalsBook {
  public struct Snapshot: Sendable, Hashable {
    public let analysis: SmartGoals.Analysis?
    public let protein: SmartGoals.Protein?
    /// Nhãn trên viên thuốc mục tiêu (`profile?.goal || 'maintain'`).
    public let goal: String
    public let unit: WeightUnit
  }

  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready(Snapshot)
  }

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private var closed = false

  public init(userId: String, today: LocalDate, store: any RowStore) {
    self.userId = userId
    self.today = today
    self.store = store
  }

  public func close() { closed = true }

  /// Qua nửa đêm: tuần và cửa sổ đổi theo hôm nay.
  public func move(to day: LocalDate) async {
    guard day != today else { return }
    today = day
    await load()
  }

  /// Ba lượt đọc song song. Một lượt hỏng → lỗi có thử lại (RN: hồ sơ hỏng mới
  /// báo lỗi, cân / nhật ký hỏng thì vẽ như "chưa đủ dữ liệu"); đọc lại hỏng
  /// khi đã có số thì giữ số.
  public func load() async {
    let store = self.store
    let uid = userId
    let day = today
    async let weights = store.select(SmartGoals.weightQuery(userId: uid, today: day))
    async let daily = store.select(SmartGoals.dailyQuery(userId: uid, today: day))
    async let profile = store.select(SmartGoals.profileQuery(userId: uid))
    let w: [JSONValue]
    let d: [JSONValue]
    let p: [JSONValue]
    do {
      w = try await weights
      d = try await daily
      p = try await profile
    } catch {
      // Hai lượt còn lại bị huỷ khi ra khỏi phạm vi.
      guard !closed, day == today else { return }
      if case .ready = phase { return }
      phase = .failed
      return
    }
    guard !closed, day == today else { return }
    let row = p.first
    phase = .ready(
      Snapshot(
        analysis: SmartGoals.analyse(weights: w, daily: d, profile: row, today: day),
        protein: SmartGoals.protein(daily: d, profile: row), goal: SmartGoals.goal(row),
        unit: WeightUnit(stored: row?["units_weight"]?.stringValue)))
  }
}
