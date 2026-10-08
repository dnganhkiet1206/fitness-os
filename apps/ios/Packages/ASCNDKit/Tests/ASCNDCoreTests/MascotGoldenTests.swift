@testable import ASCNDCore
import Foundation
import Testing

/// Phòng linh vật (#527 Phase 7) so với CHÍNH `lib/mascot-room.ts` +
/// `lib/streak.ts` @ fac9ac2 (`Fixtures/mascot-golden.json`, `gen-mascot.mjs`).
struct MascotGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "mascot-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) throws -> [JSONValue] {
    guard case .array(let a)? = v else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  static func int(_ v: JSONValue?) -> Int? { v?.doubleValue.map { Int($0) } }

  @Test func constantsMatchRN() throws {
    let c = try Self.golden()["constants"]
    #expect(Self.int(c?["levelXp"]) == MascotRules.levelXp)
    #expect(Self.int(c?["streakXp"]) == MascotRules.streakXp)
    #expect(Self.int(c?["freezeMax"]) == MascotRules.freezeMax)
    #expect(Self.int(c?["freezePrice"]) == MascotRules.freezePrice)
    #expect(Self.int(c?["weeklyBonusXp"]) == MascotRules.weeklyBonusXp)
    #expect(Self.int(c?["streakWindow"]) == Streak.window)
    #expect(c?["loggedDayFilter"]?.stringValue == Streak.loggedDayFilter)
    let signals = try Self.array(c?["energySignals"]).compactMap(\.stringValue)
    #expect(signals == MascotRules.energySignals.map(\.rawValue))
  }

  @Test func questsRanksAndChallengeRewardsMatchRN() throws {
    let g = try Self.golden()
    let quests = try Self.array(g["quests"])
    #expect(quests.count == MascotRules.dailyQuests.count)
    for (q, def) in zip(quests, MascotRules.dailyQuests) {
      #expect(q["key"]?.stringValue == def.key.rawValue)
      #expect(Self.int(q["coins"]) == def.coins)
      #expect(Self.int(q["xp"]) == def.xp)
      #expect(q["name"]?["vi"]?.stringValue == def.names[0])
      #expect(q["name"]?["en"]?.stringValue == def.names[1])
      #expect(q["name"]?["es"]?.stringValue == def.names[2])
    }
    let ranks = try Self.array(g["ranks"])
    #expect(ranks.count == MascotRules.ranks.count)
    for (r, def) in zip(ranks, MascotRules.ranks) {
      #expect(r["key"]?.stringValue == def.key)
      #expect(Self.int(r["minLevel"]) == def.minLevel)
      #expect(r["color"]?.stringValue == def.colorHex)
      #expect(r["name"]?["vi"]?.stringValue == def.name(.vi))
      #expect(r["name"]?["en"]?.stringValue == def.name(.en))
      #expect(r["name"]?["es"]?.stringValue == def.name(.es))
    }
    guard case .object(let rewards)? = g["challengeReward"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(Set(rewards.keys) == Set(MascotRules.challengeReward.keys))
    for (tier, v) in rewards {
      #expect(Self.int(v["coins"]) == MascotRules.challengeReward[tier]?.coins, "\(tier)")
      #expect(Self.int(v["xp"]) == MascotRules.challengeReward[tier]?.xp, "\(tier)")
    }
    #expect(g["refKeys"]?["quest"]?.stringValue == MascotRules.questRefKey(LocalDate("2026-10-08")!, .workout))
    #expect(
      g["refKeys"]?["challenge"]?.stringValue
        == MascotRules.challengeRefKey(tier: "gold", weekStart: "2026-10-05", key: "steps_week"))
  }

  /// XP đọc từ `ref_key` — gồm khoá giả (`dev:`, `ch:diamond`, `set:nope`, ngày sai dạng).
  @Test func xpForRefKeyMatchesRN() throws {
    for c in try Self.array(Self.golden()["xp"]) {
      let key = try #require(c["refKey"]?.stringValue)
      #expect(MascotRules.xpForRefKey(key) == Self.int(c["xp"]), "\(key)")
    }
  }

  @Test func levelsRanksAndStreakCoinsMatchRN() throws {
    let g = try Self.golden()
    for c in try Self.array(g["levels"]) {
      let x = try #require(Self.int(c["xp"]))
      #expect(MascotRules.level(xp: x) == Self.int(c["level"]), "xp \(x)")
      #expect(x % MascotRules.levelXp == Self.int(c["into"]), "xp \(x) into")
    }
    let byLevel = try Self.array(g["rankByLevel"])
    #expect(byLevel.count == 71)
    for c in byLevel {
      let level = try #require(Self.int(c["level"]))
      #expect(MascotRules.rank(level: level).key == c["rank"]?.stringValue, "level \(level)")
      #expect(MascotRules.nextRank(level: level)?.key == c["next"]?.stringValue, "level \(level) next")
    }
    for c in try Self.array(g["streakCoins"]) {
      let n = try #require(Self.int(c["streak"]))
      #expect(MascotRules.streakCoins(n) == Self.int(c["coins"]), "streak \(n)")
    }
  }

  /// Ví = phép cộng trên sổ: số dư (gồm khoản trừ khi mua), XP theo `ref_key`.
  @Test func walletReductionMatchesRN() throws {
    for c in try Self.array(Self.golden()["ledgers"]) {
      let rows = try Self.array(c["rows"]).map { r in
        LedgerRow(amount: Self.int(r["amount"]) ?? 0, refKey: r["ref_key"]?.stringValue)
      }
      let w = MascotWallet(rows: rows)
      #expect(w.balance == Self.int(c["balance"]))
      #expect(w.xp == Self.int(c["xp"]))
      #expect(w.claimed == Set(rows.compactMap(\.refKey)))
    }
  }

  @Test func energyHeadlineMatchesRN() throws {
    for c in try Self.array(Self.golden()["energy"]) {
      let n = try #require(Self.int(c["count"]))
      #expect(MascotRules.energyHeadline(n).rawValue == c["headline"]?.stringValue, "\(n)")
    }
  }

  /// `streakFrom` / `missedDates`: tương lai, băng, ranh tháng / năm / nhuận.
  @Test func streakAndMissedDatesMatchRN() throws {
    let cases = try Self.array(Self.golden()["streakCases"])
    #expect(cases.count == 17)
    for c in cases {
      let name = c["name"]?.stringValue ?? "?"
      let dates = try Self.array(c["dates"]).compactMap { $0.stringValue.flatMap(LocalDate.init) }
      let frozen = try Self.array(c["frozen"]).compactMap { $0.stringValue.flatMap(LocalDate.init) }
      let today = try #require(c["today"]?.stringValue.flatMap(LocalDate.init))
      let s = Streak.from(dates.map(\.description), today: today.description, frozen: frozen.map(\.description))
      #expect(s.count == Self.int(c["streak"]?["count"]), "\(name): count")
      #expect(s.loggedToday == (c["streak"]?["loggedToday"] == .bool(true)), "\(name): loggedToday")
      let missed = Streak.missedDates(datesDesc: dates, today: today, frozen: frozen).map(\.description)
      #expect(missed == (try Self.array(c["missed"]).compactMap(\.stringValue)), "\(name): missed")
    }
  }
}
