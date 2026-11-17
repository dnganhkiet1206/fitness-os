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
  /// Tài khoản mà các cache theo người dùng đang phục vụ (#431).
  public let accounts = AccountScope()

  /// Cấu hình SQLite RÕ RÀNG (R2-SYNC-09): trước đây `DatabaseQueue(path:)`
  /// dùng mặc định — journal DELETE của SQLite, không ai chọn, không ai khẳng
  /// định. Nay:
  /// - Journal WAL: ghi không chặn đọc; tắt app / mất điện không hỏng tệp
  ///   (khôi phục từ `-wal` lúc mở sau). GRDB 7 không có nút `synchronous`
  ///   riêng: mở WAL thì GRDB đặt `synchronous = NORMAL` kèm theo
  ///   (`setUpWALMode`) — commit chỉ mất khi mất điện trước checkpoint, không
  ///   bao giờ hỏng, và không bao giờ mất khi chỉ tắt / kill app (điều mà lời
  ///   hứa "đã lưu trên máy" của outbox cần). `FULL` sẽ fsync mỗi commit cho
  ///   một tệp nhật ký của một người — không đáng.
  /// - Pragmas hiệu lực được khẳng định bằng test trên tệp thật
  ///   (`DatabaseConfigurationTests`): `journal_mode = wal`, `synchronous = 1`.
  /// - Chế độ journal GHI DAI trong tệp: tệp cũ mở lên được chuyển sang WAL ở
  ///   lần mở đầu sau bản này; `synchronous` theo kết nối, GRDB đặt lại mỗi
  ///   lần mở. Cơ sở trong bộ nhớ bỏ qua phần journal (GRDB không dựng WAL
  ///   cho `:memory:`), cùng một `Configuration` vẫn dùng được.
  static var configuration: Configuration {
    var config = Configuration()
    config.journalMode = .wal
    return config
  }

  public init(path: String) throws {
    queue = try DatabaseQueue(path: path, configuration: Self.configuration)
    try Self.migrator.migrate(queue)
  }

  /// Trong bộ nhớ — cho test.
  public init() throws {
    queue = try DatabaseQueue(configuration: Self.configuration)
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
    m.registerMigration("v4-workout-day-owner") { db in
      // `workout_day` theo tài khoản (#452). Bảng v2 không ghi của ai, nên
      // đăng xuất phải xoá cả bảng và một lượt ghi muộn của người vừa rời đi
      // dựng lại "ngày đã chốt" của họ cho người kế tiếp. Dựng lại bảng với
      // khoá (người, ngày): SQLite không đổi được khoá chính tại chỗ.
      //
      // Hàng cũ KHÔNG được gán cho ai — không biết của ai thì không phải của
      // người đăng nhập kế tiếp. Chúng mang chủ `#legacy` (không tài khoản nào
      // trùng được), không ai đọc / ghi được. `pruneDays` chỉ chạm ngày của
      // người đang đăng nhập (#476), nên chúng bị bỏ ở lượt dọn xuyên tài
      // khoản lúc phiên mở (`AccountLifecycle.sessionStarted` →
      // `clearAll(except:)`), không phải theo tuổi.
      try db.create(table: "workout_day_owned") { t in
        t.column("userId", .text).notNull()
        t.column("key", .text).notNull()
        t.column("state", .text).notNull()
        t.primaryKey(["userId", "key"])
      }
      try db.execute(
        sql: "INSERT INTO workout_day_owned (userId, key, state) SELECT ?, key, state FROM workout_day",
        arguments: [AccountScope.legacyOwner])
      try db.drop(table: "workout_day")
      try db.rename(table: "workout_day_owned", to: "workout_day")
    }
    m.registerMigration("v5-read-cache-updated-at") { db in
      // Dấu lần ghi cuối của mỗi hàng `read_cache` (R2-SYNC-03): lượt cắt
      // hướng dẫn theo tuổi (`ReadCacheCleanup.pruneExerciseGuides`) cần biết
      // hàng nào đã lâu không làm mới. Hàng cũ mang NULL — không biết tuổi thì
      // chỉ rời đi khi quá trần số hàng, không bị cắt theo tuổi.
      try db.alter(table: "read_cache") { t in
        t.add(column: "updatedAt", .integer)
      }
    }
    return m
  }
}
