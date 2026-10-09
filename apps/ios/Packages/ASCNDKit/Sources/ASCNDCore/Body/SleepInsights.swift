public import Foundation
public import Observation

/// Giấc ngủ (#527) — `app/sleep-insights.tsx`, `useSleepHistory`
/// (`use-today-data.ts`), `useDeleteSleepLog` (`use-fitness-data.ts`) @ fac9ac2.
///
/// Như RN: 7 ngày `sleep_logs` (theo `waketime`), độ dài một đêm là
/// `asleepMinutes` (ưu tiên `asleep_min` của HealthKit, không thì thức − ngủ);
/// tầng ngủ chỉ tính trên những đêm CÓ đo tầng (đêm ghi tay không phải "0 giờ
/// ngủ sâu"); mục tiêu = `sleep_target_hours` của hồ sơ, không có thì 8; lời
/// khuyên (thiếu ngủ / deep < 1h / REM < 1.2h / nợ > 5h / chất lượng ≥ 7);
/// trục biểu đồ chừa 15 % trên mục tiêu; danh sách mới → cũ, xoá một đêm phải
/// chạm ≥ 1 hàng rồi dựng lại `daily_logs` của ngày đó và hôm nay.
///
/// Khác RN: nợ ngủ tính trên SỐ ĐÊM ĐÃ GHI (RN: mục tiêu × 7 — hai đêm được ghi
/// thành "nợ 42 giờ"); có tiếng Tây Ban Nha.
public enum SleepInsights {
  public typealias Text3 = AssistantSuggestions.Text3

  public struct Night: Sendable, Hashable, Identifiable {
    public let id: String
    public let bedtime: EpochMillis?
    public let waketime: EpochMillis?
    /// `asleepMinutes`.
    public let minutes: Double
    public let deepH: Double
    public let remH: Double
    public let lightH: Double
    public let stagesKnown: Bool
    public let quality: Double

    public var totalH: Double { minutes / 60 }
  }

  public struct Stats: Sendable, Hashable {
    public let avgTotal: Double
    public let avgQuality: Double
    public let avgDeep: Double?
    public let avgRem: Double?
    public let debt: Double
  }

  public static let days = 7

  /// `useSleepHistory(7)`: `waketime >= bây giờ − 7 ngày lịch`, cũ → mới.
  public static func query(userId: String, now: EpochMillis, in tz: TimeZone) -> RowQuery {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let nowDate = Date(timeIntervalSince1970: TimeInterval(now.millis) / 1000)
    let from = cal.date(byAdding: .day, value: -days, to: nowDate) ?? nowDate
    return RowQuery(
      table: "sleep_logs", columns: "*",
      filters: [.eq("user_id", .string(userId)), .gte("waketime", .string(WorkoutSessionRecord.iso8601(EpochMillis(from))))],
      order: RowQuery.Order(column: "waketime", ascending: true))
  }

  public static func profileQuery(userId: String) -> RowQuery {
    RowQuery(
      table: "profiles", columns: "sleep_target_hours", filters: [.eq("user_id", .string(userId))], mode: .maybeSingle)
  }

  /// `Number(profile?.sleep_target_hours) || 8`.
  public static func targetHours(_ profile: JSONValue?) -> Double {
    let v = JS.number(profile?["sleep_target_hours"])
    return JS.truthy(v) ? v : 8
  }

  public static func night(_ row: JSONValue) -> Night? {
    guard let id = row["id"]?.stringValue else { return nil }
    let deep = JS.number(row["deep_min"])
    let rem = JS.number(row["rem_min"])
    let light = JS.number(row["light_min"])
    let ms = { (k: String) -> EpochMillis? in
      let v = DailyLog.millis(row[k])
      return v.isFinite ? EpochMillis(Int64(v)) : nil
    }
    return Night(
      id: id, bedtime: ms("bedtime"), waketime: ms("waketime"), minutes: DailyLog.asleepMinutes(row),
      deepH: deep / 60, remH: rem / 60, lightH: light / 60, stagesKnown: deep + rem + light > 0,
      quality: JS.number(row["quality"]))
  }

  public static func stats(_ nights: [Night], targetHours: Double) -> Stats? {
    guard !nights.isEmpty else { return nil }
    let n = Double(nights.count)
    let sumTotal = nights.reduce(0) { $0 + $1.totalH }
    let staged = nights.filter(\.stagesKnown)
    let avgDeep = staged.isEmpty ? nil : staged.reduce(0) { $0 + $1.deepH } / Double(staged.count)
    let avgRem = staged.isEmpty ? nil : staged.reduce(0) { $0 + $1.remH } / Double(staged.count)
    return Stats(
      avgTotal: sumTotal / n, avgQuality: nights.reduce(0) { $0 + $1.quality } / n, avgDeep: avgDeep, avgRem: avgRem,
      debt: max(0, targetHours * n - sumTotal))
  }

  private static func h(_ x: Double) -> String { ReadinessEngine.jsString(x) }

  public static func insights(_ s: Stats, targetHours: Double) -> [Text3] {
    var out: [Text3] = []
    if s.avgTotal < targetHours - 0.5 {
      let avg = JS.fixed(s.avgTotal, 1)
      let short = JS.fixed(targetHours - s.avgTotal, 1)
      out.append(
        Text3(
          vi: "Bạn ngủ trung bình \(avg)h, thiếu \(short)h so với mục tiêu.",
          en: "You sleep \(avg)h on average, short by \(short)h vs target.",
          es: "Duermes \(avg) h de media, \(short) h menos que tu objetivo."))
    }
    if let deep = s.avgDeep, deep < 1 {
      out.append(
        Text3(
          vi: "Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.",
          en: "Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.",
          es: "El sueño profundo es bajo (<1 h). Evita el alcohol y la cafeína antes de dormir."))
    }
    if let rem = s.avgRem, rem < 1.2 {
      out.append(
        Text3(
          vi: "REM sleep thấp. Cố gắng đi ngủ đều giờ hơn.", en: "REM sleep is low. Try to keep a consistent bedtime.",
          es: "El sueño REM es bajo. Intenta acostarte siempre a la misma hora."))
    }
    if s.debt > 5 {
      let debt = JS.fixed(s.debt, 1)
      out.append(
        Text3(
          vi: "Nợ giấc ngủ tuần: \(debt)h. Cân nhắc ngủ bù cuối tuần.",
          en: "Weekly sleep debt: \(debt)h. Consider catching up on weekends.",
          es: "Deuda de sueño semanal: \(debt) h. Plantéate recuperar el fin de semana."))
    }
    if s.avgQuality >= 7 {
      out.append(
        Text3(
          vi: "Chất lượng giấc ngủ tốt! Giữ vững thói quen.", en: "Sleep quality is good! Keep it up.",
          es: "¡Buena calidad de sueño! Sigue así."))
    }
    return out
  }

  /// Dòng dưới số giờ trung bình.
  public static func caption(_ s: Stats, targetHours: Double) -> Text3 {
    let t = h(targetHours)
    if s.avgTotal >= targetHours {
      return Text3(vi: "Đạt mục tiêu \(t)h", en: "Meeting your \(t)h target", es: "Cumples tu objetivo de \(t) h")
    }
    let short = JS.fixed(targetHours - s.avgTotal, 1)
    return Text3(
      vi: "Thiếu \(short)h so với mục tiêu \(t)h", en: "\(short)h short of your \(t)h target",
      es: "\(short) h por debajo de tu objetivo de \(t) h")
  }

  /// Ba ô chống lưng: chất lượng, deep ("—" khi không ai đo tầng), nợ ngủ.
  public static func metrics(_ s: Stats) -> (quality: String, deep: String, debt: String) {
    (JS.fixed(s.avgQuality, 1), s.avgDeep.map { "\(JS.fixed($0, 1))h" } ?? "—", "\(JS.fixed(s.debt, 1))h")
  }

  /// `Math.max(targetHours * 1.15, ...total_h)`.
  public static func maxH(_ nights: [Night], targetHours: Double) -> Double {
    nights.reduce(targetHours * 1.15) { max($0, $1.totalH) }
  }

  /// Số giờ trung bình của thẻ chủ (`HeroMetric` value + unit "h"): "7.2h".
  public static func hoursText(_ h: Double) -> String { "\(JS.fixed(h, 1))h" }

  /// Giờ ngủ của một hàng: "7h05".
  public static func duration(_ minutes: Double) -> String {
    let m = Int(minutes)
    let r = m % 60
    return "\(m / 60)h\(r < 10 ? "0" : "")\(r)"
  }

  /// Ngày cần dựng lại khi xoá một đêm: ngày của `waketime` và hôm nay.
  public static func rebuildDays(waketime: EpochMillis, now: EpochMillis, in tz: TimeZone) -> [LocalDate] {
    Biometrics.rebuildDays(sampleAt: waketime, now: now, in: tz)
  }
}

/// Lệnh xoá một đêm (`sleep_logs`), lọc `id` VÀ `user_id`, trả số hàng đã chạm.
public protocol SleepLogRemover: Sendable {
  func deleteNight(id: String, userId: String) async throws(RowStoreError) -> Int
}

/// Màn Giấc ngủ của MỘT tài khoản.
@MainActor @Observable
public final class SleepInsightsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    /// Cũ → mới.
    case ready([SleepInsights.Night], targetHours: Double)
  }

  public typealias DeleteOutcome = BiometricsBook.DeleteOutcome

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var deleting = false

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let remover: any SleepLogRemover
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var closed = false

  public init(
    userId: String, store: any RowStore, remover: any SleepLogRemover, clock: any WallClock = SystemWallClock(),
    timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.store = store
    self.remover = remover
    self.clock = clock
    self.timeZone = timeZone
  }

  public func close() { closed = true }

  /// Đọc (lại) đêm + mục tiêu. Đọc đêm hỏng → lỗi (RN: `LoadFailed`), không
  /// bao giờ "chưa có dữ liệu"; đọc lại hỏng khi đã có số thì giữ số. Hồ sơ
  /// hỏng thì mục tiêu 8 như RN (`profile` chưa có).
  public func load() async {
    let store = self.store
    let uid = userId
    let q = SleepInsights.query(userId: uid, now: clock.nowMillis(), in: timeZone)
    async let profile = try? await store.select(SleepInsights.profileQuery(userId: uid))
    let rows: [JSONValue]
    do {
      rows = try await store.select(q)
    } catch {
      _ = await profile
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed
      return
    }
    let p = await profile
    guard !closed else { return }
    phase = .ready(rows.compactMap(SleepInsights.night), targetHours: SleepInsights.targetHours(p?.first))
  }

  /// Xoá một đêm rồi dựng lại ngày ấy và hôm nay; xong thì đọc lại.
  public func delete(_ night: SleepInsights.Night) async -> DeleteOutcome {
    guard !deleting, !closed else { return .failed }
    deleting = true
    defer { deleting = false }
    let touched: Int
    do {
      touched = try await remover.deleteNight(id: night.id, userId: userId)
    } catch {
      return .failed
    }
    guard touched > 0 else {
      await load()
      return .nothingWritten
    }
    let now = clock.nowMillis()
    var rebuilt = true
    if let wake = night.waketime {
      for day in SleepInsights.rebuildDays(waketime: wake, now: now, in: timeZone) {
        do {
          try await DailyLog.recompute(userId: userId, date: day, store: store, now: now, in: timeZone)
        } catch {
          rebuilt = false
          break
        }
      }
    }
    await load()
    return rebuilt ? .deleted : .rebuildFailed
  }
}
