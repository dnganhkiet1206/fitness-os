@testable import ASCNDCore
import Testing

/// KOA-T26: màn diễn của Koa đứng yên khi tạm dừng, chạy tiếp không nhảy cóc.
struct RestActiveClockTests {
  @Test func pauseFreezesAndResumeContinues() {
    var c = RestActiveClock()
    #expect(c.elapsed(now: 0, paused: false) == 0)
    #expect(c.elapsed(now: 4000, paused: false) == 4000)
    #expect(c.elapsed(now: 5000, paused: true) == 5000)
    #expect(c.elapsed(now: 20000, paused: true) == 5000, "đang dừng: đứng yên")
    #expect(c.elapsed(now: 20000, paused: false) == 5000, "tiếp tục: không nhảy")
    #expect(c.elapsed(now: 21000, paused: false) == 6000)
  }

  @Test func repeatedPausesAccumulateAndSameNowIsStable() {
    var c = RestActiveClock()
    _ = c.elapsed(now: 1000, paused: true)
    _ = c.elapsed(now: 3000, paused: false)
    _ = c.elapsed(now: 5000, paused: true)
    _ = c.elapsed(now: 9000, paused: false)
    #expect(c.elapsed(now: 10000, paused: false) == 4000)
    #expect(c.elapsed(now: 10000, paused: false) == 4000)
  }
}
