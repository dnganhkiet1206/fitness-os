@testable import ASCNDCore
import Foundation
import Testing

/// Koa V2, lát dọc (05/11): nét mặt chuyển dần, nhịp nghỉ có đà, dồn trọng tâm, chớp lệch hai mắt,
/// ánh nhìn sống ngoài phòng. Bản RN (`KoaScene.rn`) không đổi.
struct KoaV2SliceTests {
  static func opacities(_ e: KoaRender.Element) -> [Double] {
    var out: [Double] = []
    if e.tag == "G", case .number(let k)? = e.props["opacity"] { out.append(k) }
    for k in e.kids { out += opacities(k) }
    return out
  }

  static func options(_ e: KoaFlags.Expression = .happy, t: Double = 1234) -> KoaRender.Options {
    var o = KoaRender.Options()
    o.expression = e
    o.t = t
    return o
  }

  // MARK: - nét mặt chuyển dần

  @Test func faceTweenEasesFromTheOldFaceToTheNew() {
    let happy = KoaRender.Options.Face(expression: .happy, gesture: nil)
    let sad = KoaRender.Options.Face(expression: .sad, gesture: nil)
    var tw = KoaFaceTween()
    tw.update(happy, at: 0)
    #expect(tw.from(at: 0) == nil, "nét đầu tiên hiện ngay, không chuyển từ đâu")
    tw.update(sad, at: 1000)
    #expect(tw.from(at: 1000) == happy)
    #expect(tw.mix(at: 1000) == 0)
    #expect(tw.mix(at: 1000 + KoaFaceTween.duration / 2) == 0.5, "dịu hai đầu, giữa chừng là nửa")
    #expect(tw.mix(at: 1000 + KoaFaceTween.duration) == 1)
    #expect(tw.from(at: 1000 + KoaFaceTween.duration) == nil, "xong thì thôi chuyển")
  }

  @Test func changingFaceMidwayStartsFromTheFaceShownMost() {
    let a = KoaRender.Options.Face(expression: .happy, gesture: nil)
    let b = KoaRender.Options.Face(expression: .sad, gesture: nil)
    let c = KoaRender.Options.Face(expression: .surprised, gesture: nil)
    var tw = KoaFaceTween()
    tw.update(a, at: 0)
    tw.update(b, at: 100)
    tw.update(c, at: 120)  // b mới hiện chút ít: rời từ a
    #expect(tw.from(at: 120) == a)
    tw.update(b, at: 120 + KoaFaceTween.duration * 0.9)  // c đã hiện gần hết: rời từ c
    #expect(tw.from(at: 120 + KoaFaceTween.duration * 0.9) == c)
  }

  @Test func crossfadeDrawsBothFacesHalfwayAndOnlyTheNewOneAfter() {
    var o = Self.options(.sad)
    o.faceFrom = .init(expression: .happy, gesture: nil)
    o.faceMix = 0.5
    let mid = Self.opacities(KoaRender.figure(o))
    #expect(mid.filter { abs($0 - 0.5) < 1e-9 }.count >= 2, "lớp của nét cũ và nét mới cùng hiện một nửa")

    o.faceMix = 1
    #expect(KoaRender.figure(o) == KoaRender.figure(Self.options(.sad)), "chuyển xong là đúng hình nét mới")
    o.faceMix = 0.5
    o.faceFrom = .init(expression: .sad, gesture: nil)
    #expect(KoaRender.figure(o) == KoaRender.figure(Self.options(.sad)), "cùng nét mặt thì không có gì để chuyển")
  }

  @Test func eyesSwitchUnderABlinkInsteadOfFading() {
    var o = Self.options(.sad)
    o.faceFrom = .init(expression: .happy, gesture: nil)
    o.faceMix = 0.5
    o.faceEyesNew = false
    // trước lúc mí khép kín: mắt cũ còn nguyên, chỉ mày / miệng mờ dần
    let fades = Self.opacities(KoaRender.figure(o)).filter { abs($0 - 0.5) < 1e-9 }.count
    #expect(fades >= 1, "mày / miệng vẫn mờ dần")
    var plain = Self.options(.sad)
    plain.faceFrom = o.faceFrom
    plain.faceMix = 0.5
    #expect(KoaRender.figure(o) != KoaRender.figure(plain), "mắt cũ hay mắt mới tuỳ lúc mí khép")
    var tw = KoaFaceTween()
    tw.update(.init(expression: .happy, gesture: nil), at: 0)
    tw.update(.init(expression: .sad, gesture: nil), at: 1000)
    #expect(!tw.eyesNew(at: 1050) && tw.eyesNew(at: 1070), "mắt đổi lúc 70 ms, khi mí khép kín")
    #expect(abs((tw.blink(at: 1070) ?? 0) - 1) < 1e-9, "đúng lúc đổi mắt thì mí khép kín")
    #expect(tw.blink(at: 1000 + KoaFaceTween.duration) == nil)
    #expect((tw.blinkRight(at: 1035) ?? 1) < (tw.blink(at: 1035) ?? 0), "mắt phải theo sau")
  }

  @Test func crossfadeStartsFromTheOldFace() {
    var o = Self.options(.sad)
    o.faceFrom = .init(expression: .happy, gesture: nil)
    o.faceMix = 0
    let start = Self.opacities(KoaRender.figure(o))
    let happy = Self.opacities(KoaRender.figure(Self.options(.happy)))
    #expect(start == happy, "lúc bắt đầu chưa có lớp nào của nét mới, không lớp nào mờ thêm")
  }

  @Test func faceCrossfadeIsNativeOnlyAndNeedsALiveFigure() {
    var o = Self.options(.sad)
    o.faceFrom = .init(expression: .happy, gesture: nil)
    o.faceMix = 0.5
    let rn = KoaScene.$rn.withValue(true) { KoaRender.figure(o) }
    let rnPlain = KoaScene.$rn.withValue(true) { KoaRender.figure(Self.options(.sad)) }
    #expect(rn == rnPlain, "bản RN không đổi")
    o.live = false
    var still = Self.options(.sad)
    still.live = false
    #expect(KoaRender.figure(o) == KoaRender.figure(still), "khung đứng yên (lưới, ô chọn) không chuyển")
  }

  // MARK: - nhịp nghỉ có đà, dồn trọng tâm

  @Test func idleLayersNoLongerMoveInLockstep() {
    var on = Self.options(t: 900)
    var off = on
    off.settle = false
    #expect(KoaRender.figure(on) != KoaRender.figure(off), "tai / tay theo sau đầu")
    on.t = 0
    off.t = 0
    #expect(KoaRender.figure(on) == KoaRender.figure(off), "khung t=0 (ảnh chuẩn) giữ nguyên")
  }

  @Test func weightShiftIsSlowSmallAndZeroAtStart() {
    #expect(KoaMath.weightShift(0) == 0)
    let samples = stride(from: 0.0, through: 60_000, by: 50).map(KoaMath.weightShift)
    #expect(samples.allSatisfy { abs($0) < 1.2 }, "nghiêng tối đa ~1°: bàn chân gần như không rời sàn")
    #expect(samples.contains { $0 > 0.4 } && samples.contains { $0 < -0.4 }, "dồn sang cả hai chân")
    let steepest = zip(samples, samples.dropFirst()).map { abs($1 - $0) }.max() ?? 0
    #expect(steepest < 0.05, "chậm: dưới 0,05° mỗi 50 ms")
  }

  @Test func weightShiftOnlyWhenStandingPlain() {
    var o = Self.options(t: 3000)
    let f = KoaRender.flags(o)
    #expect(KoaRender.context(o, f).weightShift != 0)
    o.gesture = .cheer
    #expect(KoaRender.context(o, KoaRender.flags(o)).weightShift == 0, "dáng biểu cảm tự lo thân")
    o.gesture = nil
    o.pose = .lifting
    #expect(KoaRender.context(o, KoaRender.flags(o)).weightShift == 0, "tư thế khác có nhịp riêng")
  }

  // MARK: - chớp lệch hai mắt

  @Test func rightEyeCanTrailTheLeft() {
    var o = Self.options()
    o.blink = 0.6
    let same = KoaRender.figure(o)
    o.blinkRight = 0.6
    #expect(KoaRender.figure(o) == same, "bằng nhau thì vẽ như cũ")
    o.blinkRight = 0.3
    #expect(KoaRender.figure(o) != same, "mắt phải khép ít hơn mắt trái")
    o.blink = nil
    let noBlink = KoaRender.figure(o)
    o.blinkRight = nil
    #expect(KoaRender.figure(o) == noBlink, "không ai điều khiển chớp thì mắt phải cũng không")
  }

  @Test func gazeBlinkClosesTheRightEyeAFrameLater() {
    #expect(KoaGaze.lid(0.035) > KoaGaze.lid(0.035 - KoaGaze.rightLag))
    #expect(KoaGaze.lid(0) == 0 && KoaGaze.lid(0.16) == 0)
    #expect(abs(KoaGaze.lid(0.07) - 1) < 1e-9)
  }

  // MARK: - ánh nhìn sống ngoài phòng

  @Test func idleLifeLooksAroundAndBlinksIrregularly() {
    var life = KoaIdleLife(seed: 7)
    var blinks: [Double] = []
    var closed = false
    var lookedAway = false
    for i in 0..<(60 * 30) {
      let ms = Double(i) * 1000 / 60
      let out = life.step(at: ms)
      #expect(abs(out.eyes.x) <= 1 && abs(out.head.x) <= 1)
      if abs(out.eyes.x) > 0.3 { lookedAway = true }
      if out.blink > 0.5, !closed { blinks.append(ms) }
      closed = out.blink > 0.5
    }
    #expect(lookedAway, "trong 30 giây Koa liếc đi ít nhất một lần")
    #expect(blinks.count >= 7 && blinks.count <= 20, "chớp 7–20 lần trong 30 giây (không thưa như 2–7 s của phòng)")
    let gaps = zip(blinks, blinks.dropFirst()).map { $1 - $0 }
    #expect(Set(gaps.map { Int($0 / 100) }).count > 1, "khoảng cách giữa hai lần chớp không đều")
  }

  @Test func idleLifeBlinksOftenEnoughOnEverySeed() {
    for seed in UInt64(1)...40 {
      var life = KoaIdleLife(seed: seed)
      var n = 0, closed = false
      for i in 0..<(60 * 10) {
        let b = life.step(at: Double(i) * 1000 / 60).blink
        if b > 0.5, !closed { n += 1 }
        closed = b > 0.5
      }
      #expect(n >= 2, "hạt \(seed): ít nhất 2 lần chớp trong 10 giây")
    }
  }

  @Test func idleLifeDoesNotCatchUpAfterAPause() {
    var a = KoaIdleLife(seed: 3)
    _ = a.step(at: 0)
    a.pause()
    let afterPause = a.step(at: 600_000)
    var b = KoaIdleLife(seed: 3)
    _ = b.step(at: 0)
    let fresh = b.step(at: 0)
    #expect(afterPause == fresh, "dừng 10 phút rồi chạy lại: không bù cả quãng")
  }
}

/// Mặt tập gym vẽ thêm (05/11, Kiệt: "Đạt, đưa vào app").
struct KoaGymFaceTests {
  @Test func eachGymFaceTurnsOnOnlyItsOwnLayerAndHidesTheDrawnFace() {
    for (e, flag) in KoaFlags.gymFace {
      let f = KoaFlags.flags(e, .idle)
      #expect(f[flag]?.truthy == true, "\(e)")
      for (other, of) in KoaFlags.gymFace where other != e { #expect(f[of] == nil) }
      #expect(f["eyesOpen"]?.truthy == false, "mắt gốc tắt: mặt gym có mắt riêng")
      for k in f.keys where k.hasPrefix("brow") || k.hasPrefix("mouth") { #expect(f[k]?.truthy != true, "\(e) \(k)") }
    }
    #expect(KoaFlags.flags(.happy, .idle).keys.contains { $0.hasPrefix("faceGym") } == false, "mặt cũ không đổi")
  }

  @Test func gymFacesAreInTheAppSceneAndDraw() {
    let scene = KoaScene.wardrobeJSON
    for flag in KoaFlags.gymFace.values { #expect(scene.contains("\"if\":\"\(flag)\""), "\(flag)") }
    var o = KoaRender.Options()
    o.live = false
    o.expression = .happy
    let happy = KoaRender.figure(o)
    for e in KoaFlags.gymFace.keys {
      o.expression = e
      #expect(KoaRender.figure(o) != happy, "\(e) vẽ khác mặt vui")
    }
  }

  @Test func closedEyeGymFacesAreNotForcedToBlink() {
    #expect(KoaFlags.eyesClosed(.puff) && KoaFlags.eyesClosed(.roar))
    #expect(!KoaFlags.eyesClosed(.focus))
  }
}
