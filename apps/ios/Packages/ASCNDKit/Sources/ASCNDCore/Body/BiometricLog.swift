public import Foundation
public import Observation

/// Luật "số này do Apple Health đo" — `lib/health-owned.ts` @ fac9ac2, dùng
/// chung cho màn nhập sinh trắc và màn ghi giấc ngủ.
public enum HealthOwned {
  /// `MANUAL_SOURCE` (`biometric-source.ts:29`).
  static let manualSource = "manual"

  /// `fromHealth(row)`: `source` (bỏ khoảng trắng) có chữ và khác `manual`.
  public static func fromHealth(_ row: JSONValue?) -> Bool {
    guard case .string(let s)? = row?["source"] else { return false }
    let t = RepEntry.trimJS(s)
    return !t.isEmpty && t != manualSource
  }

  /// `healthValues(row, fields)`: chỉ hàng của Health; số hữu hạn > 0.
  public static func values(_ row: JSONValue?, _ fields: [String]) -> [String: Double] {
    guard fromHealth(row), let row else { return [:] }
    var out: [String: Double] = [:]
    for f in fields {
      let v = row[f] == nil ? Double.nan : JS.number(row[f])
      if v.isFinite, v > 0 { out[f] = v }
    }
    return out
  }

  /// `overriddenFields(owned, typed).length`: ô có số hữu hạn khác số của Health.
  public static func overridden(_ owned: [String: Double], typed: [String: Double?]) -> Int {
    owned.reduce(0) { n, kv in
      guard let t = typed[kv.key] ?? nil, t.isFinite else { return n }
      return t != kv.value ? n + 1 : n
    }
  }
}

/// Nhập chỉ số sinh trắc (#527) — `app/log-biometrics.tsx` + `useLogBiometrics`
/// (`hooks/use-biometrics.ts:76`) + `useTodayBiometrics` + `biometricRowToReplace`
/// + `case 'biometrics'` của `offline-write.ts`. Golden THẬT: `BiometricLogGoldenTests`.
///
/// RN behavior (giữ nguyên):
/// - năm ô (nhịp tim nghỉ, HRV RMSSD, SpO₂, VO₂max, nhịp thở), mỗi ô trống
///   hoặc đúng dạng số trong cận `plausible`; cộng câu hỏi buổi sáng: đau nhức
///   1…10 (chạm lại để bỏ) và "hôm nay bị ốm";
/// - lưu được khi có ô có chữ (kể cả chỉ dấu cách — như RN), hoặc đã trả lời
///   câu hỏi buổi sáng, và không ô nào sai;
/// - số của Apple Health hôm nay (nhịp tim, SpO₂, nhịp thở) điền sẵn MỘT lần;
///   đổi số ấy thì hỏi lại "N thứ sẽ thay số của Health";
/// - một bộ số mỗi ngày: hàng `manual` mới nhất của ngày ấy được SỬA, không có
///   thì thêm (`source: 'manual'`, `confidence: 0.7`, giờ lúc chạm); rồi dựng
///   lại `daily_logs` của ngày ấy; mất mạng xếp hàng `kind: 'biometrics'`.
///
/// Khác RN có chủ đích (`NATIVE_IMPROVEMENTS.md`): ghi ĐÈ hàng cần sửa (RN
/// `ignoreDuplicates: true` bỏ qua đúng hàng ấy — nhập lại trong ngày không đổi
/// gì, cả khi có mạng vì RN đi qua cùng `applyOfflineWrite`).
public enum BiometricLog {
  public static let kind = "biometrics"

  /// Năm ô, đúng thứ tự màn.
  public enum Field: String, Sendable, Hashable, CaseIterable {
    case hr = "hr_bpm"
    case hrv = "hrv_rmssd_ms"
    case spo2 = "spo2_pct"
    case vo2 = "vo2max_mlkgmin"
    case resp = "resp_rate_rpm"

    /// `BOUNDS` (`plausible.ts:105-131`).
    public var bounds: ClosedRange<Double> {
      switch self {
      case .hr: 20...250
      case .hrv: 1...500
      case .spo2: 50...100
      case .vo2: 10...100
      case .resp: 4...60
      }
    }
  }

  /// `HEALTH_OWNED_BIOMETRICS`.
  public static let healthOwned = ["hr_bpm", "spo2_pct", "resp_rate_rpm"]

  /// `outOfRangeMessage(q, text, …) != null`: có chữ mà sai dạng / ngoài cận.
  public static func bad(_ field: Field, _ text: String) -> Bool {
    let t = RepEntry.trimJS(text)
    return !t.isEmpty && FitnessCalc.readStat(t, field.bounds) == nil
  }

  /// `num(v)`: trống (sau trim) → `nil`, không thì `Number(v)`.
  public static func value(_ text: String) -> Double? {
    RepEntry.trimJS(text).isEmpty ? nil : JS.number(.string(text))
  }

  /// `hasAnyInput`: một ô có chữ (chưa trim — như RN), hoặc đã trả lời câu hỏi.
  public static func hasAnyInput(_ texts: [Field: String], soreness: Int?, ill: Bool) -> Bool {
    Field.allCases.contains { !(texts[$0] ?? "").isEmpty } || soreness != nil || ill
  }

  public static func canSave(_ texts: [Field: String], soreness: Int?, ill: Bool) -> Bool {
    hasAnyInput(texts, soreness: soreness, ill: ill) && !Field.allCases.contains { bad($0, texts[$0] ?? "") }
  }

  /// Bao nhiêu số của Health sẽ bị thay.
  public static func healthChanges(_ healthRow: JSONValue?, texts: [Field: String]) -> Int {
    let owned = HealthOwned.values(healthRow, healthOwned)
    var typed: [String: Double?] = [:]
    for f in [Field.hr, .spo2, .resp] { typed[f.rawValue] = value(texts[f] ?? "") }
    return HealthOwned.overridden(owned, typed: typed)
  }

  /// Ô điền sẵn từ Health (`String(owned.x)`).
  public static func prefill(_ healthRow: JSONValue?) -> [Field: String] {
    let owned = HealthOwned.values(healthRow, healthOwned)
    var out: [Field: String] = [:]
    for f in [Field.hr, .spo2, .resp] { if let v = owned[f.rawValue] { out[f] = Units.text(v) } }
    return out
  }

  /// Hàng `biometric_samples` của `case 'biometrics'`. Số không hữu hạn (ô
  /// sai không bao giờ tới đây) ghi `null` như `JSON.stringify`.
  public static func row(
    id: String, userId: String, at: EpochMillis, texts: [Field: String], soreness: Int?, ill: Bool
  ) -> [String: JSONValue] {
    func n(_ f: Field) -> JSONValue { value(texts[f] ?? "").map(JS.json) ?? .null }
    return [
      "id": .string(id), "user_id": .string(userId), "source": .string(HealthOwned.manualSource),
      "confidence": .number(0.7), "date_time": .string(WorkoutSessionRecord.iso8601(at)),
      "hr_bpm": n(.hr), "hrv_sdnn_ms": .null, "hrv_rmssd_ms": n(.hrv), "spo2_pct": n(.spo2),
      "resp_rate_rpm": n(.resp), "vo2max_mlkgmin": n(.vo2),
      "soreness_1_10": soreness.map { .number(Double($0)) } ?? .null, "illness_flag": .bool(ill),
    ]
  }

  /// `useTodayBiometrics`: hàng mới nhất có `date_time` trong ngày.
  public static func todayQuery(userId: String, day: LocalDate, in tz: TimeZone) -> RowQuery {
    let r = DailyLog.dayRange(day, in: tz)
    return RowQuery(
      table: "biometric_samples", columns: "*",
      filters: [.eq("user_id", .string(userId)), .gte("date_time", .string(r.start)), .lt("date_time", .string(r.end))],
      order: .init(column: "date_time", ascending: false), limit: 1)
  }

  /// `biometricRowToReplace`: hàng `manual` mới nhất trong ngày địa phương của `at`.
  public static func replaceQuery(userId: String, at: EpochMillis, in tz: TimeZone) -> RowQuery {
    let r = DailyLog.dayRange(LocalDate(at, in: tz), in: tz)
    return RowQuery(
      table: "biometric_samples", columns: "id",
      filters: [
        .eq("user_id", .string(userId)), .eq("source", .string(HealthOwned.manualSource)),
        .gte("date_time", .string(r.start)), .lt("date_time", .string(r.end)),
      ],
      order: .init(column: "date_time", ascending: false), limit: 1)
  }

  /// Hàng outbox `biometrics` dùng được: chính chủ, có id, giờ đọc được, nguồn tay.
  public static func isRow(_ e: OutboxEntry) -> Bool {
    guard e.kind == kind, case .object(let o) = e.payload,
      o["user_id"]?.stringValue?.lowercased() == e.userId.lowercased(),
      let id = o["id"]?.stringValue, !id.isEmpty, o["source"] == .string(HealthOwned.manualSource),
      SleepLog.millis(o["date_time"]) != nil
    else { return false }
    return true
  }

  /// `rebuildAfterReplay(userId, localDateStr(new Date(w.dateTime)))`.
  public static func day(_ e: OutboxEntry, in tz: TimeZone) -> LocalDate? {
    SleepLog.millis(e.payload["date_time"]).map { LocalDate(EpochMillis($0), in: tz) }
  }
}

/// Màn nhập sinh trắc của MỘT người, trên `RowStore` + outbox.
@MainActor @Observable
public final class BiometricLogger {
  public enum Outcome: Sendable, Hashable {
    case saved, queued, invalid, failed, unavailable
  }

  public let userId: String
  /// Hàng hôm nay nếu do Apple Health ghi; `nil` khi không có / chưa đọc.
  public private(set) var healthRow: JSONValue?
  public private(set) var loaded = false
  public private(set) var submitting = false
  public private(set) var done = false

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let outbox: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var closed = false

  public init(
    userId: String, store: any RowStore, outbox: (any PlanWriteStore)?,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.store = store
    self.outbox = outbox
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  public func close() { closed = true }

  /// `useTodayBiometrics`; chỉ giữ khi là hàng của Health. Đọc hỏng: như không có.
  public func load() async {
    guard !closed else { return }
    let now = clock.nowMillis()
    let rows = try? await store.select(
      BiometricLog.todayQuery(userId: userId, day: LocalDate(now, in: timeZone), in: timeZone))
    guard !closed else { return }
    let row = rows?.first
    healthRow = HealthOwned.fromHealth(row) ? row : nil
    loaded = true
  }

  /// Nút Lưu (sau hộp hỏi lại nếu có). Có mạng: tìm hàng `manual` hôm nay, ghi
  /// đè theo id ấy hay id mới, rồi dựng lại ngày. Mất mạng: xếp hàng.
  public func submit(texts: [BiometricLog.Field: String], soreness: Int?, ill: Bool, online: Bool) async -> Outcome {
    guard !closed, !submitting, !done else { return .unavailable }
    guard BiometricLog.canSave(texts, soreness: soreness, ill: ill) else { return .invalid }
    let now = clock.nowMillis()
    let id = makeId().lowercased()
    var row = BiometricLog.row(id: id, userId: userId, at: now, texts: texts, soreness: soreness, ill: ill)
    if !online {
      guard let outbox else { return .unavailable }
      let entry = OutboxEntry(id: id, userId: userId, kind: BiometricLog.kind, payload: .object(row), createdAt: now)
      do {
        try await outbox.enqueue([entry])
      } catch {
        return .failed
      }
      done = true
      onEnqueued(entry)
      return .queued
    }
    submitting = true
    defer { if !closed { submitting = false } }
    let found = try? await store.select(BiometricLog.replaceQuery(userId: userId, at: now, in: timeZone))
    if let replace = found?.first?["id"]?.stringValue { row["id"] = .string(replace) }
    do throws(RowStoreError) {
      try await store.upsert("biometric_samples", [row], onConflict: "id")
    } catch {
      return .failed
    }
    try? await DailyLog.recompute(userId: userId, date: LocalDate(now, in: timeZone), store: store, now: now, in: timeZone)
    if !closed { done = true }
    return .saved
  }
}
