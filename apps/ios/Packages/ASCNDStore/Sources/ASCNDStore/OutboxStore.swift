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
/// - `persist`: sau mỗi bước của worker (gửi xong, lỗi, bỏ sang `dead`, đăng
///   xuất), làm đĩa khớp với giá trị trong MỘT transaction.
///
/// Bản ghi lưu dưới dạng JSON của `OutboxEntry` — cùng một `Codable` mà test
/// của Core đã thử khứ hồi; không có ánh xạ cột thứ hai để lệch.
public final class OutboxStore: Sendable {
  private let db: DatabaseQueue

  /// Mở (hoặc tạo) cơ sở dữ liệu ở `path` và chạy migration.
  public init(path: String) throws {
    db = try DatabaseQueue(path: path)
    try Self.migrator.migrate(db)
  }

  /// Cơ sở dữ liệu trong bộ nhớ — cho test.
  public init() throws {
    db = try DatabaseQueue()
    try Self.migrator.migrate(db)
  }

  static var migrator: DatabaseMigrator {
    var m = DatabaseMigrator()
    m.registerMigration("v1-outbox") { db in
      try db.create(table: "outbox") { t in
        // `seq` tăng dần = thứ tự tạo = thứ tự gửi (một làn tuần tự).
        t.autoIncrementedPrimaryKey("seq")
        t.column("id", .text).notNull().unique()
        t.column("userId", .text).notNull()
        t.column("entry", .text).notNull()
      }
      try db.create(table: "outbox_dead") { t in
        t.autoIncrementedPrimaryKey("seq")
        t.column("id", .text).notNull()
        t.column("dead", .text).notNull()
      }
    }
    return m
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

  /// Làm đĩa khớp với `outbox`, trong một transaction: hàng không còn trong
  /// `pending` bị xoá, hàng còn lại cập nhật lịch sử lỗi / hạn chờ, hàng mới
  /// được thêm vào cuối, bản ghi `dead` mới được nối thêm.
  public func persist(_ outbox: Outbox) throws {
    let pending = try outbox.pending.map { ($0, try Self.json($0)) }
    let dead = try outbox.dead.map { ($0.entry.id, try Self.json($0)) }
    try db.write { db in
      let keep = Set(outbox.pending.map(\.id))
      for id in try String.fetchAll(db, sql: "SELECT id FROM outbox") where !keep.contains(id) {
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

  private static func json<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return String(decoding: try encoder.encode(value), as: UTF8.self)
  }
}
