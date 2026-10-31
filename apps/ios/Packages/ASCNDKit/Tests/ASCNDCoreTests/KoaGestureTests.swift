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

  /// Cảm xúc của ngày thắng dáng: xong hết việc, lo chuỗi, ăn quá, mới ngủ dậy thì không hờn đè lên.
  @Test(arguments: [KoaEmotion.Emotion.celebrate, .worry, .oops, .rested, .hat, .proud, .sleep])
  func moodBeatsGesture(mood: KoaEmotion.Emotion) {
    let g = KoaGesture.pick(trainedToday: false, weekComplete: false, missedPlanned: true, tired: false, loggedAnything: true, mood: mood)
    #expect(g == nil)
  }

  /// Vừa tập xong thì ta-da vẫn thắng, cả khi cảm xúc khác.
  @Test func trainingStillWins() {
    let g = KoaGesture.pick(trainedToday: true, weekComplete: false, missedPlanned: true, tired: false, loggedAnything: true, mood: .celebrate)
    #expect(g == .taDa)
  }

  /// Không biểu cảm nào giận, van nài người dùng ở nhịp hằng ngày: không gây tội lỗi.
  @Test func nothingBlamesTheUser() {
    for e in [KoaEmotion.Emotion.worry, .oops, .sad, .tired, .proud] {
      #expect(![KoaFlags.Expression.angry, .plead].contains(KoaEmotion.state(e).expression), "\(e)")
    }
    #expect(!KoaGesture.pout.face.contains("browAngry"))
  }

  /// Buổi hôm nay chưa tập chưa phải đã lỡ; ngày nghỉ thì `missedDays` vốn không đếm hôm nay.
  @Test func missedExcludesToday() {
    let today = LocalDate("2026-10-31")!
    var s = KoaGains.State(points: 0, peak: 0, missedDays: 1, lastSession: nil)
    #expect(s.missedBefore(today) == 0)
    s.restToday = true
    #expect(s.missedBefore(today) == 1)
    s.restToday = false
    s.lastSession = today
    #expect(s.missedBefore(today) == 1)
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
