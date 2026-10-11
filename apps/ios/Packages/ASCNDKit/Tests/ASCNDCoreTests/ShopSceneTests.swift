@testable import ASCNDCore
import Foundation
import Testing

/// Phòng thử đồ S2 — `Fixtures/shop-scene-golden.json` (`tools/studio/gen-shop.cjs`):
/// `ShopRoom` của RN @ fac9ac2 + lớp vẽ lại, token giải bằng luật của bộ sinh;
/// khung hình / máy quay = chính `shop-camera.ts`.
struct ShopSceneTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "shop-scene-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func shot(_ v: JSONValue?) -> ShopScene.Shot {
    ShopScene.Shot(
      x: v?["x"]?.doubleValue ?? .nan, y: v?["y"]?.doubleValue ?? .nan, w: v?["w"]?.doubleValue ?? .nan,
      h: v?["h"]?.doubleValue ?? .nan)
  }

  static func same(_ a: ShopScene.Shot, _ b: ShopScene.Shot) -> Bool {
    KoaRenderGoldenTests.close(a.x, b.x) && KoaRenderGoldenTests.close(a.y, b.y)
      && KoaRenderGoldenTests.close(a.w, b.w) && KoaRenderGoldenTests.close(a.h, b.h)
  }

  @Test func everySceneMatches() throws {
    let scenes = KoaRenderGoldenTests.array(try Self.golden()["scenes"])
    #expect(scenes.count == 5)
    for (i, s) in scenes.enumerated() {
      let tree = ShopScene.tree(skin: s["skin"]?.stringValue ?? "", energy: s["energy"]?.doubleValue ?? -1)
      let want = KoaRenderGoldenTests.array(s["tree"])
      #expect(tree.count == want.count, "#\(i)")
      for (j, (e, w)) in zip(tree, want).enumerated() {
        let d = KoaRenderGoldenTests.diff(e, w, "#\(i)/\(j)")
        #expect(d == nil, "\(d ?? "")")
      }
    }
  }

  @Test func shotsAndFigureBoxAreRNs() throws {
    let g = try Self.golden()
    #expect(g["width"]?.doubleValue == ShopScene.width)
    #expect(g["height"]?.doubleValue == ShopScene.height)
    for name in ShopScene.ShotName.allCases {
      #expect(Self.same(ShopScene.shot(name), Self.shot(g["shots"]?[name.rawValue])), "\(name)")
    }
    #expect(Self.same(ShopScene.figureBox, Self.shot(g["figureBox"])))
  }

  @Test func cameraIsRNs() throws {
    let cams = KoaRenderGoldenTests.array(try Self.golden()["cams"])
    #expect(cams.count == 16)
    for c in cams {
      let name = try #require(ShopScene.ShotName(rawValue: c["shot"]?.stringValue ?? ""))
      let w = c["w"]?.doubleValue ?? 0
      let h = c["h"]?.doubleValue ?? 0
      let m = ShopScene.camera(ShopScene.shot(name), width: w, height: h)
      let want = KoaRenderGoldenTests.array(c["m"]).compactMap { $0.doubleValue }
      #expect(want.count == 6)
      #expect(zip(m, want).allSatisfy { KoaRenderGoldenTests.close($0, $1) }, "\(name) \(w)×\(h)")
    }
  }

  /// Phòng lập được kế hoạch vẽ trọn: mọi `url(#…)` tìm được, có vùng cắt.
  @Test func roomPlans() {
    let root = KoaRender.Element("Svg", [:], matrix: nil, kids: ShopScene.tree(skin: "night", energy: 0.5))
    let plan = KoaPaint.plan(root)
    #expect(KoaPaintTests.shapes(plan).count > 100)
    #expect(KoaPaintTests.groups(plan).contains { $0.1 != nil })
  }
}
