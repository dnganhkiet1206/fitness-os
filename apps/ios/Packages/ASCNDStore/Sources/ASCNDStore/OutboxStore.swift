public import ASCNDCore
import Foundation
import GRDB

/// Hàng đợi lớp Ghi nhận trên đĩa (ADR-0003 §1, §3).
///
/// Giá trị `Outbox` của ASCNDCore là nguồn sự thật về LOGIC; nơi này chỉ giữ
/// cho đĩa khớp với nó. Hai lối ghi:
/// - `append`: ghi một bản ghi mới, COMMIT xong mới trả về — màn hình chỉ được
///   nói "đã lưu trên máy" sau khi hàm này trả về. Đóng lỗ hổng `:729` của
///   baseline (tắt app giữa chừng là mất bản ghi).
/// - `persist`: sau mỗi bước của worker (gửi xong, lỗi, bỏ sang `dead`), ghi
///   bước ấy xuống đĩa trong MỘT transaction — không đụng hàng worker chưa nạp.
///
/// Bản ghi lưu dưới dạng JSON của `OutboxEntry` — cùng một `Codable` mà test
/// của Core đã thử khứ hồi; không có ánh xạ cột thứ hai để lệch.
public final class OutboxStore: Sendable {
  private let db: DatabaseQueue
  private let accounts: AccountScope

  /// Dùng chung cơ sở dữ liệu của app — để `GRDBWorkoutStore.commitFinish`
  /// ghi hàng outbox và ngày đã chốt trong CÙNG một transaction.
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

  /// Nạp hàng đợi theo đúng thứ tự đã ghi.
  ///
  /// Giải mã TỪNG hàng: hàng không giải mã được (bản app mới hơn ghi rồi người
  /// dùng quay về bản cũ, hay một lỗi ghi) bị bỏ qua chứ không làm hỏng cả lần
  /// nạp. Trước đây một hàng hỏng làm `load()` ném, `SyncWorker` không bao giờ
  /// nạp được hàng đợi, và mọi bản ghi "đã lưu trên máy" đứng yên mãi (audit
  /// #527, 6138699103). Hàng bị bỏ qua vẫn NẰM trên đĩa — không xoá dữ liệu
  /// người dùng; `persist` chỉ xoá theo id worker báo xong, nên không đụng tới
  /// nó; bản app đọc được nó sẽ gửi nó. `undecodableIds()` liệt kê chúng.
  public func load() throws -> Outbox {
    try db.read { db in
      Outbox(
        pending: try Self.rows(db, "SELECT id, entry FROM outbox ORDER BY seq", as: OutboxEntry.self).decoded,
        dead: try Self.rows(db, "SELECT id, dead FROM outbox_dead ORDER BY seq", as: DeadEntry.self).decoded)
    }
  }

  /// Id các hàng (chờ gửi và `dead`) đang nằm trên đĩa mà bản app này không
  /// giải mã được — `load()` bỏ qua chúng.
  public func undecodableIds() throws -> [String] {
    try db.read { db in
      try Self.rows(db, "SELECT id, entry FROM outbox ORDER BY seq", as: OutboxEntry.self).undecodable
        + Self.rows(db, "SELECT id, dead FROM outbox_dead ORDER BY seq", as: DeadEntry.self).undecodable
    }
  }

  /// Hàng `(id, json)` của `sql`, chia thành giá trị giải mã được và id của
  /// hàng không giải mã được, giữ thứ tự.
  private static func rows<T: Decodable>(
    _ db: Database, _ sql: String, as type: T.Type
  ) throws -> (decoded: [T], undecodable: [String]) {
    let decoder = JSONDecoder()
    var decoded: [T] = []
    var undecodable: [String] = []
    for row in try Row.fetchAll(db, sql: sql) {
      let id: String = row[0]
      let json: String = row[1]
      if let value = try? decoder.decode(T.self, from: Data(json.utf8)) {
        decoded.append(value)
      } else {
        undecodable.append(id)
      }
    }
    return (decoded, undecodable)
  }

  /// Ghi một bản ghi mới. Trả về SAU khi commit. Cùng `id` ghi hai lần là một
  /// hàng (idempotent, như `Outbox.enqueue`).
  ///
  /// Hàng rào tài khoản (#485) như `enqueue`: kiểm tra NGAY TRONG transaction.
  public func append(_ entry: OutboxEntry) throws {
    let json = try Self.json(entry)
    try db.write { db in
      guard accounts.owner(writingFor: entry.userId) != nil else { throw AccountScopeClosed() }
      try db.execute(
        sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: [entry.id, entry.userId, json])
    }
  }

  /// Ghi các bước của worker xuống đĩa, trong một transaction: hàng còn trong
  /// `pending` cập nhật lịch sử lỗi / hạn chờ, hàng mới của worker thêm vào
  /// cuối, bản ghi `dead` mới được nối thêm, và hàng bị XOÁ chỉ khi worker nói
  /// rõ nó đã xong — `settled` (gửi thành) hoặc đã sang `dead`.
  ///
  /// Không "xoá mọi thứ không có trong `pending`": `append` (màn tập chốt
  /// buổi) chạy song song với worker, và hàng vừa chèn sau lần `load()` của
  /// worker không có trong giá trị của nó. Xoá theo "không thấy" là xoá mất
  /// một buổi tập vừa được báo "đã lưu".
  public func persist(_ outbox: Outbox, settled: Set<String>) throws {
    let pending = try outbox.pending.map { ($0, try Self.json($0)) }
    let dead = try outbox.dead.map { ($0.entry.id, try Self.json($0)) }
    let finished = settled.union(outbox.dead.map(\.entry.id)).subtracting(outbox.pending.map(\.id))
    try db.write { db in
      for id in finished {
        try db.execute(sql: "DELETE FROM outbox WHERE id = ?", arguments: [id])
      }
      for (entry, json) in pending {
        try db.execute(
          sql: """
            INSERT INTO outbox (id, userId, entry) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET entry = excluded.entry
            """,
          arguments: [entry.id, entry.userId, json])
      }
      // Đếm hàng `dead` mà `load()` thấy — hàng không giải mã được bị bỏ qua ở
      // đó nên cũng không tính ở đây, không thì `outbox.dead` (ngắn hơn số hàng
      // trên đĩa) mất bản ghi `dead` mới nhất ở lần ghi kế tiếp.
      let stored = try Self.rows(db, "SELECT id, dead FROM outbox_dead ORDER BY seq", as: DeadEntry.self).decoded.count
      for (id, json) in dead.dropFirst(stored) {
        try db.execute(sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: [id, json])
      }
    }
  }

  /// Đăng xuất: bỏ cả hàng đợi như baseline (`clearPersistedCache`, #241 chờ
  /// Kiệt) — kể cả hàng worker chưa nạp, và cả `outbox_dead` (buổi tập của
  /// người vừa rời đi, #335). Trả về số hàng CHỜ GỬI bỏ.
  @discardableResult
  public func dropAllOnSignOut() throws -> Int {
    try db.write { db in
      try db.execute(sql: "DELETE FROM outbox")
      let n = db.changesCount
      try db.execute(sql: "DELETE FROM outbox_dead")
      return n
    }
  }

  static func json<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return String(decoding: try encoder.encode(value), as: UTF8.self)
  }
}

/// `SyncWorker` (ASCNDCore) đọc và ghi hàng đợi qua đây. Các hàm đồng bộ của
/// GRDB thoả yêu cầu `async` của giao thức; worker gọi chúng ngoài main actor.
extension OutboxStore: OutboxPersistence {}

/// Lệnh sửa kế hoạch (#401): nhiều hàng một giao dịch — tạo template và gán
/// ngày cùng bền hoặc cùng không, đúng thứ tự `seq`.
extension OutboxStore: PlanWriteStore {
  public func enqueue(_ entries: [OutboxEntry]) throws {
    let rows = try entries.map { ($0, try Self.json($0)) }
    try db.write { db in
      // Hàng rào tài khoản (#485): kiểm tra NGAY TRONG transaction ghi — như
      // `GRDBWorkoutStore.writer(for:)`. Kiểm NGOÀI transaction để hở TOCTOU:
      // sign-out (+ `dropAllOnSignOut`) xen giữa check và write sẽ chèn hàng
      // SAU lượt dọn, để lại hàng mồ côi của người đã rời đi. GRDB xếp mọi
      // `db.write` nối tiếp nhau, và `sessionEnded` luôn đóng chốt trước khi
      // dọn, nên thứ tự chỉ có thể là: (check+insert) trước DELETE → hàng bị
      // dọn sạch; hoặc DELETE trước (check+insert) → check thấy signedOut →
      // ném `AccountScopeClosed`. Không có thứ tự nào để lại hàng mồ côi.
      // Tất-cả-hoặc-không: một entry lọt rào là cả lô bị từ chối, không ghi
      // hàng nào.
      for e in entries {
        guard accounts.owner(writingFor: e.userId) != nil else { throw AccountScopeClosed() }
      }
      for (e, json) in rows {
        try db.execute(
          sql: "INSERT OR IGNORE INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
          arguments: [e.id, e.userId, json])
      }
    }
  }

  public func pending(userId: String) throws -> [OutboxEntry] {
    try load().pending.filter { $0.userId == userId }
  }
}
