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

  @Test func signOutDropPersists() throws {
    let store = try OutboxStore()
    var box = Outbox()
    // Bản ghi của tài khoản khác ở ĐẦU hàng → `dead`, xuống đĩa.
    for e in [entry("x", user: "u9"), entry("a"), entry("b")] {
      box.enqueue(e)
      try store.append(e)
    }
    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    try store.persist(box, settled: [])
    #expect(try store.load().dead.count == 1)

    box.dropAllOnSignOut()
    #expect(try store.dropAllOnSignOut() == 2)
    #expect(try store.load().pending.isEmpty)
    #expect(try store.load().dead.isEmpty, "buổi tập của người vừa rời đi không ở lại (#335)")
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
}
