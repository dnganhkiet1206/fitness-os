public import Foundation
public import Observation

/// Ghi cân nặng (#527 Phase 4) — `app/log-weight.tsx` + `useWeightWrite`
/// (`hooks/use-weight-write.ts`) + `useLogWeight` / `useTodayWeight`
/// (`hooks/use-fitness-data.ts`) + `syncProfileWeight` (`lib/weight-sync.ts`) +
/// `case 'weight'` của `offline-write.ts`.
///
/// RN behavior (giữ nguyên):
/// - một hàng mỗi (người, ngày địa phương) trong `weight_logs`: upsert
///   `onConflict: 'user_id,date'` — ghi lại hôm nay là SỬA, không thêm hàng;
/// - người dùng chọn trên thước theo đơn vị đang hiện; quy về kg TRƯỚC khi so
///   dải `BOUNDS.weight_kg` 20–400 kg;
/// - hạt giống: cân hôm nay ?? `profile.weight_kg` ?? 70;
/// - server nhận rồi thì `profiles.weight_kg` theo — chỉ khi không có lần cân
///   nào SAU ngày ấy (`syncProfileWeight`);
/// - mất mạng lúc chạm: xếp hàng bền (`kind: 'weight'`), nói "đã lưu — sẽ đồng
///   bộ", và nút chết luôn (chạm lần hai không xếp thêm lần cân);
/// - KHÔNG dựng lại `daily_logs` (cả online lẫn lúc phát lại).
public enum WeightLog {
  /// `kind` của outbox (`OfflineWrite` `kind: 'weight'`).
  public static let kind = "weight"
  /// `DEFAULT_KG` của màn.
  public static let defaultKg = 70.0

  /// `plausible('weight_kg', kg)`: số hữu hạn trong `[20, 400]`.
  public static func plausible(_ kg: Double) -> Bool {
    kg.isFinite && FitnessCalc.weightBounds.contains(kg)
  }

  /// `todayWeight ?? profileKg ?? DEFAULT_KG`.
  public static func seedKg(today: Double?, profile: Double?) -> Double {
    today ?? profile ?? defaultKg
  }

  /// Dải theo đơn vị đang hiện cho câu báo lỗi (`displayWeight(min/max, unit)`).
  public static func boundsText(_ unit: WeightUnit) -> (min: String, max: String) {
    let lo = Units.displayWeight(FitnessCalc.weightBounds.lowerBound, unit: unit.rawValue)
    let hi = Units.displayWeight(FitnessCalc.weightBounds.upperBound, unit: unit.rawValue)
    return (Units.text(lo), Units.text(hi))
  }

  /// Hàng `upsert` của `useLogWeight` / phát lại: `notes: ''` như bản online.
  public static func row(userId: String, kg: Double, date: LocalDate) -> JSONValue {
    .object([
      "user_id": .string(userId), "date": .string(date.description), "weight_kg": .number(kg),
      "notes": .string(""),
    ])
  }

  /// Một lần cân xếp hàng lúc mất mạng. Mỗi cú chạm một id: hai lần sửa cùng
  /// ngày phát lại theo thứ tự, lần sau thắng — như hàng đợi RN.
  public static func entry(id: String, userId: String, kg: Double, date: LocalDate, createdAt: EpochMillis)
    -> OutboxEntry
  {
    OutboxEntry(id: id.lowercased(), userId: userId, kind: kind, payload: row(userId: userId, kg: kg, date: date),
                createdAt: createdAt)
  }

  /// Hàng outbox `weight` có dùng được không: của chính chủ, ngày hợp lệ, cân
  /// trong dải — một hàng hỏng không bao giờ chạm `profiles` / `weight_logs`.
  public static func isRow(_ e: OutboxEntry) -> Bool {
    guard e.kind == kind, e.payload["user_id"]?.stringValue?.lowercased() == e.userId.lowercased(),
      e.payload["date"]?.stringValue.flatMap({ LocalDate($0) }) != nil,
      let kg = e.payload["weight_kg"]?.doubleValue, plausible(kg)
    else { return false }
    return true
  }
}

/// Đọc / ghi `weight_logs` khi có mạng (`ASCNDBackend.SupabaseWeightLog`).
public protocol WeightLogSource: Sendable {
  /// `useTodayWeight`: `weight_kg` của (người, ngày); `nil` khi chưa cân.
  func weight(userId: String, date: LocalDate) async throws -> Double?
  /// `useLogWeight`: upsert rồi `syncProfileWeight` — một lượt.
  func log(userId: String, kg: Double, date: LocalDate) async throws
}

/// Màn ghi cân của MỘT người.
@MainActor @Observable
public final class WeightLogger {
  public enum Outcome: Sendable, Hashable {
    /// Server đã nhận (và hồ sơ đã theo).
    case saved
    /// Mất mạng: đã giữ trên máy, sẽ gửi (`logMealQueued`).
    case queued
    /// Ngoài dải 20–400 kg — không gửi.
    case outOfRange
    /// Mất mạng giữa chừng / lỗi server: không gì được ghi.
    case offline
    case failed
    /// Sổ đã đóng / đang gửi / đã xếp hàng.
    case unavailable
  }

  public let userId: String
  /// Cân hôm nay đọc được; `nil` khi chưa cân HOẶC chưa đọc được (RN không
  /// phân biệt: hạt giống rơi về hồ sơ).
  public private(set) var todayKg: Double?
  public private(set) var loaded = false
  public private(set) var submitting = false
  /// Đã xếp hàng một lần cân: nút chết luôn (`queue.isSuccess`).
  public private(set) var queued = false

  /// `pending` của RN: đang gửi, hoặc đã xếp hàng.
  public var pending: Bool { submitting || queued }

  @ObservationIgnored private let source: any WeightLogSource
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  /// Server ĐÃ nhận lần cân của ngày ấy (nhánh online) — như `invalidateQueries`
  /// của `useLogWeight.onSuccess`. Không gọi khi xếp hàng / lỗi / ngoài dải.
  @ObservationIgnored private let onSaved: @MainActor (LocalDate) -> Void
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any WeightLogSource, store: (any PlanWriteStore)?,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in },
    onSaved: @escaping @MainActor (LocalDate) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
    self.onSaved = onSaved
  }

  /// Đóng màn / đổi tài khoản: lượt đọc về muộn không đổi gì nữa.
  public func close() { closed = true }

  private func today() -> LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// `useTodayWeight`. Đọc hỏng: như chưa cân — hạt giống rơi về hồ sơ.
  public func load() async {
    guard !closed else { return }
    let kg = try? await source.weight(userId: userId, date: today())
    guard !closed else { return }
    todayKg = kg
    loaded = true
  }

  /// `submit` của `useWeightWrite`. Ngày đọc lúc chạm.
  public func submit(kg: Double, online: Bool) async -> Outcome {
    guard !closed, !pending else { return .unavailable }
    guard kg > 0, WeightLog.plausible(kg) else { return .outOfRange }
    let day = today()
    if !online {
      guard let store else { return .unavailable }
      let entry = WeightLog.entry(id: makeId(), userId: userId, kg: kg, date: day, createdAt: clock.nowMillis())
      do {
        try await store.enqueue([entry])
      } catch {
        return .failed
      }
      queued = true
      onEnqueued(entry)
      return .queued
    }
    submitting = true
    defer { if !closed { submitting = false } }
    do {
      try await source.log(userId: userId, kg: kg, date: day)
    } catch {
      return NetworkFailure.isOffline(error) ? .offline : .failed
    }
    if !closed { todayKg = kg }
    // Server đã nhận dù màn vừa đóng: nơi khác (kế hoạch nhắc nhở) vẫn phải biết.
    onSaved(day)
    return .saved
  }
}
