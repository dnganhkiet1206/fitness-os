import Testing

@testable import ASCNDCore

/// Màn nghỉ có Koa (07/11, Kiệt: thay đồng hồ nghỉ cũ, story có ý nghĩa, biểu cảm không quá nhanh).
@Suite struct KoaRestStoryTests {
  typealias S = KoaRestStory

  @Test func storyFollowsTheRealClock() {
    let total = 90.0
    // việc thật của người nghỉ: đặt tạ → lau mồ hôi → uống nước → thở
    let down = S.at(elapsed: 500, left: 89_000, total: total)
    #expect(down.beat == .setDown && down.hand == "dumbbell" && down.camera.zoom > 1.2, "mở bằng cận thấp")
    #expect(S.at(elapsed: 1800, left: 88_000, total: total).dumbbellOnFloor)
    #expect(S.at(elapsed: 4000, left: 86_000, total: total).hand == "towel")
    #expect(S.at(elapsed: 8500, left: 81_000, total: total).hand == "bottle")
    let a = S.at(elapsed: 14_000, left: 76_000, total: total)
    let b = S.at(elapsed: 18_000, left: 72_000, total: total)
    #expect(a.beat == .breathe && a.caption == .inhale && a.hand == nil)
    #expect(b.caption == .exhale)
    // nghỉ ngắn: bỏ đoạn uống nước
    #expect(S.at(elapsed: 8500, left: 21_000, total: 30).hand != "bottle")
    // chuẩn bị ở 12 s cuối (nhặt tạ), đếm ngược 3 s cuối, hết giờ "lên set" máy thấp nghiêng
    let r = S.at(elapsed: 80_000, left: 10_000, total: total)
    #expect(r.beat == .ready && r.hand == "dumbbell" && !r.dumbbellOnFloor)
    #expect(S.at(elapsed: 88_000, left: 2_000, total: total).beat == .countdown)
    let go = S.at(elapsed: 90_400, left: -400, total: total)
    #expect(go.beat == .go && go.camera.tilt > 2 && go.camera.anchor > 0.9)
    // tạm dừng: suy nghĩ, lâu thì ngủ gật
    #expect(S.at(elapsed: 30_000, left: 60_000, total: total, pausedFor: 2000).frame.expression == .thinking)
    #expect(S.at(elapsed: 30_000, left: 60_000, total: total, pausedFor: 12_000).frame.expression == .sleepy)
  }

  @Test func manyFacesNotOne() {
    // Kiệt: "biểu cảm mới mẻ hơn" — một quãng nghỉ 90 s đi qua ít nhất 8 nét mặt khác nhau
    var seen = Set<KoaFlags.Expression>()
    var t = 0.0
    while t < 90_500 { seen.insert(S.at(elapsed: t, left: 90_000 - t, total: 90).frame.expression); t += 50 }
    #expect(seen.count >= 8, "\(seen)")
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
    var prevZoom = S.at(elapsed: 0, left: 60_000, total: 60).camera.zoom
    var t = 20.0
    while t < 60_000 {
      let m = S.at(elapsed: t, left: 60_000 - t, total: 60)
      let f = m.frame
      #expect(abs(f.walk.bob - prev.walk.bob) < 1.5, "bob nhảy ở \(t): \(prev.walk.bob) → \(f.walk.bob)")
      #expect(abs(f.walk.armRight - prev.walk.armRight) < 12, "tay nhảy ở \(t)")
      #expect(abs(m.camera.zoom - prevZoom) < 0.02, "máy giật ở \(t)")
      #expect(f.walk.bob >= KoaPerformance.minCanvasBob - 0.01 && f.walk.bob <= KoaPerformance.inCanvasBob)
      prev = f; prevZoom = m.camera.zoom; t += 20
    }
  }

  @Test func shortRestStillHasAllBeats() {
    #expect(S.readySeconds(total: 30) == 10)
    #expect(S.readySeconds(total: 120) == 12)
    #expect(S.readySeconds(total: 10) == 5)
  }
}
