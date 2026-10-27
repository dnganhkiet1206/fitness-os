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

  /// Lần cân cách nhau `every` ngày, bắt đầu 30/09/2026.
  static func weighs(_ kgs: [Double], every: Int = 7) -> [P.Weigh] {
    kgs.enumerated().map { P.Weigh(date: LocalDate("2026-09-30")!.adding(days: $0.offset * every), kg: $0.element) }
  }

  @Test func bodyFollowsTheGoalDirection() {
    #expect(P.body(Self.weighs([55.0, 55.4, 55.2]), goal: .maintain).level == .good)
    #expect(P.body(Self.weighs([55.0, 55.6, 56.2]), goal: .maintain).level == .attention)
    #expect(P.body(Self.weighs([60.0, 59.5, 59.0]), goal: .lose).level == .good)
    #expect(P.body(Self.weighs([60.0, 60.2, 60.5]), goal: .lose).bodyNote == .offTrack)
    #expect(P.body(Self.weighs([60.0, 60.3, 60.5]), goal: .gain).level == .good)
    #expect(P.body(Self.weighs([60.0, 60.1]), goal: .gain).level == .insufficient)
    #expect(P.weightGoal("cut") == .lose && P.weightGoal("bulk") == .gain && P.weightGoal(nil) == .maintain)
  }

  /// Kiệt 27/10: tăng / giảm nhanh hơn ~1 % cân nặng mỗi tuần là "Cần chú ý".
  /// Audit vòng 4: +15 kg trong 4 tuần, mục tiêu tăng, từng ra "Tốt".
  @Test func gainingFasterThanOnePercentAWeekNeedsAttention() {
    let r = P.body(Self.weighs([70, 74, 78, 81, 85]), goal: .gain)  // 28 ngày, +3,75 kg/tuần
    #expect(r.level == .attention && r.bodyNote == .gainingFast)
    #expect(abs((r.weeklyKg ?? 0) - 3.75) < 1e-9)
    // 70 kg, +0,6 kg/tuần (0,86 %/tuần) — trong ngưỡng.
    let ok = P.body(Self.weighs([70, 70.6, 71.2, 71.8, 72.4]), goal: .gain)
    #expect(ok.level == .good && ok.bodyNote == nil)
    // Vừa quá 1 %: 70 kg, +0,75 kg/tuần (1,07 %).
    #expect(P.body(Self.weighs([70, 70.75, 71.5]), goal: .gain).bodyNote == .gainingFast)
  }

  @Test func losingFasterThanOnePercentAWeekNeedsAttention() {
    let r = P.body(Self.weighs([80, 78, 76]), goal: .lose)  // −2 kg/tuần = −2,5 %/tuần
    #expect(r.level == .attention && r.bodyNote == .losingFast)
    #expect(r.weeklyKg == -2)
    // 80 kg, −0,5 kg/tuần (0,63 %) — trong ngưỡng.
    #expect(P.body(Self.weighs([80, 79.5, 79, 78.5]), goal: .lose).level == .good)
  }

  /// Giữ cân: vẫn dải ±1 kg trong 4 tuần như trước (tốc độ không xét riêng).
  @Test func maintainKeepsItsBand() {
    #expect(P.body(Self.weighs([70, 70.4, 70.8]), goal: .maintain).level == .good)
    let r = P.body(Self.weighs([70, 74, 78, 81, 85]), goal: .maintain)
    #expect(r.level == .attention && r.bodyNote == .offTrack)
    // Giảm nhanh khi mục tiêu tăng: đi ngược mục tiêu, không phải "giảm nhanh".
    #expect(P.body(Self.weighs([70, 68, 66]), goal: .gain).bodyNote == .offTrack)
  }

  /// Lần cân cách nhau dưới một tuần: chưa nói được tốc độ (nước, bữa muộn) — chỉ xét hướng.
  @Test func shortSpansDoNotJudgeSpeed() {
    let r = P.body(Self.weighs([70, 71, 72], every: 1), goal: .gain)
    #expect(r.weeklyKg == nil && r.level == .good)
    #expect(P.weeklyChangeKg(Self.weighs([70, 71], every: 7)) == 1)
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

  @Test func rowsToSevenDays() throws {
    let today = try #require(LocalDate("2026-10-21"))
    let days = P.window(today)
    #expect(days.count == 7 && days.first == LocalDate("2026-10-15") && days.last == today)
    let rows: [JSONValue] = [
      .object(["date": .string("2026-10-21"), "steps": .number(2632), "readiness_score": .number(70),
               "readiness_explain": .string("load:70")]),
      .object(["date": .string("2026-10-20"), "steps": .number(0), "readiness_score": .number(88),
               "readiness_explain": .string("hrv:30|load:45|rhr:69|sleep:88")]),
    ]
    #expect(P.column(rows, "steps", days: days).last == 2632)
    #expect(P.column(rows, "steps", days: days)[5] == nil, "0 bước = chưa có số")
    let ready = P.measuredReadiness(rows, days: days)
    #expect(ready[5] == 88 && ready[6] == nil, "chỉ tải tập → không tính là đo được phục hồi")
    #expect(P.recoveryMeasured("sleep:47|load:80") && !P.recoveryMeasured("load:80") && !P.recoveryMeasured(nil))
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
