import Testing

@testable import ASCNDCore

struct KoaParallaxTests {
  private func indices(_ l: StudioScene.Layer) -> [Int] {
    l.parts.flatMap { p -> [Int] in
      if case .template(let r) = p { return Array(r) }
      return []
    }
  }

  @Test func everyRoomElementIsInExactlyOneLayer() {
    let all = StudioScene.layers.flatMap(indices)
    #expect(all == Array(0..<StudioScene.template.count))
  }

  @Test func everyDepthElementIsInExactlyOneLayer() {
    let all = StudioScene.layers.flatMap { l in
      l.parts.flatMap { p -> [Int] in
        if case .depth(let i) = p { return i }
        return []
      }
    }
    // phần tử 0 là `Defs`, lớp nào có phần chiều sâu cũng kèm
    #expect(all.sorted() == Array(1..<StudioScene.depthLayer.count))
  }

  @Test func layersDrawInBothThemes() {
    for light in [false, true] {
      var o = StudioScene.Options()
      o.light = light
      o.depth = true
      for l in StudioScene.layers where l.id != "lamp" || !light {
        #expect(StudioScene.tree(o, layer: l).contains { $0.tag != "Defs" }, "\(l.id)")
      }
    }
  }

  @Test func decorKeepsItsPlaceInTheLayers() {
    var o = StudioScene.Options()
    o.depth = true
    o.decor = ["plants": "snake", "window": "ocean"]
    let props = StudioScene.layers.first { $0.id == "props" }!
    let frame = StudioScene.layers.first { $0.id == "frame" }!
    let sky = StudioScene.layers.first { $0.id == "sky" }!
    #expect(StudioScene.tree(o, layer: props).count > 1)
    #expect(StudioScene.tree(o, layer: frame).count > 1)
    // cửa sổ đổi cảnh thì phần ngoài trời cũ không vẽ lại
    #expect(!StudioScene.tree(o, layer: sky).contains { $0.tag != "Defs" })
  }

  @Test func nearPlanesMoveMoreThanFarOnes() {
    typealias P = KoaParallax.Plane
    #expect(P.sky.amp < P.city.amp)
    #expect(P.city.amp < P.wall.amp)
    #expect(P.wall.amp < P.lamp.amp)
    #expect(P.lamp.amp < P.props.amp)
    #expect(P.props.amp < P.stage.amp)
    #expect(P.sky.lag > P.lamp.lag)
    #expect(P.stage.lag == 0)
  }

  @Test func nothingSlidesPastTheOverscan() {
    let room = StudioScene.width * (KoaParallax.overscan - 1) / 2
    #expect(KoaParallax.floorFront.amp <= room)
  }

  @Test func floorFollowsTheWallAtTheBackAndTheFrontMost() {
    #expect(KoaParallax.floorAmp(360) == KoaParallax.Plane.wall.amp)
    #expect(KoaParallax.floorAmp(476) == 7.5)
    #expect(KoaParallax.amp(koa: .floor, y: 400) == KoaParallax.floorAmp(400))
    #expect(KoaParallax.amp(koa: .stage, y: 430) == KoaParallax.Plane.stage.amp)
  }

  @Test func cameraStartsOnKoaWithoutSwooping() {
    var c = KoaParallax.Camera()
    c.step(1.0 / 60, koaX: 300)
    #expect(abs(c.x - (300 - 195) / 130) < 0.02)
  }

  @Test func cameraTrailsKoaThenSettlesWithoutOvershoot() {
    var c = KoaParallax.Camera()
    c.step(0, koaX: 195)
    var x = 195.0
    for _ in 0..<60 {
      x += 46.0 / 60
      c.step(1.0 / 60, koaX: x)
    }
    // sau một giây đi, máy còn trễ sau đích
    #expect(c.x < (x - 195) / 130)
    var peak = 0.0
    for _ in 0..<600 {
      c.step(1.0 / 60, koaX: x)
      peak = max(peak, c.x)
    }
    let goal = (x - 195) / 130
    #expect(abs(c.x - goal) < 0.001)
    #expect(peak <= goal + 0.001)
    #expect(!c.settling)
  }

  @Test func cameraLeadsTheDirectionOfTravel() {
    #expect(KoaParallax.Camera.target(195, speed: 46) > KoaParallax.Camera.target(195, speed: 0))
    #expect(KoaParallax.Camera.target(195, speed: -46) < 0)
    #expect(KoaParallax.Camera.target(195, speed: 900) == 0.14)
  }

  @Test func shotStaysInRangeAndScenePansAwayFromTheCamera() {
    var c = KoaParallax.Camera()
    c.step(0, koaX: 400)
    let s = c.shot(tilt: 1)
    #expect(s.pan == 1)
    #expect(s.shift(3) == -3)
  }

  @Test func pushInGoesAndComesBack() {
    var c = KoaParallax.Camera()
    c.step(0, koaX: 195)
    c.push()
    var peak = 0.0
    for _ in 0..<(60 * 5) {
      c.step(1.0 / 60, koaX: 195)
      peak = max(peak, c.shot().push)
    }
    #expect(peak == 1)
    #expect(c.shot().push == 0)
    let s = KoaParallax.Shot(push: 1)
    #expect(s.scale(6) > s.scale(1))
  }

  @Test func framingReturnsToTheOriginalShotForBedtimeAndBack() {
    var c = KoaParallax.Camera()
    for _ in 0..<240 { c.step(1.0 / 60, koaX: 300, framed: false) }
    #expect(abs(c.shot().zoom - 1) < 0.001)
    #expect(abs(c.shot().pan) < 0.001)
    c.rest()
    #expect(c.shot().zoom == 1)
    for _ in 0..<240 { c.step(1.0 / 60, koaX: 195) }
    #expect(abs(c.shot().zoom - KoaParallax.overscan) < 0.001)
  }

  /// Điểm chạm trên vùng sàn của một chỗ trong phòng, đúng như người xem thấy khi phòng phóng sẵn.
  private func tap(_ x: Double, _ y: Double, zoom: Double, k: Double = 1.077, top: Double = 360) -> KoaRoomMap.Spot {
    let cx = StudioScene.width / 2, cy = KoaParallax.anchorY
    let shownX = cx + (x - cx) * zoom, shownY = cy + (y - cy) * zoom
    return KoaParallax.floorTap(x: shownX * k, y: (shownY - top) * k, scale: k, top: top, zoom: zoom)
  }

  @Test(arguments: [1, KoaParallax.overscan])
  func tappingThePodiumReachesTheStage(zoom: Double) {
    for (x, y) in [(195.0, 412.0), (195.0, 460.0), (120.0, 440.0), (270.0, 440.0)] {
      #expect(tap(x, y, zoom: zoom).plane == .stage, "\(x), \(y)")
    }
  }

  @Test(arguments: [1, KoaParallax.overscan])
  func tappingBehindThePodiumStaysOnTheFloor(zoom: Double) {
    let s = tap(222, 372, zoom: zoom)
    #expect(s.plane == .floor)
    #expect(abs(s.x - 222) < 1)
    #expect(abs(s.d - 372) < 1)
  }

  @Test func tiltForgetsTheWayThePhoneIsHeld() {
    var t = KoaParallax.Tilt()
    t.step(1.0 / 30, roll: 0.5)
    #expect(t.value == 0)
    t.step(1.0 / 30, roll: 0.7)
    for _ in 0..<15 { t.step(1.0 / 30, roll: 0.7) }
    #expect(t.value > 0.3)
    for _ in 0..<(30 * 20) { t.step(1.0 / 30, roll: 0.7) }
    #expect(abs(t.value) < 0.02)
  }
}
