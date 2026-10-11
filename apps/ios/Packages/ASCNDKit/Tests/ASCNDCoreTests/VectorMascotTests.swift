@testable import ASCNDCore
import Foundation
import Testing

/// Linh vật vector V1 = CHÍNH `VectorMascot` của RN @ fac9ac2 —
/// `Fixtures/vector-mascot-golden.json` (`gen-vector-mascot.mjs`: dựng bằng
/// react-test-renderer ở khung đứng yên). So cả cây: thẻ, từng thuộc tính (kể
/// cả từng ký tự của `d`), ma trận, thứ tự con.
struct VectorMascotGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "vector-mascot-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  @Test func everyMascotIsRNs() throws {
    let cases = KoaRenderGoldenTests.array(try Self.golden()["cases"])
    #expect(cases.count == 23)
    for (i, c) in cases.enumerated() {
      let mood = try #require(VectorMascot.Mood(rawValue: c["mood"]?.stringValue ?? ""))
      let equipped = Set(KoaRenderGoldenTests.array(c["equipped"]).compactMap { $0.stringValue })
      let tree = VectorMascot.figure(
        id: c["id"]?.stringValue ?? "", size: c["size"]?.doubleValue ?? 0, mood: mood,
        level: c["level"]?.intValue ?? 1, equipped: equipped)
      let d = KoaRenderGoldenTests.diff(tree, c["tree"] ?? .null, "#\(i)")
      #expect(d == nil, "\(d ?? "")")
    }
  }

  @Test func jsNumbersAndShades() {
    #expect(VectorMascot.js(117) == "117")
    #expect(VectorMascot.js(-0.0) == "0")
    #expect(VectorMascot.js(68.24000000000001) == "68.24000000000001")
    #expect(VectorMascot.js(4.5) == "4.5")
    #expect(VectorMascot.shade("#3d4450", -14) == "#2f3642")
    #expect(VectorMascot.shade("#e5e8ec", 26) == "#ffffff")  // kẹp 255
  }

  /// Mọi linh vật đều lập được kế hoạch vẽ trọn (mọi `url(#…)` có clip).
  @Test func everyMascotPlans() {
    for id in ["koa", "blaze", "swift", "titan", "drago", "nova"] {
      let plan = KoaPaint.plan(VectorMascot.figure(id: id))
      #expect(KoaPaintTests.shapes(plan).count > 40, "\(id)")
      #expect(KoaPaintTests.groups(plan).contains { $0.1 != nil }, "\(id)")
    }
  }
}
