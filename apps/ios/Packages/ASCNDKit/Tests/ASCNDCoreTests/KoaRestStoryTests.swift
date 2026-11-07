import Testing

@testable import ASCNDCore

/// Màn nghỉ "Một hơi nữa thôi" (07/11, storyboard lần 3 Kiệt duyệt): một câu chuyện, mặt đổi dần, máy có lý do.
@Suite struct KoaRestStoryTests {
  typealias S = KoaRestStory

  @Test func storyBeatsFollowTheRealClock() {
    let total = 90.0
    func at(_ e: Double) -> S.Moment { S.at(elapsed: e, left: total * 1000 - e, total: total) }
    // 1: buông tạ, ngồi phịch cạnh nó
    #expect(at(300).beat == .drop && at(300).hand == "dumbbell" && at(300).pose == .idle)
    #expect(at(2000).dumbbellOnFloor && at(2000).pose == .relaxing)
    // 2: thở, hồi sức dần (mí mở lại)
    #expect(at(5000).beat == .recover)
    #expect(at(5000).face.lidL > at(20_000).face.lidL)
    // 3: liếc tạ (mắt nhìn về phía tạ, máy lia theo)
    let side = at(30_000)
    #expect(side.beat == .sideEye && side.frame.eyes.x > 0.3 && side.camera.dx > 0)
    // 4: nhìn bạn
    #expect(at(45_000).beat == .lookAtYou)
    // 5: quyết định ở 12 s cuối, đứng dậy cầm tạ
    #expect(at(79_000).beat == .decide && at(79_000).pose == .relaxing)
    #expect(at(83_000).pose == .idle && at(83_000).hand == "dumbbell")
    // 6: cắt sang máy thấp, đếm ngược; 0 s nhấc tạ, máy nghiêng
    let cd = at(88_000)
    #expect(cd.beat == .countdown && cd.camera.anchor > 0.9)
    let go = S.at(elapsed: 90_400, left: -400, total: total)
    #expect(go.beat == .go && go.camera.tilt > 2 && go.frame.walk.armRight < -80)
    // tạm dừng lâu thì ngủ gật dần
    #expect(S.at(elapsed: 40_000, left: 50_000, total: total, pausedFor: 15_000).face.lidL > 0.85)
  }

  @Test func shortRestSkipsTheSideEyeButKeepsTheArc() {
    var beats = Set<S.Beat>()
    var t = 0.0
    while t < 20_500 { beats.insert(S.at(elapsed: t, left: 20_000 - t, total: 20).beat); t += 100 }
    #expect(!beats.contains(.sideEye))
    #expect(beats.isSuperset(of: [.drop, .recover, .lookAtYou, .decide, .countdown, .go]))
  }

  @Test func faceChangesGraduallyNotByWholeFaceSwaps() {
    // Kiệt: "biểu cảm biến đổi tự nhiên" — giữa hai khung 20 ms, không tham số mặt nào nhảy xa
    for total in [30.0, 90.0] {
      var prev = S.at(elapsed: 0, left: total * 1000, total: total).face
      var t = 20.0
      while t < total * 1000 {
        let f = S.at(elapsed: t, left: total * 1000 - t, total: total).face
        for (a, b, name) in [(prev.lidL, f.lidL, "mí"), (prev.browTiltL, f.browTiltL, "mày"), (prev.smile, f.smile, "cười"),
                             (prev.open, f.open, "há")] {
          #expect(abs(a - b) < 0.09, "\(name) nhảy ở \(t) ms (nghỉ \(total) s): \(a) → \(b)")
        }
        prev = f
        t += 20
      }
    }
  }

  @Test func cameraMovesOnlyCutsOnce() {
    // máy di chuyển liền; chỉ có MỘT cú cắt (vào cảnh 6)
    var cuts: [Double] = []
    var prev = S.at(elapsed: 0, left: 90_000, total: 90).camera
    var t = 20.0
    while t < 90_000 {
      let c = S.at(elapsed: t, left: 90_000 - t, total: 90).camera
      if abs(c.zoom - prev.zoom) > 0.03 || abs(c.anchor - prev.anchor) > 0.05 { cuts.append(t) }
      prev = c
      t += 20
    }
    #expect(cuts.count == 1, "\(cuts)")
    #expect(cuts.first.map { abs($0 - 87_000) < 50 } ?? false)
  }

  @Test func bodyHasNoPops() {
    var prev = S.at(elapsed: 0, left: 60_000, total: 60).frame
    var t = 20.0
    while t < 60_000 {
      let f = S.at(elapsed: t, left: 60_000 - t, total: 60).frame
      #expect(abs(f.sy - prev.sy) < 0.03, "thân nhảy ở \(t)")
      #expect(abs(f.walk.armRight - prev.walk.armRight) < 12, "tay nhảy ở \(t)")
      prev = f
      t += 20
    }
  }
}

@Suite struct KoaFaceRigTests {
  @Test func eyesLeadThenBrowsThenMouth() {
    let keys = [KoaFaceRig.Key(0, .rested), KoaFaceRig.Key(1000, .determined, ms: 600)]
    let f = KoaFaceRig.at(1150, keys)
    let k = { (a: Double, b: Double, x: Double) in (x - a) / (b - a) }
    let lids = k(KoaFaceRig.rested.lidL, KoaFaceRig.determined.lidL, f.lidL)
    let brows = k(KoaFaceRig.rested.browTiltL, KoaFaceRig.determined.browTiltL, f.browTiltL)
    let mouth = k(KoaFaceRig.rested.smile, KoaFaceRig.determined.smile, f.smile)
    #expect(lids > brows && brows > mouth)
  }

  @Test func shapesStayOnTheFace() {
    for face in [KoaFaceRig.strain, .spent, .rested, .unimpressed, .sigh, .warm, .determined, .doze] {
      let m = face.mouth()
      #expect(m.lip.hasPrefix("M"))
      if face.open > 0.1 { #expect(m.cavity != nil) }
      #expect(face.browPaths().count == 2)
    }
    #expect(KoaFaceRig.strain.mouth().teeth != nil)
    #expect(KoaFaceRig.spent.mouth().tongue != nil)
  }

  @Test func rendererSwapsInRiggedBrowsAndMouth() {
    var o = KoaRender.Options()
    o.rig = .unimpressed
    let f = KoaRender.flags(o)
    #expect(f["browArc"]?.truthy == true && f["mouthSoft"]?.truthy == true && f["eyesOpen"]?.truthy == true)
    #expect(f["mouthSmile"]?.truthy != true && f["eyesArc"]?.truthy != true)
  }
}
