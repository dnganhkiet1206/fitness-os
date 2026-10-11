@testable import ASCNDCore
import Foundation
import Testing

/// Thử thách cộng đồng = CHÍNH RN @ fac9ac2 —
/// `Fixtures/community-challenges-golden.json` (`gen-community-challenges.mjs`:
/// `pendingClaims` biên dịch + nhóm / thẻ nổi bật / `localizeChallenge` chép
/// nguyên văn).
struct CommunityChallengesGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-challenges-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }
  static func strings(_ v: JSONValue?) -> [String] { array(v).compactMap { $0.stringValue } }

  @Test func groupsFeaturedAndPendingAreRNs() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 220)
    for c in cases {
      let today = c["today"]?.stringValue ?? ""
      let items = Self.array(c["items"]).compactMap { CommunityChallenges.challenge($0, lang: "vi") }
      let g = CommunityChallenges.groups(items, today: today)
      #expect(g.joined.map { $0.id } == Self.strings(c["groups"]?["joined"]), "\(c)")
      #expect(g.open.map { $0.id } == Self.strings(c["groups"]?["open"]), "\(c)")
      #expect(g.soon.map { $0.id } == Self.strings(c["groups"]?["soon"]), "\(c)")
      #expect(CommunityChallenges.featured(items, today: today)?.id == c["featured"]?.stringValue, "\(c)")
      let pending = CommunityChallenges.pendingClaims(items, today: today)
      let want = Self.array(c["pending"])
      #expect(pending.map { $0.id } == want.compactMap { $0["id"]?.stringValue }, "\(c)")
      #expect(pending.map { Double($0.daysLeft) } == want.compactMap { $0["daysLeft"]?.doubleValue }, "\(c)")
    }
  }

  @Test func localizeIsRNs() throws {
    let cases = Self.array(try Self.golden()["localize"])
    #expect(cases.count == 15)
    for c in cases {
      var row = c["row"] ?? .null
      if case .object(var o) = row {
        o["id"] = .string("c1")
        row = .object(o)
      }
      let ch = try #require(CommunityChallenges.challenge(row, lang: c["lang"]?.stringValue ?? ""))
      #expect(ch.title == c["title"]?.stringValue, "\(c)")
      #expect(ch.description == c["description"]?.stringValue, "\(c)")
    }
  }
}

@MainActor
struct CommunityChallengesBookTests {
  final class Remote: CommunityChallengesRemote, @unchecked Sendable {
    var rows: [JSONValue] = []
    var historyRows: [JSONValue] = []
    var offsets: [Int] = []
    var leaveTouches = true
    var calls: [String] = []

    func challengesOverview(offsetMinutes: Int) async throws -> [JSONValue] {
      offsets.append(offsetMinutes)
      return rows
    }
    func challengeHistory() async throws -> [JSONValue] { historyRows }
    func setChallengeMembership(me: String, challengeId: String, join: Bool, offsetMinutes: Int) async throws {
      calls.append("\(join ? "join" : "leave"):\(challengeId):\(offsetMinutes)")
      if !join && !leaveTouches { throw CommunityModerationFailure.nothingWritten }
    }
    func claimChallenge(_ challengeId: String, offsetMinutes: Int) async throws -> Int {
      calls.append("claim:\(challengeId)")
      return 150
    }
  }

  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_000_000) }  // 2026-10-03
  }

  static func row(_ id: String, joined: Bool, progress: Int, claimed: Bool = false) -> JSONValue {
    .object([
      "id": .string(id), "title": .string("T \(id)"), "description": .string(""), "target": .number(10),
      "starts_on": .string("2026-09-01"), "ends_on": .string("2026-12-31"), "reward_coins": .number(150),
      "participants": .number(3), "joined": .bool(joined), "progress": .number(Double(progress)),
      "claimed": .bool(claimed),
    ])
  }

  @Test func joinLeaveAndClaimSendTheOffsetAndReread() async {
    let r = Remote()
    r.rows = [Self.row("c1", joined: true, progress: 10), Self.row("c2", joined: false, progress: 0)]
    let b = CommunityChallengesBook(userId: "me", remote: r, clock: Clock(), offsetMinutes: { 420 })
    await b.load(lang: "vi")
    #expect(b.featured?.id == "c1")  // đang theo, chưa nhận
    #expect(await b.setJoined("c2", true, lang: "vi") == .done)
    r.leaveTouches = false
    #expect(await b.setJoined("c2", false, lang: "vi") == .failed(.nothingWritten))
    #expect(await b.claim("c1", lang: "vi") == .claimed(coins: 150, title: "T c1"))
    #expect(r.calls == ["join:c2:420", "leave:c2:420", "claim:c1"])
    #expect(r.offsets.allSatisfy { $0 == 420 })
  }

  @Test func aChallengeGoneFromTheOverviewIsRebuiltFromHistory() async {
    let r = Remote()
    r.historyRows = [
      .object([
        "id": .string("old"), "title": .string("Cũ"), "description": .string(""), "target": .number(30),
        "starts_on": .string("2026-07-01"), "ends_on": .string("2026-07-31"), "coins": .number(120),
        "claimed_at": .string("2026-08-02T10:00:00Z"),
      ])
    ]
    let b = CommunityChallengesBook(userId: "me", remote: r, clock: Clock())
    await b.load(lang: "vi")
    await b.loadHistory(lang: "vi")
    let ch = b.challenge("old")
    #expect(ch?.fromHistory == true)
    #expect(ch?.claimed == true && ch?.joined == true && ch?.progress == 30)
    #expect(ch?.rewardCoins == 120)  // số ĐÃ VÀO SỔ
  }
}
