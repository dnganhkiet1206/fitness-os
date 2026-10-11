@testable import ASCNDCore
import Foundation
import Testing

/// Trang người dùng = CHÍNH RN @ fac9ac2 — `Fixtures/community-user-golden.json`
/// (`gen-community-user.mjs`: `buildJourney` biên dịch + biểu thức của màn).
struct CommunityUserGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-user-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func close(_ a: Double, _ b: Double?) -> Bool {
    guard let b else { return false }
    return abs(a - b) < 1e-9
  }

  @Test func journeyIsRNs() throws {
    let cases = Self.array(try Self.golden()["journey"])
    #expect(cases.count == 220)
    for c in cases {
      let unit: WeightUnit = c["unit"]?.stringValue == "lbs" ? .lbs : .kg
      let j = ProgressJourney.build(Self.array(c["rows"]))
      let out = c["out"]
      #expect(Double(j.posts) == out?["posts"]?.doubleValue, "\(c)")
      #expect(j.firstAt == out?["firstAt"]?.stringValue, "\(c)")
      #expect(j.lastAt == out?["lastAt"]?.stringValue, "\(c)")
      let want = Self.array(out?["lines"])
      #expect(j.lines.count == want.count, "\(c)")
      for (line, w) in zip(j.lines, want) {
        let r = ProgressJourney.row(line, unit: unit)
        #expect(r.key.rawValue == w["key"]?.stringValue, "\(c)")
        #expect(r.name == w["name"]?.stringValue, "\(c)")
        #expect(Self.close(r.start, w["start"]?.doubleValue), "\(c)")
        #expect(Self.close(r.end, w["end"]?.doubleValue), "\(c)")
        #expect(Self.close(r.delta, w["delta"]?.doubleValue), "\(c)")
        #expect(Double(line.updates) == w["updates"]?.doubleValue, "\(c)")
        #expect(line.firstAt == w["firstAt"]?.stringValue, "\(c)")
        #expect(line.lastAt == w["lastAt"]?.stringValue, "\(c)")
      }
    }
  }

  @Test func kindsAndFiltersAreRNs() throws {
    let cases = Self.array(try Self.golden()["kinds"])
    #expect(cases.count == 120)
    for c in cases {
      let raw = Self.array(c["raw"]).compactMap(\.stringValue)
      let kinds = CommunityUser.kinds(raw)
      let pick = CommunityUser.KindFilter(rawValue: c["pick"]?.stringValue ?? "") ?? .all
      let kind = CommunityUser.effectiveKind(pick, kinds: kinds)
      let out = c["out"]
      #expect(kinds.map(\.rawValue) == Self.array(out?["kinds"]).compactMap(\.stringValue), "\(c)")
      #expect(kind.rawValue == out?["kind"]?.stringValue, "\(c)")
      #expect(CommunityUser.showsKindRow(kinds) == out?["row"].map { JS.truthyValue($0) }, "\(c)")
      #expect(CommunityUser.showsJourney(kind: kind, kinds: kinds) == out?["journey"].map { JS.truthyValue($0) }, "\(c)")
    }
  }

  @Test func statsAreRNs() throws {
    for c in Self.array(try Self.golden()["stats"]) {
      let s = CommunityUser.stats(Self.array(c["data"]))
      if case .object(let o)? = c["out"] {
        #expect(s.map { Double($0.posts) } == o["posts"]?.doubleValue, "\(c)")
        #expect(s.map { Double($0.likes) } == o["likes"]?.doubleValue, "\(c)")
        #expect(s.map { Double($0.tries) } == o["tries"]?.doubleValue, "\(c)")
      } else {
        #expect(s == nil, "\(c)")
      }
    }
  }

  @Test func journeyDeltaSignsAreRNs() {
    let r = { (d: Double) in ProgressJourney.Row(key: .weight, name: nil, start: 0, end: 0, unit: "kg", delta: d) }
    let en = Locale(identifier: "en_US")
    #expect(r(1.5).deltaText(locale: en) == "+1.5 kg")
    #expect(r(-2).deltaText(locale: en) == "\u{2212}2 kg")
    #expect(r(0).deltaText(locale: en) == "\u{00B1}0 kg")
  }
}

/// `CommunityUserBook` trên một server giả.
@MainActor
struct CommunityUserBookTests {
  struct Boom: Error {}

  final class Remote: CommunityUserRemote, @unchecked Sendable {
    var profileRow: JSONValue? = .object([
      "user_id": .string("u2"), "handle": .string("kiet"), "display_name": .string("Kiệt"),
      "mascot_id": .string("koa"), "is_official": .bool(false), "bio": .string("hi"),
    ])
    var failProfile = false
    var followers = 3
    var following = 4
    var follows = false
    var kindRows = ["workout", "recipe"]
    var statsRows: [JSONValue] = [.object(["posts": .number(2), "likes": .number(5), "tries": .number(1)])]
    var badgeRows: [JSONValue] = []
    var muteRows: [JSONValue] = []
    var journeyRows: [JSONValue] = []
    var journeyCalls = 0
    var postRows: [JSONValue] = []
    var queries: [CommunityPostQuery] = []
    var failPosts = false
    var followFailure: CommunityModerationFailure?
    var unmuteFailure: CommunityModerationFailure?
    var blocked: [String] = []
    var reported: [String] = []

    func followees(me: String) async throws -> [String] { [] }
    func settings(me: String) async throws -> JSONValue? { nil }
    func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] {
      queries.append(q)
      if failPosts { throw Boom() }
      var rows = postRows.filter { r in q.kinds.map { $0.contains(r["kind"]?.stringValue ?? "") } ?? true }
      if let f = q.cursorFilter {
        guard
          let i = rows.firstIndex(where: {
            CommunityPayloads.olderThan(.init(at: $0["created_at"]?.stringValue ?? "", id: $0["id"]?.stringValue ?? "")) == f
          })
        else { return [] }
        rows = Array(rows.dropFirst(i + 1))
      }
      return Array(rows.prefix(q.limit))
    }
    func profiles(ids: [String]) async throws -> [JSONValue] { profileRow.map { [$0] } ?? [] }
    func likedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func savedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func art(ids: [String]) async throws -> [JSONValue] { [] }
    func restriction(me: String, nowISO: String) async throws -> JSONValue? { nil }
    func myProfile(me: String) async throws -> JSONValue? { nil }
    func artURL(path: String) -> URL? { nil }

    func userProfile(id: String) async throws -> JSONValue? {
      if failProfile { throw Boom() }
      return profileRow
    }
    func followCounts(userId: String) async throws -> (followers: Int, following: Int) { (followers, following) }
    func iFollow(me: String, userId: String) async throws -> Bool { follows }
    func userKinds(userId: String) async throws -> [String] { kindRows }
    func userStats(userId: String) async throws -> [JSONValue] { statsRows }
    func userBadges(userId: String) async throws -> [JSONValue] { badgeRows }
    func mutes(me: String, nowISO: String) async throws -> [JSONValue] { muteRows }
    func journeyPosts(userId: String) async throws -> [JSONValue] {
      journeyCalls += 1
      return journeyRows
    }
    func follow(me: String, userId: String, on: Bool) async throws {
      if let followFailure { throw followFailure }
      follows = on
      followers += on ? 1 : -1
    }
    func mute(me: String, userId: String) async throws {
      muteRows = [.object(["muted_id": .string(userId), "until": .string("2026-11-10T00:00:00+00:00")])]
    }
    func unmute(me: String, userId: String) async throws {
      if let unmuteFailure { throw unmuteFailure }
      muteRows = []
    }
    func block(me: String, userId: String) async throws { blocked.append(userId) }
    func reportUser(me: String, userId: String, reason: CommunityReportReason) async throws { reported.append(userId) }

    static func post(_ i: Int, kind: String = "workout") -> JSONValue {
      .object([
        "id": .string(String(format: "p%03d", i)), "author_id": .string("u2"), "kind": .string(kind),
        "payload": .object([:]), "caption": .string(""), "visibility": .string("public"),
        "like_count": .number(0), "comment_count": .number(0), "save_count": .number(0), "hidden": .bool(false),
        "created_at": .string(String(format: "2026-10-%02dT10:%02d:00+00:00", 1 + i / 60, i % 60)),
      ])
    }
  }

  static func book(_ r: Remote, me: String = "me") -> CommunityUserBook {
    CommunityUserBook(userId: me, targetId: "u2", remote: r)
  }

  @Test func goneFailedAndReadyAreDistinct() async {
    let r = Remote()
    r.failProfile = true
    var b = Self.book(r)
    await b.load()
    #expect(b.phase == .failed)
    r.failProfile = false
    r.profileRow = nil
    b = Self.book(r)
    await b.load()
    #expect(b.phase == .gone)
    r.profileRow = Remote().profileRow
    b = Self.book(r)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.followers == 3 && b.following == 4 && !b.iFollow && !b.isMe)
    #expect(b.stats == CommunityUser.Stats(posts: 2, likes: 5, tries: 1))
    #expect(b.kinds == [.workout, .recipe])
    #expect(b.showsKindRow)
  }

  @Test func postsFilterOnTheServerAndPageBy30() async {
    let r = Remote()
    r.postRows = (0..<45).map { Remote.post(44 - $0) }
    let b = Self.book(r)
    await b.load()
    #expect(b.posts.count == 30)
    #expect(b.canLoadMore)
    #expect(r.queries.last?.authors == ["u2"])
    #expect(r.queries.last?.kinds == nil)
    await b.loadMore()
    #expect(b.posts.count == 45)
    #expect(!b.canLoadMore)
    await b.select(.recipe)
    #expect(r.queries.last?.kinds == ["recipe"])
    // Loại không còn bài → về Tất cả, không đứng trước một bộ lọc rỗng.
    r.kindRows = ["workout"]
    await b.load()
    #expect(b.kind == .all)
  }

  @Test func journeyIsAskedOnlyWhenShown() async {
    let r = Remote()
    r.kindRows = ["workout", "progress"]
    let b = Self.book(r)
    await b.load()
    #expect(r.journeyCalls == 0)
    await b.select(.progress)
    #expect(r.journeyCalls == 1)
    r.kindRows = ["progress"]
    let only = Self.book(r)
    await only.load()
    #expect(only.showsJourney)
    #expect(r.journeyCalls == 2)
  }

  @Test func followRereadsCountsAndNamesFailures() async {
    let r = Remote()
    let b = Self.book(r)
    await b.load()
    #expect(await b.toggleFollow() == .done)
    #expect(b.iFollow && b.followers == 4)
    r.followFailure = .offline
    #expect(await b.toggleFollow() == .failed(.offline))
    #expect(b.iFollow)  // không giả là đã bỏ theo dõi
    let me = Self.book(r, me: "u2")
    await me.load()
    #expect(me.isMe)
    #expect(await me.toggleFollow() == .ignored)
  }

  @Test func muteUnmuteBlockAndReport() async {
    let r = Remote()
    let b = Self.book(r)
    await b.load()
    #expect(b.mutedUntil == nil)
    #expect(await b.mute() == .done)
    #expect(b.mutedUntil == "2026-11-10T00:00:00+00:00")
    #expect(await b.mute() == .ignored)
    r.unmuteFailure = .nothingWritten
    #expect(await b.unmute() == .failed(.nothingWritten))
    r.unmuteFailure = nil
    #expect(await b.unmute() == .done)
    #expect(b.mutedUntil == nil)
    #expect(await b.report() == .done)
    #expect(await b.block() == .done)
    #expect(r.reported == ["u2"] && r.blocked == ["u2"])
  }

  @Test func firstPostsFailureIsAnError() async {
    let r = Remote()
    r.failPosts = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.postsPhase == .failed)
  }
}
