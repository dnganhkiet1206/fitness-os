@testable import ASCNDCore
import Foundation
import Testing

@MainActor
struct DirectMessagesTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  nonisolated static func at(_ iso: String) -> EpochMillis { EpochMillis(iso8601: iso)! }
  static let minh = CommunityFeed.Author(
    userId: "u-minh", handle: "minhlifts", displayName: "Minh Trần", mascotId: nil, isOfficial: false, bio: nil)

  static func thread(_ id: String, at iso: String, request: Bool = false, unread: Bool = false) -> DirectMessages.Thread {
    DirectMessages.Thread(
      id: id, other: minh, lastText: "x", lastAt: at(iso), lastFromMe: false, unread: unread, isRequest: request,
      training: nil)
  }

  final class Fake: DMSource, @unchecked Sendable {
    var store: [String: [DirectMessages.Message]] = [:]
    var reads: [String] = []
    var fail = false
    var n = 0
    func threads(userId: String) async throws -> [DirectMessages.Thread] { [] }
    func messages(threadId: String) async throws -> [DirectMessages.Message] { store[threadId] ?? [] }
    func send(threadId: String, from userId: String, body: DirectMessages.Body) async throws -> DirectMessages.Message {
      if fail { throw CancellationError() }
      n += 1
      let m = DirectMessages.Message(id: "m\(n)", senderId: userId, body: body, at: EpochMillis(1_760_504_400_000))
      store[threadId, default: []].append(m)
      return m
    }
    func open(with other: CommunityFeed.Author, userId: String) async throws -> DirectMessages.Thread {
      DirectMessages.Thread(
        id: "t-new", other: other, lastText: "", lastAt: EpochMillis(0), lastFromMe: false, unread: false,
        isRequest: false, training: nil)
    }
    func markRead(threadId: String, userId: String) async throws { reads.append(threadId) }
  }

  @Test func sendableTrimsAndRejectsBlank() {
    #expect(DirectMessages.sendable("  hi \n") == "hi")
    #expect(DirectMessages.sendable("   ") == nil)
    #expect(DirectMessages.sendable(String(repeating: "a", count: 1200))?.count == 1000)
  }

  @Test func rowsAddDaySeparatorsAndOneSeenMark() {
    let ms = [
      DirectMessages.Message(id: "a", senderId: "me", body: .text("1"), at: Self.at("2026-10-14T02:00:00Z"), readAt: Self.at("2026-10-14T03:00:00Z")),
      DirectMessages.Message(id: "b", senderId: "u-minh", body: .text("2"), at: Self.at("2026-10-14T18:00:00Z")),  // 15/10 01:00 VN
      DirectMessages.Message(id: "c", senderId: "me", body: .text("3"), at: Self.at("2026-10-15T01:00:00Z"), readAt: Self.at("2026-10-15T01:05:00Z")),
      DirectMessages.Message(id: "d", senderId: "me", body: .text("4"), at: Self.at("2026-10-15T02:00:00Z")),
    ]
    let rows = DirectMessages.rows(ms.reversed(), me: "me", timeZone: Self.tz)
    #expect(rows.map(\.id) == ["d:2026-10-14", "m:a", "d:2026-10-15", "m:b", "m:c", "m:d"])
    let seen = rows.compactMap { r -> String? in if case .message(let m, _, true) = r { m.id } else { nil } }
    #expect(seen == ["c"], "chỉ tin cuối của mình đã đọc")
  }

  @Test func splitSortsNewestAndSeparatesRequests() {
    let s = DirectMessages.split([
      Self.thread("old", at: "2026-10-10T00:00:00Z"), Self.thread("req", at: "2026-10-15T00:00:00Z", request: true),
      Self.thread("new", at: "2026-10-14T00:00:00Z"),
    ])
    #expect(s.main.map(\.id) == ["new", "old"])
    #expect(s.requests.map(\.id) == ["req"])
  }

  @Test func filterFoldsDiacritics() {
    let ts = [Self.thread("t", at: "2026-10-15T00:00:00Z")]
    #expect(DirectMessages.filter(ts, query: "tran").count == 1)
    #expect(DirectMessages.filter(ts, query: "@x").isEmpty)
    #expect(DirectMessages.filter(ts, query: "MINHLI").count == 1)
  }

  @Test func threadBookMarksReadSendsAndPromotesRequest() async {
    let f = Fake()
    var updates: [DirectMessages.Thread] = []
    let b = DMThreadBook(userId: "me", thread: Self.thread("t1", at: "2026-10-15T00:00:00Z", request: true, unread: true), source: f) {
      updates.append($0)
    }
    await b.load()
    #expect(f.reads == ["t1"])
    #expect(!b.thread.unread)
    #expect(await b.send(.text("   ")) == false)
    #expect(await b.send(.text("  chào ")))
    #expect(b.messages.count == 1)
    #expect(b.thread.lastText == "chào" && b.thread.lastFromMe && !b.thread.isRequest)
    #expect(updates.count == 2)
    f.fail = true
    #expect(await b.send(.text("x")) == false)
    #expect(b.sendFailed)
  }
}
