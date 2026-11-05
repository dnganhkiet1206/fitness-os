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

  /// Kệ, cây lớn, bóng vẽ lại (04/11, #799, theo mock Kiệt duyệt cả bản ngày): bóng ván mờ 0.35 ban
  /// đêm, 0.25 ban ngày (`$day:<đêm>:<ngày>`); bóng tiếp xúc của tranh mới giữ đen ('black') ban ngày,
  /// màu riêng của tranh mới đều có bản ngày.
  @Test func redrawnShelfFollowsTheApprovedDayMock() {
    var o = StudioScene.Options()
    #expect(StudioScene.resolve("$day:0.35:0.25", o, StudioScene.skins["default"]!) == .number(0.35))
    let night = String(describing: StudioScene.tree(o))
    o.light = true
    #expect(StudioScene.resolve("$day:0.35:0.25", o, StudioScene.lightSkins["default"]!) == .number(0.25))
    let day = String(describing: StudioScene.tree(o))
    #expect(!day.contains("$day") && !night.contains("$day"))
    #expect(day.contains("\"black\"") && night.contains("\"black\""))
    // gỗ, gang, lá, chậu, bóng tập của đêm không còn ở bản ngày
    for c in ["#7A5A86", "#4C3763", "#2A2D45", "#3D8254", "#5A3F7A", "#6D5BD0", "#1C2140"] {
      #expect(night.contains(c) && !day.contains(c), "\(c)")
    }
  }

  /// Lá cây lớn (vẽ lại #799) rung quanh ngọn thân (0, −28) nơi tám lá mọc ra: điểm ấy đứng yên, thân
  /// và chậu không rung.
  @Test func plantLeavesSwayAroundTheStemTop() throws {
    var o = StudioScene.Options()
    o.plantSway = 0.2  // 0,2 giây sau khi bị chạm từ bên trái
    let plant = try #require(StudioScene.objects(o, [StudioScene.plantIndex]).first { $0.tag == "G" })
    #expect(plant.kids.count == 13)
    for leaf in plant.kids[1...8] {
      let m = try #require(leaf.matrix)
      #expect(abs(m[2] * -28 + m[4]) < 1e-9 && abs(m[3] * -28 + m[5] + 28) < 1e-9)
      #expect(abs(m[1]) > 0.05, "lá có xoay")
    }
    #expect(plant.kids[0].matrix == nil && plant.kids[9].matrix == nil)
  }

  /// Chạm cây (Kiệt 04/11): lá ngả ra XA chỗ chạm trước, mỗi lá một góc (không lắc đồng loạt), lá
  /// phía chạm động trước, rồi lắng hẳn.
  @Test func leavesBendAwayFromTheTouchOneByOne() {
    let early = (1...8).map { StudioScene.leafAngle($0, t: 0.12, side: 1) }
    #expect(early.allSatisfy { $0 >= 0 }, "chạm từ trái: lá ngả sang phải (góc dương)")
    #expect(early[0] > early[7], "lá bên trái (gần chỗ chạm) đi trước")
    #expect(Set(early.map { ($0 * 100).rounded() }).count > 4, "mỗi lá một góc")
    #expect((1...8).allSatisfy { StudioScene.leafAngle($0, t: 0.12, side: -1) <= 0 })
    #expect((1...8).allSatisfy { abs(StudioScene.leafAngle($0, t: StudioScene.leafSettle, side: 1)) < 0.1 })
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

  /// Bảng trên tường thay chuỗi (29/10): chữ, số, biểu tượng, số chấm theo `Board`.
  @Test func boardReplacesStreak() {
    var o = StudioScene.Options()
    o.streak = 40
    o.board = .init(word: "HẠNG", value: "3", icon: .dumbbell, dots: 6, lit: 3)
    let plan = KoaPaint.plan(KoaRender.Element("Svg", [:], matrix: nil, kids: StudioScene.tree(o)))
    let texts = Self.labels(plan).map(\.text)
    #expect(texts.contains("HẠNG") && texts.contains("3") && !texts.contains("STREAK") && !texts.contains("40"))
    let tree = String(describing: StudioScene.tree(o))
    #expect(tree.contains(StudioScene.dumbbell) && !tree.contains("M 330 289"))
    let skin = StudioScene.skins["default"]!
    #expect(StudioScene.resolve("$dot2:off:on", o, skin) == .string("on"))
    #expect(StudioScene.resolve("$dot3:off:on", o, skin) == .string("off"))
    #expect(StudioScene.resolve("$dot6:off:on", o, skin) == .string("none"))
    o.board = .init(word: "KỶ LỤC · KG", value: "102", icon: .trophy, dots: 0, lit: 0)
    #expect(StudioScene.resolve("$countSize", o, skin) == .number(19))
    #expect(StudioScene.resolve("$dot0:off:on", o, skin) == .string("none"))
    #expect(String(describing: StudioScene.tree(o)).contains(StudioScene.boardIcons[.trophy]!))
  }

  /// Đồ phòng (29/10): mỗi món của cửa hàng có biến thể; bật món thì phần tử gốc của chỗ
  /// đó biến mất, biến thể nằm đúng chỗ, mọi `url(#…)` đều trỏ tới một định nghĩa.
  @Test func decorVariantsReplaceTheirSpot() throws {
    let base = StudioScene.tree(StudioScene.Options())
    #expect(Set(StudioScene.decorData.spots.keys) == Set(StudioScene.decorSpots))
    for it in MascotShop.decor {
      let spot = try #require(it.slot)
      let id = try #require(it.koaId)
      #expect(StudioScene.decorData.variants["\(spot).\(id)"] != nil, "\(it.key)")
      var o = StudioScene.Options()
      o.decor = MascotShop.decorChoice(equipped: [it.key])
      #expect(o.decor == [spot: id])
      let tree = StudioScene.tree(o)
      #expect(tree != base, "\(it.key)")
      let text = String(describing: tree)
      let ids = Set((StudioScene.json + StudioScene.decorJSON).matches(of: /"id":"([^"]+)"/).map { String($0.1) })
      let refs = Set(text.matches(of: /url\(#([A-Za-z0-9]+)\)/).map { String($0.1) })
      #expect(refs.isSubset(of: ids), "\(it.key): \(refs.subtracting(ids))")
      let plan = KoaPaint.plan(KoaRender.Element("Svg", [:], matrix: nil, kids: tree))
      #expect(KoaPaintTests.shapes(plan).count > 100)
    }
    // ban ngày không có đèn treo, kể cả đèn mua
    var day = StudioScene.Options()
    day.lamp = false
    day.decor = ["lamp": "chandelier"]
    var dayBase = StudioScene.Options()
    dayBase.lamp = false
    #expect(StudioScene.tree(day) == StudioScene.tree(dayBase))
  }
}
