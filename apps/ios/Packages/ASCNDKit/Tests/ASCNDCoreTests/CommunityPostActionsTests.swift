@testable import ASCNDCore
import Foundation
import Testing

/// Thích / lưu / menu bài (#527, lát 6) = `useToggle` / `usePostMenu` @ fac9ac2 —
/// `Fixtures/community-actions-golden.json` (`gen-community-actions.mjs`:
/// `onMutate` / `onError` của `useToggle`, chép nguyên văn).
@MainActor
struct CommunityPostActionsTests {
  struct Boom: Error {}

  final class Remote: CommunityPostActionsRemote, @unchecked Sendable {
    var failure: CommunityModerationFailure?
    var calls: [String] = []
    func toggle(_ t: CommunityToggle, postId: String, me: String, on: Bool) async throws {
      calls.append("\(t == .like ? "like" : "save"):\(on)")
      if let failure { throw failure }
    }
    func hidePost(postId: String) async throws {
      calls.append("hide")
      if let failure { throw failure }
    }
    func reportPost(me: String, postId: String, reason: CommunityReportReason) async throws {
      calls.append("report:\(reason.rawValue)")
      if let failure { throw failure }
    }
    func deletePost(me: String, postId: String) async throws {
      calls.append("delete")
      if let failure { throw failure }
    }
    func setCommentsOff(postId: String, off: Bool) async throws {
      calls.append("comments:\(off)")
      if let failure { throw failure }
    }
    func mute(me: String, userId: String) async throws {
      calls.append("mute:\(userId)")
      if let failure { throw failure }
    }
    func block(me: String, userId: String) async throws {
      calls.append("block:\(userId)")
      if let failure { throw failure }
    }
  }

  final class Host: CommunityPostHost {
    var posts: [CommunityFeed.Post]
    var reloads = 0
    init(_ posts: [CommunityFeed.Post]) { self.posts = posts }
    func post(id: String) -> CommunityFeed.Post? { posts.first { $0.id == id } }
    func replace(_ post: CommunityFeed.Post) {
      if let i = posts.firstIndex(where: { $0.id == post.id }) { posts[i] = post }
    }
    func reloadAfterAction() async { reloads += 1 }
  }

  static func post(
    id: String = "p1", mine: Bool = false, liked: Bool = false, likes: Int = 3, saved: Bool = false, saves: Int = 0,
    commentsOff: Bool = false
  ) -> CommunityFeed.Post {
    let row: JSONValue = .object([
      "id": .string(id), "author_id": .string(mine ? "me" : "u2"), "kind": .string("workout"),
      "payload": .object([:]), "caption": .string(""), "visibility": .string("public"),
      "like_count": .number(Double(likes)), "comment_count": .number(0), "save_count": .number(Double(saves)),
      "hidden": .bool(false), "created_at": .string("2026-10-01T00:00:00Z"), "comments_off": .bool(commentsOff),
    ])
    let author: JSONValue = .object([
      "user_id": .string(mine ? "me" : "u2"), "handle": .string("h"), "display_name": .string("H"),
    ])
    return CommunityFeed.hydrate(
      [row], me: "me", authors: [author], liked: liked ? [id] : [], saved: saved ? [id] : [], arts: [])[0]
  }

  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-actions-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  @Test func optimisticAndRevertAreRNs() throws {
    let cases = CommunityUserGoldenTests.array(try Self.golden()["toggle"])
    #expect(cases.count >= 100)
    for c in cases {
      let t: CommunityToggle = c["flag"]?.stringValue == "liked" ? .like : .save
      let on = c["on"].map { JS.truthyValue($0) } ?? false
      let p = Self.post(
        liked: c["liked"].map { JS.truthyValue($0) } ?? false, likes: Int(c["like_count"]?.doubleValue ?? 0),
        saved: c["saved"].map { JS.truthyValue($0) } ?? false, saves: Int(c["save_count"]?.doubleValue ?? 0))
      let m = CommunityPostActions.optimistic(p, t, on: on)
      #expect(m.liked == c["mutated"]?["liked"].map { JS.truthyValue($0) }, "\(c)")
      #expect(Double(m.likeCount) == c["mutated"]?["like_count"]?.doubleValue, "\(c)")
      #expect(m.saved == c["mutated"]?["saved"].map { JS.truthyValue($0) }, "\(c)")
      #expect(Double(m.saveCount) == c["mutated"]?["save_count"]?.doubleValue, "\(c)")
      let e = CommunityPostActions.reverted(m, t, on: on)
      #expect(e.liked == c["errored"]?["liked"].map { JS.truthyValue($0) }, "\(c)")
      #expect(e.saved == c["errored"]?["saved"].map { JS.truthyValue($0) }, "\(c)")
    }
  }

  @Test func likeIsImmediateAndAFailureRevertsTheFlagThenRereads() async {
    let r = Remote()
    let host = Host([Self.post(likes: 3)])
    let a = CommunityPostActions(userId: "me", remote: r)
    #expect(await a.toggle(.like, postId: "p1", host: host) == .done)
    #expect(host.posts[0].liked && host.posts[0].likeCount == 4)
    #expect(r.calls == ["like:true"])
    #expect(host.reloads == 0)
    r.failure = .offline
    #expect(await a.toggle(.like, postId: "p1", host: host) == .failed(.offline))
    #expect(host.posts[0].liked)  // cờ trả về như trước lúc bấm
    #expect(host.reloads == 1)  // số đếm đọc lại từ server
    #expect(await a.toggle(.save, postId: "nope", host: host) == .ignored)
  }

  @Test func myPostMenuIsCommentsAndDeleteOnly() async {
    let r = Remote()
    let host = Host([Self.post(mine: true)])
    let a = CommunityPostActions(userId: "me", remote: r)
    #expect(await a.hide(postId: "p1", host: host) == .ignored)
    #expect(await a.report(postId: "p1", reason: .spam, host: host) == .ignored)
    #expect(await a.setCommentsOff(true, postId: "p1", host: host) == .done)
    #expect(host.posts[0].commentsOff)
    #expect(await a.delete(postId: "p1", host: host) == .done)
    #expect(host.reloads == 1)
    r.failure = .nothingWritten
    #expect(await a.delete(postId: "p1", host: host) == .failed(.nothingWritten))
    #expect(r.calls == ["comments:true", "delete", "delete"])
  }

  @Test func othersPostMenuHidesReportsMutesBlocks() async {
    let r = Remote()
    let p = Self.post()
    let host = Host([p])
    let a = CommunityPostActions(userId: "me", remote: r)
    #expect(await a.delete(postId: "p1", host: host) == .ignored)
    #expect(await a.setCommentsOff(true, postId: "p1", host: host) == .ignored)
    #expect(await a.hide(postId: "p1", host: host) == .done)
    #expect(await a.report(postId: "p1", reason: .harassment, host: host) == .done)
    // Sau báo cáo bài đã rời danh sách — tắt tiếng / chặn vẫn theo NGƯỜI.
    host.posts = []
    let author = p.author!
    #expect(await a.mute(author: author, host: host) == .done)
    #expect(await a.block(author: author, host: host) == .done)
    #expect(r.calls == ["hide", "report:harassment", "mute:u2", "block:u2"])
    #expect(host.reloads == 4)
    r.failure = .reportLimit
    host.posts = [p]
    #expect(await a.report(postId: "p1", reason: .spam, host: host) == .failed(.reportLimit))
    #expect(host.reloads == 4)  // hỏng thì không đọc lại
  }
}
