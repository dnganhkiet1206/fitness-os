@testable import ASCNDCore
import Foundation
import Testing

/// Màn Tìm = CHÍNH RN @ fac9ac2 — `Fixtures/community-search-golden.json`
/// (`gen-community-search.mjs`: `searchTerm`, chuỗi gửi server, lý do gợi ý,
/// xếp lại sau `.in()`).
struct CommunitySearchGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-search-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  @Test func termIsRNs() throws {
    let cases = Self.array(try Self.golden()["term"])
    #expect(cases.count >= 300)
    for c in cases {
      let typed = c["typed"]?.stringValue ?? ""
      let searched = c["searched"]?.stringValue ?? ""
      #expect(CommunitySearch.term(searched) == c["searchTerm"]?.stringValue, "\(c)")
      #expect(CommunitySearch.searching(searched) == (c["searching"] == .bool(true)), "\(c)")
      #expect(CommunitySearch.showsMinHint(typed: typed, searched: searched) == (c["minHint"] == .bool(true)), "\(c)")
      #expect(CommunitySearch.query(searched, mode: .people) == c["people"]?.stringValue, "\(c)")
      #expect(CommunitySearch.query(searched, mode: .recipe) == c["recipe"]?.stringValue, "\(c)")
      #expect(CommunitySearch.query(searched, mode: .posts) == c["recipe"]?.stringValue, "\(c)")
      #expect(CommunitySearch.trimmed(searched) == c["trimmed"]?.stringValue, "\(c)")
    }
  }

  @Test func whyIsRNs() throws {
    let cases = Self.array(try Self.golden()["why"])
    #expect(cases.count == 24)
    for c in cases {
      let p = try #require(CommunitySearch.person(c["row"] ?? .null))
      let want: CommunitySearch.Why
      switch c["out"]?["kind"]?.stringValue {
      case "official": want = .official
      case "active": want = .active(Int(c["out"]?["n"]?.doubleValue ?? -1))
      default: want = .handle("koa")
      }
      #expect(CommunitySearch.why(p) == want, "\(c)")
    }
  }

  @Test func orderIsRNs() throws {
    let cases = Self.array(try Self.golden()["order"])
    #expect(cases.count == 80)
    for c in cases {
      let ids = Self.array(c["ids"]).compactMap { $0.stringValue }
      let got = CommunitySearch.ordered(ids: ids, rows: Self.array(c["rows"])).map { $0["id"]?.stringValue ?? "" }
      let want = Self.array(c["out"]).compactMap { $0.stringValue }
      #expect(got == want, "\(c)")
    }
  }
}

@MainActor
struct CommunitySearchBookTests {
  struct Boom: Error {}

  final class Remote: CommunitySearchRemote, @unchecked Sendable {
    var people: [JSONValue] = []
    var suggestionRows: [JSONValue] = []
    var recipeHits: [JSONValue] = []
    var postRows: [String: JSONValue] = [:]
    var fail = false
    var calls: [String] = []
    var follows: Set<String> = []

    func searchProfiles(term: String) async throws -> [JSONValue] {
      calls.append("people:\(term)")
      if fail { throw Boom() }
      return people.map { row in
        guard case .object(var o) = row else { return row }
        o["i_follow"] = .bool(follows.contains(o["user_id"]?.stringValue ?? ""))
        return .object(o)
      }
    }
    func followSuggestions() async throws -> [JSONValue] {
      calls.append("suggest")
      if fail { throw Boom() }
      return suggestionRows
    }
    func findRecipes(term: String) async throws -> [JSONValue] {
      calls.append("recipe:\(term)")
      if fail { throw Boom() }
      return recipeHits
    }
    func findPosts(term: String) async throws -> [JSONValue] {
      calls.append("posts:\(term)")
      if fail { throw Boom() }
      return []
    }
    func posts(ids: [String]) async throws -> [JSONValue] { ids.reversed().compactMap { postRows[$0] } }
    func follow(me: String, userId: String, on: Bool) async throws {
      calls.append("follow:\(userId):\(on)")
      if fail { throw Boom() }
      if on { follows.insert(userId) } else { follows.remove(userId) }
    }
    func followees(me: String) async throws -> [String] { [] }
    func settings(me: String) async throws -> JSONValue? { nil }
    func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] { [] }
    func profiles(ids: [String]) async throws -> [JSONValue] { [] }
    func likedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func savedPostIds(me: String, postIds: [String]) async throws -> [String] { [] }
    func art(ids: [String]) async throws -> [JSONValue] { [] }
    func restriction(me: String, nowISO: String) async throws -> JSONValue? { nil }
    func myProfile(me: String) async throws -> JSONValue? { nil }
    func artURL(path: String) -> URL? { nil }
  }

  static func person(_ id: String) -> JSONValue {
    .object(["user_id": .string(id), "handle": .string(id), "display_name": .string(id.uppercased())])
  }

  @Test func onlyTheOpenSegmentAsksAndShortTermsDoNot() async {
    let r = Remote()
    r.people = [Self.person("u2")]
    let b = CommunitySearchBook(userId: "me", remote: r)
    await b.search("@a")
    #expect(!b.isSearching)
    #expect(b.peoplePhase == .idle)
    await b.search("  @@KoA ")
    #expect(b.peoplePhase == .ready)
    #expect(b.people.map { $0.id } == ["u2"])
    await b.select(.recipe)
    // Công thức giữ `@` (`q.trim().toLowerCase()`).
    #expect(r.calls == ["people:koa", "recipe:@@koa"])
    #expect(b.hitsPhase == .ready)
    #expect(b.hits.isEmpty)
  }

  @Test func recipeHitsKeepTheServerOrder() async {
    let r = Remote()
    r.recipeHits = [.object(["post_id": .string("p2")]), .object(["post_id": .string("p9")]), .object(["post_id": .string("p1")])]
    for id in ["p1", "p2"] {
      r.postRows[id] = .object([
        "id": .string(id), "author_id": .string("u2"), "kind": .string("recipe"), "payload": .object([:]),
        "created_at": .string("2026-10-01T00:00:00Z"),
      ])
    }
    let b = CommunitySearchBook(userId: "me", mode: .recipe, remote: r)
    await b.search("bowl")
    #expect(b.hits.map { $0.id } == ["p2", "p1"])
    #expect(b.post(id: "p1") != nil)
  }

  @Test func followRereadsTheFlagsEvenWhenItFails() async {
    let r = Remote()
    r.people = [Self.person("u2")]
    let b = CommunitySearchBook(userId: "me", remote: r)
    await b.search("u2")
    #expect(b.people.first?.iFollow == false)
    #expect(await b.follow("u2", on: true) == .done)
    #expect(b.people.first?.iFollow == true)
    #expect(await b.follow("me", on: true) == .ignored)
    r.fail = true
    #expect(await b.follow("u2", on: false) == .failed(.server(code: nil)))
    #expect(r.calls.filter { $0 == "suggest" }.count == 2)
  }

  @Test func failuresAreNamed() async {
    let r = Remote()
    r.fail = true
    let b = CommunitySearchBook(userId: "me", remote: r)
    await b.loadSuggestions()
    #expect(b.suggestionsPhase == .failed)
    await b.search("abc")
    #expect(b.peoplePhase == .failed)
    r.fail = false
    await b.retry()
    #expect(b.peoplePhase == .ready)
  }
}
