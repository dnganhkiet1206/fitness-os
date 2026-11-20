public import ASCNDCore
import Foundation
import GRDB

/// Ý chờ gửi của lớp Trạng thái (#161) trên đĩa (AUD-29).
///
/// Giá trị `StateWriter` của ASCNDCore là nguồn sự thật về LOGIC; nơi này chỉ
/// giữ cho đĩa khớp với nó: `save` ghi đè toàn bộ ảnh của tài khoản đang đăng
/// nhập trong MỘT transaction — bảng chỉ có vài hàng (một hàng mỗi khoá), nên
/// ghi đè rẻ hơn ghi từng thay đổi và không bao giờ lệch.
///
/// Hàng mang `userId` của chủ, qua chốt tài khoản như `read_cache` (#431):
/// đọc / ghi chỉ đi qua cho đúng người đang đăng nhập; lúc không ai đăng nhập
/// thì đọc không thấy gì, ghi bị từ chối (`AccountScopeClosed`). Ý của người
/// này không bao giờ sống sang phiên của người khác — kể cả khi `clear()` lúc
/// đăng xuất chạy lúc chốt đã thuộc về người mới (đổi thẳng tài khoản): lượt
/// dọn của vòng đời (`AccountLifecycle`) xoá hàng của mọi người khác ở lần mở
/// phiên sau.
public final class StateIntentStore: Sendable {
  private let db: DatabaseQueue
  private let accounts: AccountScope

  /// Dùng chung cơ sở dữ liệu của app.
  public init(_ database: ASCNDDatabase) {
    db = database.queue
    accounts = database.accounts
  }

  /// Mở (hoặc tạo) cơ sở dữ liệu riêng ở `path` và chạy migration.
  public convenience init(path: String) throws {
    self.init(try ASCNDDatabase(path: path))
  }

  /// Cơ sở dữ liệu trong bộ nhớ — cho test.
  public convenience init() throws {
    self.init(try ASCNDDatabase())
  }

  /// Bỏ mọi hàng của mọi người — chỉ cho vòng đời phiên (`AccountLifecycle`).
  /// Không đi qua chốt, như `ReadCacheCleanup`.
  @discardableResult
  public func clearAll() async throws -> Int {
    try await db.write { db in
      try db.execute(sql: "DELETE FROM state_intents")
      return db.changesCount
    }
  }

  /// Bỏ mọi hàng của người KHÁC `userId` — so không phân biệt hoa thường,
  /// như chốt (`AccountScope.allows`).
  @discardableResult
  public func clearAll(except userId: String) async throws -> Int {
    try await db.write { db in
      try db.execute(sql: "DELETE FROM state_intents WHERE lower(userId) != lower(?)", arguments: [userId])
      return db.changesCount
    }
  }
}

/// `StateWriter` (ASCNDCore) đọc và ghi các ý qua đây. Các hàm đồng bộ của
/// GRDB chạy trên main actor sau mỗi lần ý đổi — bảng chỉ có vài hàng.
extension StateIntentStore: StateIntentPersistence {
  public func load() throws -> [StateIntent] {
    try db.read { db in
      // Hỏi chốt TRONG giao dịch (#459): lượt dọn của phiên khác (cũng là một
      // giao dịch) không chen được giữa lúc hỏi và lúc đọc.
      guard let owner = accounts.owner else { return [] }
      let rows = try Row.fetchAll(
        db, sql: "SELECT intentKey, desired, server FROM state_intents WHERE userId = ? ORDER BY intentKey",
        arguments: [owner])
      return rows.map { row in
        let key: String = row[0]
        let desired: Int64 = row[1]
        let server: Int64 = row[2]
        return StateIntent(key: key, desired: desired != 0, server: server != 0)
      }
    }
  }

  public func save(_ intents: [StateIntent]) throws {
    try db.write { db in
      guard let owner = accounts.owner else { throw AccountScopeClosed() }
      try db.execute(sql: "DELETE FROM state_intents WHERE userId = ?", arguments: [owner])
      for intent in intents {
        try db.execute(
          sql: "INSERT INTO state_intents (userId, intentKey, desired, server) VALUES (?, ?, ?, ?)",
          arguments: [owner, intent.key, intent.desired ? 1 : 0, intent.server ? 1 : 0])
      }
    }
  }
}
