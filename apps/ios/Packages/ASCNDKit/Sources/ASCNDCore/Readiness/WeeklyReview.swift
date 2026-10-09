public import Foundation
public import Observation

/// Tổng kết tuần (#527) — phần tính của `app/weekly-review.tsx` @ fac9ac2.
/// Golden: `weekly-golden.json` (`tools/insights-golden/gen-weekly.mjs`, chép
/// nguyên văn biểu thức của màn + CHÍNH `nutrition-mean.ts`, `readiness-week.ts`,
/// `training-card.ts`).
///
/// Như RN: trung bình kcal / protein / nước tính trên ĐÚNG những ngày có số
/// (`metricMean`), giấc ngủ là `asleepMinutes` của từng đêm, ACWR là số engine
/// đã ghi (`latestAcwr`, không tự tính lại), tuần deload chỉ khi điểm thấp
/// ĐƯỢC đo bằng tín hiệu hồi phục (`deloadWarranted`).
///
/// Khác RN (có chủ ý, Kiệt giao E tự chốt): lời khuyên ACWR theo đúng các
/// băng của `acwrZone` (0.65 / 0.8 / 1.3 / 1.6) — thứ thẻ sẵn sàng trên Hôm
/// nay tô màu — thay vì bộ ngưỡng riêng của màn (0.6 / 0.8 / 1.3 / 1.5). Bộ
/// riêng ấy nói "giảm 15–20%" ở 1.55, chỗ thẻ Hôm nay vẫn tô vàng "tăng nhanh",
/// và im lặng ở 0.6–0.65, chỗ thẻ tô đỏ "mất nền". Một số, một lời.
public enum WeeklyReview {
  // MARK: - Đọc

  public struct Reads: Sendable {
    public let daily: RowQuery
    public let workouts: RowQuery
    public let sleep: RowQuery
    public let previous: RowQuery
    public let volumeHistory: RowQuery
    public let profile: RowQuery
  }

  static let dailyColumns =
    "date, kcal, protein_g, volume_load, readiness_score, readiness_explain, acwr, sleep_duration_min, sleep_quality, supplement_taken, supplement_planned, water_ml"

  /// Sáu lệnh đọc của màn cho tuần bắt đầu `weekStart` (Thứ Hai).
  public static func reads(userId: String, weekStart: LocalDate, in tz: TimeZone) -> Reads {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let end = weekStart.adding(days: 7)
    func days(_ from: LocalDate, _ to: LocalDate) -> [RowQuery.Filter] {
      [.gte("date", .string(from.description)), .lt("date", .string(to.description))]
    }
    let start = DailyLog.dayRange(weekStart, in: tz).start
    let stop = DailyLog.dayRange(end, in: tz).start
    return Reads(
      daily: RowQuery(
        table: "daily_logs", columns: dailyColumns, filters: [me] + days(weekStart, end),
        order: RowQuery.Order(column: "date", ascending: true)),
      workouts: RowQuery(
        table: "workout_sessions", columns: "id, date_time",
        filters: [me, .gte("date_time", .string(start)), .lt("date_time", .string(stop))]),
      sleep: RowQuery(
        table: "sleep_logs", columns: "bedtime, waketime, asleep_min, deep_min, rem_min, light_min",
        filters: [me, .gte("waketime", .string(start)), .lt("waketime", .string(stop))]),
      previous: RowQuery(
        table: "daily_logs", columns: "kcal, protein_g, volume_load",
        filters: [me] + days(weekStart.adding(days: -7), weekStart)),
      volumeHistory: RowQuery(
        table: "daily_logs", columns: "date, volume_load", filters: [me] + days(weekStart.adding(days: -84), weekStart)),
      profile: RowQuery(
        table: "profiles", columns: "tdee_target_kcal, macro_protein_g, sleep_target_hours, water_target_ml",
        filters: [me], mode: .maybeSingle))
  }

  /// Hàng đã đọc của một tuần.
  public struct Input: Sendable, Hashable {
    public var dailyLogs: [JSONValue]
    public var workouts: [JSONValue]
    public var sleepLogs: [JSONValue]
    public var prevLogs: [JSONValue]
    public var volumeHistory: [JSONValue]
    public var profile: JSONValue?

    public init(
      dailyLogs: [JSONValue], workouts: [JSONValue], sleepLogs: [JSONValue], prevLogs: [JSONValue],
      volumeHistory: [JSONValue], profile: JSONValue?
    ) {
      self.dailyLogs = dailyLogs
      self.workouts = workouts
      self.sleepLogs = sleepLogs
      self.prevLogs = prevLogs
      self.volumeHistory = volumeHistory
      self.profile = profile
    }
  }

  // MARK: - Kết quả

  /// Một lời khuyên: màn dịch `id` (khoá chữ `wr.rec.<id>`), chèn `args`.
  public struct Recommendation: Sendable, Hashable {
    public enum Kind: String, Sendable, Hashable { case success, warning, info }
    public let kind: Kind
    public let id: String
    public let args: [String]
  }

  /// Một ô số: giá trị và mẫu số đã viết sẵn (chữ số + đơn vị, không ngôn ngữ),
  /// phần trăm so với tuần trước (`nil` khi tuần trước không có số).
  public struct Card: Sendable, Hashable {
    public let value: String
    public let sub: String
    public let delta: Int?
  }

  public struct Cards: Sendable, Hashable {
    public let kcal: Card
    public let protein: Card
    public let sleep: Card
    /// `sub` là số buổi tập — màn viết "n buổi".
    public let volume: Card
    public let sessions: Int
    public let readiness: Card
    /// `nil` khi tuần không có kế hoạch thực phẩm bổ sung.
    public let supplements: Card?
    public let water: Card
  }

  /// Một ngày trên biểu đồ (`chartData`).
  public struct Day: Sendable, Hashable {
    public let date: LocalDate
    public let kcal: Double
    public let protein: Double
    public let sleepHours: Double
    public let volume: Double
    public let readiness: Double
  }

  /// Một tuần của đường khối lượng 12 tuần, đơn vị tấn (`/1000`, làm tròn).
  public struct VolumeWeek: Sendable, Hashable {
    public let weekStart: LocalDate
    public let tonnes: Double
  }

  public struct Summary: Sendable, Hashable {
    /// Số hàng `daily_logs` của tuần — 0 thì màn chỉ nói "chưa có dữ liệu".
    public let daysWithData: Int
    /// Ngày có kcal, khối lượng hoặc điểm (`daysLogged`).
    public let daysLogged: Int
    public let avgKcal: Double
    public let avgProtein: Double
    public let proteinDays: Int
    public let avgWaterMl: Double
    public let avgSleepHours: Double
    public let totalVolume: Double
    public let workoutCount: Int
    public let supplementAdherence: Int?
    public let readinessDays: Int
    public let avgReadiness: Double
    public let prevAvgKcal: Double
    public let prevAvgProtein: Double
    public let prevTotalVolume: Double
    public let acwr: Double?
    /// Mục tiêu (kcal / protein theo hồ sơ, mặc định 2200 / 140; giờ ngủ, mặc định 8).
    public let kcalTarget: Double
    public let sleepTargetHours: Double
    public let cards: Cards
    public let days: [Day]
    public let volumeWeeks: [VolumeWeek]
    /// Lời khuyên theo thứ tự hiện: ACWR trước, rồi phục hồi, ngủ, protein, khối lượng.
    public let recommendations: [Recommendation]
  }

  // MARK: - Tính

  public static func summarize(_ input: Input, weekStart: LocalDate, in tz: TimeZone, copy: ReadinessCard.Copy)
    -> Summary
  {
    let logs = input.dailyLogs
    let profile = input.profile
    let kcalTarget = coalesce(profile?["tdee_target_kcal"], 2200)
    let proteinTarget = coalesce(profile?["macro_protein_g"], 140)
    let sleepRaw = JS.number(profile?["sleep_target_hours"])
    let sleepTarget = JS.truthy(sleepRaw) ? sleepRaw : 8

    let kcal = metricMean(logs, "kcal")
    let protein = metricMean(logs, "protein_g")
    let water = metricMean(logs, "water_ml")
    let avgSleepMin = avg(input.sleepLogs.map(DailyLog.asleepMinutes))
    let avgSleepH = avgSleepMin / 60
    let totalVolume = logs.reduce(0.0) { $0 + orZero(JS.number($1["volume_load"])) }
    let workoutCount = input.workouts.count

    let suppDays = logs.filter { JS.number($0["supplement_planned"]) > 0 }
    // Ô hỏng (chuỗi không phải số) cho NaN — RN in "NaN%"; ở đây ẩn ô thay vì sập.
    let suppRatio = JS.round(
      suppDays.reduce(0.0) { $0 + JS.number(or0($1["supplement_taken"])) }
        / suppDays.reduce(0.0) { $0 + JS.number(or0($1["supplement_planned"])) } * 100)
    let supp: Int? = suppDays.isEmpty || !suppRatio.isFinite ? nil : Int(suppRatio)

    let scored = logs.filter { truthy($0["readiness_score"]) }
    let readinessDays = scored.count
    let avgReadiness = avg(scored.map { JS.number($0["readiness_score"]) })

    let prev = input.prevLogs
    let prevKcal = metricMean(prev, "kcal").mean
    let prevProtein = metricMean(prev, "protein_g").mean
    let prevVolume = prev.reduce(0.0) { $0 + orZero(JS.number($1["volume_load"])) }

    // 12 tuần khối lượng, gom theo Thứ Hai của từng ngày.
    var byWeek: [LocalDate: Double] = [:]
    for r in input.volumeHistory {
      guard let s = r["date"]?.stringValue, let d = LocalDate(s) else { continue }
      byWeek[WeeklyChallenges.weekStart(d), default: 0] += orZero(JS.number(r["volume_load"]))
    }
    let volumeWeeks = (0..<12).reversed().map { i -> VolumeWeek in
      let w = weekStart.adding(days: -7 * i)
      return VolumeWeek(weekStart: w, tonnes: JS.round((byWeek[w] ?? 0) / 1000))
    }

    let days = (0..<7).map { i -> Day in
      let date = weekStart.adding(days: i)
      let key = date.description
      let log = logs.first { $0["date"]?.stringValue == key }
      let sleep = input.sleepLogs.first { DailyLog.localDay($0["waketime"], tz) == key }
      let sleepMin = sleep.map(DailyLog.asleepMinutes) ?? 0
      return Day(
        date: date, kcal: orZero(JS.number(log?["kcal"])), protein: orZero(JS.number(log?["protein_g"])),
        sleepHours: Double(JS.fixed(sleepMin / 60, 1)) ?? 0, volume: orZero(JS.number(log?["volume_load"])),
        readiness: orZero(JS.number(log?["readiness_score"])))
    }

    let acwr = ReadinessCard.latestAcwr(logs)

    var recs: [Recommendation] = []
    if let acwr, let advice = acwrAdvice(acwr) { recs.append(advice) }
    if deloadWarranted(logs, avgReadiness: avgReadiness, readinessDays: readinessDays, copy: copy) {
      recs.append(Recommendation(kind: .warning, id: "deload", args: []))
    } else if avgReadiness >= 75 {
      recs.append(
        Recommendation(
          kind: .success, id: recoveryBacked(logs, copy: copy) ? "overloadRecovered" : "overloadCapacity", args: []))
    }
    if avgSleepH < sleepTarget - 1 {
      recs.append(
        Recommendation(kind: .warning, id: "sleepDebt", args: [JS.fixed(avgSleepH, 1), num(sleepTarget)]))
    }
    if protein.mean < JS.number(proteinTarget) * 0.8 && protein.count >= 3 {
      recs.append(
        Recommendation(
          kind: .info, id: "proteinLow", args: [num(JS.round(protein.mean)), DailyLog.jsString(proteinTarget)]))
    }
    if totalVolume > prevVolume * 1.15 && prevVolume > 0 {
      recs.append(
        Recommendation(kind: .info, id: "volumeUp", args: [num(JS.round((totalVolume / prevVolume - 1) * 100))]))
    }

    func delta(_ curr: Double, _ prev: Double) -> Int? {
      JS.truthy(prev) ? Int(JS.round((curr - prev) / prev * 100)) : nil
    }
    let waterTargetRaw = JS.number(profile?["water_target_ml"])
    let waterTarget = JS.truthy(waterTargetRaw) ? waterTargetRaw : 2500
    let cards = Cards(
      kcal: Card(
        value: num(JS.round(kcal.mean)), sub: "/\(DailyLog.jsString(kcalTarget))", delta: delta(kcal.mean, prevKcal)),
      protein: Card(
        value: "\(num(JS.round(protein.mean)))g", sub: "/\(DailyLog.jsString(proteinTarget))g",
        delta: delta(protein.mean, prevProtein)),
      sleep: Card(value: "\(JS.fixed(avgSleepH, 1))h", sub: "/\(num(sleepTarget))h", delta: nil),
      volume: Card(
        value: "\(num(JS.round(totalVolume / 1000)))k", sub: num(Double(workoutCount)),
        delta: delta(totalVolume, prevVolume)),
      sessions: workoutCount,
      readiness: Card(
        value: num(JS.round(avgReadiness)), sub: acwr.map { "ACWR \(num($0))" } ?? "—", delta: nil),
      supplements: supp.map { Card(value: "\($0)%", sub: "/\(suppDays.count)d", delta: nil) },
      water: Card(value: "\(JS.fixed(water.mean / 1000, 1))L", sub: "/\(num(waterTarget / 1000))L", delta: nil))

    let daysLogged = logs.filter {
      JS.number($0["kcal"]) > 0 || JS.number($0["volume_load"]) > 0 || JS.present($0["readiness_score"])
    }.count

    return Summary(
      daysWithData: logs.count, daysLogged: daysLogged, avgKcal: kcal.mean, avgProtein: protein.mean,
      proteinDays: protein.count, avgWaterMl: water.mean, avgSleepHours: avgSleepH, totalVolume: totalVolume,
      workoutCount: workoutCount, supplementAdherence: supp, readinessDays: readinessDays, avgReadiness: avgReadiness,
      prevAvgKcal: prevKcal, prevAvgProtein: prevProtein, prevTotalVolume: prevVolume, acwr: acwr,
      kcalTarget: JS.number(kcalTarget), sleepTargetHours: sleepTarget, cards: cards, days: days,
      volumeWeeks: volumeWeeks, recommendations: recs)
  }

  /// Lời khuyên ACWR theo băng của `acwrZone` (xem đầu tệp): quá tải → giảm
  /// 15–20%; tăng nhanh → giảm 5–10%; mất nền → tăng dần 10–15%; tối ưu → giữ
  /// hoặc +5%; hơi thưa (0.65–0.8) → không nói gì, như vùng giữa của RN.
  public static func acwrAdvice(_ acwr: Double) -> Recommendation? {
    let shown = [num(acwr)]
    switch ReadinessCard.zone(acwr) {
    case .spike: return Recommendation(kind: .warning, id: "acwrHigh", args: shown)
    case .elevated: return Recommendation(kind: .warning, id: "acwrSlightlyHigh", args: shown)
    case .detraining: return Recommendation(kind: .info, id: "acwrLow", args: shown)
    case .optimal: return Recommendation(kind: .success, id: "acwrOptimal", args: shown)
    case .low: return nil
    }
  }

  // MARK: - `readiness-week.ts`

  /// `recoveryBacked`: ít nhất 3 ngày có điểm ĐO bằng HRV / RHR / giấc ngủ.
  public static func recoveryBacked(_ logs: [JSONValue], copy: ReadinessCard.Copy) -> Bool {
    logs.filter {
      truthy($0["readiness_score"])
        && ReadinessCard.hasRecoverySignal($0["readiness_explain"]?.stringValue, copy: copy)
    }.count >= 3
  }

  /// `deloadWarranted`: điểm trung bình < 50 trên ≥ 3 ngày, và điểm ấy đo được hồi phục.
  public static func deloadWarranted(
    _ logs: [JSONValue], avgReadiness: Double, readinessDays: Int, copy: ReadinessCard.Copy
  ) -> Bool {
    avgReadiness < 50 && readinessDays >= 3 && recoveryBacked(logs, copy: copy)
  }

  // MARK: - Phụ

  /// `metricMean`: trung bình trên những hàng có số dương hữu hạn.
  static func metricMean(_ rows: [JSONValue], _ column: String) -> (mean: Double, count: Int) {
    let values = rows.map { JS.number($0[column]) }.filter { $0.isFinite && $0 > 0 }
    return (avg(values), values.count)
  }

  static func avg(_ a: [Double]) -> Double { a.isEmpty ? 0 : a.reduce(0, +) / Double(a.count) }

  /// `Number(x) || 0`.
  static func orZero(_ x: Double) -> Double { JS.truthy(x) ? x : 0 }

  /// `x || 0` trên một ô (trước khi `Number`).
  static func or0(_ v: JSONValue?) -> JSONValue { truthy(v) ? v! : .number(0) }

  /// `x ?? fallback`: chỉ `null` / thiếu mới lấy mặc định; giữ nguyên ô (có thể là chuỗi).
  static func coalesce(_ v: JSONValue?, _ fallback: Double) -> JSONValue { JS.present(v) ? v! : .number(fallback) }

  /// Giá trị "truthy" của một ô JSON: 0 / NaN / "" / null / false là sai.
  static func truthy(_ v: JSONValue?) -> Bool {
    switch v {
    case .number(let n)?: return JS.truthy(n)
    case .string(let s)?: return !s.isEmpty
    case .bool(let b)?: return b
    case .array?, .object?: return true
    default: return false
    }
  }

  /// `${n}` của JS.
  static func num(_ x: Double) -> String { ReadinessEngine.jsString(x) }
}

/// Tổng kết của MỘT tài khoản, từng tuần một. Đóng khi phiên đổi — kết quả về
/// sau không được áp.
@MainActor @Observable
public final class WeeklyReviewBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready(WeeklyReview.Summary)
  }

  public let userId: String
  /// 0 = tuần này; −1 = tuần trước… Không đi tới tương lai.
  public private(set) var weekOffset = 0
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let copy: ReadinessCard.Copy
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private var today: LocalDate
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var generation = 0

  public init(userId: String, today: LocalDate, store: any RowStore, copy: ReadinessCard.Copy, in tz: TimeZone) {
    self.userId = userId
    self.today = today
    self.store = store
    self.copy = copy
    self.tz = tz
  }

  public func close() { closed = true }

  /// Thứ Hai của tuần đang xem.
  public var weekStart: LocalDate { WeeklyChallenges.weekStart(today).adding(days: 7 * weekOffset) }

  public var canGoForward: Bool { weekOffset < 0 }

  /// Đổi tuần (−1 lùi, +1 tiến, không quá tuần này) rồi đọc.
  public func step(_ by: Int) async {
    let next = Swift.min(weekOffset + by, 0)
    guard next != weekOffset else { return }
    weekOffset = next
    phase = .loading
    await load()
  }

  /// Qua nửa đêm / mở lại app: tuần "này" có thể đã đổi.
  public func move(to today: LocalDate) async {
    guard today != self.today else { return }
    let before = weekStart
    self.today = today
    // Tuần đang xem đổi thì số cũ không còn là của nó.
    if weekStart != before { phase = .loading }
    await load()
  }

  /// Đọc (lại) sáu nguồn của tuần đang xem. Hỏng một nguồn là hỏng cả tuần —
  /// không vẽ số nửa vời; đọc lại hỏng khi đã có số của ĐÚNG tuần này thì giữ số.
  public func load() async {
    generation += 1
    let mine = generation
    let ws = weekStart
    let reads = WeeklyReview.reads(userId: userId, weekStart: ws, in: tz)
    let store = self.store
    do {
      async let daily = store.select(reads.daily)
      async let workouts = store.select(reads.workouts)
      async let sleep = store.select(reads.sleep)
      async let prev = store.select(reads.previous)
      async let history = store.select(reads.volumeHistory)
      async let profile = store.select(reads.profile)
      let input = try await WeeklyReview.Input(
        dailyLogs: daily, workouts: workouts, sleepLogs: sleep, prevLogs: prev, volumeHistory: history,
        profile: profile.first)
      guard !closed, mine == generation else { return }
      phase = .ready(WeeklyReview.summarize(input, weekStart: ws, in: tz, copy: copy))
    } catch {
      guard !closed, mine == generation else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }
}
