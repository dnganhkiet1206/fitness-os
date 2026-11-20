@testable import ASCNDCore
import Testing

/// KOA-T60: `Streak.missedDates` trực tiếp (golden 17 ca ở `MascotGoldenTests` đối chiếu RN; đây là các ranh).
struct StreakMissedTests {
  static let today = LocalDate("2026-11-20")!
  func d(_ o: Int) -> LocalDate { Self.today.adding(days: o) }

  @Test func nothingLoggedMeansNothingMissed() {
    #expect(Streak.missedDates(datesDesc: [], today: Self.today).isEmpty)
  }

  @Test func loggedYesterdayMeansNothingMissed() {
    #expect(Streak.missedDates(datesDesc: [d(-1), d(-5)], today: Self.today).isEmpty)
  }

  @Test func gapIsOldToNewAndStopsAtTheLastLog() {
    #expect(Streak.missedDates(datesDesc: [d(-4)], today: Self.today) == [d(-3), d(-2), d(-1)])
  }

  @Test func frozenDayClosesTheGap() {
    #expect(Streak.missedDates(datesDesc: [d(-5)], today: Self.today, frozen: [d(-2)]) == [d(-1)])
  }

  @Test func todayItselfIsNeverMissed() {
    #expect(!Streak.missedDates(datesDesc: [d(-3)], today: Self.today).contains(Self.today))
  }

  @Test func cappedAtTheWindow() {
    let m = Streak.missedDates(datesDesc: [d(-(Streak.window + 50))], today: Self.today)
    #expect(m.count == Streak.window)
    #expect(m.last == d(-1))
  }
}
