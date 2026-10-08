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
///
/// Theo tài khoản (#452): mỗi hàng `workout_day` có chủ — người đang đăng nhập
/// theo `AccountScope` của database (chốt DUY NHẤT, cùng chốt với
/// `read_cache`). Đọc / ghi / chốt / xoá chỉ chạm hàng của chủ ấy; không ai
/// đăng nhập thì đọc không thấy gì và ghi bị từ chối (`AccountScopeClosed`)
/// trước khi có gì bền. Chủ được đọc TRONG transaction, cùng lúc với phép ghi.
///
/// Hàng rào ghi (#454): mỗi phép ghi nói nó ghi cho ai — `saveDay(userId:)`,
/// `entry.userId` của `commitFinish` / `commitDelete`. Người ấy phải là người
/// đang đăng nhập (so như `AccountScope.allows`: không phân biệt hoa thường,
/// rỗng không bao giờ), không thì `AccountScopeClosed`, kiểm TRƯỚC câu lệnh
/// ghi đầu tiên của giao dịch — giao dịch chốt vẫn là tất-cả-hoặc-không. Không
/// thế thì lượt ghi muộn của controller của A, tới sau khi B đã đăng nhập,
/// được ghi dưới tên B: ngày của A dựng lại trong ngày của B, hàng outbox của
/// A nằm cạnh hàng của B.
public final class GRDBWorkoutStore: WorkoutStore {
  private let db: DatabaseQueue
  private let accounts: AccountScope

  public init(_ database: ASCNDDatabase) {
    db = database.queue
    accounts = database.accounts
  }

  /// Chủ của lượt ghi cho `userId`, hoặc từ chối: không ai đăng nhập, hay
  /// người đăng nhập không phải `userId`.
  private func writer(for userId: String) throws -> String {
    guard let owner = accounts.owner(writingFor: userId) else { throw AccountScopeClosed() }
    return owner
  }

  public func loadDay(_ key: String) async throws -> DayState? {
    try await db.read { [accounts] db in
      guard let owner = accounts.owner else { return nil }
      return try Self.day(db, owner, key)
    }
  }

  public func saveDay(_ key: String, _ state: DayState, userId: String) async throws {
    let json = try OutboxStore.json(state)
    try await db.write { db in
      let owner = try self.writer(for: userId)
      try Self.ensureUnlocked(db, owner, key, for: state.loggedSessionId)
      try Self.upsert(db, owner, key, json)
    }
  }

  @discardableResult
  public func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    let day = try OutboxStore.json(state)
    let row = try OutboxStore.json(entry)
    return try await db.write { db in
      let owner = try self.writer(for: entry.userId)
      try Self.ensureUnlocked(db, owner, key, for: state.loggedSessionId)
      try Self.upsert(db, owner, key, day)
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, row])
      return db.changesCount > 0
    }
  }

  public func commitDelete(sessionId: String, _ entry: OutboxEntry) async throws {
    let row = try OutboxStore.json(entry)
    try await db.write { db in
      let owner = try self.writer(for: entry.userId)
      let exists = try Bool.fetchOne(db, sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE id = ?)", arguments: [entry.id]) ?? false
      guard !exists else { return }
      for key in try String.fetchAll(db, sql: "SELECT key FROM workout_day WHERE userId = ?", arguments: [owner]) {
        guard var state = try Self.day(db, owner, key), state.loggedSessionId == sessionId else { continue }
        state.loggedKeys = []
        try Self.upsert(db, owner, key, try OutboxStore.json(state))
      }
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, row])
    }
  }

  /// Dọn điểm quay lại quá 14 ngày (`DayProgressStore.stale`, luật của
  /// baseline). Ngày đã chốt cũng bị dọn: buổi của nó đã nằm ở outbox/server,
  /// và cửa sổ mở lại của baseline cũng chỉ 14 ngày. Trả về số ngày bỏ.
  ///
  /// Theo TUỔI, không theo chủ: chạy lúc mở app (trước khi ai đăng nhập) và
  /// dọn cả hàng của người khác / hàng `#legacy` — xoá một ngày đã quá hạn
  /// không lộ gì của ai.
  @discardableResult
  public func pruneDays(today: LocalDate) async throws -> Int {
    try await db.write { db in
      let keys = Set(try String.fetchAll(db, sql: "SELECT key FROM workout_day"))
      let stale = DayProgressStore.stale(Array(keys), today: today)
      var removed = 0
      for k in stale {
        try db.execute(sql: "DELETE FROM workout_day WHERE key = ?", arguments: [k])
        removed += db.changesCount
      }
      return removed
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
  private static func day(_ db: Database, _ owner: String, _ key: String) throws -> DayState? {
    guard
      let json = try String.fetchOne(
        db, sql: "SELECT state FROM workout_day WHERE userId = ? AND key = ?", arguments: [owner, key])
    else { return nil }
    return try? JSONDecoder().decode(DayState.self, from: Data(json.utf8))
  }

  private static func ensureUnlocked(_ db: Database, _ owner: String, _ key: String, for id: String?) throws {
    if let logged = try day(db, owner, key)?.loggedSessionId, logged != id {
      throw DayAlreadyLogged(sessionId: logged)
    }
  }

  private static func upsert(_ db: Database, _ owner: String, _ key: String, _ json: String) throws {
    try db.execute(
      sql: """
        INSERT INTO workout_day (userId, key, state) VALUES (?, ?, ?)
        ON CONFLICT(userId, key) DO UPDATE SET state = excluded.state
        """,
      arguments: [owner, key, json])
  }
}

/// Ghi `workout_day` khi không ai đăng nhập (#452), hoặc cho người không phải
/// người đang đăng nhập (#454): từ chối trước khi có gì bền — lượt ghi muộn
/// của người vừa rời đi không dựng lại ngày của họ, ở máy trống hay trong
/// phiên của người kế tiếp.
public struct AccountScopeClosed: Error, Sendable, Hashable {
  public init() {}
}
