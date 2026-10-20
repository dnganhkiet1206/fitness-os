@testable import ASCNDCore
import Foundation
import Testing

/// Koa K4 = RN @ fac9ac2, trừ `wave`/`run` đã bỏ (19/10) nên fixture ghi chúng về `idle` — `Fixtures/koa-emotion-golden.json`
/// (`gen-koa-emotion.mjs`: `koaStateFor` biên dịch; `wornFrom` chép nguyên văn
/// trên `getShopItem` biên dịch).
struct KoaEmotionGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "koa-emotion-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  static func worn(_ v: JSONValue?) -> KoaFlags.Worn {
    var w: KoaFlags.Worn = [:]
    for slot in KoaFlags.Slot.allCases {
      if let id = v?[slot.rawValue]?.stringValue { w[slot] = id }
    }
    return w
  }

  @Test func statesAreRNs() throws {
    let cases = Self.array(try Self.golden()["states"])
    #expect(cases.count == 17)
    for c in cases {
      let e = c["e"]?.stringValue ?? ""
      let s = KoaEmotion.state(e)
      // Khác RN có chủ đích (20/10, Kiệt): `tired` / `sleep` ngồi thiền, mắt khép
      // (`meditate`) thay cho mắt mệt của RN. Dáng và đồ vẫn như RN.
      let want = e == "tired" || e == "sleep" ? "meditate" : c["s"]?["expression"]?.stringValue
      #expect(s.expression.rawValue == want, "\(e)")
      #expect(s.pose.rawValue == c["s"]?["pose"]?.stringValue, "\(e)")
      #expect(s.outfit == Self.worn(c["s"]?["outfit"]), "\(e)")
    }
    // mọi cảm xúc của RN trừ `wave`/`run` (đã bỏ, rơi về `idle` — xem fixture)
    #expect(KoaEmotion.Emotion.allCases.count == 13)
    #expect(KoaEmotion.Emotion(rawValue: "wave") == nil && KoaEmotion.Emotion(rawValue: "run") == nil)
    let dev = Self.array(try Self.golden()["dev"]).compactMap { $0.stringValue }
    #expect(KoaEmotion.devEmotions.map { $0.rawValue } == dev)
  }

  @Test func wornIsRNs() throws {
    let cases = Self.array(try Self.golden()["worn"])
    #expect(cases.count == 120)
    for c in cases {
      let keys = Self.array(c["equipped"]).compactMap { $0.stringValue }
      #expect(KoaEmotion.worn(keys) == Self.worn(c["worn"]), "\(keys)")
    }
  }
}

/// Vóc dáng theo hạng (20/10, Kiệt duyệt `koa-rank-evolution.html`).
struct KoaRankBuildTests {
  @Test func flagsFollowTheRank() {
    let newbie = KoaRender.rankFlags(rank: 0, pose: .idle)
    #expect(newbie["rkE0"] == .bool(true) && newbie["rk1"] == .bool(false))
    #expect(newbie["armRankL"] == .text("") && newbie["topRank"] == .text(""))
    let gymRat = KoaRender.rankFlags(rank: 1, pose: .idle)
    #expect(gymRat["rkE1"] == .bool(true) && gymRat["rk1"] == .bool(true) && gymRat["rk2"] == .bool(false))
    let monster = KoaRender.rankFlags(rank: 5, pose: .idle)
    #expect(monster["rkE5"] == .bool(true) && monster["rk5"] == .bool(true))
    #expect(monster["armRankR"]?.text.contains("scale(1.22,1.05)") == true)
    // tay chỉ dang theo vai ở tư thế đứng; đồ cầm tay theo cùng
    #expect(KoaRender.rankFlags(rank: 5, pose: .lifting)["handRank"] == .text(""))
    #expect(monster["handRank"] == monster["armRankR"])
  }

  /// Mọi hạng × tư thế đều vẽ trọn (thân có đúng một biến thể).
  @Test func everyRankPlans() {
    for level in 0..<MascotRules.ranks.count {
      for pose in KoaFlags.Pose.allCases {
        var o = KoaRender.Options()
        o.build = level
        o.pose = pose
        o.worn = [.top: "tank"]
        #expect(KoaPaint.plan(KoaRender.figure(o)).count > 0, "\(level) \(pose)")
      }
    }
  }
}
