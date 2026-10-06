import Foundation
import GRDB

/// MỘT tệp SQLite cho mọi thứ app giữ trên máy (ADR-0003 §1).
///
/// Một tệp chứ không mỗi store một tệp: chốt buổi tập phải ghi hàng outbox và
/// "ngày đã chốt" trong cùng một transaction, và SQLite chỉ cho điều đó trong
/// một cơ sở dữ liệu. Mọi migration sống ở đây, theo thứ tự, không bao giờ sửa
/// một migration đã phát hành — chỉ thêm cái mới.
public final class ASCNDDatabase: Sendable {
  let queue: DatabaseQueue

  public init(path: String) throws {
    queue = try DatabaseQueue(path: path)
    try Self.migrator.migrate(queue)
  }

  /// Trong bộ nhớ — cho test.
  public init() throws {
    queue = try DatabaseQueue()
    try Self.migrator.migrate(queue)
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
    m.registerMigration("v2-workout-day") { db in
      // Một hàng mỗi (ngày, template): khoá `routine-day:<ngày>:<template>` của
      // baseline, giá trị là JSON của `DayState`.
      try db.create(table: "workout_day") { t in
        t.primaryKey("key", .text)
        t.column("state", .text).notNull()
      }
    }
    m.registerMigration("v3-read-cache") { db in
      // Read model local-first (#270): bản chụp mới nhất từ server, theo người
      // dùng — mở app offline vẫn có kế hoạch; đổi tài khoản không thấy của
      // người trước.
      try db.create(table: "read_cache") { t in
        t.column("userId", .text).notNull()
        t.column("kind", .text).notNull()
        t.column("json", .text).notNull()
        t.primaryKey(["userId", "kind"])
      }
    }
    return m
  }
}
