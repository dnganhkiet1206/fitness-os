import ASCNDCore
import Foundation
import Testing

/// Kế hoạch tuần (#527 Phase 2) — `components/ascnd/week-plan.tsx` @ fac9ac2.
struct WeekPlanningTests {
  private let wed = LocalDate("2026-10-07")!

  /// Tuần Thứ Hai → Chủ nhật quanh hôm nay; lùi / tiến theo tuần.
  @Test func weekStartsMondayAndSteps() {
    #expect(WeekPlanning.weekDates(today: wed, offset: 0).map(\.description) == [
      "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
    ])
    #expect(WeekPlanning.weekDates(today: wed, offset: -1).first?.description == "2026-09-28")
    let sunday = LocalDate("2026-10-11")!
    #expect(WeekPlanning.weekDates(today: sunday, offset: 0).first?.description == "2026-10-05", "Chủ nhật thuộc tuần bắt đầu Thứ Hai trước đó")
    #expect(WeekPlanning.clamp(offset: -9) == -4 && WeekPlanning.clamp(offset: 7) == 4 && WeekPlanning.clamp(offset: 2) == 2)
  }

  /// Ba buổi dùng gần nhất; chưa dùng xếp sau, giữ thứ tự; tên cắt khoảng trắng.
  @Test func suggestionsAreMostRecentlyUsed() {
    let t = ["Push", "Pull", "Legs", "Arms", "Core"].enumerated().map {
      WorkoutTemplate(id: "t\($0.offset)", name: $0.element, exercises: [])
    }
    let s: [(name: String, at: EpochMillis)] = [
      ("Legs", EpochMillis(10)), (" Pull ", EpochMillis(30)), ("Legs", EpochMillis(50)), ("", EpochMillis(99)),
      ("Gone", EpochMillis(70)),
    ]
    #expect(WeekPlanning.suggestions(t, sessions: s).map(\.name) == ["Legs", "Pull", "Push"])
    #expect(WeekPlanning.suggestions([], sessions: s).isEmpty)
    #expect(WeekPlanning.suggestions(t, sessions: []).map(\.name) == ["Push", "Pull", "Legs"], "chưa dùng: giữ thứ tự")
  }

  @Test func duplicateNamesOnly() {
    let t = ["A", "B", "A", "C", "C", "C"].enumerated().map {
      WorkoutTemplate(id: "t\($0.offset)", name: $0.element, exercises: [])
    }
    #expect(WeekPlanning.duplicateNames(t) == ["A", "C"])
  }
}
