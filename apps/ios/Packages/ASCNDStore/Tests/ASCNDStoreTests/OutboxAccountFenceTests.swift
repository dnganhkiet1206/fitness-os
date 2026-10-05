import ASCNDCore
@testable import ASCNDStore
import Foundation
import Testing

/// D-27 (#485): `OutboxStore.enqueue` (PlanWriteStore) phải từ chối entry của
/// người không phải người đang đăng nhập — như `GRDBWorkoutStore.writer(for:)`.
/// Không thì lượt ghi muộn của controller người cũ (PlanEdits/ExerciseLibrary
/// giữ `userId` cũ) chèn hàng outbox của A trong phiên của B.

private func planEntry(_ id: String, user: String) -> OutboxEntry {
  OutboxEntry(
    id: id, userId: user, kind: PlanEdit.templateKind,
    payload: .object(["user_id": .string(user)]), createdAt: EpochMillis(0))
}

struct OutboxAccountFenceTests {
  /// B đang đăng nhập; entry của A (lượt muộn) bị từ chối, không có hàng nào.
  @Test func enqueueForWrongUserIsRefused() throws {
    let db = try ASCNDDatabase()
    let store = OutboxStore(db)
    db.accounts.signIn("b")
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([planEntry("a-1", user: "a")])
    }
    #expect(try store.load().pending.isEmpty)
  }

  /// Không ai đăng nhập: từ chối.
  @Test func enqueueWhileSignedOutIsRefused() throws {
    let db = try ASCNDDatabase()
    let store = OutboxStore(db)
    db.accounts.signOut()
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([planEntry("a-1", user: "a")])
    }
    #expect(try store.load().pending.isEmpty)
  }

  /// Đúng người (không phân biệt hoa thường): ghi được.
  @Test func enqueueForSignedInUserSucceeds() throws {
    let db = try ASCNDDatabase()
    let store = OutboxStore(db)
    db.accounts.signIn("B")
    try store.enqueue([planEntry("b-1", user: "b")])
    #expect(try store.load().pending.map(\.id) == ["b-1"])
  }

  /// Tên rỗng không bao giờ được ghi.
  @Test func enqueueWithEmptyUserIsRefused() throws {
    let db = try ASCNDDatabase()
    let store = OutboxStore(db)
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([planEntry("x-1", user: "")])
    }
    #expect(try store.load().pending.isEmpty)
  }
}
