public import Foundation
public import Observation

/// Ghi số đo cơ thể (#527) — `app/log-measurement.tsx` + `useUpsertBodyMeasurement`
/// (`hooks/use-fitness-data.ts:1040`) + `case 'measurement'` của
/// `offline-write.ts:611`. Golden THẬT: `MeasurementLogGoldenTests`.
///
/// RN behavior (giữ nguyên):
/// - 12 ô (11 vòng đo + mỡ cơ thể), ô nào trống thì không gửi; một hàng mỗi
///   (người, ngày) trong `body_measurements`: upsert `onConflict: 'user_id,date'`
///   — ghi lại cùng ngày là SỬA;
/// - vòng đo gõ theo đơn vị chiều dài của tài khoản (`units_height` cm / in),
///   quy về cm TRƯỚC khi so `BOUNDS.circumference_cm` 10–300, lưu cm làm tròn
///   0,1; mỡ cơ thể là % ở cả hai hệ, so `BOUNDS.body_fat_pct` 2–75 như gõ;
/// - lưu được khi có ít nhất một ô là số và không ô nào sai;
/// - mất mạng lúc chạm: xếp hàng bền (`kind: 'measurement'`), "đã lưu — sẽ
///   đồng bộ", nút chết luôn; KHÔNG dựng lại `daily_logs` (không có trường số đo).
public enum MeasurementLog {
  /// `kind` của outbox (`OfflineWrite` `kind: 'measurement'`).
  public static let kind = "measurement"

  /// `FIELDS` của màn, đúng thứ tự (hai cột).
  public enum Field: String, Sendable, Hashable, CaseIterable {
    case neck = "neck_cm"
    case shoulders = "shoulders_cm"
    case chest = "chest_cm"
    case waist = "waist_cm"
    case hips = "hips_cm"
    case bicepLeft = "bicep_left_cm"
    case bicepRight = "bicep_right_cm"
    case thighLeft = "thigh_left_cm"
    case thighRight = "thigh_right_cm"
    case calfLeft = "calf_left_cm"
    case calfRight = "calf_right_cm"
    case bodyFat = "body_fat_pct"
  }

  /// `useUnits().height`.
  public enum LengthUnit: String, Sendable, Hashable {
    case cm
    case inches = "in"

    /// `units_height` của hồ sơ; thiếu / lạ là cm (`useUnits`).
    public init(profile: String?) { self = profile == "in" ? .inches : .cm }

    public var label: String { rawValue }
  }

  /// `BOUNDS.circumference_cm` (`plausible.ts:149`), `BOUNDS.body_fat_pct` (`:146`).
  public static let circumferenceBounds = 10.0...300.0
  public static let bodyFatBounds = 2.0...75.0

  /// `lengthToCm`.
  public static func cm(_ value: Double, _ unit: LengthUnit) -> Double {
    unit == .inches ? value * Units.cmPerIn : value
  }

  /// `displayLength(cm, unit)`: một chữ số lẻ.
  static func display(_ cm: Double, _ unit: LengthUnit) -> Double {
    JS.round((unit == .inches ? cm / Units.cmPerIn : cm) * 10) / 10
  }

  /// Ô sai ra sao (`errorFor`) — câu `outOfRange` với ba vế ấy.
  public struct Problem: Sendable, Hashable {
    public let min: String
    public let max: String
    public let unit: String
  }

  /// `errorFor(key)`: trống → không sai; không phải số → "0 – —"; ngoài cận.
  public static func problem(_ field: Field, _ text: String, unit: LengthUnit) -> Problem? {
    let raw = RepEntry.trimJS(text)
    guard !raw.isEmpty else { return nil }
    let n = JS.number(.string(raw))
    guard n.isFinite else { return Problem(min: "0", max: "—", unit: "") }
    if field == .bodyFat {
      return bodyFatBounds.contains(n) ? nil : Problem(min: "2", max: "75", unit: "%")
    }
    return circumferenceBounds.contains(cm(n, unit))
      ? nil
      : Problem(
        min: Units.text(JS.round(display(circumferenceBounds.lowerBound, unit))),
        max: Units.text(JS.round(display(circumferenceBounds.upperBound, unit))),
        unit: unit.label)
  }

  /// Giá trị gửi đi của một ô (`save`): `nil` khi trống / không phải số.
  static func value(_ field: Field, _ text: String, unit: LengthUnit) -> Double? {
    let raw = RepEntry.trimJS(text)
    guard !raw.isEmpty else { return nil }
    let n = JS.number(.string(raw))
    guard !n.isNaN else { return nil }
    return field == .bodyFat ? n : JS.round(cm(n, unit) * 10) / 10
  }

  /// `canSave` trừ phần "đang gửi": có ô là số và không ô nào sai.
  public static func canSave(_ fields: [Field: String], unit: LengthUnit) -> Bool {
    let hasValue = Field.allCases.contains { value($0, fields[$0] ?? "", unit: unit) != nil }
    let anyBad = Field.allCases.contains { problem($0, fields[$0] ?? "", unit: unit) != nil }
    return hasValue && !anyBad
  }

  /// Hàng upsert: `{ user_id, date, …ô có số }` — cùng hàng cho online và phát lại.
  public static func row(userId: String, date: LocalDate, fields: [Field: String], unit: LengthUnit) -> JSONValue {
    var o: [String: JSONValue] = ["user_id": .string(userId), "date": .string(date.description)]
    for f in Field.allCases {
      if let v = value(f, fields[f] ?? "", unit: unit) { o[f.rawValue] = .number(v) }
    }
    return .object(o)
  }

  /// Hàng outbox `measurement` có dùng được không: của chính chủ, ngày hợp lệ,
  /// mọi cột khác là một ô đã biết mang số hữu hạn trong cận (đã quy cm).
  public static func isRow(_ e: OutboxEntry) -> Bool {
    guard e.kind == kind, case .object(let o) = e.payload,
      o["user_id"]?.stringValue?.lowercased() == e.userId.lowercased(),
      o["date"]?.stringValue.flatMap({ LocalDate($0) }) != nil
    else { return false }
    var any = false
    for (k, v) in o where k != "user_id" && k != "date" {
      guard let f = Field(rawValue: k), let n = v.doubleValue, n.isFinite else { return false }
      guard (f == .bodyFat ? bodyFatBounds : circumferenceBounds).contains(n) else { return false }
      any = true
    }
    return any
  }
}

/// Ghi `body_measurements` khi có mạng (`ASCNDBackend.SupabaseMeasurementLog`).
public protocol MeasurementLogSource: Sendable {
  /// `useUpsertBodyMeasurement`: upsert theo `(user_id, date)`.
  func upsert(_ row: JSONValue) async throws
}

/// Màn ghi số đo của MỘT người.
@MainActor @Observable
public final class MeasurementLogger {
  public enum Outcome: Sendable, Hashable {
    /// Server đã nhận.
    case saved
    /// Mất mạng: đã giữ trên máy, sẽ gửi.
    case queued
    /// Không có ô nào là số, hay có ô sai — không gửi.
    case invalid
    /// Mất mạng giữa chừng / lỗi server: không gì được ghi.
    case offline
    case failed
    /// Sổ đã đóng / đang gửi / đã lưu / đã xếp hàng.
    case unavailable
  }

  public let userId: String
  public private(set) var submitting = false
  /// Đã lưu hay đã xếp hàng: nút chết luôn (`isSuccess`).
  public private(set) var done = false

  @ObservationIgnored private let source: any MeasurementLogSource
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any MeasurementLogSource, store: (any PlanWriteStore)?,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  public func close() { closed = true }

  /// Hôm nay địa phương — ngày lớn nhất được chọn (`maximumDate={new Date()}`).
  public var today: LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// `save`. Ngày sau hôm nay (đồng hồ vừa qua nửa đêm ngược) kẹp về hôm nay.
  public func submit(fields: [MeasurementLog.Field: String], unit: MeasurementLog.LengthUnit, date: LocalDate, online: Bool)
    async -> Outcome
  {
    guard !closed, !submitting, !done else { return .unavailable }
    guard MeasurementLog.canSave(fields, unit: unit) else { return .invalid }
    let day = min(date, today)
    let row = MeasurementLog.row(userId: userId, date: day, fields: fields, unit: unit)
    if !online {
      guard let store else { return .unavailable }
      let entry = OutboxEntry(
        id: makeId().lowercased(), userId: userId, kind: MeasurementLog.kind, payload: row, createdAt: clock.nowMillis())
      do {
        try await store.enqueue([entry])
      } catch {
        return .failed
      }
      done = true
      onEnqueued(entry)
      return .queued
    }
    submitting = true
    defer { if !closed { submitting = false } }
    do {
      try await source.upsert(row)
    } catch {
      return NetworkFailure.isOffline(error) ? .offline : .failed
    }
    if !closed { done = true }
    return .saved
  }
}
