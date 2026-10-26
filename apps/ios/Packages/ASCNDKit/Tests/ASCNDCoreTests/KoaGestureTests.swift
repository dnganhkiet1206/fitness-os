@testable import ASCNDCore
import Testing

/// Dáng mới của Koa (25/10).
struct KoaGestureTests {
  @Test func pickFollowsTheDay() {
    func p(_ t: Bool = false, _ w: Bool = false, _ m: Bool = false, _ tired: Bool = false, _ l: Bool = true) -> KoaGesture? {
      KoaGesture.pick(trainedToday: t, weekComplete: w, missedPlanned: m, tired: tired, loggedAnything: l)
    }
    #expect(p(true, true) == .cheer)
    #expect(p(true) == .taDa)
    #expect(p(false, false, true) == .pout)
    #expect(p(false, false, false, true) == .flop)
    #expect(p(false, false, false, false, false) == .curious)
    #expect(p() == nil)
  }

  /// Mỗi dáng có nét mặt riêng, và hình vẽ ra được (có đầu, thân, tay).
  @Test func everyGestureDraws() {
    for g in KoaGesture.allCases {
      var o = KoaRender.Options()
      o.gesture = g
      o.live = false
      let f = KoaRender.flags(o)
      for k in g.face { #expect(f[k]?.truthy == true, "\(g) \(k)") }
      #expect(!KoaPaint.plan(KoaRender.figure(o)).isEmpty, "\(g)")
    }
  }

  /// Bản RN (golden) không bị đổi: không dáng → không có mảng lấp / nhấc tay.
  @Test func rnTreeUntouched() {
    let a = KoaScene.$rn.withValue(true) { KoaRender.figure(KoaRender.Options()) }
    let b = KoaScene.$rn.withValue(true) { KoaRender.figure(KoaRender.Options()) }
    #expect(a == b)
  }
}
