import Testing

@testable import ASCNDCore

@Suite struct KoaWeekCoachTests {
  private func item(_ name: String, _ a: OverloadPlan.Advice) -> OverloadPlan.Item { .init(name: name, advice: a) }

  @Test func missingHalfOrAWeekOffMeansALightWeek() {
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 4, done: 2), daysOff: 1, targets: []) == .light(loadFactor: 1))
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 2), daysOff: 2, targets: []) == .steady)
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 3), daysOff: 7, targets: []) == .light(loadFactor: 1))
  }

  @Test func longBreaksSuggestLessWeight() {
    #expect(KoaWeekCoach.loadFactor(daysOff: 20) == 1)
    #expect(KoaWeekCoach.loadFactor(daysOff: 21) == 0.9)
    #expect(KoaWeekCoach.loadFactor(daysOff: 56) == 0.8)
  }

  @Test func progressOnlyWhenTheWeekWasFullAndALiftQualifies() {
    let up = [item("Squat", .addWeight(fromKg: 80, toKg: 82.5, reps: 5))]
    let reps = [item("Row", .addRep(weightKg: 40, from: 8, to: 9))]
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 3), daysOff: 2, targets: up) == .progress)
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 3), daysOff: 2, targets: reps) == .steady)
    #expect(KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 2), daysOff: 2, targets: up) == .steady)
  }

  @Test func cardShowsMondayToWednesdayOnceAndOnlyWithASchedule() {
    let mon = LocalDate("2026-11-02")!
    #expect(KoaWeekCoach.shows(today: mon, lastWeek: .init(planned: 3, done: 3), answered: false))
    #expect(KoaWeekCoach.shows(today: mon.adding(days: 2), lastWeek: .init(planned: 3, done: 3), answered: false))
    #expect(!KoaWeekCoach.shows(today: mon.adding(days: 3), lastWeek: .init(planned: 3, done: 3), answered: false))
    #expect(!KoaWeekCoach.shows(today: mon, lastWeek: .init(planned: 3, done: 3), answered: true))
    #expect(!KoaWeekCoach.shows(today: mon, lastWeek: .init(planned: 0, done: 0), answered: false))
  }

  @Test func targetsListWeightFirstThenReps() {
    let t = [
      item("Row", .addRep(weightKg: 40, from: 8, to: 9)), item("Plank", .hold(weightKg: nil, reps: nil)),
      item("Squat", .addWeight(fromKg: 80, toKg: 82.5, reps: 5)),
    ]
    #expect(KoaWeekCoach.shownTargets(t).map(\.name) == ["Squat", "Row"])
  }
}
