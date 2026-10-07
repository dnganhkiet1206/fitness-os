public import ASCNDCore
import Foundation
import GRDB

/// Hàng đợi lớp Ghi nhận trên đĩa (ADR-0003 §1, §3).
///
/// Giá trị `Outbox` của ASCNDCore là nguồn sự thật về LOGIC; nơi này chỉ giữ
/// cho đĩa khớp với nó. Hai lối ghi:
/// - `append`: ghi một bản ghi mới, COMMIT xong mới trả về — màn hình chỉ được
///   nói "đã lưu trên máy" sau khi hàm này trả về. Đóng lỗ hổng `:729` của
///   baseline (tắt app giữa chừng là mất bản ghi).
/// - `persist`: sau mỗi bước của worker (gửi xong, lỗi, bỏ sang `dead`), ghi
///   bước ấy xuống đĩa trong MỘT transaction — không đụng hàng worker chưa nạp.
///
/// Bản ghi lưu dưới dạng JSON của `OutboxEntry` — cùng một `Codable` mà test
/// của Core đã thử khứ hồi; không có ánh xạ cột thứ hai để lệch.
public final class OutboxStore: Sendable {
  private let db: DatabaseQueue

  /// Dùng chung cơ sở dữ liệu của app — để `GRDBWorkoutStore.commitFinish`
  /// ghi hàng outbox và ngày đã chốt trong CÙNG một transaction.
  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  /// Mở (hoặc tạo) cơ sở dữ liệu riêng ở `path` và chạy migration.
  public convenience init(path: String) throws {
    self.init(try ASCNDDatabase(path: path))
  }

  /// Cơ sở dữ liệu trong bộ nhớ — cho test.
  public convenience init() throws {
    self.init(try ASCNDDatabase())
  }

  /// Nạp hàng đợi theo đúng thứ tự đã ghi.
  public func load() throws -> Outbox {
    try db.read { db in
      let decoder = JSONDecoder()
      let pending = try String.fetchAll(db, sql: "SELECT entry FROM outbox ORDER BY seq")
        .map { try decoder.decode(OutboxEntry.self, from: Data($0.utf8)) }
      let dead = try String.fetchAll(db, sql: "SELECT dead FROM outbox_dead ORDER BY seq")
        .map { try decoder.decode(DeadEntry.self, from: Data($0.utf8)) }
      return Outbox(pending: pending, dead: dead)
    }
  }

  /// Ghi một bản ghi mới. Trả về SAU khi commit. Cùng `id` ghi hai lần là một
  /// hàng (idempotent, như `Outbox.enqueue`).
  public func append(_ entry: OutboxEntry) throws {
    let json = try Self.json(entry)
    try db.write { db in
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, json])
    }
  }

  /// Ghi các bước của worker xuống đĩa, trong một transaction: hàng còn trong
  /// `pending` cập nhật lịch sử lỗi / hạn chờ, hàng mới của worker thêm vào
  /// cuối, bản ghi `dead` mới được nối thêm, và hàng bị XOÁ chỉ khi worker nói
  /// rõ nó đã xong — `settled` (gửi thành) hoặc đã sang `dead`.
  ///
  /// Không "xoá mọi thứ không có trong `pending`": `append` (màn tập chốt
  /// buổi) chạy song song với worker, và hàng vừa chèn sau lần `load()` của
  /// worker không có trong giá trị của nó. Xoá theo "không thấy" là xoá mất
  /// một buổi tập vừa được báo "đã lưu".
  public func persist(_ outbox: Outbox, settled: Set<String>) throws {
    let pending = try outbox.pending.map { ($0, try Self.json($0)) }
    let dead = try outbox.dead.map { ($0.entry.id, try Self.json($0)) }
    let finished = settled.union(outbox.dead.map(\.entry.id)).subtracting(outbox.pending.map(\.id))
    try db.write { db in
      for id in finished {
        try db.execute(sql: "DELETE FROM outbox WHERE id = ?", arguments: [id])
      }
      for (entry, json) in pending {
        try db.execute(
          sql: """
            INSERT INTO outbox (id, userId, entry) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET entry = excluded.entry
            """,
          arguments: [entry.id, entry.userId, json])
      }
      let stored = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM outbox_dead") ?? 0
      for (id, json) in dead.dropFirst(stored) {
        try db.execute(sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: [id, json])
      }
    }
  }

  /// Đăng xuất: bỏ cả hàng đợi như baseline (`clearPersistedCache`, #241 chờ
  /// Kiệt) — kể cả hàng worker chưa nạp, và cả `outbox_dead` (buổi tập của
  /// người vừa rời đi, #335). Trả về số hàng CHỜ GỬI bỏ.
  @discardableResult
  public func dropAllOnSignOut() throws -> Int {
    try db.write { db in
      try db.execute(sql: "DELETE FROM outbox")
      let n = db.changesCount
      try db.execute(sql: "DELETE FROM outbox_dead")
      return n
    }
  }

  static func json<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return String(decoding: try encoder.encode(value), as: UTF8.self)
  }
}

/// `SyncWorker` (ASCNDCore) đọc và ghi hàng đợi qua đây. Các hàm đồng bộ của
/// GRDB thoả yêu cầu `async` của giao thức; worker gọi chúng ngoài main actor.
extension OutboxStore: OutboxPersistence {}

/// Lệnh sửa kế hoạch (#401): nhiều hàng một giao dịch — tạo template và gán
/// ngày cùng bền hoặc cùng không, đúng thứ tự `seq`.
extension OutboxStore: PlanWriteStore {
  public func enqueue(_ entries: [OutboxEntry]) throws {
    let rows = try entries.map { ($0, try Self.json($0)) }
    try db.write { db in
      for (e, json) in rows {
        try db.execute(
          sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
          arguments: [e.id, e.userId, json])
      }
    }
  }

  public func pending(userId: String) throws -> [OutboxEntry] {
    try load().pending.filter { $0.userId == userId }
  }
}
