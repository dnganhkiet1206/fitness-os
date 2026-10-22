@testable import ASCNDCore
import Testing

/// Chữ A tô theo số thật (Kiệt 22/10).
struct ProgressFillTests {
  @Test func trainingIsSessionsOverPlan() {
    let r = ProgressStatus.training(done: 3, dueBeforeToday: 3, planned: 6)
    #expect(ProgressStatus.fill(r) == 0.5)
  }

  @Test func ratioGroupsAreAverageOverTarget() {
    let protein = ProgressStatus.nutrition([60, 62, 64, nil, nil, nil, nil], target: 124)
    #expect(abs(ProgressStatus.fill(protein) - 0.5) < 0.0001)
    let over = ProgressStatus.steps([12000, 12000, 12000, 12000, 12000, 12000, 12000], goal: 8000)
    #expect(ProgressStatus.fill(over) == 1)
  }

  @Test func insufficientShowsHowMuchDataExists() {
    let r = ProgressStatus.sleep([420, nil, nil, nil, nil, nil, nil], targetHours: 8)
    #expect(r.level == .insufficient)
    #expect(ProgressStatus.fill(r) == 1.0 / Double(r.need))
    let none = ProgressStatus.training(done: 0, dueBeforeToday: 0, planned: nil)
    #expect(ProgressStatus.fill(none) == 0)
  }
}
