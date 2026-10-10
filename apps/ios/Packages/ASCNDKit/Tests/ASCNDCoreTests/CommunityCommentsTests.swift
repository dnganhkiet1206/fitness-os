@testable import ASCNDCore
import Foundation
import Testing

/// Bình luận = CHÍNH `lib/comment-thread.ts` @ fac9ac2 —
/// `Fixtures/community-comments-golden.json` (`gen-community-comments.mjs`).
struct CommunityCommentsGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-comments-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func node(_ v: JSONValue) -> CommentThread.Node {
    .init(id: v["id"]?.stringValue ?? "", parentId: v["parent_id"]?.stringValue, createdAt: v["created_at"]?.stringValue ?? "")
  }

  @Test func mentionPartsAreRNs() throws {
    let cases = Self.array(try Self.root()["mentions"])
    #expect(cases.count == 160)
    var linked = 0
    for c in cases {
      var known: [String: String] = [:]
      for pair in Self.array(c["known"]) {
        let p = Self.array(pair)
        if let h = p.first?.stringValue, let u = p.last?.stringValue { known[h] = u }
      }
      let got = CommentThread.mentionParts(c["body"]?.stringValue ?? "", known: known)
      let want = Self.array(c["out"]).map { CommentThread.Part(text: $0["text"]?.stringValue ?? "", userId: $0["userId"]?.stringValue) }
      #expect(got == want, "\(c)")
      if got.contains(where: { $0.userId != nil }) { linked += 1 }
    }
    #expect(linked > 40)
  }

  @Test func threadsAreRNs() throws {
    let cases = Self.array(try Self.root()["threads"])
    #expect(cases.count == 120)
    for c in cases {
      let got = CommentThread.threads(Self.array(c["list"]), node: Self.node)
      let want = Self.array(c["out"])
      #expect(got.count == want.count, "\(c)")
      for (g, w) in zip(got, want) {
        #expect(Self.node(g.root).id == w["root"]?.stringValue, "\(c)")
        #expect(g.replies.map { Self.node($0).id } == Self.array(w["replies"]).compactMap(\.stringValue), "\(c)")
      }
    }
  }

  @Test func missingRootsAreRNs() throws {
    let cases = Self.array(try Self.root()["missing"])
    #expect(cases.count == 60)
    for c in cases {
      let rows = Self.array(c["rows"]).map(Self.node)
      #expect(CommentThread.missingRoots(rows) == Self.array(c["out"]).compactMap(\.stringValue), "\(c)")
    }
  }

  @Test func mergePagesIsRNs() throws {
    let cases = Self.array(try Self.root()["merges"])
    #expect(cases.count == 60)
    for c in cases {
      let pages = Self.array(c["pages"]).map { (rows: Self.array($0["rows"]), roots: Self.array($0["roots"])) }
      let got = CommentThread.mergePages(pages, node: Self.node).compactMap { $0["tag"]?.doubleValue }
      #expect(got == Self.array(c["out"]).compactMap(\.doubleValue), "\(c)")
    }
  }

  @Test func replyPrefixIsRNs() throws {
    for c in Self.array(try Self.root()["prefix"]) {
      #expect(CommentThread.replyPrefix(c["handle"]?.stringValue) == c["out"]?.stringValue)
    }
  }

  /// Ô RN `maxLength={500}` (UTF-16), thân gửi `body.trim()`; CHECK của bảng là
  /// `char_length(btrim(body)) BETWEEN 1 AND 500`.
  @Test func draftLimitAndTrim() {
    #expect(CommentThread.clamp(String(repeating: "a", count: 501)).count == 500)
    #expect(CommentThread.clamp(String(repeating: "😀", count: 300)).utf16.count == 500)
    #expect(CommentThread.sendable("  \n ") == nil)
    #expect(CommentThread.sendable("  @kiet hi \n") == "@kiet hi")
  }
}

@MainActor
struct CommunityPostBookTests {
  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_633_600) }  // 2026-10-10T12:00Z
  }

  struct Boom: Error {}

  final class Remote: CommunityPostRemote, @unchecked Sendable {
    var postRow: JSONValue?
    var failPost = false
    /// Mới → cũ.
    var table: [JSONValue] = []
    var failComments = false
    var mentions: [JSONValue] = []
    var muted: [String] = []
    var restrictionRow: JSONValue?
    var profileRow: JSONValue? = .object(["handle": .string("me1"), "display_name": .string("Me")])
    var addFailure: CommunityCommentFailure?
    var added: [(body: String, parent: String?)] = []
    var pageCalls = 0
    // Lát 4.
    var deleteFailure: CommunityModerationFailure?
    var deleted: [String] = []
    var reportFailure: CommunityModerationFailure?
    var reported: [(id: String, reason: CommunityReportReason)] = []
    var hiddenRows: [JSONValue] = []
    var failHidden = false
    var hiddenCalls = 0
    var appealFailure: CommunityModerationFailure?
    var appeals: [(id: String, message: String)] = []

    func followees(me: String) async throws -> [String] { [] }
    func settings(me: String) async throws -> JSONValue? { nil }
    func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] { [] }
    func profiles(ids: [String]) async throws -> [JSONValue] {
      ids.map { .object(["user_id": .string($0), "handle": .string("h\($0)"), "display_name": .string("N\($0)")]) }
    }
    func likedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func savedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func art(ids: [String]) async throws -> [JSONValue] { [] }
    func restriction(me: String, nowISO: String) async throws -> JSONValue? { restrictionRow }
    func myProfile(me: String) async throws -> JSONValue? { profileRow }
    func artURL(path: String) -> URL? { nil }

    func post(id: String) async throws -> JSONValue? {
      if failPost { throw Boom() }
      return postRow
    }
    func comments(postId: String, olderThan: String?, limit: Int) async throws -> [JSONValue] {
      pageCalls += 1
      if failComments { throw Boom() }
      var rows = table
      if let f = olderThan {
        guard
          let i = rows.firstIndex(where: {
            CommunityPayloads.olderThan(.init(at: $0["created_at"]?.stringValue ?? "", id: $0["id"]?.stringValue ?? "")) == f
          })
        else { return [] }
        rows = Array(rows.dropFirst(i + 1))
      }
      return Array(rows.prefix(limit))
    }
    func comments(ids: [String]) async throws -> [JSONValue] {
      table.filter { ids.contains($0["id"]?.stringValue ?? "") }
    }
    func commentMentions(commentIds: [String]) async throws -> [JSONValue] {
      mentions.filter { commentIds.contains($0["comment_id"]?.stringValue ?? "") }
    }
    func mutedIds(me: String, nowISO: String) async throws -> [String] { muted }
    func addComment(postId: String, me: String, body: String, parentId: String?) async throws {
      if let addFailure { throw addFailure }
      added.append((body, parentId))
      let n = table.count
      table.insert(Self.comment(n + 1000, author: me, parent: parentId), at: 0)
    }

    func deleteComment(id: String) async throws {
      await Task.yield()
      if let deleteFailure { throw deleteFailure }
      deleted.append(id)
      // ON DELETE CASCADE: trả lời của nó đi theo.
      table.removeAll { $0["id"]?.stringValue == id || $0["parent_id"]?.stringValue == id }
    }
    func reportComment(id: String, me: String, reason: CommunityReportReason) async throws {
      await Task.yield()
      if let reportFailure { throw reportFailure }
      reported.append((id, reason))
    }
    func hiddenReasons() async throws -> [JSONValue] {
      hiddenCalls += 1
      if failHidden { throw Boom() }
      return hiddenRows
    }
    func appeal(commentId: String, message: String) async throws {
      await Task.yield()
      if let appealFailure { throw appealFailure }
      appeals.append((commentId, message))
      hiddenRows = hiddenRows.map { r in
        guard r["comment_id"]?.stringValue == commentId, case .object(var o) = r else { return r }
        o["review_requested"] = .bool(true)
        return .object(o)
      }
    }

    static func comment(_ i: Int, author: String, parent: String? = nil, body: String = "hi", hidden: Bool = false)
      -> JSONValue
    {
      .object([
        "id": .string(String(format: "c%04d", i)), "post_id": .string("p1"), "author_id": .string(author),
        "body": .string(body), "parent_id": parent.map(JSONValue.string) ?? .null, "hidden": .bool(hidden),
        "created_at": .string(String(format: "2026-10-%02dT10:%02d:00+00:00", 1 + i / 60, i % 60)),
      ])
    }

    static func postRow(mine: Bool = false, commentsOff: Bool = false, count: Int = 0) -> JSONValue {
      .object([
        "id": .string("p1"), "author_id": .string(mine ? "me" : "x"), "kind": .string("workout"),
        "payload": .object([:]), "caption": .string(""), "visibility": .string("public"),
        "like_count": .number(0), "comment_count": .number(Double(count)), "save_count": .number(0),
        "hidden": .bool(false), "created_at": .string("2026-10-01T00:00:00Z"), "comments_off": .bool(commentsOff),
      ])
    }
  }

  static func book(_ r: Remote) -> CommunityPostBook {
    CommunityPostBook(userId: "me", postId: "p1", remote: r, clock: Clock())
  }

  /// Bảng mới → cũ: `count` bình luận, id tăng theo thời gian.
  static func seed(_ r: Remote, count: Int, author: (Int) -> String = { _ in "a" }) {
    r.table = (0..<count).map { Remote.comment($0, author: author($0)) }.reversed()
  }

  @Test func goneAndFailedAreDistinct() async {
    let r = Remote()
    r.failPost = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .failed)
    r.failPost = false
    await b.load()
    #expect(b.phase == .gone)  // không còn bài ≠ đọc hỏng
    r.postRow = Remote.postRow(count: 3)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.commentCount == 3)
  }

  @Test func commentsPageBy50OldToNewAndOlderFailureKeepsThem() async {
    let r = Remote()
    r.postRow = Remote.postRow()
    Self.seed(r, count: 120)
    let b = Self.book(r)
    await b.load()
    #expect(b.commentsPhase == .ready)
    #expect(b.comments.count == 50)
    #expect(b.comments.first?.id == "c0070")  // 50 câu mới nhất, cũ → mới
    #expect(b.comments.last?.id == "c0119")
    #expect(b.canLoadOlder)
    r.failComments = true
    await b.loadOlder()
    #expect(b.olderFailed)
    #expect(b.comments.count == 50)  // giữ những gì đã có
    r.failComments = false
    await b.loadOlder()
    await b.loadOlder()
    #expect(b.comments.count == 120)
    #expect(!b.canLoadOlder)
    #expect(b.comments.map(\.id) == (0..<120).map { String(format: "c%04d", $0) })
  }

  @Test func firstCommentFailureIsAnErrorNotEmpty() async {
    let r = Remote()
    r.postRow = Remote.postRow()
    r.failComments = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.commentsPhase == .failed)
    r.failComments = false
    await b.reloadComments()
    #expect(b.commentsPhase == .ready)
    #expect(b.comments.isEmpty)
  }

  @Test func orphanReplyBringsItsRootAndMentionsAreConfirmedOnly() async {
    let r = Remote()
    r.postRow = Remote.postRow()
    Self.seed(r, count: 60)
    // c0059 trả lời c0001 (nằm ở trang cũ): gốc phải về cùng trang đầu.
    r.table[0] = Remote.comment(59, author: "a", parent: "c0001", body: "@hb chào @ghost")
    r.mentions = [.object(["comment_id": .string("c0059"), "user_id": .string("b")])]
    let b = Self.book(r)
    await b.load()
    #expect(b.comments.contains { $0.id == "c0001" })
    let reply = b.comments.first { $0.id == "c0059" }
    #expect(reply?.mentions == ["hb": "b"])
    let parts = CommentThread.mentionParts(reply?.body ?? "", known: reply?.mentions ?? [:])
    #expect(parts.filter { $0.userId != nil }.map(\.text) == ["@hb"])  // @ghost vẫn là chữ
    let thread = b.threads.first { $0.root.id == "c0001" }
    #expect(thread?.replies.map(\.id) == ["c0059"])
  }

  @Test func mutedAuthorsAreHiddenButNotMyOwn() async {
    let r = Remote()
    r.postRow = Remote.postRow()
    Self.seed(r, count: 4) { ["a", "muted", "me", "muted"][$0] }
    r.muted = ["muted", "me"]
    let b = Self.book(r)
    await b.load()
    #expect(b.comments.map(\.authorId) == ["a", "me"])
  }

  @Test func sendIsOnlineOnlyAndNamesTheLimitAndRestriction() async {
    let r = Remote()
    r.postRow = Remote.postRow(count: 0)
    let b = Self.book(r)
    await b.load()
    #expect(b.canComment)
    #expect(await b.send("   ", replyTo: nil) == .ignored)
    r.addFailure = .limit
    #expect(await b.send("hi", replyTo: nil) == .failed(.limit))
    r.addFailure = .restricted
    #expect(await b.send("hi", replyTo: nil) == .failed(.restricted))
    r.addFailure = .offline
    #expect(await b.send("hi", replyTo: nil) == .failed(.offline))
    #expect(r.added.isEmpty)
    #expect(b.commentCount == 0)  // không giả báo đã gửi
    r.addFailure = nil
    #expect(await b.send("  @ha xin chào  ", replyTo: "c0007") == .sent)
    #expect(r.added.first?.body == "@ha xin chào")
    #expect(r.added.first?.parent == "c0007")
    #expect(b.commentCount == 1)
    #expect(b.comments.count == 1)  // đọc lại sau khi gửi
  }

  @Test func closedCommentsRestrictionAndNoProfileBlockTheComposer() async {
    let r = Remote()
    r.postRow = Remote.postRow(commentsOff: true)
    let b = Self.book(r)
    await b.load()
    #expect(!b.canComment)
    #expect(await b.send("hi", replyTo: nil) == .ignored)
    r.postRow = Remote.postRow(mine: true, commentsOff: true)
    await b.load()
    #expect(b.canComment)  // tác giả vẫn bình luận được
    r.restrictionRow = .object(["until": .string("2026-10-12T00:00:00+00:00")])
    await b.load()
    #expect(!b.canComment)
    r.restrictionRow = nil
    r.profileRow = nil
    await b.load()
    #expect(b.hasProfile == false)
    #expect(!b.canComment)
  }
}
