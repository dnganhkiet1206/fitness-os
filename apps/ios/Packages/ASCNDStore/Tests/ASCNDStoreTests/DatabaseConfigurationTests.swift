import Foundation
import GRDB
import Testing
@testable import ASCNDStore

/// R2-SYNC-09: cấu hình SQLite rõ ràng, khẳng định trên tệp thật — không còn
/// mặc định ngầm của GRDB/SQLite.
struct DatabaseConfigurationTests {
  private func tempPath(_ tag: String) -> String {
    FileManager.default.temporaryDirectory.appendingPathComponent("dbconfig-\(tag)-\(UUID().uuidString).sqlite").path
  }

  private func remove(_ path: String) {
    for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) }
  }

  private func pragmas(_ db: ASCNDDatabase) throws -> (journal: String?, synchronous: Int?) {
    try db.queue.read { db in
      (journal: try String.fetchOne(db, sql: "PRAGMA journal_mode"),
       synchronous: try Int.fetchOne(db, sql: "PRAGMA synchronous"))
    }
  }

  @Test func fileDatabaseUsesWalWithNormalSynchronous() throws {
    let path = tempPath("wal")
    defer { remove(path) }
    let db = try ASCNDDatabase(path: path)
    let p = try pragmas(db)
    #expect(p.journal == "wal")
    #expect(p.synchronous == 1, "NORMAL — GRDB đặt kèm khi mở WAL")
  }

  /// Chế độ journal ghi dai trong tệp: mở lại vẫn là WAL.
  @Test func journalModePersistsAcrossReopen() throws {
    let path = tempPath("reopen")
    defer { remove(path) }
    do {
      let db = try ASCNDDatabase(path: path)
      #expect(try pragmas(db).journal == "wal")
    }
    let reopened = try ASCNDDatabase(path: path)
    #expect(try pragmas(reopened).journal == "wal")
    #expect(try pragmas(reopened).synchronous == 1)
  }

  /// Cơ sở trong bộ nhớ vẫn mở được với cùng cấu hình (GRDB bỏ qua phần
  /// journal cho `:memory:`) và migration vẫn chạy.
  @Test func inMemoryDatabaseOpensWithTheSameConfiguration() throws {
    let db = try ASCNDDatabase()
    let tables = try db.queue.read { db in
      try String.fetchAll(db, sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'outbox'")
    }
    #expect(tables == ["outbox"])
  }
}
