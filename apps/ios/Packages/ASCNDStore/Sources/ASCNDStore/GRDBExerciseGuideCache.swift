public import ASCNDCore
import Foundation
import GRDB

/// `ExerciseGuideCache` trên SQLite — sheet hướng dẫn đã đọc (#422), theo người
/// dùng × bài × ngôn ngữ, cùng bảng `read_cache` (đăng xuất xoá cùng; đăng
/// nhập dọn của người khác, #397).
public final class GRDBExerciseGuideCache: ExerciseGuideCache {
  static let prefix = "exercise-guide:"
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func load(userId: String, key: String) async throws -> ExerciseGuide? {
    let json = try await db.read { db in
      try String.fetchOne(
        db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, Self.prefix + key])
    }
    guard let json else { return nil }
    return try? JSONDecoder().decode(ExerciseGuide.self, from: Data(json.utf8))
  }

  public func save(userId: String, key: String, _ guide: ExerciseGuide) async throws {
    let json = try OutboxStore.json(guide)
    try await db.write { db in
      try db.execute(
        sql: """
          INSERT INTO read_cache (userId, kind, json) VALUES (?, ?, ?)
          ON CONFLICT(userId, kind) DO UPDATE SET json = excluded.json
          """,
        arguments: [userId, Self.prefix + key, json])
    }
  }
}
