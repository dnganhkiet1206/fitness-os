public import ASCNDCore
import Foundation
import GRDB

/// `RecordBookCache` trên SQLite — bảng tốt-nhất theo người dùng (#295), cùng
/// bảng `read_cache` với kế hoạch tuần.
public final class GRDBRecordBookCache: RecordBookCache {
  static let kind = "record-bests"
  private let db: DatabaseQueue

  public init(_ database: ASCNDDatabase) {
    db = database.queue
  }

  public func load(userId: String) async throws -> PersonalRecords.Bests? {
    let json = try await db.read { db in
      try String.fetchOne(
        db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, Self.kind])
    }
    guard let json else { return nil }
    return try JSONDecoder().decode(PersonalRecords.Bests.self, from: Data(json.utf8))
  }

  public func save(userId: String, _ bests: PersonalRecords.Bests) async throws {
    let json = try OutboxStore.json(bests)
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
