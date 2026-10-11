@testable import ASCNDCore
import Foundation
import Testing

/// Thư viện Đã lưu = CHÍNH RN @ fac9ac2 — `Fixtures/community-saved-golden.json`
/// (`gen-community-saved.mjs`: `saved-library.ts` biên dịch).
struct CommunitySavedGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-saved-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  static func post(id: String, kind: String) -> CommunityFeed.Post {
    let row: JSONValue = .object([
      "id": .string(id), "author_id": .string("u2"), "kind": .string(kind), "payload": .object([:]),
      "created_at": .string("2026-10-01T00:00:00Z"),
    ])
    return CommunityFeed.hydrate([row], me: "me", authors: [], liked: [], saved: [], arts: [])[0]
  }

  @Test func selectIsRNs() throws {
    let cases = Self.array(try Self.golden()["select"])
    #expect(cases.count == 240)
    for c in cases {
      let ids = Self.array(c["ids"]).compactMap(\.stringValue)
      let got = CommunitySaved.select(ids: ids, rows: Self.array(c["rows"]), me: "me").map { $0["id"]?.stringValue ?? "" }
      let want = Self.array(c["out"]).compactMap { $0.stringValue }
      #expect(got == want, "\(c)")
    }
  }

  @Test func filterIsRNs() throws {
    let cases = Self.array(try Self.golden()["filter"])
    #expect(cases.count == 180)
    for c in cases {
      let list = Self.array(c["list"]).map {
        Self.post(id: $0["id"]?.stringValue ?? "", kind: $0["kind"]?.stringValue ?? "")
      }
      let f = try #require(CommunitySaved.Filter(rawValue: c["filter"]?.stringValue ?? ""))
      let got = CommunitySaved.filter(list, f).map { $0.id }
      let want = Self.array(c["out"]).compactMap { $0.stringValue }
      #expect(got == want, "\(c)")
    }
  }

  @Test func cursorIsRNs() throws {
    let cases = Self.array(try Self.golden()["cursor"])
    #expect(cases.count == 40)
    for c in cases {
      let saves = Self.array(c["saves"]).map {
        (postId: $0["post_id"]?.stringValue ?? "", createdAt: $0["created_at"]?.stringValue ?? "")
      }
      let got = CommunitySaved.cursor(saves, size: Int(c["page"]?.doubleValue ?? 0))
      if case .object(let o)? = c["out"] {
        #expect(got?.at == o["at"]?.stringValue, "\(c)")
        #expect(got?.id == o["id"]?.stringValue, "\(c)")
      } else {
        #expect(got == nil, "\(c)")
      }
    }
  }
}

@MainActor
struct CommunitySavedBookTests {
  struct Boom: Error {}

  final class Remote: CommunitySavedRemote, @unchecked Sendable {
    /// Dòng lưu, mới → cũ.
    var saveRows: [JSONValue] = []
    var postRows: [String: JSONValue] = [:]
    var failSaves = false
    var reads = 0

    func saves(me: String, olderThan: String?, limit: Int) async throws -> [JSONValue] {
      reads += 1
      if failSaves { throw Boom() }
      var start = 0
      if let olderThan, let i = saveRows.firstIndex(where: { olderThan.contains("post_id.lt.\"\($0["post_id"]?.stringValue ?? "")\"") }) {
        start = i + 1
      }
      return Array(saveRows.dropFirst(start).prefix(limit))
    }
    func posts(ids: [String]) async throws -> [JSONValue] {
      // Server không hứa thứ tự.
      ids.reversed().compactMap { postRows[$0] }
    }
    func followees(me: String) async throws -> [String] { [] }
    func settings(me: String) async throws -> JSONValue? { nil }
    func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] { [] }
    func profiles(ids: [String]) async throws -> [JSONValue] { [] }
    func likedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func savedPostIds(me: String, postIds: [String]) async throws -> [String] { postIds }
    func art(ids: [String]) async throws -> [JSONValue] { [] }
    func restriction(me: String, nowISO: String) async throws -> JSONValue? { nil }
    func myProfile(me: String) async throws -> JSONValue? { nil }
    func artURL(path: String) -> URL? { nil }
  }

  /// `n` dòng lưu p0…p(n-1), mới → cũ; bài theo `kind(i)`; `gone(i)` = RLS không trả.
  static func remote(_ n: Int, kind: (Int) -> String = { _ in "workout" }, gone: (Int) -> Bool = { _ in false }) -> Remote {
    let r = Remote()
    for i in 0..<n {
      let id = "p\(i)"
      r.saveRows.append(
        .object([
          "post_id": .string(id), "created_at": .string(String(format: "2026-10-01T00:00:%02d+00:00", 59 - i % 60)),
        ]))
      if !gone(i) {
        r.postRows[id] = .object([
          "id": .string(id), "author_id": .string("u2"), "kind": .string(kind(i)), "payload": .object([:]),
          "created_at": .string("2026-09-01T00:00:00Z"), "save_count": .number(1),
        ])
      }
    }
    return r
  }

  @Test func orderIsSaveOrderAndPagesFollowTheSaveRows() async {
    let r = Self.remote(45)
    let b = CommunitySavedBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.posts.map { $0.id } == (0..<30).map { "p\($0)" })
    #expect(b.posts.allSatisfy { $0.saved })
    #expect(b.canLoadMore)
    await b.loadMore()
    #expect(b.posts.map { $0.id } == (0..<45).map { "p\($0)" })
    #expect(!b.canLoadMore)
  }

  @Test func aPageOfGonePostsStillMovesTheCursor() async {
    // Trang đầu toàn bài đã ẩn / xoá: con trỏ của DÒNG LƯU vẫn đi tiếp.
    let r = Self.remote(40, gone: { $0 < 30 })
    let b = CommunitySavedBook(userId: "me", remote: r)
    await b.load()
    #expect(b.posts.isEmpty)
    #expect(b.canLoadMore)
    #expect(b.hunting)
    await b.hunt()
    #expect(b.posts.map { $0.id } == (30..<40).map { "p\($0)" })
    #expect(!b.hunting)
  }

  @Test func anEmptyFilterReadsOnUntilItFindsOneOrTheEnd() async {
    let r = Self.remote(70, kind: { $0 == 65 ? "recipe" : "workout" })
    let b = CommunitySavedBook(userId: "me", remote: r)
    await b.load()
    b.filter = .recipe
    #expect(b.hunting)
    await b.hunt()
    #expect(b.visible.map { $0.id } == ["p65"])
    #expect(r.reads == 3)
    b.filter = .all
    #expect(b.visible.count == 70)
  }

  @Test func failuresAreNamedAndKeepWhatIsShown() async {
    let r = Self.remote(35)
    r.failSaves = true
    let b = CommunitySavedBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .failed)
    r.failSaves = false
    await b.load()
    #expect(b.posts.count == 30)
    r.failSaves = true
    await b.loadMore()
    #expect(b.moreFailed)
    #expect(b.posts.count == 30)
    b.filter = .recipe
    #expect(!b.hunting)  // hỏng thì dừng, chờ "Thử lại"
    await b.load()
    #expect(b.posts.count == 30)  // đọc lại hỏng: giữ danh sách đang thấy
    #expect(b.phase == .ready)
  }

  @Test func unsavingInTheLibraryKeepsTheItemUntilNextOpen() async {
    let r = Self.remote(2)
    let b = CommunitySavedBook(userId: "me", remote: r)
    await b.load()
    guard let p = b.post(id: "p1") else {
      Issue.record("p1 missing")
      return
    }
    b.replace(CommunityPostActions.optimistic(p, .save, on: false))
    #expect(b.posts.map { $0.id } == ["p0", "p1"])
    #expect(b.post(id: "p1")?.saved == false)
  }
}
