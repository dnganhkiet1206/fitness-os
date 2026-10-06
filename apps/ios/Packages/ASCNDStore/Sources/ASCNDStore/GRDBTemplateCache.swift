public import ASCNDCore
import Foundation
import GRDB

/// `TemplateCache` trên SQLite: bản chụp `routine_days` + `workout_templates`
/// mới nhất của từng người dùng (#270).
public final class GRDBTemplateCache: TemplateCache {
  static let kind = "templates"
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func load(userId: String) async throws -> TemplateSnapshot? {
    let json = try await db.read { db in
      try String.fetchOne(
        db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, Self.kind])
    }
    guard let json else { return nil }
    return try JSONDecoder().decode(TemplateSnapshot.self, from: Data(json.utf8))
  }

  public func save(userId: String, _ snapshot: TemplateSnapshot) async throws {
    let json = try OutboxStore.json(snapshot)
    try await db.write { db in
      try db.execute(
        sql: """
          INSERT INTO read_cache (userId, kind, json) VALUES (?, ?, ?)
          ON CONFLICT(userId, kind) DO UPDATE SET json = excluded.json
          """,
        arguments: [userId, Self.kind, json])
    }
  }

  /// Đăng xuất: bỏ cache của mọi người dùng trên máy.
  public func clearAll() async throws {
    try await db.write { db in try db.execute(sql: "DELETE FROM read_cache") }
  }

  /// Đăng nhập: bỏ cache của MỌI người khác. Lượt làm mới của người vừa rời
  /// đi có thể về SAU lượt dọn lúc đăng xuất và ghi lại cache của họ (#335);
  /// lần này dọn nốt. Trả về số hàng bỏ.
  @discardableResult
  public func clearAll(except userId: String) async throws -> Int {
    try await db.write { db in
      try db.execute(sql: "DELETE FROM read_cache WHERE userId != ?", arguments: [userId])
      return db.changesCount
    }
  }
}
