@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T21: một chỗ tính Thứ Hai đầu tuần; khớp mọi bản cũ ở ranh giới.
struct WeekStartTests {
  /// Công thức cũ của `SmartGoals.weekStart` (Chủ nhật = 0, như `getDay()`).
  static func oldSmartGoals(_ d: LocalDate) -> LocalDate {
    let dow = ((d.daysSinceEpoch + 4) % 7 + 7) % 7
    return d.adding(days: dow == 0 ? -6 : 1 - dow)
  }

  @Test func boundaries() {
    #expect(LocalDate("2026-11-16")!.weekStart == LocalDate("2026-11-16")!, "Thứ Hai là chính nó")
    #expect(LocalDate("2026-11-22")!.weekStart == LocalDate("2026-11-16")!, "Chủ nhật thuộc tuần trước")
    #expect(LocalDate("2026-11-23")!.weekStart == LocalDate("2026-11-23")!)
    #expect(LocalDate("2024-03-03")!.weekStart == LocalDate("2024-02-26")!, "qua 29/2 năm nhuận")
    #expect(LocalDate("2027-01-01")!.weekStart == LocalDate("2026-12-28")!, "qua năm")
    #expect(LocalDate("1969-12-31")!.weekStart == LocalDate("1969-12-29")!, "trước mốc 1970")
  }

  @Test func everyOldFormulaAgreesOverYears() {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    var d = LocalDate("2019-12-30")!
    for _ in 0..<(366 * 9) {
      let w = d.weekStart
      #expect(w == Self.oldSmartGoals(d))
      #expect(w == d.adding(days: -WorkoutPlanning.routineIndex(d)))
      #expect(w == SmartGoals.weekStart(d) && w == WeeklyChallenges.weekStart(d) && w == KoaGains.monday(d))
      // Lịch Gregorian: Thứ Hai = weekday 2.
      let date = Date(timeIntervalSince1970: Double(w.daysSinceEpoch) * 86_400)
      #expect(cal.component(.weekday, from: date) == 2)
      d = d.adding(days: 1)
    }
  }

  /// `Water.rollingWindowStart` vẫn là khung trượt — không phải Thứ Hai.
  @Test func waterWindowIsRolling() {
    let today = LocalDate("2026-11-19")!
    #expect(Water.rollingWindowStart(today) == min(today.adding(days: -6), AverageWindow.first(before: today)))
  }
}

/// KOA-T30: mặt Koa trên thẻ tuần theo lời khuyên.
struct KoaWeekCoachEmotionTests {
  @Test func emotionFollowsKind() {
    #expect(KoaWeekCoach.Kind.light(loadFactor: 0.8).emotion == .rested)
    #expect(KoaWeekCoach.Kind.steady.emotion == .happy)
    #expect(KoaWeekCoach.Kind.progress.emotion == .proud)
  }
}
