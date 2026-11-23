@testable import ASCNDCore
import Testing

/// Mặt nạ che Koa (`StudioScene.objects`) với đồ phòng đã mua và bụi, và bụi không lơ lửng khi thứ nó
/// nằm trên không được vẽ (soát 04/11 sau #799). Đồ mua và bụi mang `at` (`tools/koa-room/build.py`).
struct StudioMaskTests {
  private func occluder(_ name: String) -> Set<Int> {
    Set(KoaRoomMap.occluders.first { $0.name == name }?.elements ?? [])
  }

  private func uses(_ els: [KoaRender.Element], _ fill: String) -> Bool {
    els.contains { $0.props["fill"] == .string(fill) || uses($0.kids, fill) }
  }

  private func shapes(_ els: [KoaRender.Element]) -> [KoaRender.Element] { els.filter { $0.tag != "Defs" } }

  private func dust(at i: Int, _ o: StudioScene.Options) -> Set<KoaRender.Element> {
    let skin = StudioScene.skins["default"]!
    let nodes = StudioScene.decorData.dust.values.joined().filter { $0["at"]?.intValue == i }
    // bụi trên bảng dời theo bảng (#799-B)
    let board = o.board == nil ? Set<Int>() : Set(StudioScene.decorData.spots["board"] ?? [])
    return Set(nodes.compactMap { StudioScene.element($0, o, skin) }.map { board.contains(i) ? StudioScene.boardDust($0) : $0 })
  }

  /// Kệ mua che Koa như kệ gốc (trước đây mặt nạ chỉ còn cúp: biến thể chèn ở phần tử 77, ngoài mặt nạ);
  /// bóng tiếp xúc trên sàn không vào mặt nạ.
  @Test func boughtShelvesHideKoaLikeTheShelf() {
    for (id, paint) in [("chrome", "url(#ncBoard)"), ("olympic", "url(#noIron)")] {
      var o = StudioScene.Options()
      o.decor = ["shelf": id]
      let mask = StudioScene.objects(o, occluder("shelf"))
      #expect(uses(mask, paint), "\(id)")
      #expect(!uses(mask, "url(#nsContact)"), "\(id)")
      #expect(!uses(StudioScene.objects(o, occluder("plant")), paint), "\(id)")
    }
  }

  /// Cây mua và quả bóng / ấm tạ đi kèm: mỗi thứ vào đúng mặt nạ của mình (cây che Koa từ độ sâu 400,
  /// bóng từ 402), không thứ nào kéo bóng tiếp xúc theo.
  @Test func boughtPlantsSplitBetweenPlantAndBall() {
    for (id, plantPaint, ballPaint) in [("snake", "#2F7A4C", "#2BB5A8"), ("bonsai", "#2F7A4C", "url(#decorBell)")] {
      var o = StudioScene.Options()
      o.decor = ["plants": id]
      let plant = StudioScene.objects(o, occluder("plant"))
      let ball = StudioScene.objects(o, occluder("ball"))
      #expect(shapes(plant).count == 1 && shapes(ball).count == 1, "\(id)")
      #expect(uses(plant, plantPaint) && !uses(plant, ballPaint), "\(id)")
      #expect(uses(ball, ballPaint) && !uses(ball, plantPaint), "\(id)")
      #expect(!uses(plant, "url(#nsContact)") && !uses(ball, "url(#nsContact)"), "\(id)")
    }
  }

  /// Bụi chỉ vào mặt nạ của đồ nó nằm trên: bụi trên ván kệ che Koa cùng kệ; bụi tường, sàn, hạt lơ lửng
  /// không bao giờ vẽ đè lên Koa (trước đây cả lớp bụi nằm trong mặt nạ của quả bóng). Phòng vẫn đủ bụi.
  @Test func dustOnlyMasksWithWhatItSitsOn() {
    let clean = StudioScene.Options()
    var dusty = clean
    dusty.dust = 3
    #expect(StudioScene.objects(dusty, occluder("ball")) == StudioScene.objects(clean, occluder("ball")))
    #expect(StudioScene.objects(dusty, occluder("plant")) == StudioScene.objects(clean, occluder("plant")))
    let shelfMask = Set(StudioScene.objects(dusty, occluder("shelf")))
    #expect(!dust(at: 80, dusty).isEmpty && shelfMask.isSuperset(of: dust(at: 80, dusty)))
    #expect(shelfMask.isDisjoint(with: dust(at: 66, dusty)))
    let all = StudioScene.decorData.dust.values.joined().count
    #expect(StudioScene.tree(dusty).count - StudioScene.tree(clean).count == all)
    let props = StudioScene.layers.first { $0.id == "props" }!
    #expect(StudioScene.tree(dusty, layer: props).count - StudioScene.tree(clean, layer: props).count == all)
  }

  /// Cây mua thay cả quả bóng (phần tử 94, chỗ bụi nằm ngay sau): phòng vẫn đủ bụi (trước đây mất hết).
  @Test func boughtPlantsKeepTheDust() {
    let all = StudioScene.decorData.dust.values.joined().count
    for id in ["snake", "bonsai"] {
      var clean = StudioScene.Options()
      clean.decor = ["plants": id]
      var dusty = clean
      dusty.dust = 3
      #expect(StudioScene.tree(dusty).count - StudioScene.tree(clean).count == all, "\(id)")
    }
  }

  /// Bụi không lơ lửng: khung dọc bỏ bậu cửa sổ (62) và bảng neon cũ (100) thì bụi trên chúng không vẽ,
  /// kể cả khi cửa sổ là đồ mua (#799-B: cảnh mua vào ô cửa vòm); giá olympic không có ván thì bụi ván kệ không vẽ, kệ
  /// chrome cùng ván thì vẫn có.
  @Test func dustNeedsSomethingToSitOn() {
    var o = StudioScene.Options()
    o.dust = 3
    let flat = Set(StudioScene.tree(o))
    for i in [62, 66, 80, 100] {
      #expect(!dust(at: i, o).isEmpty && flat.isSuperset(of: dust(at: i, o)), "\(i)")
    }
    var tall = o
    tall.omit = StudioTall.omit(tall)
    let tallRoom = Set(StudioScene.tree(tall))
    #expect(tallRoom.isDisjoint(with: dust(at: 62, o)) && tallRoom.isDisjoint(with: dust(at: 100, o)))
    #expect(tallRoom.isSuperset(of: dust(at: 66, o)) && tallRoom.isSuperset(of: dust(at: 80, o)))
    // #799-B: khung dọc không vẽ lại cửa sổ cũ kể cả khi mua — cảnh mua nằm trong ô cửa vòm, bụi bậu là của khung dọc
    var ocean = o
    ocean.decor = ["window": "ocean"]
    ocean.omit = StudioTall.omit(ocean)
    #expect(Set(StudioScene.tree(ocean)).isDisjoint(with: dust(at: 62, o)))
    for (id, kept) in [("olympic", false), ("chrome", true)] {
      var shelf = o
      shelf.decor = ["shelf": id]
      let room = Set(StudioScene.tree(shelf))
      #expect(kept ? room.isSuperset(of: dust(at: 80, o)) : room.isDisjoint(with: dust(at: 80, o)), "\(id)")
    }
  }
}

/// Cửa sổ / đèn đã mua trong phòng khung dọc (#799-B, Kiệt duyệt mock 23/11): đặt lại theo ô cửa vòm và chỗ chao
/// đèn, không vẽ tranh nhỏ của phòng cũ ở chỗ cũ nữa.
struct StudioTallDecorTests {
  static func night(_ decor: [String: String]) -> StudioScene.Options {
    var o = StudioScene.Options()
    o.lamp = true
    o.decor = decor
    o.omit = StudioTall.omit(o)
    return o
  }

  /// Phòng khung dọc luôn bỏ tranh cửa sổ (25…64) và đèn (108…131) của phòng cũ, có mua hay không.
  @Test func oldWindowAndLampArtAreAlwaysLeftOut() {
    for decor in [[:], ["window": "ocean"], ["window": "mountain"], ["lamp": "ring"], ["lamp": "chandelier"]] {
      let o = Self.night(decor)
      #expect(o.omit.isSuperset(of: Set(25...64).union(108...131).filter { StudioScene.template[$0]["t"]?.stringValue != "Defs" }), "\(decor)")
    }
  }

  /// Biển đã mua: vệt trăng / gợn sóng tĩnh của tranh bị bỏ (vẽ động theo thời tiết); núi giữ nguyên tranh.
  @Test func oceanDropsItsStaticGlitterPath() throws {
    func glints(_ id: String) throws -> Int {
      let parts = try #require(StudioTall.boughtWindow(Self.night(["window": id])))
      let inner = try #require(parts.last)
      return inner.kids.flatMap(\.kids).count(where: StudioTall.isStaticSeaGlint) + inner.kids.count(where: StudioTall.isStaticSeaGlint)
    }
    #expect(try glints("ocean") == 0)
    let raw = try #require(StudioScene.decorData.variants["window.ocean"])
    #expect(raw.description.contains("#FFC24D"), "tranh gốc có vệt trăng tĩnh")
    #expect(abs(StudioTall.oceanHorizon - 85.83) < 0.01)
    #expect(StudioTall.oceanMoonX > StudioTall.arch.x + StudioTall.arch.w / 2, "trăng lệch phải, không nằm sau song giữa")
  }

  /// Cửa sổ mua: cảnh thay trời + toà nhà, nằm gọn trong khung ô cửa vòm (x 206…368, y −151…160).
  @Test func boughtWindowFillsTheArch() throws {
    for id in ["ocean", "mountain"] {
      let o = Self.night(["window": id])
      let parts = try #require(StudioTall.boughtWindow(o), "\(id)")
      #expect(StudioTall.tree(o, layer: "city").isEmpty, "\(id): toà nhà nhường chỗ cho cảnh")
      #expect(StudioTall.tree(o, layer: "sky") == parts)
      let groups = parts.filter { $0.tag == "G" }
      #expect(groups.count == 2, "\(id): trời + cảnh")
      // trời giãn kín ô: 278…361 × 101…206 → 206…368 × −151…160
      let m = try #require(groups[0].matrix)
      let x0: Double = m[0] * 278 + m[4], x1: Double = m[0] * 361 + m[4]
      let y0: Double = m[3] * 101 + m[5], y1: Double = m[3] * 206 + m[5]
      #expect(abs(x0 - 206) < 0.01, "\(id)")
      #expect(abs(x1 - 368) < 0.01, "\(id)")
      #expect(abs(y0 + 151) < 0.01, "\(id)")
      #expect(abs(y1 - 160) < 0.01, "\(id)")
      // cảnh giữ tỉ lệ, chạm bậu
      let u = try #require(groups[1].matrix)
      let sill: Double = u[3] * 206 + u[5]
      #expect(u[0] == u[3], "\(id)")
      #expect(abs(sill - 160) < 0.01, "\(id)")
    }
    #expect(StudioTall.boughtWindow(Self.night([:])) == nil)
    #expect(!StudioTall.tree(Self.night([:]), layer: "city").isEmpty)
  }

  /// Đèn mua: treo đúng chỗ chao đèn, phóng vừa; không kéo theo luồng sáng / hạt bụi của tranh cũ; ban ngày không treo.
  @Test func boughtLampHangsWhereTheShadeWas() throws {
    for id in ["ring", "chandelier"] {
      let o = Self.night(["lamp": id])
      let g = try #require(StudioTall.boughtLamp(o)?.first, "\(id)")
      let m = try #require(g.matrix)
      let hook: Double = m[3] * 40 + m[5]
      #expect(m[0] == StudioTall.boughtLampScale, "\(id)")
      #expect(abs(hook + 110) < 0.01, "\(id): móc treo ở y −110")
      func cones(_ e: KoaRender.Element) -> Int {
        let fill: String = { if case .string(let f)? = e.props["fill"] { return f } else { return "" } }()
        return (fill.contains("Cone") ? 1 : 0) + e.kids.reduce(0) { $0 + cones($1) }
      }
      #expect(cones(g) == 0, "\(id): không có luồng sáng của tranh cũ")
      var day = o
      day.lamp = false
      #expect(StudioTall.tree(day, layer: "lamp").filter { $0.tag != "Defs" }.isEmpty, "\(id): ban ngày không treo đèn")
    }
  }
}

/// Đèn trần chỉ lắc khi bị chạm / máy nghiêng mạnh, rồi tắt dần (Kiệt 23/11 — trước đây tự lắc mỗi 26 giây).
struct StudioLampSwingTests {
  @Test func stillUntilPushed() {
    let s = StudioTall.LampSwing()
    for t in stride(from: 0.0, through: 120, by: 0.5) { #expect(s.angle(at: t) == 0) }
  }

  @Test func aPushSwingsThenSettles() {
    var s = StudioTall.LampSwing()
    s.push(at: 10, strength: 1)
    #expect(s.angle(at: 10) == 0, "bắt đầu từ 0, không giật")
    let peak = stride(from: 10.0, through: 12, by: 0.05).map { abs(s.angle(at: $0)) }.max() ?? 0
    #expect(peak > 1.5 && peak <= StudioTall.LampSwing.maxDegrees)
    #expect(abs(s.angle(at: 18)) < 0.2, "tắt dần")
    #expect(s.angle(at: 10 + StudioTall.LampSwing.life + 1) == 0 && !s.moving(at: 10 + StudioTall.LampSwing.life + 1))
  }

  /// Đẩy thêm lúc đang lắc: góc liền mạch (cộng dao động), không nhảy về 0.
  @Test func pushingAgainNeverJumps() {
    var s = StudioTall.LampSwing()
    s.push(at: 0, strength: 1)
    let before = s.angle(at: 1.3)
    s.push(at: 1.3, strength: 1, direction: -1)
    #expect(abs(s.angle(at: 1.3) - before) < 1e-9)
    var last = s.angle(at: 0)
    for t in stride(from: 0.0, through: 12, by: 1.0 / 60) {
      let a = s.angle(at: t)
      #expect(abs(a - last) < 0.5, "khung \(t)")
      last = a
    }
  }
}

/// Bảng số vừa khung dọc và có dây điện + ổ cắm như storyboard sửa bảng (Kiệt 23/11).
struct StudioBoardCordTests {
  static func room(_ cord: Bool = true) -> StudioScene.Options {
    var o = StudioScene.Options()
    o.board = RoomBoard.rank(2, of: MascotRules.ranks.count, lang: "vi")
    o.boardCord = cord
    return o
  }

  /// Mép phải bảng, sau phép phóng sẵn của phòng, còn trong khung 390 với lề ≥ 16.
  @Test func boardFitsTheFrame() {
    let right = 370 + StudioScene.boardShift
    let shown = 195 + KoaParallax.overscan * (right - 195)
    #expect(shown <= 390 - 16, "\(shown)")
  }

  /// Dây + ổ cắm có trong phòng (đúng toạ độ storyboard), tắt được khi đoạn diễn sửa bảng tự vẽ.
  @Test func cordAndSocketAreDrawn() {
    let cord = Set(StudioScene.boardCord())
    #expect(cord.count == 5)
    #expect(Set(StudioScene.tree(Self.room())).isSuperset(of: cord))
    #expect(Set(StudioScene.tree(Self.room(false))).isDisjoint(with: cord))
    let sk = KoaRepairScene.room(KoaRepairScene.Board.socketPx.x, KoaRepairScene.Board.socketPx.y)
    #expect(sk.y > 300 && sk.y < 362, "ổ cắm trên ván ốp chân tường")
    var rn = StudioScene.Options()
    rn.board = nil
    #expect(Set(StudioScene.tree(rn)).isDisjoint(with: cord), "bảng chuỗi RN (golden) không có dây")
  }
}

