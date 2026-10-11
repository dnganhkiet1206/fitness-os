@testable import ASCNDCore
import Foundation
import Testing

/// Koa K4 = CHÍNH RN @ fac9ac2 — `Fixtures/koa-emotion-golden.json`
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
      #expect(s.expression.rawValue == c["s"]?["expression"]?.stringValue, "\(e)")
      #expect(s.pose.rawValue == c["s"]?["pose"]?.stringValue, "\(e)")
      #expect(s.outfit == Self.worn(c["s"]?["outfit"]), "\(e)")
    }
    // mọi cảm xúc của RN đều có trong bảng
    #expect(KoaEmotion.Emotion.allCases.count == 15)
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
