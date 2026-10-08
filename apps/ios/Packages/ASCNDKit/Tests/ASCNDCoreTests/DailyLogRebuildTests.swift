@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Đường ghi của `recomputeDailyLog` (#266): ghi có điều kiện theo token đọc
/// TRƯỚC, bị chen thì làm lại, hết lượt thì chỉ chấp nhận khi hàng đang lưu đã
/// đúng số. Và ngày nào được dựng lại sau mỗi lệnh buổi tập (WH-3a).
struct DailyLogRebuildTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let now = EpochMillis(iso8601: "2026-10-05T10:00:00.000Z")!
  static let today = LocalDate("2026-10-05")!

  /// Bảng `daily_logs` có kịch bản: mọi nguồn khác rỗng.
  final class Scripted: RowStore, @unchecked Sendable {
    var row: JSONValue?
    /// Mỗi lần `update` / `insert`: kịch bản kế tiếp (nil = làm thật).
    var updateScript: [Int] = []
    var insertErrors: [RowStoreError] = []
    var failTable: String?
    var stored: JSONValue?
    var updates = 0, inserts = 0

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if q.table == failTable { throw RowStoreError(code: nil, message: "boom") }
      if q.table == "daily_logs" {
        if q.columns == "id, updated_at" { return row.map { [$0] } ?? [] }
        return stored.map { [$0] } ?? []
      }
      if q.mode == .single { throw RowStoreError(code: "PGRST116", message: "no rows") }
      return []
    }

    func insert(_ table: String, _ r: [String: JSONValue]) async throws(RowStoreError) {
      inserts += 1
      if !insertErrors.isEmpty {
        let e = insertErrors.removeFirst()
        // Máy khác vừa chèn hàng của cùng ngày.
        row = .object(["id": .string("dl-1"), "updated_at": .string("t1")])
        throw e
      }
      stored = .object(r)
    }

    func update(_ table: String, _ r: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
      updates += 1
      if !updateScript.isEmpty { return updateScript.removeFirst() }
      stored = .object(r)
      return 1
    }
  }

  func run(_ s: Scripted) async -> DailyLogRebuildError? {
    do {
      try await DailyLog.recompute(userId: "u1", date: Self.today, store: s, now: Self.now, in: Self.utc)
      return nil
    } catch {
      return error
    }
  }

  @Test func noRowInserts() async {
    let s = Scripted()
    #expect(await run(s) == nil)
    #expect(s.inserts == 1 && s.updates == 0)
    #expect(s.stored?["date"] == .string("2026-10-05"))
  }

  /// Bị chen giữa đọc token và ghi → làm lại từ đầu, lần sau thắng.
  @Test func lostRaceRetries() async {
    let s = Scripted()
    s.row = .object(["id": .string("dl-1"), "updated_at": .string("t0")])
    s.updateScript = [0]
    #expect(await run(s) == nil)
    #expect(s.updates == 2)
  }

  /// Hai máy cùng chèn hàng đầu tiên của ngày: 23505 → đọc lại, thành update.
  @Test func duplicateInsertBecomesUpdate() async {
    let s = Scripted()
    s.insertErrors = [RowStoreError(code: "23505", message: "dup")]
    #expect(await run(s) == nil)
    #expect(s.inserts == 1 && s.updates == 1)
  }

  @Test func otherInsertErrorThrows() async {
    let s = Scripted()
    s.insertErrors = [RowStoreError(code: "42501", message: "rls")]
    #expect(await run(s) != nil)
  }

  /// Hết 3 lượt: hàng đang lưu đã mang đúng số ta tính → chấp nhận; khác → lỗi.
  @Test func exhaustedAcceptsOnlyAMatchingRow() async throws {
    let s = Scripted()
    s.row = .object(["id": .string("dl-1"), "updated_at": .string("t0")])
    s.updateScript = [0, 0, 0]
    let mine = DailyLog.row(
      userId: "u1", date: Self.today,
      sources: .init(
        meals: [], workouts: [], sleeps: [], supplements: [], intakes: [], bio: [], profile: nil, bioHistory: [],
        load7d: [], load28d: [], sleeps7d: [], water: []),
      now: Self.now, in: Self.utc)
    s.stored = .object(mine)
    #expect(await run(s) == nil)
    #expect(s.updates == 3)

    let t = Scripted()
    t.row = s.row
    t.updateScript = [0, 0, 0]
    var other = mine
    other["kcal"] = .number(1200)
    t.stored = .object(other)
    #expect(await run(t) != nil)
  }

  /// Một nguồn đọc lỗi: KHÔNG ghi gì (hàng cũ ở yên).
  @Test func failedReadWritesNothing() async {
    let s = Scripted()
    s.failTable = "biometric_samples"
    #expect(await run(s) != nil)
    #expect(s.inserts == 0 && s.updates == 0)
  }

  /// Hồ sơ thiếu không phải lỗi: mục tiêu ngủ mặc định 8 giờ.
  @Test func missingProfileIsNotAFailure() async {
    let s = Scripted()
    #expect(await run(s) == nil)
    #expect(s.inserts == 1)
  }

  // MARK: - Ngày dựng lại

  func entry(_ kind: String, _ payload: [String: JSONValue]) -> OutboxEntry {
    OutboxEntry(id: "x", userId: "u1", kind: kind, payload: .object(payload), createdAt: Self.now)
  }

  @Test func deleteOfAPastSessionRebuildsThatDayAndToday() {
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [LocalDate("2026-10-03")!, Self.today])
  }

  @Test func todaysSessionRebuildsOnlyToday() {
    let e = entry(WorkoutSessionRecord.outboxKind, ["id": .string("s1"), "date_time": .string("2026-10-05T08:00:00.000Z")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [Self.today])
  }

  /// Ngày là ngày ĐỊA PHƯƠNG: 18:00Z ngày 3 là ngày 4 ở Sài Gòn.
  @Test func dayFollowsTheLocalCalendar() {
    let e = entry(WorkoutSessionRecord.revisionKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: saigon) == [LocalDate("2026-10-04")!, Self.today])
  }

  @Test func oldDeleteWithoutDateRebuildsToday() {
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [Self.today])
  }

  @Test func planEditsDoNotTouchDailyLogs() {
    let e = entry(PlanEdit.templateKind, ["id": .string("t1")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc).isEmpty)
  }

  /// Lỗi dựng lại không ném ra writer — chỉ trả về để chẩn đoán.
  @Test func rebuildAfterWriteSwallowsFailures() async {
    let s = Scripted()
    s.failTable = "meal_entries"
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    let failures = await DailyLog.rebuildAfterWrite(e, store: s, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"), in: Self.utc)
    #expect(failures.count == 2)
  }
}
