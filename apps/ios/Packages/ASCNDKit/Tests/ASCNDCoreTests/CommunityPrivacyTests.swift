@testable import ASCNDCore
import Foundation
import Testing

/// Quyền riêng tư = CHÍNH RN @ fac9ac2 — `Fixtures/community-privacy-golden.json`
/// (`gen-community-privacy.mjs`: `readCommunitySettings` / `readDiscoverKinds`,
/// công tắc Khám phá, danh sách chặn — chép nguyên văn).
struct CommunityPrivacyGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-privacy-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }
  static func strings(_ v: JSONValue?) -> [String] { array(v).compactMap { $0.stringValue } }

  @Test func settingsAreRNs() throws {
    let cases = Self.array(try Self.golden()["settings"])
    #expect(cases.count == 151)
    for c in cases {
      let row: JSONValue? = c["row"] == .null ? nil : c["row"]
      let s = CommunityPrivacy.settings(row)
      let o = c["out"]
      #expect(s.defaultVisibility.rawValue == o?["defaultVisibility"]?.stringValue, "\(c)")
      #expect(s.showBadges == (o?["showBadges"] == .bool(true)), "\(c)")
      #expect(s.discoverKinds == Self.strings(o?["discoverKinds"]), "\(c)")
      for k in CommunityPrivacy.NotifyKey.allCases {
        #expect(s.notify[k] == (o?["notify"]?[k.rawValue] == .bool(true)), "\(k) \(c)")
      }
    }
  }

  @Test func discoverSwitchesAreRNs() throws {
    let cases = Self.array(try Self.golden()["kinds"])
    #expect(cases.count == 42)
    for c in cases {
      let kinds = Self.strings(c["kinds"])
      let k = c["k"]?.stringValue ?? ""
      let on = c["v"] == .bool(true)
      #expect(CommunityPrivacy.kinds(kinds, toggling: k, on: on) == Self.strings(c["out"]), "\(c)")
      #expect(CommunityPrivacy.isLastOn(kinds, k) == (c["last"] == .bool(true)), "\(c)")
    }
  }

  @Test func blockedListIsRNs() throws {
    let g = try Self.golden()
    let profiles = Self.array(g["profiles"])
    let cases = Self.array(g["people"])
    #expect(cases.count == 40)
    for c in cases {
      let got = CommunityPrivacy.people(
        rows: Self.array(c["rows"]), idColumn: "blocked_id", atColumn: "created_at", profiles: profiles)
      let want = Self.array(c["out"])
      #expect(got.map { $0.userId } == want.compactMap { $0["user_id"]?.stringValue }, "\(c)")
      #expect(got.map { $0.at } == want.compactMap { $0["since"]?.stringValue }, "\(c)")
      #expect(got.map { $0.profile?.userId } == want.map { $0["profile"]?.stringValue }, "\(c)")
    }
  }
}

@MainActor
struct CommunityPrivacyBookTests {
  struct Boom: Error {}

  final class Remote: CommunityPrivacyRemote, @unchecked Sendable {
    var row: [String: JSONValue] = [:]
    var blockRows: [JSONValue] = []
    var failWrite = false
    var patches: [[String: JSONValue]] = []
    var deleted = 0

    func privacySettings(me: String) async throws -> JSONValue? { row.isEmpty ? nil : .object(row) }
    func updateSettings(me: String, patch: [String: JSONValue]) async throws {
      patches.append(patch)
      if failWrite { throw CommunityModerationFailure.offline }
      row.merge(patch) { $1 }
    }
    func blocks(me: String) async throws -> [JSONValue] { blockRows }
    func mutes(me: String, nowISO: String) async throws -> [JSONValue] { [] }
    func profiles(ids: [String]) async throws -> [JSONValue] { [] }
    func unblock(me: String, userId: String) async throws {
      let before = blockRows.count
      blockRows.removeAll { $0["blocked_id"]?.stringValue == userId }
      if blockRows.count == before { throw CommunityModerationFailure.nothingWritten }
    }
    func unmute(me: String, userId: String) async throws {}
    func deleteAllPosts(me: String) async throws -> Int { deleted }
  }

  @Test func defaultsWithoutARowThenWritesAndRereads() async {
    let r = Remote()
    let b = CommunityPrivacyBook(userId: "me", remote: r)
    await b.load()
    #expect(b.visibility == .public)
    #expect(!b.badgesOn)
    #expect(b.kinds == ["workout", "progress", "recipe"])
    #expect(CommunityPrivacy.NotifyKey.allCases.allSatisfy { b.notifyOn($0) })
    #expect(await b.setVisibility(.followers) == .done)
    #expect(b.visibility == .followers)
    #expect(await b.setVisibility(.followers) == .ignored)
    #expect(await b.setNotify(.likes, on: false) == .done)
    #expect(!b.notifyOn(.likes))
    #expect(r.patches.count == 2)
  }

  @Test func theLastDiscoverKindStaysOn() async {
    let r = Remote()
    r.row = ["discover_kinds": .array([.string("recipe")])]
    let b = CommunityPrivacyBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.setKind("recipe", on: false) == .ignored)
    #expect(await b.setKind("workout", on: true) == .done)
    #expect(b.kinds == ["workout", "recipe"])
    r.failWrite = true
    #expect(await b.setKind("recipe", on: false) == .failed(.offline))
    #expect(b.kinds == ["workout", "recipe"])  // đọc lại sau lỗi
  }

  @Test func unblockMustTouchARowAndWipeCountsPosts() async {
    let r = Remote()
    r.blockRows = [.object(["blocked_id": .string("u2"), "created_at": .string("2026-10-01T00:00:00Z")])]
    let b = CommunityPrivacyBook(userId: "me", remote: r)
    await b.load()
    #expect(b.blocked.map { $0.userId } == ["u2"])
    #expect(b.blocked.first?.profile == nil)
    #expect(await b.unblock("u2") == .done)
    #expect(b.blocked.isEmpty)
    #expect(await b.unblock("u2") == .failed(.nothingWritten))
    r.deleted = 0
    #expect(await b.deleteAllPosts() == .deleted(0))
    r.deleted = 4
    #expect(await b.deleteAllPosts() == .deleted(4))
  }
}
