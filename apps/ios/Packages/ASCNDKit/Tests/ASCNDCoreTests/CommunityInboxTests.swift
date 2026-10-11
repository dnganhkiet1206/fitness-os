@testable import ASCNDCore
import Foundation
import Testing

/// Hộp thông báo = CHÍNH RN @ fac9ac2 — `Fixtures/community-inbox-golden.json`
/// (`gen-community-inbox.mjs`: thân `useInbox` + `localizeChallenge` +
/// `sentence` / `open` của màn, chép nguyên văn).
struct CommunityInboxGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-inbox-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  static func sentenceText(_ s: CommunityInbox.Sentence) -> String {
    switch s {
    case .follow: "follow"
    case .comment: "comment"
    case .reply: "reply"
    case .mention: "mention"
    case .save: "save"
    case .tryWorkout: "try"
    case .challengeDone: "done"
    case .challengeHalf: "half"
    case .like: "like"
    case .likeMany(let n): "likeMany:\(n)"
    }
  }

  static func targetText(_ t: CommunityInbox.Target?) -> String? {
    switch t {
    case .challenge(let id): "challenge:\(id)"
    case .user(let id): "user:\(id)"
    case .post(let id): "post:\(id)"
    case nil: nil
    }
  }

  @Test func inboxIsRNs() throws {
    let g = try Self.golden()
    let profiles = Self.array(g["profiles"])
    let challenges = Self.array(g["challenges"])
    let cases = Self.array(g["cases"])
    #expect(cases.count == 160)
    var seen = 0
    for c in cases {
      let got = CommunityInbox.build(
        rows: Self.array(c["rows"]), profiles: profiles, challenges: challenges, lang: c["lang"]?.stringValue ?? "")
      let want = Self.array(c["out"])
      #expect(got.count == want.count, "\(c)")
      for (x, w) in zip(got, want) {
        seen += 1
        #expect(x.key == w["key"]?.stringValue, "\(w)")
        #expect(x.kind.rawValue == w["kind"]?.stringValue, "\(w)")
        let actors = x.actors.map { $0.userId }
        #expect(actors == Self.array(w["actors"]).compactMap { $0.stringValue }, "\(w)")
        #expect(Double(x.count) == w["count"]?.doubleValue, "\(w)")
        #expect(x.postId == w["postId"]?.stringValue, "\(w)")
        #expect(x.at == w["at"]?.stringValue, "\(w)")
        #expect(x.unread == (w["unread"] == .bool(true)), "\(w)")
        #expect(x.challenge?.id == w["challenge"]?["id"]?.stringValue, "\(w)")
        #expect(x.challenge?.title == w["challenge"]?["title"]?.stringValue, "\(w)")
        #expect(x.challenge.map { Double($0.milestone) } == w["challenge"]?["milestone"]?.doubleValue, "\(w)")
        #expect(Self.sentenceText(CommunityInbox.sentence(x)) == w["sentence"]?.stringValue, "\(w)")
        #expect(Self.targetText(CommunityInbox.target(x)) == w["open"]?.stringValue, "\(w)")
      }
    }
    #expect(seen > 300)
  }
}

@MainActor
struct CommunityInboxBookTests {
  struct Boom: Error {}

  final class Remote: CommunityInboxRemote, @unchecked Sendable {
    var rows: [JSONValue] = []
    var failMark = false
    var marks = 0

    func notifications(me: String, limit: Int) async throws -> [JSONValue] { Array(rows.prefix(limit)) }
    func profiles(ids: [String]) async throws -> [JSONValue] {
      ids.map { .object(["user_id": .string($0), "handle": .string($0), "display_name": .string($0)]) }
    }
    func challenges(ids: [String]) async throws -> [JSONValue] { [] }
    func markNotificationsRead() async throws {
      marks += 1
      if failMark { throw Boom() }
      rows = rows.map { r in
        guard case .object(var o) = r else { return r }
        o["read_at"] = .string("2026-10-11T00:00:00Z")
        return .object(o)
      }
    }
  }

  static func row(_ id: String, kind: String = "comment", unread: Bool) -> JSONValue {
    .object([
      "id": .string(id), "actor_id": .string("a1"), "kind": .string(kind), "post_id": .string("p1"),
      "created_at": .string("2026-10-10T00:00:00Z"), "read_at": unread ? .null : .string("2026-10-09T00:00:00Z"),
    ])
  }

  @Test func openingMarksReadButKeepsTheDotsForThisVisit() async {
    let r = Remote()
    r.rows = [Self.row("n1", unread: true), Self.row("n2", unread: false)]
    let b = CommunityInboxBook(userId: "me", remote: r)
    await b.load(lang: "vi")
    #expect(b.hasNew)
    await b.beginViewing(lang: "vi")
    #expect(r.marks == 1)
    #expect(!b.hasNew)  // chuông hết chấm
    let n1 = b.items.first { $0.key == "n1" }
    let n2 = b.items.first { $0.key == "n2" }
    #expect(n1.map { b.isNew($0) } == true)  // dòng vẫn mang chấm tới khi rời màn
    #expect(n2.map { b.isNew($0) } == false)
    // Mở lại: ảnh chụp mới — không còn gì mới, không đánh dấu nữa.
    await b.beginViewing(lang: "vi")
    #expect(r.marks == 1)
    #expect(b.items.allSatisfy { !b.isNew($0) })
  }

  @Test func aFailedMarkIsSilentAndRetriedNextOpen() async {
    let r = Remote()
    r.rows = [Self.row("n1", unread: true)]
    r.failMark = true
    let b = CommunityInboxBook(userId: "me", remote: r)
    await b.beginViewing(lang: "vi")
    #expect(b.phase == .ready)
    #expect(r.marks == 1)
    #expect(b.hasNew)
    r.failMark = false
    await b.beginViewing(lang: "vi")
    #expect(r.marks == 2)
    #expect(!b.hasNew)
  }
}
