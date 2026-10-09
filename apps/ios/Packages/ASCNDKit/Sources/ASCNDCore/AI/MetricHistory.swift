public import Foundation
public import Observation

/// Dữ liệu 7 ngày cho bảng chỉ số của tab Trợ lý (#527) — các truy vấn
/// `useReadinessHistory` / `useSleepDurationHistory` / `useKcalHistory`
/// (`use-fitness-data.ts`) và `useBiometricHistory` (`use-biometrics.ts`) @
/// fac9ac2, cùng phép gom nhịp tim của `(tabs)/assistant.tsx`.
///
/// Như RN: giấc ngủ và calo đọc từ `daily_logs` (cùng cột với ô phía trên),
/// bỏ ngày ≤ 0; sẵn sàng bỏ hàng không có điểm; nhịp tim là số THẤP NHẤT của
/// mỗi ngày theo giờ máy (nhịp tim nghỉ, không phải trung bình cả ngày có buổi
/// tập); chỉ đọc loại đang chọn.
///
/// Khác RN: đọc hỏng là trạng thái lỗi có thử lại (RN: `data` rỗng → "Chưa có
/// ngày nào được ghi").
public enum MetricHistory {
  /// `localDaysAgoStr(days)`.
  public static func since(_ today: LocalDate) -> LocalDate { today.adding(days: -MetricAnalysis.windowDays) }

  public static func query(_ kind: MetricAnalysis.Kind, userId: String, today: LocalDate, now: EpochMillis, in tz: TimeZone)
    -> RowQuery
  {
    let user = RowQuery.Filter.eq("user_id", .string(userId))
    let from = JSONValue.string(since(today).description)
    let byDate = RowQuery.Order(column: "date", ascending: true)
    switch kind {
    case .readiness:
      return RowQuery(
        table: "daily_logs", columns: "date, readiness_score, readiness_status",
        filters: [user, .gte("date", from), .or("readiness_score.not.is.null")], order: byDate)
    case .sleep:
      return RowQuery(
        table: "daily_logs", columns: "date, sleep_duration_min",
        filters: [user, .gte("date", from), .or("sleep_duration_min.not.is.null")], order: byDate)
    case .kcal:
      return RowQuery(
        table: "daily_logs", columns: "date, kcal", filters: [user, .gte("date", from), .or("kcal.not.is.null")],
        order: byDate)
    case .hr:
      // `since.setDate(since.getDate() - days)`: cùng giờ, 7 ngày lịch trước.
      var cal = Calendar(identifier: .gregorian)
      cal.timeZone = tz
      let nowDate = Date(timeIntervalSince1970: TimeInterval(now.millis) / 1000)
      let back = cal.date(byAdding: .day, value: -MetricAnalysis.windowDays, to: nowDate) ?? nowDate
      return RowQuery(
        table: "biometric_samples", columns: "date_time, hr_bpm",
        filters: [user, .gte("date_time", .string(WorkoutSessionRecord.iso8601(EpochMillis(back))))],
        order: RowQuery.Order(column: "date_time", ascending: true))
    }
  }

  /// Hàng → điểm.
  public static func points(_ kind: MetricAnalysis.Kind, rows: [JSONValue], in tz: TimeZone) -> [MetricAnalysis.Point] {
    switch kind {
    case .readiness:
      return rows.compactMap { r in
        guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { return nil }
        let v = JS.number(r["readiness_score"])
        return MetricAnalysis.Point(date: d, value: JS.truthy(v) ? v : 0)
      }
    case .sleep, .kcal:
      let column = kind == .sleep ? "sleep_duration_min" : "kcal"
      return rows.compactMap { r in
        let v = JS.number(r[column])
        guard v > 0, let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { return nil }
        return MetricAnalysis.Point(date: d, value: v)
      }
    case .hr:
      var byDay: [LocalDate: Double] = [:]
      var order: [LocalDate] = []
      for s in rows {
        let hr = JS.number(s["hr_bpm"])
        guard JS.truthy(hr) else { continue }
        let ms = DailyLog.millis(s["date_time"])
        guard ms.isFinite else { continue }
        let day = LocalDate(EpochMillis(Int64(ms)), in: tz)
        if let cur = byDay[day] {
          byDay[day] = min(cur, hr)
        } else {
          byDay[day] = hr
          order.append(day)
        }
      }
      return order.map { MetricAnalysis.Point(date: $0, value: byDay[$0] ?? 0) }
    }
  }
}

/// Bảng chỉ số của MỘT tài khoản: loại đang chọn + phân tích của nó.
@MainActor @Observable
public final class MetricHistoryBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready(MetricAnalysis.Analysis)
  }

  public let userId: String
  public private(set) var kind: MetricAnalysis.Kind = .readiness
  public private(set) var phase: Phase = .loading
  public private(set) var today: LocalDate

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private let clock: @Sendable () -> EpochMillis
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var generation = 0

  public init(
    userId: String, today: LocalDate, store: any RowStore, in tz: TimeZone,
    clock: @escaping @Sendable () -> EpochMillis = { SystemWallClock().nowMillis() }
  ) {
    self.userId = userId
    self.today = today
    self.store = store
    self.tz = tz
    self.clock = clock
  }

  public func close() { closed = true }

  /// Chọn loại khác (chỉ loại ấy được đọc, như `enabled` của RN).
  public func select(_ k: MetricAnalysis.Kind, kcalTarget: Double) async {
    guard k != kind || phase == .failed else { return }
    kind = k
    phase = .loading
    await load(kcalTarget: kcalTarget)
  }

  public func move(to day: LocalDate, kcalTarget: Double) async {
    today = day
    await load(kcalTarget: kcalTarget)
  }

  /// Đọc loại đang chọn. Lượt về muộn của loại / ngày cũ không đè lượt mới.
  public func load(kcalTarget: Double) async {
    generation += 1
    let mine = generation
    let k = kind
    let day = today
    let q = MetricHistory.query(k, userId: userId, today: day, now: clock(), in: tz)
    let store = self.store
    let rows: [JSONValue]
    do {
      rows = try await store.select(q)
    } catch {
      guard !closed, mine == generation else { return }
      // Đọc lại hỏng khi đã có số của đúng loại: giữ số.
      if case .ready = phase { return }
      phase = .failed
      return
    }
    guard !closed, mine == generation else { return }
    let points = MetricHistory.points(k, rows: rows, in: tz)
    phase = .ready(MetricAnalysis.analyse(kind: k, points: points, today: day, kcalTarget: kcalTarget))
  }
}
