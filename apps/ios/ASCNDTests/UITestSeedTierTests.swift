import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Tài khoản giả của chế độ UI test đứng đúng chỗ so với mốc bậc (10/11): mặc định 70 Gains, với
/// `-uiTestTierUp` là 100 Gains, một buổi trong lịch nữa là lên Gym Rat II. Lịch giả có buổi cả bảy ngày.
@MainActor
@Suite struct UITestSeedTierTests {
  private let week = KoaGains.Week(planned: Set(0..<7), rest: [])

  private func history(tierUp: Bool, now: Date) -> [KoaGains.Day] {
    let rows = UITestSeed.tables(now: now, calendar: .current, tierUp: tierUp)["workout_sessions"] ?? []
    return KoaGainsSync.days(rows.map(JSONValue.object), in: .current)
  }

  @Test(arguments: 0..<7) func seedSitsOneSessionBelowTheTier(dayOffset: Int) {
    // mọi thứ trong tuần: Gains của tài khoản giả không phụ thuộc hôm nay là thứ mấy
    let now = Date(timeIntervalSince1970: 1_794_300_000 + Double(dayOffset) * 86_400)
    let today = LocalDate(EpochMillis(Int64(now.timeIntervalSince1970 * 1000)), in: .current)
    let plain = KoaGains.compute(history(tierUp: false, now: now), week: week, today: today)
    #expect(plain.points == 70)

    let days = history(tierUp: true, now: now)
    let before = KoaGains.compute(days, week: week, today: today)
    #expect(before.points == 100 && KoaGains.tier(before.points).remaining == 10)
    let all = days + [KoaGains.Day(date: today, personalRecord: false)]
    let after = KoaGains.compute(all, week: week, today: today)
    let up = WorkoutSummaryView.tierUp(all, week: week, today: today, before: before, after: after)
    #expect(up?.rank == 1 && up?.tier == 2, "buổi hôm nay lên Gym Rat II")
    #expect(up?.sessions == 7, "chặng từ sau ngày lên Gym Rat I (buổi thứ 4): sáu buổi cũ và buổi hôm nay")
  }
}
