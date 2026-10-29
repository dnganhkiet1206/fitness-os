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
      let got = StudioScene.moonPath(cx: 301, cy: 125, r: 11, phase: phase)
      let want = m["d"]?.stringValue ?? ""
      #expect(Self.samePath(got, want), "\(phase): \(got) ≠ \(want)")
    }
  }

  /// Cùng lệnh, cùng cờ, số bằng nhau theo `close` — `cos` của libm và của V8
  /// có thể lệch 1 ulp (pha 0,175 / 0,325 / 0,675 / 0,825: `rx` …017 vs …016), cùng sai số mà cây cảnh
  /// đã dùng cho mọi thuộc tính số.
  static func samePath(_ a: String, _ b: String) -> Bool {
    let x = a.split(separator: " "), y = b.split(separator: " ")
    guard x.count == y.count else { return false }
    return zip(x, y).allSatisfy { p, q in
      if let u = Double(p), let v = Double(q) { return KoaRenderGoldenTests.close(u, v) }
      return p == q
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
    #expect(StudioScene.skinKey(stage: "stage_sunset") == "sunset")
    #expect(StudioScene.skinKey(stage: "hat_cap") == "default")
    #expect(StudioScene.skinKey(stage: nil) == "default")
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

  /// Bản ngày: tường sáng, không còn màu khung đêm; bản đêm không đổi.
  @Test func dayRoomRecolorsWithoutTouchingNight() {
    var o = StudioScene.Options()
    let night = StudioScene.tree(o)
    o.light = true
    let day = StudioScene.tree(o)
    // ban ngày bỏ sao ngoài cửa sổ — ít phần tử hơn, không nhiều hơn
    #expect(day.count < night.count)
    #expect(!String(describing: day).contains("#7B61FF"))
    let dayText = String(describing: day)
    #expect(!dayText.contains("#151A33") && dayText.contains("#F7EEE2"))
    #expect(String(describing: night).contains("#151A33"))
  }

  /// Tắt đèn: bỏ vệt sáng, chao, dây; bật chiều sâu: thêm lớp ván sàn / chân tường.
  @Test func lampAndDepthToggles() {
    var o = StudioScene.Options()
    let base = String(describing: StudioScene.tree(o))
    #expect(base.contains("studioCone") && !base.contains("studioWallSide"))
    o.lamp = false
    o.depth = true
    let next = String(describing: StudioScene.tree(o))
    #expect(!next.contains("url(#studioCone)") && !next.contains("url(#nsHalo)"))
    #expect(next.contains("studioWallSide") && next.contains("studioFloorDepth"))
  }

  /// Chữ trên tranh theo ngôn ngữ; tiếng Anh giữ nguyên.
  @Test func signTextFollowsLanguage() {
    var o = StudioScene.Options()
    #expect(String(describing: StudioScene.tree(o)).contains("STRONGER"))
    o.lang = "vi"
    let vi = String(describing: StudioScene.tree(o))
    #expect(vi.contains("MẠNH HƠN") && vi.contains("CHUỖI") && !vi.contains("STRONGER") && !vi.contains("STREAK"))
  }

  /// Bảng trên tường là hạng Gains (29/10): chữ hạng theo ngôn ngữ, số 1…6, quả tạ
  /// thay ngọn lửa, sáu chấm sáng tới hạng, chấm thứ bảy ẩn.
  @Test func gainsBoardReplacesStreak() {
    var o = StudioScene.Options()
    o.streak = 40
    o.gainsRank = 2
    o.lang = "vi"
    let plan = KoaPaint.plan(KoaRender.Element("Svg", [:], matrix: nil, kids: StudioScene.tree(o)))
    let texts = Self.labels(plan).map(\.text)
    #expect(texts.contains("HẠNG") && texts.contains("3") && !texts.contains("CHUỖI") && !texts.contains("40"))
    let tree = String(describing: StudioScene.tree(o))
    #expect(tree.contains(StudioScene.dumbbell) && !tree.contains("M 330 289"))
    #expect(StudioScene.resolve("$dot2:off:on", o, StudioScene.skins["default"]!) == .string("on"))
    #expect(StudioScene.resolve("$dot3:off:on", o, StudioScene.skins["default"]!) == .string("off"))
    #expect(StudioScene.resolve("$dot6:off:on", o, StudioScene.skins["default"]!) == .string("none"))
  }
}
