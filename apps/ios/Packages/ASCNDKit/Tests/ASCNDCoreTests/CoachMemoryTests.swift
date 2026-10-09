@testable import ASCNDCore
import Foundation
import Testing

/// Trí nhớ coach (#527) — `app/coach-memory.tsx` @ fac9ac2.
@MainActor
struct CoachMemoryTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func row(_ id: String, _ kind: String?, _ fact: String, _ at: String?) -> JSONValue {
    .object([
      "id": .string(id), "kind": kind.map(JSONValue.string) ?? .null, "fact": .string(fact),
      "last_confirmed": at.map(JSONValue.string) ?? .null, "source_excerpt": .null,
    ])
  }

  final class Store: CoachMemoryStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [JSONValue] = []
    var failRead = false
    var failForget = false
    private var log: [String] = []
    var calls: [String] { lock.withLock { log } }
    func facts(userId: String) async throws -> [JSONValue] {
      if lock.withLock({ failRead }) { throw RowStoreError(code: nil, message: "down") }
      return lock.withLock { rows }
    }
    func forget(id: String, userId: String) async throws {
      if lock.withLock({ failForget }) { throw RowStoreError(code: nil, message: "nothing written") }
      lock.withLock {
        log.append("forget \(id)")
        rows.removeAll { $0["id"]?.stringValue == id }
      }
    }
    func forgetAll(userId: String) async throws {
      if lock.withLock({ failForget }) { throw RowStoreError(code: nil, message: "nothing written") }
      lock.withLock {
        log.append("forgetAll \(userId)")
        rows = []
      }
    }
  }

  @Test func lastConfirmedIsTheLocalDayNotTheUTCText() throws {
    // 22:30 UTC ngày 8 = 05:30 ngày 9 ở Hà Nội — cắt chuỗi sẽ ra ngày 8.
    let f = try #require(CoachMemory.fact(Self.row("1", "goal", "Chạy 10k", "2026-10-08T22:30:00+00:00"), in: Self.tz))
    #expect(f.lastConfirmed == LocalDate("2026-10-09"))
    #expect(f.kind == .goal)
    let bad = try #require(CoachMemory.fact(Self.row("2", "mystery", "?", nil), in: Self.tz))
    #expect(bad.kind == nil)
    #expect(bad.lastConfirmed == nil)
    #expect(CoachMemory.fact(.object(["fact": .string("không id")]), in: Self.tz) == nil)
  }

  @Test func groupedInTheScreensOrderUnknownKindsHidden() {
    let facts = [
      CoachMemory.Fact(id: "a", kind: .preference, fact: "Tập buổi sáng", lastConfirmed: nil),
      CoachMemory.Fact(id: "b", kind: .constraint, fact: "Đau gối trái", lastConfirmed: nil),
      CoachMemory.Fact(id: "c", kind: nil, fact: "lạ", lastConfirmed: nil),
      CoachMemory.Fact(id: "d", kind: .constraint, fact: "Không ăn hải sản", lastConfirmed: nil),
    ]
    let g = CoachMemory.groups(facts)
    #expect(g.map(\.kind) == [.constraint, .preference])
    #expect(g.first?.facts.map(\.id) == ["b", "d"])
  }

  @Test func forgetThenReread() async {
    let store = Store()
    store.rows = [Self.row("1", "goal", "Chạy 10k", nil), Self.row("2", "context", "Làm ca đêm", nil)]
    let book = CoachMemoryBook(userId: "u", store: store, in: Self.tz)
    await book.load()
    #expect(book.groups.count == 2)
    await book.forget("1")
    #expect(store.calls == ["forget 1"])
    #expect(book.groups.map(\.kind) == [.context])
    await book.forgetAll()
    #expect(book.phase == .ready([]))
    #expect(!book.forgetFailed)
  }

  @Test func failuresAreNamedAndKeepWhatWasRead() async {
    let store = Store()
    store.rows = [Self.row("1", "goal", "Chạy 10k", nil)]
    let book = CoachMemoryBook(userId: "u", store: store, in: Self.tz)
    await book.load()
    store.failForget = true
    await book.forget("1")
    #expect(book.forgetFailed)
    #expect(book.groups.count == 1)
    store.failRead = true
    await book.load()
    #expect(book.groups.count == 1)  // đọc lại hỏng: giữ danh sách
    let fresh = CoachMemoryBook(userId: "u", store: store, in: Self.tz)
    await fresh.load()
    #expect(fresh.phase == .failed)
  }

  @Test func closedBookIgnoresLateWork() async {
    let store = Store()
    store.rows = [Self.row("1", "goal", "Chạy 10k", nil)]
    let book = CoachMemoryBook(userId: "u", store: store, in: Self.tz)
    book.close()
    await book.load()
    await book.forget("1")
    #expect(book.phase == .loading)
    #expect(store.calls.isEmpty)
  }
}
