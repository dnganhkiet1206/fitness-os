import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// R2-SYNC-03: hàng hướng dẫn (`exercise-guide:`) trong `read_cache` bị cắt
/// theo tuổi và số hàng lúc phiên mở; kind cố định và hàng của người khác
/// không đụng tới; `put` đóng dấu lần ghi cuối để lượt cắt có tuổi mà đọc.
struct ReadCachePruneTests {
  private func seed(_ db: ASCNDDatabase, userId: String, kind: String, updatedAt: Int64?) throws {
    try db.queue.write { db in
      try db.execute(
        sql: "INSERT INTO read_cache (userId, kind, json, updatedAt) VALUES (?, ?, ?, ?)",
        arguments: [userId, kind, "{}", updatedAt])
    }
  }

  private func kinds(_ db: ASCNDDatabase, userId: String) throws -> [String] {
    try db.queue.read { db in
      try String.fetchAll(db, sql: "SELECT kind FROM read_cache WHERE userId = ? ORDER BY kind", arguments: [userId])
    }
  }

  @Test func pruneDropsStaleGuidesAndKeepsTheRest() async throws {
    let db = try ASCNDDatabase()
    let now = EpochMillis(100 * 24 * 3_600_000)
    let stale = now.millis - ReadCacheCleanup.exerciseGuideMaxAgeMillis - 1
    try seed(db, userId: "u1", kind: "exercise-guide:bench:vi", updatedAt: stale)
    try seed(db, userId: "u1", kind: "exercise-guide:curl:vi", updatedAt: now.millis)
    try seed(db, userId: "u1", kind: "exercise-guide:row:vi", updatedAt: nil)
    try seed(db, userId: "u1", kind: "templates", updatedAt: stale)
    try seed(db, userId: "u2", kind: "exercise-guide:bench:vi", updatedAt: stale)

    let cleanup = ReadCacheCleanup(db)
    #expect(try await cleanup.pruneExerciseGuides(userId: "u1", now: now) == 1)
    #expect(try kinds(db, userId: "u1") == ["exercise-guide:curl:vi", "exercise-guide:row:vi", "templates"])
    #expect(try kinds(db, userId: "u2") == ["exercise-guide:bench:vi"], "người khác không đụng tới")
  }

  @Test func pruneCapsGuideRowsOldestFirst() async throws {
    let db = try ASCNDDatabase()
    let now = EpochMillis(100 * 24 * 3_600_000)
    for i in 0...ReadCacheCleanup.maxExerciseGuideRows {
      try seed(db, userId: "u1", kind: "exercise-guide:ex\(i):vi", updatedAt: now.millis - 100 + Int64(i))
    }
    let cleanup = ReadCacheCleanup(db)
    #expect(try await cleanup.pruneExerciseGuides(userId: "u1", now: now) == 1)
    let kept = try kinds(db, userId: "u1")
    #expect(kept.count == ReadCacheCleanup.maxExerciseGuideRows)
    #expect(!kept.contains("exercise-guide:ex0:vi"), "lâu không làm mới nhất rời đi")
    #expect(kept.contains("exercise-guide:ex100:vi"))
  }

  @Test func pruneDropsUnstampedRowsFirstWhenOverTheCap() async throws {
    let db = try ASCNDDatabase()
    let now = EpochMillis(100 * 24 * 3_600_000)
    try seed(db, userId: "u1", kind: "exercise-guide:legacy:vi", updatedAt: nil)
    for i in 0..<ReadCacheCleanup.maxExerciseGuideRows {
      try seed(db, userId: "u1", kind: "exercise-guide:ex\(i):vi", updatedAt: now.millis)
    }
    let cleanup = ReadCacheCleanup(db)
    #expect(try await cleanup.pruneExerciseGuides(userId: "u1", now: now) == 1)
    let kept = try kinds(db, userId: "u1")
    #expect(!kept.contains("exercise-guide:legacy:vi"))
  }

  /// `put` đóng dấu `updatedAt` để lượt cắt có tuổi mà đọc.
  @Test func saveStampsUpdatedAt() async throws {
    let db = try ASCNDDatabase()
    let cache = GRDBTemplateCache(db)
    try await cache.save(userId: "u1", TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1)))
    let stamped = try await db.queue.read { db in
      try Int64.fetchOne(db, sql: "SELECT updatedAt FROM read_cache WHERE kind = 'templates'")
    }
    #expect(stamped != nil)
    #expect(stamped ?? 0 > 0)
  }
}
