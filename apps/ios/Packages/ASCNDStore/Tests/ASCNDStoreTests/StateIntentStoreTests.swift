import ASCNDCore
@testable import ASCNDStore
import Foundation
import Testing

/// Ý chờ gửi của lớp Trạng thái (#161) trên đĩa (AUD-29): ghi đè toàn bộ ảnh
/// của tài khoản đang đăng nhập, qua chốt tài khoản như `read_cache` (#431).
struct StateIntentStoreTests {
  @Test func saveThenLoadRoundTrips() throws {
    let store = try StateIntentStore()
    let intents = [
      StateIntent(key: "grocery:checked:1", desired: true, server: false),
      StateIntent(key: "supplement:taken:2:2026-11-17", desired: false, server: true),
    ]
    try store.save(intents)
    #expect(try store.load() == intents.sorted { $0.key < $1.key })
  }

  @Test func saveReplacesTheWholeSnapshot() throws {
    let store = try StateIntentStore()
    try store.save([
      StateIntent(key: "a", desired: true, server: false), StateIntent(key: "b", desired: true, server: false),
    ])
    try store.save([StateIntent(key: "b", desired: false, server: false)])
    #expect(try store.load() == [StateIntent(key: "b", desired: false, server: false)])
    // `save([])` là xoá sạch — `clear()` lúc đăng xuất.
    try store.save([])
    #expect(try store.load().isEmpty)
  }

  @Test func signedOutSeesNothingAndCannotSave() throws {
    let db = try ASCNDDatabase()
    db.accounts.signOut()
    let store = StateIntentStore(db)
    #expect(try store.load().isEmpty)
    #expect(throws: AccountScopeClosed.self) {
      try store.save([StateIntent(key: "a", desired: true, server: false)])
    }
  }

  @Test func rowsAreScopedPerUser() throws {
    let db = try ASCNDDatabase()
    let store = StateIntentStore(db)
    db.accounts.signIn("u1")
    try store.save([StateIntent(key: "a", desired: true, server: false)])
    db.accounts.signIn("u2")
    #expect(try store.load().isEmpty)
    try store.save([StateIntent(key: "b", desired: true, server: false)])
    db.accounts.signIn("u1")
    #expect(try store.load() == [StateIntent(key: "a", desired: true, server: false)])
    // Ghi của người này không xoá hàng của người kia.
    try store.save([StateIntent(key: "c", desired: false, server: false)])
    db.accounts.signIn("u2")
    #expect(try store.load() == [StateIntent(key: "b", desired: true, server: false)])
  }

  @Test func clearAllExceptKeepsOneUser() async throws {
    let db = try ASCNDDatabase()
    let store = StateIntentStore(db)
    db.accounts.signIn("U1")
    try store.save([StateIntent(key: "a", desired: true, server: false)])
    db.accounts.signIn("u2")
    try store.save([StateIntent(key: "b", desired: true, server: false)])
    // So không phân biệt hoa thường, như chốt.
    _ = try await store.clearAll(except: "u1")
    db.accounts.signIn("u1")
    #expect(try store.load() == [StateIntent(key: "a", desired: true, server: false)])
    db.accounts.signIn("u2")
    #expect(try store.load().isEmpty)
    _ = try await store.clearAll()
    db.accounts.signIn("u1")
    #expect(try store.load().isEmpty)
  }
}
