public import ASCNDCore
import Foundation
import GRDB

/// `PerformanceCache` trên SQLite — "lần trước" theo người dùng (#331), cùng
/// bảng `read_cache` (đăng xuất xoá cùng).
public final class GRDBPerformanceCache: PerformanceCache {
  static let kind = "last-performance"
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func load(userId: String) async throws -> [String: LastPerformance]? {
    let json = try await db.read { db in
      try String.fetchOne(
        db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, Self.kind])
    }
    guard let json else { return nil }
    return try JSONDecoder().decode([String: LastPerformance].self, from: Data(json.utf8))
  }

  public func save(userId: String, _ table: [String: LastPerformance]) async throws {
    let json = try OutboxStore.json(table)
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
