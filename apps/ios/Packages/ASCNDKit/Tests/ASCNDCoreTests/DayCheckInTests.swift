import Foundation
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

  /// Nước điền sẵn = ĐÚNG hôm qua (trong 50…5000); không có → 500. Nút ghi nói
  /// "như hôm qua (71 oz)" phải ghi đúng 71 oz như thẻ Nước — không làm tròn.
  @Test func waterPrefillFollowsYesterday() {
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: nil) == 500)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 0) == 500)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 1_980) == 1_980)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 2_100) == 2_100)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 30) == 50)
    #expect(DayCheckIn.waterPrefillMl(yesterdayMl: 9_000) == 5_000)
    let today = LocalDate("2026-10-18")!
    let week = [WaterDay(date: LocalDate("2026-10-17")!, totalMl: 1_750), WaterDay(date: today, totalMl: 250)]
    #expect(DayCheckIn.yesterdayWaterMl(week, today: today) == 1_750)
    #expect(DayCheckIn.yesterdayWaterMl([], today: today) == nil)
    #expect(DayCheckIn.yesterdayWaterMl([WaterDay(date: LocalDate("2026-10-17")!, totalMl: 0)], today: today) == nil)
  }

  /// Kế hoạch ăn: ngày 1 = thứ Hai, ngày 7 = Chủ nhật.
  @Test func mealPlanDayIsMondayFirst() {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    func d(_ s: String) -> Date { ISO8601DateFormatter().date(from: s + "T12:00:00Z")! }
    #expect(MealPlans.dayIndex(d("2026-10-19"), calendar: cal) == 0)
    #expect(MealPlans.dayIndex(d("2026-10-18"), calendar: cal) == 6)
    #expect(MealPlans.dayIndex(d("2026-10-24"), calendar: cal) == 5)
  }

  /// Kế hoạch hôm nay: mới nhất có món cho đúng ngày; không có → nil.
  @Test func activePlanIsNewestWithFoodToday() {
    let a = MealPlans.Plan(id: "new", name: "Mới", goal: nil, mealsPerDay: 3)
    let b = MealPlans.Plan(id: "old", name: "Cũ", goal: nil, mealsPerDay: 3)
    let fill = ["new": [2: 3], "old": [0: 4, 2: 1]]
    #expect(MealPlans.activePlan([a, b], fill: fill, day: 0)?.id == "old")
    #expect(MealPlans.activePlan([a, b], fill: fill, day: 2)?.id == "new")
    #expect(MealPlans.activePlan([a, b], fill: fill, day: 5) == nil)
    let items = [
      MealPlans.Item(id: "1", day: 2, mealType: "lunch", name: "Cơm", kcal: 300),
      MealPlans.Item(id: "2", day: 3, mealType: "lunch", name: "Phở", kcal: 400),
    ]
    #expect(MealPlans.plannedToday(items, day: 2)["lunch"]?.map(\.name) == ["Cơm"])
  }
}
