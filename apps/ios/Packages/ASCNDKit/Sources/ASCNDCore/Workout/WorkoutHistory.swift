public import Foundation
public import Observation

/// Lịch sử buổi tập (#400) — màn "Các buổi đã tập" (`app/sessions.tsx`).
///
/// Nguồn baseline (`fac9ac2`):
/// - đọc: `useWorkoutSessions(90)` (`use-fitness-data.ts:848`) — các cột `id,
///   date_time, template_name, session_rpe, volume_load, pr_detected, sets`,
///   `user_id` của mình, mới trước;
/// - xoá: `useDeleteWorkoutSession` (`:210`) — `delete` theo `id` + `user_id`,
///   hỏi lại trước (`sessions.tsx:64`), rồi dựng lại `daily_log` của ngày ấy
///   và hôm nay.
///
/// Một dòng lịch sử — đúng các con số màn Tổng kết hiện cho buổi ấy, đếm cùng
/// một luật (`WorkoutSummary`).
public struct HistoryEntry: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  public let at: EpochMillis
  public let templateName: String
  public let sessionRpe: Int
  public let volumeKg: Int
  public let prDetected: Bool
  /// Set đã làm, không tính khởi động (như `WorkoutSummary.completedSets`).
  public let completedSets: Int
  public let exerciseCount: Int
  /// Cột `sets` nguyên văn — cho màn chi tiết (#428). Tuỳ chọn: cache ghi
  /// trước #428 không có, đọc ra `nil` (chi tiết khi ấy chưa có set, chờ lần
  /// làm mới) thay vì làm hỏng cả cache.
  public let sets: JSONValue?
  /// `volume_load` như đã lưu; `nil` khi cột trống (`volume_load != null` của
  /// `session-row.tsx` — không hiện "0 kg" cho một con số không có).
  public let volumeLoad: Int?

  public init(
    id: String, at: EpochMillis, templateName: String, sessionRpe: Int, volumeKg: Int, prDetected: Bool,
    completedSets: Int, exerciseCount: Int, sets: JSONValue? = nil, volumeLoad: Int? = nil
  ) {
    self.id = id
    self.at = at
    self.templateName = templateName
    self.sessionRpe = sessionRpe
    self.volumeKg = volumeKg
    self.prDetected = prDetected
    self.completedSets = completedSets
    self.exerciseCount = exerciseCount
    self.sets = sets
    self.volumeLoad = volumeLoad
  }

  /// Một hàng `workout_sessions` (server, hoặc payload outbox của buổi vừa
  /// chốt). Không có `id` hay thời điểm đọc được → `nil`: không đoán buổi ấy
  /// thuộc ngày nào.
  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue, !id.isEmpty,
      let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return nil }
    let sets = PersonalRecords.sets(fromJSON: row["sets"])
    let counted = sets.filter { !$0.warmup && ($0.reps > 0 || ($0.durationSec ?? 0) > 0) }
    self.init(
      id: id.lowercased(), at: at,
      templateName: row["template_name"]?.stringValue ?? "Workout",
      sessionRpe: PersonalRecords.jsNumber(row["session_rpe"]).map { Int($0) } ?? 0,
      volumeKg: PersonalRecords.jsNumber(row["volume_load"]).map { Int($0) } ?? 0,
      prDetected: row["pr_detected"]?.boolValue == true,
      completedSets: counted.count,
      exerciseCount: Set(counted.map { PersonalRecords.exerciseKey($0.exerciseName) }).count,
      sets: row["sets"],
      volumeLoad: row["volume_load"] == nil || row["volume_load"] == .null
        ? nil : PersonalRecords.jsNumber(row["volume_load"]).map { Int($0) })
  }

  /// Mới trước (`.order('date_time', { ascending: false })`); cùng thời điểm
  /// thì theo id, để thứ tự không đổi giữa hai lần đọc.
  static func newestFirst(_ a: HistoryEntry, _ b: HistoryEntry) -> Bool {
    a.at != b.at ? a.at > b.at : a.id < b.id
  }
}

/// Đọc từ server (`ASCNDBackend.SupabaseHistorySource`): các hàng thô.
public protocol HistorySource: Sendable {
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue]
}

/// Cache theo người dùng (`ASCNDStore`, bảng `read_cache`).
public protocol HistoryCache: Sendable {
  func load(userId: String) async throws -> [HistoryEntry]?
  func save(userId: String, _ entries: [HistoryEntry]) async throws
}

/// Read model lịch sử, local-first — cùng mẫu với `RecordBook` / `PerformanceBook`.
///
/// RN behavior: đọc 90 ngày mỗi lần mở màn; offline thì lỗi; xoá chỉ online,
///   đợi server rồi mới biến khỏi danh sách.
/// Native behavior: cache hiện ngay (kể cả offline); buổi vừa chốt hiện ngay,
///   không đợi sync (`absorb`, WH-4a); xoá biến khỏi danh sách ngay và đi qua
///   outbox (chạy cả offline, idempotent) — cùng đường xoá với #398.
/// Chưa port: dựng lại `daily_log` / readiness sau khi xoá (WH-3a) — thuộc
///   quyết định #266.
@MainActor @Observable
public final class HistoryBook {
  /// Cửa sổ của màn (`sessions.tsx:27`, `DAYS = 90`).
  public static let windowDays = 90

  public let userId: String
  /// Mới trước.
  public private(set) var entries: [HistoryEntry] = []
  /// Đã có gì để hiện chưa (cache hoặc server).
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?

  @ObservationIgnored private let source: any HistorySource
  @ObservationIgnored private let cache: any HistoryCache
  @ObservationIgnored private let store: any WorkoutStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  /// Buổi đã xoá trên máy mà server có thể chưa biết — lần làm mới không được
  /// hồi sinh chúng trước khi lệnh xoá tới nơi.
  @ObservationIgnored private var deleted: Set<String> = []
  /// Buổi vừa xoá (id, thời điểm) — `WorkoutFlow` nối vào để Today, "lần
  /// trước" và buổi tập đang mở theo ngay.
  @ObservationIgnored public var onDeleted: (@MainActor (String, EpochMillis) async -> Void)?

  public init(
    userId: String, source: any HistorySource, cache: any HistoryCache, store: any WorkoutStore,
    clock: any WallClock = SystemWallClock(),
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.store = store
    self.clock = clock
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  /// Cache trước, rồi server.
  public func load() async {
    if !loaded, let cached = try? await cache.load(userId: userId) {
      entries = cached.filter { !deleted.contains($0.id) }
      loaded = true
    }
    await refresh()
  }

  public func refresh() async {
    let since = clock.nowMillis() - Int64(Self.windowDays) * 86_400_000
    do {
      let rows = try await source.sessions(userId: userId, since: since)
      var seen = Set<String>()
      entries = rows.compactMap(HistoryEntry.init(row:))
        .filter { !deleted.contains($0.id) && seen.insert($0.id).inserted }
        .sorted(by: HistoryEntry.newestFirst)
      loaded = true
      failure = nil
      try? await cache.save(userId: userId, entries)
    } catch {
      failure = TodayController.failure([error])
    }
  }

  /// Hàng outbox vừa bền (chốt / nối / gỡ set / xoá): danh sách theo ngay.
  public func absorb(_ entry: OutboxEntry) async {
    if entry.kind == WorkoutSessionRecord.deleteKind {
      guard let id = entry.payload["id"]?.stringValue else { return }
      deleted.insert(id)
      entries.removeAll { $0.id == id }
    } else {
      guard let e = HistoryEntry(row: entry.payload) else { return }
      deleted.remove(e.id)
      entries.removeAll { $0.id == e.id }
      entries.append(e)
      entries.sort(by: HistoryEntry.newestFirst)
    }
    loaded = true
    try? await cache.save(userId: userId, entries)
  }

  public enum DeleteRefusal: Error, Sendable, Hashable {
    /// Không có buổi này trong lịch sử của mình (WH-2b: không xoá được buổi
    /// của người khác — cache theo người dùng, server lọc thêm `user_id`).
    case notFound
    case storage(LocalWriteError)
  }

  /// Xoá một buổi (màn hỏi lại TRƯỚC, `sessions.tsx:64`). Bền trên máy rồi mới
  /// trả về; buổi biến khỏi danh sách ngay.
  ///
  /// Cùng một giao dịch: hàng outbox xoá + mở khoá ngày đã chốt trên máy (nếu
  /// buổi ấy được chốt ở máy này) — không thì Today vẫn "đã tập" và lần nối
  /// thêm sau dựng lại đúng buổi vừa xoá.
  public func delete(_ id: String) async throws(DeleteRefusal) {
    guard let victim = entries.first(where: { $0.id == id }) else { throw .notFound }
    let entry = OutboxEntry(
      id: "\(id)@del-\(makeId())", userId: userId, kind: WorkoutSessionRecord.deleteKind,
      payload: .object(["id": .string(id)]), createdAt: clock.nowMillis())
    do {
      try await store.commitDelete(sessionId: id, entry)
    } catch {
      throw .storage(LocalWriteError("\(error)"))
    }
    await absorb(entry)
    onEnqueued(entry)
    await onDeleted?(id, victim.at)
  }
}
