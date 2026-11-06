import Testing

@testable import ASCNDCore

/// Màn nghỉ có Koa (07/11, Kiệt: thay đồng hồ nghỉ cũ, story có ý nghĩa, biểu cảm không quá nhanh).
@Suite struct KoaRestStoryTests {
  typealias S = KoaRestStory

  @Test func storyFollowsTheRealClock() {
    let total = 90.0
    // mở đầu
    #expect(S.at(elapsed: 500, left: 89_000, total: total).beat == .intro)
    // thở cùng người dùng, có chữ dẫn nhịp đổi hít / thở
    let a = S.at(elapsed: S.introMs + 1500, left: 80_000, total: total)
    let b = S.at(elapsed: S.introMs + 5500, left: 76_000, total: total)
    #expect(a.beat == .breathe && a.caption == .inhale)
    #expect(b.caption == .exhale)
    // chuẩn bị ở 12 s cuối, đếm ngược 3 s cuối, hết giờ "lên set"
    #expect(S.at(elapsed: 80_000, left: 10_000, total: total).beat == .ready)
    #expect(S.at(elapsed: 88_000, left: 2_000, total: total).beat == .countdown)
    #expect(S.at(elapsed: 90_200, left: 0, total: total).beat == .go)
    #expect(S.at(elapsed: 30_000, left: 60_000, total: total, pausedFor: 1000).beat == .paused)
  }

  @Test func facesHoldLongEnough() {
    // Kiệt: "biểu cảm xảy ra nhanh quá" — dọc một quãng nghỉ 90 s, mỗi nét mặt giữ ≥ minFaceMs
    var last = S.at(elapsed: 0, left: 90_000, total: 90).frame.expression
    var since = 0.0
    var t = 0.0
    while t < 91_000 {
      let e = S.at(elapsed: t, left: 90_000 - t, total: 90).frame.expression
      if e != last {
        #expect(t - since >= S.minFaceMs, "đổi \(last) → \(e) ở \(t) ms")
        last = e; since = t
      }
      t += 20
    }
  }

  @Test func motionIsContinuous() {
    // không giật: giữa hai khung 20 ms, thân / tay không nhảy quá xa (trừ cú giơ tạ có chủ ý lúc hết giờ)
    var prev = S.at(elapsed: 0, left: 60_000, total: 60).frame
    var t = 20.0
    while t < 60_000 {
      let f = S.at(elapsed: t, left: 60_000 - t, total: 60).frame
      #expect(abs(f.walk.bob - prev.walk.bob) < 1.5, "bob nhảy ở \(t): \(prev.walk.bob) → \(f.walk.bob)")
      #expect(abs(f.walk.armRight - prev.walk.armRight) < 12, "tay nhảy ở \(t)")
      #expect(f.walk.bob >= KoaPerformance.minCanvasBob - 0.01 && f.walk.bob <= KoaPerformance.inCanvasBob)
      prev = f; t += 20
    }
  }

  @Test func shortRestStillHasAllBeats() {
    #expect(S.readySeconds(total: 30) == 10)
    #expect(S.readySeconds(total: 120) == 12)
    #expect(S.readySeconds(total: 10) == 5)
  }
}
