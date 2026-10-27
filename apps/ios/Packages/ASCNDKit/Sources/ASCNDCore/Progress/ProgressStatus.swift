public import Foundation
public import Observation

/// Tiến bộ theo chữ trạng thái (#527, Kiệt duyệt mock `progress-status-words.html` bản 10,
/// 22/10). Sáu nhóm, mỗi nhóm MỘT chữ — Tốt · Cần chú ý · Chưa đủ dữ liệu — so số 7 ngày
/// TRƯỚC hôm nay (`AverageWindow`, Kiệt 27/10: hôm nay chưa xong) với mục tiêu của chính
/// người dùng; số hôm nay đi riêng ("Hôm nay"). Không điểm số, không AI; thiếu dữ liệu thì
/// nói thiếu (PRODUCT_DECISION_V1).
///
/// Ngưỡng (bảng của mock):
/// - Tập luyện: buổi đã tập / buổi theo lịch tới HẾT HÔM QUA — hôm nay chưa qua thì chưa
///   "chậm" (không nhắc oan buổi sáng). Chưa có lịch → chưa đủ dữ liệu.
/// - Vận động: TB bước của ngày có số ≥ 80 % mục tiêu bước.
/// - Giấc ngủ: TB giờ ngủ ≥ mục tiêu − 30 phút.
/// - Ăn uống: TB đạm ≥ 80 % mục tiêu (cùng ngưỡng lời khuyên "đạm thấp" của Tổng kết tuần).
/// - Hồi phục: TB sẵn sàng của ngày ĐO ĐƯỢC phục hồi ≥ 60.
/// - Cơ thể: xu hướng cân 4 tuần theo hướng mục tiêu (giảm / giữ / tăng); tăng hay giảm
///   nhanh hơn ~1 % cân nặng mỗi tuần cũng là "Cần chú ý" (Kiệt 27/10) — "Tốt" cho +15 kg
///   trong 4 tuần khi mục tiêu là tăng là sai.
/// - Mọi nhóm (trừ Tập luyện): dưới 3 ngày / lần có dữ liệu → chưa đủ dữ liệu.
public enum ProgressStatus {
  public enum Level: String, Sendable, Hashable, CaseIterable {
    case good, attention, insufficient
  }

  /// Thứ tự theo đường leo của chữ A: chân trái dưới → trên → đỉnh → chân phải → dưới.
  public enum Group: String, Sendable, Hashable, CaseIterable {
    case training, steps, nutrition, sleep, recovery, body
  }

  public static let windowDays = AverageWindow.length
  public static let minDays = 3
  public static let stepsRatio = 0.8
  public static let proteinRatio = 0.8
  public static let sleepSlackMinutes = 30.0
  public static let readinessGood = 60.0
  public static let weightDays = 28
  /// Cân: "giữ" là không đổi quá chừng này trong 4 tuần; "giảm / tăng" chấp nhận lệch nhẹ.
  public static let maintainBandKg = 1.0
  public static let directionSlackKg = 0.2
  /// Tăng / giảm quá chừng này % cân nặng mỗi tuần (trung bình trên các lần cân) là quá
  /// nhanh (Kiệt 27/10). Mốc hướng dẫn chung hay dùng (~0,5–1 %/tuần), không phải y khoa.
  public static let maxWeeklyChangePercent = 1.0
  /// Hai lần cân sát nhau không đủ để nói tốc độ (nước, bữa tối muộn): lần đầu và lần
  /// cuối phải cách nhau ít nhất chừng này ngày thì mới xét tốc độ.
  public static let minRateDays = 7

  /// Một lần cân (ngày địa phương, kg).
  public struct Weigh: Sendable, Hashable {
    public let date: LocalDate
    public let kg: Double

    public init(date: LocalDate, kg: Double) {
      self.date = date
      self.kg = kg
    }
  }

  /// Vì sao nhóm Cơ thể "Cần chú ý" — chọn câu khuyên.
  public enum BodyNote: String, Sendable, Hashable {
    /// Đi ngược mục tiêu (hay ra ngoài dải "giữ").
    case offTrack
    case gainingFast
    case losingFast
  }

  public struct Result: Sendable, Hashable, Identifiable {
    public let group: Group
    public let level: Level
    /// Ngày (hay lần cân) có dữ liệu / cửa sổ — "5 / 7 ngày có ghi bữa".
    public let have: Int
    public let of: Int
    /// Số tối thiểu để đọc được (chỉ có nghĩa khi `insufficient`).
    public let need: Int
    /// Hôm nay, TB và mục tiêu theo đơn vị của nhóm (bước, phút ngủ, gam đạm, điểm, kg).
    public let today: Double?
    public let average: Double?
    public let target: Double?
    /// Cơ thể: thay đổi trung bình mỗi tuần (kg) và lý do "Cần chú ý".
    public var weeklyKg: Double? = nil
    public var bodyNote: BodyNote? = nil
    public var id: Group { group }
  }

  // MARK: - Từng nhóm

  /// `done`: ngày có buổi trong tuần; `dueBeforeToday`: buổi theo lịch trước hôm nay;
  /// `planned`: cả tuần. `nil` = chưa có lịch.
  public static func training(done: Int, dueBeforeToday: Int, planned: Int?) -> Result {
    guard let planned, planned > 0 else {
      return Result(group: .training, level: .insufficient, have: done, of: 0, need: 1,
                    today: nil, average: nil, target: nil)
    }
    let level: Level = done >= dueBeforeToday ? .good : .attention
    return Result(group: .training, level: level, have: done, of: planned, need: 0,
                  today: Double(dueBeforeToday), average: nil, target: Double(planned))
  }

  /// `days`: 7 ngày của `AverageWindow` (trước hôm nay), cũ → mới, `nil` = không có số.
  /// `today`: số hôm nay, chỉ để hiện — không vào trung bình.
  public static func steps(_ days: [Double?], goal: Double, today: Double? = nil) -> Result {
    ratioGroup(.steps, days, target: goal, ratio: stepsRatio, today: today)
  }

  /// Phút ngủ mỗi đêm; mục tiêu tính bằng giờ.
  public static func sleep(_ minutes: [Double?], targetHours: Double, today todayValue: Double? = nil) -> Result {
    let have = minutes.compactMap { $0 }
    let target = targetHours * 60
    guard have.count >= minDays else {
      return Result(group: .sleep, level: .insufficient, have: have.count, of: minutes.count, need: minDays,
                    today: todayValue, average: nil, target: target)
    }
    let avg = mean(have)
    return Result(group: .sleep, level: avg >= target - sleepSlackMinutes ? .good : .attention,
                  have: have.count, of: minutes.count, need: minDays, today: todayValue, average: avg, target: target)
  }

  /// Gam đạm mỗi ngày có ghi bữa.
  public static func nutrition(_ protein: [Double?], target: Double, today: Double? = nil) -> Result {
    ratioGroup(.nutrition, protein, target: target, ratio: proteinRatio, today: today)
  }

  /// Điểm sẵn sàng của ngày ĐO ĐƯỢC phục hồi (ngày chỉ có tải tập = `nil`).
  public static func recovery(_ scores: [Double?], today todayValue: Double? = nil) -> Result {
    let have = scores.compactMap { $0 }
    guard have.count >= minDays else {
      return Result(group: .recovery, level: .insufficient, have: have.count, of: scores.count, need: minDays,
                    today: todayValue, average: nil, target: readinessGood)
    }
    let avg = mean(have)
    return Result(group: .recovery, level: avg >= readinessGood ? .good : .attention, have: have.count,
                  of: scores.count, need: minDays, today: todayValue, average: avg, target: readinessGood)
  }

  public enum WeightGoal: String, Sendable, Hashable { case lose, maintain, gain }

  /// `profiles.goal` → hướng cân: cut → giảm, bulk → tăng, còn lại → giữ.
  public static func weightGoal(_ goal: String?) -> WeightGoal {
    switch goal {
    case "cut": .lose
    case "bulk": .gain
    default: .maintain
    }
  }

  /// Thay đổi trung bình mỗi tuần (kg) từ lần cân đầu tới lần cuối. `nil` khi hai lần
  /// ấy cách nhau dưới `minRateDays` ngày.
  public static func weeklyChangeKg(_ weights: [Weigh]) -> Double? {
    guard let first = weights.first, let last = weights.last else { return nil }
    let days = last.date.daysSinceEpoch - first.date.daysSinceEpoch
    guard days >= minRateDays else { return nil }
    return (last.kg - first.kg) / (Double(days) / 7)
  }

  /// Lần cân trong 4 tuần, cũ → mới.
  public static func body(_ weights: [Weigh], goal: WeightGoal) -> Result {
    let kgs = weights.map(\.kg)
    guard kgs.count >= minDays, let first = kgs.first, let last = kgs.last else {
      return Result(group: .body, level: .insufficient, have: kgs.count, of: weightDays, need: minDays,
                    today: kgs.last, average: nil, target: nil)
    }
    let change = last - first
    let weekly = weeklyChangeKg(weights)
    let percent = weekly.map { first > 0 ? $0 / first * 100 : 0 } ?? 0
    let note: BodyNote? = switch goal {
    case .lose:
      change > directionSlackKg ? .offTrack : percent < -maxWeeklyChangePercent ? .losingFast : nil
    case .gain:
      change < -directionSlackKg ? .offTrack : percent > maxWeeklyChangePercent ? .gainingFast : nil
    case .maintain:
      abs(change) <= maintainBandKg ? nil : .offTrack
    }
    let recent = Array(kgs.suffix(windowDays))
    return Result(group: .body, level: note == nil ? .good : .attention, have: kgs.count, of: weightDays,
                  need: minDays, today: last, average: mean(recent), target: change, weeklyKg: weekly, bodyNote: note)
  }

  // MARK: - Thứ tự, câu đầu trang

  /// Cần chú ý lên trước, rồi Tốt, Chưa đủ dữ liệu cuối; cùng mức giữ thứ tự nhóm.
  public static func ordered(_ results: [Result]) -> [Result] {
    let rank: [Level: Int] = [.attention: 0, .good: 1, .insufficient: 2]
    return results.enumerated().sorted { a, b in
      let ra = rank[a.element.level]!, rb = rank[b.element.level]!
      return ra == rb ? a.offset < b.offset : ra < rb
    }.map(\.element)
  }

  /// Câu "Tuần này": nhóm cần chú ý đầu tiên theo thứ tự ưu tiên (tập → ăn → ngủ →
  /// vận động → hồi phục → cơ thể); không có thì `nil` (màn nói "đang đúng hướng").
  public static let focusOrder: [Group] = [.training, .nutrition, .sleep, .steps, .recovery, .body]
  public static func focus(_ results: [Result]) -> [Group] {
    focusOrder.filter { g in results.contains { $0.group == g && $0.level == .attention } }
  }

  // MARK: - Hàng → ngày

  /// 7 ngày TRƯỚC `today` (cũ → mới) — `AverageWindow`, chung mọi màn.
  public static func window(_ today: LocalDate) -> [LocalDate] {
    AverageWindow.days(before: today)
  }

  /// Giá trị một cột của `daily_logs` theo 7 ngày; ≤ 0 hay thiếu = `nil`.
  public static func column(_ rows: [JSONValue], _ key: String, days: [LocalDate]) -> [Double?] {
    var byDay: [LocalDate: Double] = [:]
    for r in rows {
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { continue }
      let v = JS.number(r[key])
      if v > 0, v.isFinite { byDay[d] = v }
    }
    return days.map { byDay[$0] }
  }

  /// Sẵn sàng chỉ của ngày đo được phục hồi (`readiness_explain` có hrv / rhr / sleep).
  public static func measuredReadiness(_ rows: [JSONValue], days: [LocalDate]) -> [Double?] {
    var byDay: [LocalDate: Double] = [:]
    for r in rows {
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init), recoveryMeasured(r["readiness_explain"]?.stringValue)
      else { continue }
      let v = JS.number(r["readiness_score"])
      if v > 0, v.isFinite { byDay[d] = v }
    }
    return days.map { byDay[$0] }
  }

  /// "hrv:30|load:45|sleep:88" — có ít nhất một khoá phục hồi mang số.
  public static func recoveryMeasured(_ explain: String?) -> Bool {
    guard let explain else { return false }
    return explain.split(separator: "|").contains { part in
      let bits = part.split(separator: ":", maxSplits: 1)
      guard bits.count == 2, ["hrv", "rhr", "sleep"].contains(String(bits[0])) else { return false }
      return Double(bits[1]) != nil
    }
  }

  static func mean(_ a: [Double]) -> Double { a.isEmpty ? 0 : a.reduce(0, +) / Double(a.count) }

  private static func ratioGroup(_ g: Group, _ days: [Double?], target: Double, ratio: Double, today todayValue: Double?)
    -> Result
  {
    let have = days.compactMap { $0 }
    guard have.count >= minDays, target > 0 else {
      return Result(group: g, level: .insufficient, have: have.count, of: days.count, need: minDays,
                    today: todayValue, average: have.isEmpty ? nil : mean(have), target: target)
    }
    let avg = mean(have)
    return Result(group: g, level: avg >= target * ratio ? .good : .attention, have: have.count, of: days.count,
                  need: minDays, today: todayValue, average: avg, target: target)
  }
}

/// Số liệu Tiến bộ của MỘT tài khoản: 7 ngày `daily_logs`, 4 tuần cân, mục tiêu hồ sơ.
/// Tập luyện đến từ lịch đã áp (Tuần của Koa) — app đưa vào khi tính.
@MainActor @Observable
public final class ProgressStatusBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready(Snapshot)
  }

  public struct Snapshot: Sendable, Hashable {
    public let days: [LocalDate]
    public let steps: [Double?]
    public let sleepMinutes: [Double?]
    public let protein: [Double?]
    public let kcal: [Double?]
    public let waterMl: [Double?]
    public let readiness: [Double?]
    public let weights: [ProgressStatus.Weigh]
    public let proteinTarget: Double
    public let kcalTarget: Double
    public let waterTargetMl: Double
    public let sleepTargetHours: Double
    public let weightGoal: ProgressStatus.WeightGoal
    /// Số của hôm nay (ngoài khung trung bình) — dòng "Hôm nay".
    public let today: Today
  }

  public struct Today: Sendable, Hashable {
    public let steps: Double?
    public let sleepMinutes: Double?
    public let protein: Double?
    public let readiness: Double?
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

  public func move(to day: LocalDate) async {
    today = day
    await load()
  }

  public func load() async {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let days = ProgressStatus.window(today)
    let logs = RowQuery(
      table: "daily_logs",
      columns: "date, steps, sleep_duration_min, protein_g, kcal, water_ml, readiness_score, readiness_explain",
      // Khung trung bình + hôm nay (hiện riêng).
      filters: [me, .gte("date", .string(days[0].description)), .lte("date", .string(today.description))])
    let weights = RowQuery(
      table: "weight_logs", columns: "date, weight_kg",
      filters: [me, .gte("date", .string(today.adding(days: -ProgressStatus.weightDays).description))],
      order: RowQuery.Order(column: "date", ascending: true))
    let profile = RowQuery(
      table: "profiles",
      columns: "goal, sleep_target_hours, macro_protein_g, tdee_target_kcal, water_target_ml", filters: [me])
    let store = self.store
    do {
      async let l = store.select(logs)
      async let w = store.select(weights)
      async let p = store.select(profile)
      let (rows, wRows, pRows) = try await (l, w, p)
      guard !closed else { return }
      let prof = pRows.first
      func target(_ key: String, _ fallback: Double) -> Double {
        let v = JS.number(prof?[key])
        return v > 0 && v.isFinite ? v : fallback
      }
      phase = .ready(Snapshot(
        days: days,
        steps: ProgressStatus.column(rows, "steps", days: days),
        sleepMinutes: ProgressStatus.column(rows, "sleep_duration_min", days: days),
        protein: ProgressStatus.column(rows, "protein_g", days: days),
        kcal: ProgressStatus.column(rows, "kcal", days: days),
        waterMl: ProgressStatus.column(rows, "water_ml", days: days),
        readiness: ProgressStatus.measuredReadiness(rows, days: days),
        weights: wRows.compactMap { r in
          let v = JS.number(r["weight_kg"])
          guard v > 0, v.isFinite, let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { return nil }
          return ProgressStatus.Weigh(date: d, kg: v)
        },
        proteinTarget: target("macro_protein_g", 140), kcalTarget: target("tdee_target_kcal", 2200),
        waterTargetMl: target("water_target_ml", 2500), sleepTargetHours: target("sleep_target_hours", 8),
        weightGoal: ProgressStatus.weightGoal(prof?["goal"]?.stringValue),
        today: Today(
          steps: ProgressStatus.column(rows, "steps", days: [today])[0],
          sleepMinutes: ProgressStatus.column(rows, "sleep_duration_min", days: [today])[0],
          protein: ProgressStatus.column(rows, "protein_g", days: [today])[0],
          readiness: ProgressStatus.measuredReadiness(rows, days: [today])[0])))
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }

  /// Năm nhóm từ số liệu; Tập luyện do app đưa (`training`).
  public func results(training: ProgressStatus.Result, stepsGoal: Double) -> [ProgressStatus.Result]? {
    guard case .ready(let d) = phase else { return nil }
    return [
      training,
      ProgressStatus.steps(d.steps, goal: stepsGoal, today: d.today.steps),
      ProgressStatus.nutrition(d.protein, target: d.proteinTarget, today: d.today.protein),
      ProgressStatus.sleep(d.sleepMinutes, targetHours: d.sleepTargetHours, today: d.today.sleepMinutes),
      ProgressStatus.recovery(d.readiness, today: d.today.readiness),
      ProgressStatus.body(d.weights, goal: d.weightGoal),
    ]
  }
}

extension ProgressStatus {
  /// Tập luyện từ Tuần của Koa: ngày có buổi, buổi theo lịch trước hôm nay, cả tuần.
  public static func training(_ week: KoaWeek.State?, today: LocalDate) -> Result {
    guard let week else { return training(done: 0, dueBeforeToday: 0, planned: nil) }
    let due = week.days.filter { $0.planned && $0.date < today }.count
    return training(done: week.done, dueBeforeToday: due, planned: week.target)
  }
}
