public import ASCNDCore
import Foundation
import GRDB

/// `WorkoutStore` trên SQLite — cùng tệp với `OutboxStore`, nên chốt buổi là
/// MỘT transaction thật: hàng outbox và ngày đã chốt cùng có hoặc cùng không.
///
/// Giữ đúng hợp đồng của `WorkoutStore` (ASCNDCore):
/// - trả về sau COMMIT;
/// - `commitFinish` idempotent theo id (INSERT OR IGNORE);
/// - ngày đã chốt là khoá, kiểm TRONG transaction: id khác → `DayAlreadyLogged`,
///   không ghi gì. Kiểm ở đây chứ không ở controller vì hai controller có thể
///   cùng mở một ngày, và chỉ tầng lưu thấy cả hai.
public final class GRDBWorkoutStore: WorkoutStore {
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func loadDay(_ key: String) async throws -> DayState? {
    try await db.read { db in try Self.day(db, key) }
  }

  public func saveDay(_ key: String, _ state: DayState) async throws {
    let json = try OutboxStore.json(state)
    try await db.write { db in
      try Self.ensureUnlocked(db, key, for: state.loggedSessionId)
      try Self.upsert(db, key, json)
    }
  }

  @discardableResult
  public func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    let day = try OutboxStore.json(state)
    let row = try OutboxStore.json(entry)
    return try await db.write { db in
      try Self.ensureUnlocked(db, key, for: state.loggedSessionId)
      try Self.upsert(db, key, day)
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, row])
      return db.changesCount > 0
    }
  }

  public func commitDelete(sessionId: String, _ entry: OutboxEntry) async throws {
    let row = try OutboxStore.json(entry)
    try await db.write { db in
      let exists = try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE id = ?)", arguments: [entry.id]) ?? false
      guard !exists else { return }
      for key in try String.fetchAll(db, sql: "SELECT key FROM workout_day") {
        guard var state = try Self.day(db, key), state.loggedSessionId == sessionId else { continue }
        state.loggedKeys = []
        try Self.upsert(db, key, try OutboxStore.json(state))
      }
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, row])
    }
  }

  /// Dọn điểm quay lại quá 14 ngày (`DayProgressStore.stale`, luật của
  /// baseline). Ngày đã chốt cũng bị dọn: buổi của nó đã nằm ở outbox/server,
  /// và cửa sổ mở lại của baseline cũng chỉ 14 ngày. Trả về số ngày bỏ.
  @discardableResult
  public func pruneDays(today: LocalDate) async throws -> Int {
    try await db.write { db in
      let keys = try String.fetchAll(db, sql: "SELECT key FROM workout_day")
      let stale = DayProgressStore.stale(keys, today: today)
      for k in stale {
        try db.execute(sql: "DELETE FROM workout_day WHERE key = ?", arguments: [k])
      }
      return stale.count
    }
  }

  /// Đăng xuất / đổi tài khoản: bỏ mọi điểm quay lại — như baseline xoá các
  /// khoá `routine-day:*` trong `clearUserScopedStorage` (`query-client.ts:94`).
  /// Không thì khoá "ngày đã chốt" của người trước (vd khoá `adhoc`) chặn
  /// người sau chốt buổi của chính họ. Trả về số ngày bỏ.
  @discardableResult
  public func clearAll() async throws -> Int {
    try await db.write { db in
      try db.execute(sql: "DELETE FROM workout_day")
      return db.changesCount
    }
  }

  /// Blob không giải mã được (bản build khác ghi, tệp hỏng) = không có điểm
  /// quay lại: bắt đầu lại ngày, như baseline ("a corrupt entry is not worth a
  /// crash — start the workout fresh", `day-plan.tsx:906`).
  ///
  /// Trước đây lỗi giải mã được ném ra. `ensureUnlocked` cũng đọc qua hàm này,
  /// nên mọi `saveDay` / `commitFinish` của ngày ấy hỏng VĨNH VIỄN: không lưu
  /// được set nào, không chốt được buổi nào. Lỗi của SQLite vẫn ném như cũ.
  private static func day(_ db: Database, _ key: String) throws -> DayState? {
    guard let json = try String.fetchOne(db, sql: "SELECT state FROM workout_day WHERE key = ?", arguments: [key])
    else { return nil }
    return try? JSONDecoder().decode(DayState.self, from: Data(json.utf8))
  }

  private static func ensureUnlocked(_ db: Database, _ key: String, for id: String?) throws {
    if let logged = try day(db, key)?.loggedSessionId, logged != id {
      throw DayAlreadyLogged(sessionId: logged)
    }
  }

  private static func upsert(_ db: Database, _ key: String, _ json: String) throws {
    try db.execute(
      sql: """
        INSERT INTO workout_day (key, state) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET state = excluded.state
        """,
      arguments: [key, json])
  }
}
