import ASCNDCore
@testable import ASCNDStore
import Foundation
import Testing

private func entry(_ id: String, user: String = "u1") -> OutboxEntry {
  OutboxEntry(id: id, userId: user, kind: "water", payload: .object(["ml": .number(250)]), createdAt: EpochMillis(0))
}

struct OutboxStoreTests {
  @Test func appendThenLoadKeepsOrder() throws {
    let store = try OutboxStore()
    for id in ["a", "b", "c"] { try store.append(entry(id)) }
    try store.append(entry("a"))  // trùng id: vẫn một hàng
    #expect(try store.load().pending.map(\.id) == ["a", "b", "c"])
  }

  /// Sau mỗi bước của worker, đĩa khớp với giá trị: lịch sử lỗi được lưu,
  /// bản ghi gửi xong bị xoá, bản ghi bị từ chối sang `dead`.
  @Test func persistMirrorsOutboxSteps() throws {
    let store = try OutboxStore()
    var box = Outbox()
    for id in ["a", "b", "c"] {
      box.enqueue(entry(id))
      try store.append(entry(id))
    }
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.failed(id: "a", .server(code: nil), now: EpochMillis(0))
    try store.persist(box, settled: [])
    var loaded = try store.load()
    #expect(loaded.pending.first?.history.transientFailures == 1)
    #expect(loaded.pending.first?.notBefore == EpochMillis(1000))

    _ = box.next(now: EpochMillis(1000), online: true, signedInUser: "u1")
    box.succeeded(id: "a")
    _ = box.next(now: EpochMillis(1000), online: true, signedInUser: "u1")
    box.failed(id: "b", .server(code: "23514"), now: EpochMillis(1000))
    try store.persist(box, settled: ["a"])
    loaded = try store.load()
    #expect(loaded.pending.map(\.id) == ["c"])
    #expect(loaded.dead.map(\.entry.id) == ["b"])
    #expect(loaded.dead.first?.reason == .refused)

    // persist lần hai không nhân đôi `dead`.
    try store.persist(box, settled: ["a"])
    #expect(try store.load().dead.count == 1)
  }

  /// AUD-06: kết thúc phiên không xoá gì trên đĩa — bản ghi của người khác không
  /// thành `dead` và còn nguyên sau khi mở lại app; chỉ `purge` (tài khoản đã bị
  /// xoá) mới bỏ, và chỉ của đúng tài khoản ấy (cả `outbox_dead`).
  @Test func parkedEntriesSurviveAndPurgeIsScoped() throws {
    let store = try OutboxStore()
    var box = Outbox()
    for e in [entry("x", user: "u9"), entry("a"), entry("b")] {
      box.enqueue(e)
      try store.append(e)
    }
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    try store.persist(box, settled: [])
    #expect(try store.load().dead.isEmpty, "bản ghi của u9 không bị vứt vì u1 đang đăng nhập")
    #expect(box.park() == 3)
    #expect(try store.load().pending.map(\.id) == ["x", "a", "b"])

    // u9 có một bản ghi bị từ chối; xoá tài khoản u9 thì bỏ cả nó.
    var other = try store.load()
    _ = other.next(now: EpochMillis(0), online: true, signedInUser: "u9")
    other.failed(id: "x", .server(code: "23514"), now: EpochMillis(0))
    try store.persist(other, settled: [])
    #expect(try store.load().dead.count == 1)
    #expect(try store.purge(userId: "u9") == 0)
    #expect(try store.load().dead.isEmpty)
    #expect(try store.load().pending.map(\.id) == ["a", "b"])
  }

  /// Màn tập chốt buổi (append) SAU khi worker đã nạp hàng đợi; worker gửi
  /// xong hàng cũ rồi ghi bước của nó. Buổi mới phải còn nguyên — đó là thứ
  /// màn hình vừa báo "đã lưu".
  @Test func persistNeverDropsRowsTheWorkerHasNotSeen() throws {
    let store = try OutboxStore()
    try store.append(entry("a"))
    var box = try store.load()
    try store.append(entry("late"))
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.succeeded(id: "a")
    try store.persist(box, settled: ["a"])
    #expect(try store.load().pending.map(\.id) == ["late"])
  }

  /// Audit #527 (6138699103): một hàng không giải mã được (bản app mới hơn ghi
  /// rồi quay về bản cũ) từng làm `load()` ném — worker không nạp được hàng
  /// đợi và mọi bản ghi "đã lưu" đứng yên mãi. Nay nó bị bỏ qua, các hàng còn
  /// lại gửi được, và nó vẫn nằm trên đĩa (không xoá dữ liệu).
  @Test func undecodableRowNeitherBlocksLoadNorIsDeleted() throws {
    let database = try ASCNDDatabase()
    let store = OutboxStore(database)
    try store.append(entry("a"))
    try database.queue.write { db in
      try db.execute(
        sql: "INSERT INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: ["future", "u1", #"{"kind":"water","shape":"from-a-newer-app"}"#])
    }
    try store.append(entry("b"))

    var box = try store.load()
    #expect(box.pending.map(\.id) == ["a", "b"])
    #expect(try store.undecodableIds() == ["future"])

    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.succeeded(id: "a")
    try store.persist(box, settled: ["a"])
    #expect(try store.load().pending.map(\.id) == ["b"])
    #expect(try store.undecodableIds() == ["future"], "persist không xoá hàng nó không đọc được")
  }

  /// Hàng `dead` không giải mã được bị `load()` bỏ qua, nên `outbox.dead` ngắn
  /// hơn số hàng trên đĩa; `persist` đếm như `load()`, không thì bản ghi
  /// `dead` mới nhất bị nuốt.
  @Test func undecodableDeadRowDoesNotSwallowTheNextDeadEntry() throws {
    let database = try ASCNDDatabase()
    let store = OutboxStore(database)
    try database.queue.write { db in
      try db.execute(
        sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: ["old", #"{"not":"a dead entry"}"#])
    }
    try store.append(entry("a"))
    var box = try store.load()
    #expect(box.dead.isEmpty)
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.failed(id: "a", .server(code: "23514"), now: EpochMillis(0))
    try store.persist(box, settled: [])

    let loaded = try store.load()
    #expect(loaded.dead.map(\.entry.id) == ["a"])
    #expect(loaded.pending.isEmpty)
    #expect(try store.undecodableIds() == ["old"])
    try store.persist(box, settled: [])
    #expect(try store.load().dead.count == 1, "persist lần hai không nhân đôi `dead`")
  }

  /// "Tắt app": mở lại cùng tệp, hàng đợi còn nguyên. Migration chạy lại
  /// trên một tệp đã có là vô hại.
  @Test func survivesReopen() throws {
    let path = FileManager.default.temporaryDirectory
      .appendingPathComponent("outbox-\(UUID().uuidString).sqlite").path
    defer { try? FileManager.default.removeItem(atPath: path) }
    do {
      let store = try OutboxStore(path: path)
      try store.append(entry("a"))
      try store.append(entry("b"))
    }
    let reopened = try OutboxStore(path: path)
    var box = try reopened.load()
    #expect(box.pending.map(\.id) == ["a", "b"])
    #expect(box.inFlight == nil)
    guard case .send(let e) = box.next(now: EpochMillis(0), online: true, signedInUser: "u1") else {
      Issue.record("không gửi được sau khi mở lại")
      return
    }
    #expect(e.id == "a")
  }

  /// #401: tạo + gán ngày là một giao dịch, theo thứ tự; gửi lại cùng id là
  /// một hàng; `pending` chỉ trả hàng của người hỏi.
  @Test func planEditsEnqueueAtomicallyInOrder() async throws {
    let store = try OutboxStore()
    let create = OutboxEntry(id: "tpl", userId: "u1", kind: PlanEdit.templateKind, payload: .object(["id": .string("tpl")]), createdAt: EpochMillis(0))
    let assign = OutboxEntry(id: "tpl@day0", userId: "u1", kind: PlanEdit.routineDayKind, payload: .object(["day_of_week": .number(0)]), createdAt: EpochMillis(0))
    try store.append(entry("other", user: "u2"))
    try store.enqueue([create, assign])
    try store.enqueue([create, assign])
    #expect(try store.load().pending.map(\.id) == ["other", "tpl", "tpl@day0"])
    #expect(try store.pending(userId: "u1").map(\.id) == ["tpl", "tpl@day0"])
  }

  /// R2-SYNC-02: `undecodableCount()` đếm hàng không đọc được ở cả hai bảng —
  /// worker dùng số này cho Lab và Sentry.
  @Test func undecodableCountCountsBothTables() throws {
    let database = try ASCNDDatabase()
    let store = OutboxStore(database)
    #expect(try store.undecodableCount() == 0)
    try database.queue.write { db in
      try db.execute(
        sql: "INSERT INTO outbox (id, userId, entry) VALUES (?, ?, ?)",
        arguments: ["future", "u1", #"{"kind":"water","shape":"from-a-newer-app"}"#])
      try db.execute(
        sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: ["old", #"{"not":"a dead entry"}"#])
    }
    #expect(try store.undecodableCount() == 2)
    #expect(try store.load().pending.isEmpty)
  }

  /// AUD-62: gửi lại qua `retryDead` rồi ghi đĩa — hàng chờ gửi trở lại, hàng
  /// `dead` rời đĩa, mở lại không hồi sinh bản sao `dead`, ghi lần hai không
  /// nhân đôi.
  @Test func retryDeadPersistsWithoutResurrectingTheDeadRow() throws {
    let store = try OutboxStore()
    try store.append(entry("a"))
    var box = try store.load()
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.failed(id: "a", .server(code: "23514"), now: EpochMillis(0))
    try store.persist(box, settled: [])
    #expect(try store.load().dead.map(\.entry.id) == ["a"])

    var retried = try store.load()
    #expect(retried.retryDead(id: "a"))
    try store.persist(retried, settled: [])
    var loaded = try store.load()
    #expect(loaded.pending.map(\.id) == ["a"])
    #expect(loaded.dead.isEmpty)
    #expect(loaded.pending[0].history == FailureHistory(), "ngân sách mới")

    try store.persist(retried, settled: [])
    loaded = try store.load()
    #expect(loaded.pending.map(\.id) == ["a"])
    #expect(loaded.dead.isEmpty)
  }

  /// R2-SYNC-03: cắt `outbox_dead` theo tuổi (30 ngày) rồi theo số hàng (100,
  /// cũ nhất trước); hàng chờ gửi không đụng tới; hàng không đọc được không xoá.
  @Test func pruneDeadBoundsTheDeadTableAndLeavesPendingAlone() throws {
    let database = try ASCNDDatabase()
    let store = OutboxStore(database)
    let now = EpochMillis(100 * 24 * 3_600_000)
    try store.append(entry("keep-pending"))
    func deadRow(_ id: String, at: EpochMillis) throws {
      let json = try OutboxStore.json(DeadEntry(entry: entry(id), reason: .exhausted, failure: nil, at: at))
      try database.queue.write { db in
        try db.execute(sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: [id, json])
      }
    }
    try deadRow("old", at: EpochMillis(now.millis - Outbox.deadMaxAgeMillis - 1))
    for i in 0..<101 {
      try deadRow("d\(i)", at: EpochMillis(now.millis - 100 + Int64(i)))
    }
    try database.queue.write { db in
      try db.execute(sql: "INSERT INTO outbox_dead (id, dead) VALUES (?, ?)", arguments: ["mystery", #"{"not":"a dead entry"}"#])
    }

    #expect(try store.pruneDead(now: now) == 2, "1 quá tuổi + 1 vượt trần 100")
    let loaded = try store.load()
    #expect(loaded.pending.map(\.id) == ["keep-pending"])
    #expect(loaded.dead.count == 100)
    #expect(!loaded.dead.map(\.entry.id).contains("old"))
    #expect(!loaded.dead.map(\.entry.id).contains("d0"), "cũ nhất trong số còn tuổi rời đi")
    #expect(loaded.dead.map(\.entry.id).contains("d100"))
    #expect(try store.undecodableIds() == ["mystery"])
    #expect(try store.pruneDead(now: now) == 0, "cắt lại: không còn gì để cắt")
  }
}
