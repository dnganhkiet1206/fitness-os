@testable import ASCNDCore
import Foundation
import Testing

/// Tiến bộ theo chữ trạng thái (#527, mock bản 10): ngưỡng của bảng, "chưa đủ dữ liệu"
/// khi dưới 3 ngày, thứ tự, câu đầu trang.
struct ProgressStatusTests {
  typealias P = ProgressStatus

  @Test func trainingCountsOnlyDaysBeforeToday() {
    // 2 buổi, lịch có 2 buổi trước hôm nay → Tốt (buổi hôm nay chưa tính là chậm).
    #expect(P.training(done: 2, dueBeforeToday: 2, planned: 6).level == .good)
    #expect(P.training(done: 1, dueBeforeToday: 2, planned: 6).level == .attention)
    #expect(P.training(done: 0, dueBeforeToday: 0, planned: nil).level == .insufficient)
    #expect(P.training(done: 3, dueBeforeToday: 0, planned: 0).level == .insufficient)
  }

  @Test func stepsAt80PercentOfGoal() {
    let ok: [Double?] = [nil, 8000, 8000, 8000, nil, nil, 8000]
    #expect(P.steps(ok, goal: 10_000).level == .good)
    let low: [Double?] = [7000, 7000, 7000, nil, nil, nil, nil]
    #expect(P.steps(low, goal: 10_000).level == .attention)
    let two: [Double?] = [nil, nil, nil, nil, nil, 9000, 9000]
    let r = P.steps(two, goal: 10_000)
    #expect(r.level == .insufficient && r.have == 2 && r.need == 3)
  }

  @Test func sleepWithin30MinutesOfTarget() {
    #expect(P.sleep([450, 450, 450, nil, nil, nil, nil], targetHours: 8).level == .good)  // 7h30
    #expect(P.sleep([449, 449, 449, nil, nil, nil, nil], targetHours: 8).level == .attention)
    #expect(P.sleep([nil, nil, nil, nil, nil, nil, nil], targetHours: 8).level == .insufficient)
  }

  @Test func proteinAt80PercentOfTarget() {
    #expect(P.nutrition([112, 112, 112, nil, nil, nil, nil], target: 140).level == .good)
    // Tài khoản test 21/10: đạm TB 25 / 121 g.
    let r = P.nutrition([25, 25, 25, 25, 25, nil, nil], target: 121)
    #expect(r.level == .attention && r.have == 5 && r.average == 25)
  }

  @Test func recoveryNeedsThreeMeasuredDays() {
    #expect(P.recovery([92, nil, nil, nil, nil, nil, nil]).level == .insufficient)
    #expect(P.recovery([60, 60, 60, nil, nil, nil, nil]).level == .good)
    #expect(P.recovery([59, 59, 59, nil, nil, nil, nil]).level == .attention)
  }

  @Test func bodyFollowsTheGoalDirection() {
    #expect(P.body([55.0, 55.4, 55.2], goal: .maintain).level == .good)
    #expect(P.body([55.0, 55.6, 56.2], goal: .maintain).level == .attention)
    #expect(P.body([60.0, 59.5, 59.0], goal: .lose).level == .good)
    #expect(P.body([60.0, 60.2, 60.5], goal: .lose).level == .attention)
    #expect(P.body([60.0, 60.3, 60.5], goal: .gain).level == .good)
    #expect(P.body([60.0, 60.1], goal: .gain).level == .insufficient)
    #expect(P.weightGoal("cut") == .lose && P.weightGoal("bulk") == .gain && P.weightGoal(nil) == .maintain)
  }

  @Test func orderPutsAttentionFirstAndFocusFollowsPriority() {
    let rs = [
      P.training(done: 2, dueBeforeToday: 3, planned: 6),
      P.steps([10_000, 10_000, 10_000, nil, nil, nil, nil], goal: 10_000),
      P.nutrition([25, 25, 25, nil, nil, nil, nil], target: 121),
      P.sleep([nil, nil, nil, nil, nil, nil, nil], targetHours: 8),
    ]
    #expect(P.ordered(rs).map(\.group) == [.training, .nutrition, .steps, .sleep])
    #expect(P.focus(rs) == [.training, .nutrition])
  }

  /// Kiệt 27/10: khung là 7 ngày TRƯỚC hôm nay (`AverageWindow`); hôm nay đi riêng.
  @Test func rowsToSevenDays() throws {
    let today = try #require(LocalDate("2026-10-21"))
    let days = P.window(today)
    #expect(days == AverageWindow.days(before: today))
    #expect(days.count == 7 && days.first == LocalDate("2026-10-14") && days.last == LocalDate("2026-10-20"))
    let rows: [JSONValue] = [
      .object(["date": .string("2026-10-21"), "steps": .number(2632), "readiness_score": .number(70),
               "readiness_explain": .string("load:70")]),
      .object(["date": .string("2026-10-20"), "steps": .number(0), "readiness_score": .number(88),
               "readiness_explain": .string("hrv:30|load:45|rhr:69|sleep:88")]),
      .object(["date": .string("2026-10-19"), "steps": .number(9100)]),
    ]
    #expect(!P.column(rows, "steps", days: days).contains(2632), "hôm nay không vào khung")
    #expect(P.column(rows, "steps", days: [today]) == [2632])
    #expect(P.column(rows, "steps", days: days)[6] == nil, "0 bước = chưa có số")
    #expect(P.column(rows, "steps", days: days)[5] == 9100)
    let ready = P.measuredReadiness(rows, days: days)
    #expect(ready[6] == 88)
    #expect(P.measuredReadiness(rows, days: [today]) == [nil], "chỉ tải tập → không tính là đo được phục hồi")
    #expect(P.recoveryMeasured("sleep:47|load:80") && !P.recoveryMeasured("load:80") && !P.recoveryMeasured(nil))
  }

  /// Số hôm nay chỉ để hiện: không đổi trung bình, không đổi chữ trạng thái.
  @Test func todayIsShownButNotAveraged() {
    let week: [Double?] = [8000, 8000, 8000, nil, nil, nil, nil]
    let morning = P.steps(week, goal: 10_000, today: 400)
    #expect(morning.today == 400 && morning.average == 8000 && morning.level == .good)
    #expect(P.sleep([480, 480, 480, nil, nil, nil, nil], targetHours: 8, today: 300).average == 480)
    #expect(P.nutrition([120, 120, 120, nil, nil, nil, nil], target: 140, today: 10).level == .good)
    #expect(P.recovery([70, 70, 70, nil, nil, nil, nil], today: 20).average == 70)
  }

  @Test @MainActor func trainingFromKoaWeek() throws {
    let mon = try #require(LocalDate("2026-10-19"))
    let t = WorkoutTemplate(id: "t", name: "A", exercises: [])
    let lib = TemplateSnapshot(
      routine: [0, 1, 2, 3].map { RoutineDay(dayOfWeek: $0, isRest: false, templateId: "t") }
        + [4, 5, 6].map { RoutineDay(dayOfWeek: $0, isRest: true, templateId: nil) },
      templates: [t], fetchedAt: EpochMillis(1))
    let wed = mon.adding(days: 2)
    let week = KoaWeek.state(today: wed, library: lib, trained: [mon, mon.adding(days: 1)])
    let r = P.training(week, today: wed)
    #expect(r.level == .good && r.have == 2 && r.of == 4, "T2, T3 đã tập; T4 (hôm nay) chưa tính là chậm")
    let late = KoaWeek.state(today: wed, library: lib, trained: [mon])
    #expect(P.training(late, today: wed).level == .attention)
    #expect(P.training(nil, today: wed).level == .insufficient)
  }
}
