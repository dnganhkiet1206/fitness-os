import ASCNDCore
import Testing

@testable import ASCND

/// KOA-T40: con số trong câu của Koa dựng một chỗ; chưa có giấc ngủ thì không nói "0 giờ 0 phút".
@MainActor
@Suite struct KoaLineNumbersTests {
  @Test func noSleepMeansNoSleepLine() {
    #expect(KoaLineNumbers.slept(nil) == nil)
    #expect(KoaLineNumbers.slept(DailySignals()) == nil)
  }

  @Test func sleepIsFormattedOnce() {
    var s = DailySignals()
    s.sleepMinutes = 450
    #expect(KoaLineNumbers.slept(s) == String(localized: "today.d.sleep \(7) \(30)"))
  }

  @Test func overateNeedsCaloriesAndAProfile() {
    var s = DailySignals()
    s.kcal = 2500
    #expect(KoaLineNumbers.overatePercent(s, nil) == nil)
    #expect(KoaLineNumbers.overatePercent(DailySignals(), nil) == nil)
  }
}
