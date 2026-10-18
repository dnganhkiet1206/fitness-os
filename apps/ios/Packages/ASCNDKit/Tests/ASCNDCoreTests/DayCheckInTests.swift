@testable import ASCNDCore
import Testing

/// "Hôm nay của bạn" — ghi cả ngày một lần (18/10).
struct DayCheckInTests {
  /// Việc chưa có thì hỏi; ngày nghỉ không hỏi tập và không tính vào tiến độ.
  @Test func pendingSkipsDoneAndRestDays() {
    let s = DayCheckIn.states(
      sleepDone: true, mealDone: false, waterMl: 0, waterTargetMl: 2500, workoutDone: false, workoutPlanned: true)
    #expect(DayCheckIn.pending(s) == [.meal, .water, .workout])
    #expect(DayCheckIn.progress(s) == (1, 4))
    let rest = DayCheckIn.states(
      sleepDone: false, mealDone: true, waterMl: 250, waterTargetMl: 2500, workoutDone: false, workoutPlanned: false)
    #expect(rest[.workout] == .rest)
    #expect(DayCheckIn.pending(rest) == [.sleep])
    #expect(DayCheckIn.progress(rest) == (2, 3))
    let doneWorkoutOnRestDay = DayCheckIn.states(
      sleepDone: true, mealDone: true, waterMl: 1, waterTargetMl: 2500, workoutDone: true, workoutPlanned: false)
    #expect(DayCheckIn.pending(doneWorkoutOnRestDay).isEmpty)
    #expect(DayCheckIn.progress(doneWorkoutOnRestDay) == (4, 4))
  }

  /// Nước điền sẵn = hôm qua, làm tròn nấc 250 ml, trong 250…5000; không có → 500.
  @Test func waterPrefillFollowsYesterday() {
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: nil) == 500)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 0) == 500)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 1_980) == 2_000)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 90) == 250)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 9_000) == 5_000)
    let today = LocalDate("2026-10-18")!
    let week = [WaterDay(date: LocalDate("2026-10-17")!, totalMl: 1_750), WaterDay(date: today, totalMl: 250)]
    #expect(DayCheckIn.yesterdayWaterMl(week, today: today) == 1_750)
    #expect(DayCheckIn.yesterdayWaterMl([], today: today) == nil)
    #expect(DayCheckIn.yesterdayWaterMl([WaterDay(date: LocalDate("2026-10-17")!, totalMl: 0)], today: today) == nil)
  }
}
