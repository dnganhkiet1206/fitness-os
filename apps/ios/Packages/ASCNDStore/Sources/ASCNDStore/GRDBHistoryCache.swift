public import ASCNDCore
import Foundation
import GRDB

/// `HistoryCache` trên SQLite — lịch sử buổi tập theo người dùng (#400), cùng
/// bảng `read_cache` (đăng xuất xoá cùng; đăng nhập dọn của người khác, #397).
public final class GRDBHistoryCache: HistoryCache {
  static let kind = "workout-history"
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func load(userId: String) async throws -> [HistoryEntry]? {
    let json = try await db.read { db in
      try String.fetchOne(
        db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, Self.kind])
    }
    guard let json else { return nil }
    return try JSONDecoder().decode([HistoryEntry].self, from: Data(json.utf8))
  }

  public func save(userId: String, _ entries: [HistoryEntry]) async throws {
    let json = try OutboxStore.json(entries)
    try await db.write { db in
      try db.execute(
        sql: """
          INSERT INTO read_cache (userId, kind, json) VALUES (?, ?, ?)
          ON CONFLICT(userId, kind) DO UPDATE SET json = excluded.json
          """,
        arguments: [userId, Self.kind, json])
    }
  }
}
