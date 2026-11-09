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
    return Set(nodes.compactMap { StudioScene.element($0, o, skin) })
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
  /// trừ khi cửa sổ là đồ mua (vẽ lại bậu cũ); giá olympic không có ván thì bụi ván kệ không vẽ, kệ
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
    var ocean = o
    ocean.decor = ["window": "ocean"]
    ocean.omit = StudioTall.omit(ocean)
    #expect(Set(StudioScene.tree(ocean)).isSuperset(of: dust(at: 62, o)))
    for (id, kept) in [("olympic", false), ("chrome", true)] {
      var shelf = o
      shelf.decor = ["shelf": id]
      let room = Set(StudioScene.tree(shelf))
      #expect(kept ? room.isSuperset(of: dust(at: 80, o)) : room.isDisjoint(with: dust(at: 80, o)), "\(id)")
    }
  }
}
