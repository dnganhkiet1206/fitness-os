@testable import ASCNDCore
import Foundation
import Testing

/// Studio S1 — `Fixtures/studio-golden.json` (`tools/studio/gen.cjs`): đồ đạc
/// dựng từ chính các component studio của RN @ fac9ac2 + các lớp vẽ lại, giải
/// token bằng luật của bộ sinh. So cả cây từng phần tử; trăng theo `moonPath` /
/// `moonPhase` của RN.
struct StudioSceneTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "studio-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  @Test func everySceneMatches() throws {
    let scenes = KoaRenderGoldenTests.array(try Self.golden()["scenes"])
    #expect(scenes.count == 4)
    for (i, s) in scenes.enumerated() {
      var o = StudioScene.Options()
      o.skin = s["skin"]?.stringValue ?? ""
      o.energy = s["energy"]?.doubleValue ?? -1
      o.streak = s["streak"]?.intValue ?? -1
      o.moon = s["moon"]?.doubleValue ?? -1
      o.label = s["label"]?.stringValue ?? ""
      let tree = StudioScene.tree(o)
      let want = KoaRenderGoldenTests.array(s["tree"])
      #expect(tree.count == want.count, "#\(i)")
      for (j, (e, w)) in zip(tree, want).enumerated() {
        let d = KoaRenderGoldenTests.diff(e, w, "#\(i)/\(j)")
        #expect(d == nil, "\(d ?? "")")
      }
    }
  }

  @Test func moonPathIsRNs() throws {
    let moons = KoaRenderGoldenTests.array(try Self.golden()["moons"])
    #expect(moons.count == 41)
    for m in moons {
      let phase = m["phase"]?.doubleValue ?? -1
      #expect(StudioScene.moonPath(cx: 301, cy: 125, r: 11, phase: phase) == m["d"]?.stringValue, "\(phase)")
    }
  }

  @Test func moonPhaseIsRNs() throws {
    let dates = KoaRenderGoldenTests.array(try Self.golden()["dates"])
    #expect(!dates.isEmpty)
    for d in dates {
      let t = d["t"]?.doubleValue ?? 0
      let want = d["phase"]?.doubleValue ?? -1
      let got = StudioScene.moonPhase(Date(timeIntervalSince1970: t / 1000))
      #expect(abs(got - want) < 1e-9, "\(t)")
    }
  }

  @Test func skinsAreRNs() throws {
    guard case .object(let skins)? = try Self.golden()["skins"] else {
      Issue.record("thiếu skins")
      return
    }
    #expect(Set(skins.keys) == Set(StudioScene.skins.keys))
    for (k, v) in skins {
      let wall = KoaRenderGoldenTests.array(v["wall"]).compactMap { $0.stringValue }
      let skin = StudioScene.skins[k]
      #expect(wall == [skin?.wall.0 ?? "", skin?.wall.1 ?? ""], "\(k)")
      #expect(v["glow"]?.stringValue == skin?.glow, "\(k)")
    }
  }

  @Test func skinFollowsEquippedStage() {
    #expect(StudioScene.skinKey(equipped: []) == "default")
    #expect(StudioScene.skinKey(equipped: ["stage_night"]) == "night")
    // nhiều sân khấu đang bật: món đắt nhất thắng (`activeStageKey`)
    #expect(StudioScene.skinKey(equipped: ["stage_night", "stage_champion", "stage_sunset"]) == "champion")
  }

  /// Cả căn phòng lập được kế hoạch vẽ: mọi `url(#…)` có dải màu, có chữ.
  @Test func scenePlans() {
    var o = StudioScene.Options()
    o.streak = 12
    o.label = "Koa"
    let root = KoaRender.Element("Svg", [:], matrix: nil, kids: StudioScene.tree(o))
    let plan = KoaPaint.plan(root)
    #expect(KoaPaintTests.shapes(plan).count > 100)
    #expect(Self.labels(plan).contains { $0.text == "12" && $0.fontSize == 19 })
    #expect(Self.labels(plan).contains { $0.text == "KOA" && $0.anchor == "middle" && $0.letterSpacing == 4 })
  }

  static func labels(_ ops: [KoaPaint.Op]) -> [KoaPaint.Label] {
    ops.flatMap { op -> [KoaPaint.Label] in
      switch op {
      case .text(let l): [l]
      case .group(_, _, let inner): labels(inner)
      case .shape: []
      }
    }
  }
}
