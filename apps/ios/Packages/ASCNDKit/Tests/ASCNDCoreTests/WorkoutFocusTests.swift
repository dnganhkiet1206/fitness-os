@testable import ASCNDCore
import Testing

/// Màn tập "từng set một" (thiết kế lại 14/10).
struct WorkoutFocusTests {
  let rows = [
    PlannedSet(key: "c1", exerciseId: "curl", exerciseName: "Curl", ordinal: 1, of: 2, weightKg: 15, reps: 10, plannedRest: 90),
    PlannedSet(key: "c2", exerciseId: "curl", exerciseName: "Curl", ordinal: 2, of: 2, weightKg: 15, reps: 10, plannedRest: 90),
    PlannedSet(key: "p1", exerciseName: "Plank", ordinal: 1, of: 1, weightKg: 0, reps: 0, plannedRest: 60),
  ]

  @Test func nextIsFirstOpenSetUnlessAnExerciseIsPinned() {
    var p = DayProgress()
    #expect(WorkoutFocus.next(rows, p)?.key == "c1")
    p.done["c1"] = true
    #expect(WorkoutFocus.next(rows, p)?.key == "c2")
    #expect(WorkoutFocus.next(rows, p, pinned: "Plank")?.key == "p1")
    p.done["c2"] = true
    // Bài đã xong hết thì về set mở đầu tiên của buổi.
    #expect(WorkoutFocus.next(rows, p, pinned: "curl")?.key == "p1")
    p.done["p1"] = true
    #expect(WorkoutFocus.next(rows, p) == nil)
  }

  @Test func lastDoneIsTheSetJustBeforeNext() {
    var p = DayProgress()
    #expect(WorkoutFocus.lastDone(rows, p, before: rows[0]) == nil)
    p.done["c1"] = true
    #expect(WorkoutFocus.lastDone(rows, p, before: rows[1])?.key == "c1")
    p.done["c2"] = true
    p.done["p1"] = true
    #expect(WorkoutFocus.lastDone(rows, p, before: nil)?.key == "p1")
  }

  @Test func exercisesGroupByIdThenNameAndCountDone() {
    var p = DayProgress()
    p.done["c2"] = true
    let ex = WorkoutFocus.exercises(rows, p)
    #expect(ex.map(\.key) == ["curl", "Plank"])
    #expect(ex[0].done == 1 && ex[0].total == 2 && !ex[0].isComplete)
  }

  @Test func adHocExercisesNeverMergeEvenUnnamed() {
    let extra = WorkoutPlanning.adHocRows([AdHocExercise(id: "a"), AdHocExercise(id: "b", name: "Curl", sets: 2)])
    let ex = WorkoutFocus.exercises(rows + extra, DayProgress())
    #expect(ex.map(\.key) == ["curl", "Plank", "x:a", "x:b"])
    #expect(ex[3].total == 2)
  }

  @Test func weightStepsByPlateAndNeverGoesNegative() {
    #expect(WorkoutFocus.stepWeight("15", by: 1, unit: .kg) == "17.5")
    #expect(WorkoutFocus.stepWeight("17.5", by: -1, unit: .kg) == "15")
    #expect(WorkoutFocus.stepWeight("", by: 1, unit: .kg) == "2.5")
    #expect(WorkoutFocus.stepWeight("2.5", by: -1, unit: .kg) == "")
    #expect(WorkoutFocus.stepWeight("", by: -1, unit: .kg) == "")
    #expect(WorkoutFocus.stepWeight("71,5", by: 1, unit: .kg) == "74")
    #expect(WorkoutFocus.stepWeight("100", by: 1, unit: .lbs) == "105")
  }

  @Test func emptyWeightTakesLastTimeFirst() {
    #expect(WorkoutFocus.stepWeight("", by: 1, unit: .kg, hint: "15") == "15")
    #expect(WorkoutFocus.stepWeight("", by: -1, unit: .kg, hint: "15") == "15")
    #expect(WorkoutFocus.stepWeight("15", by: 1, unit: .kg, hint: "15") == "17.5")
  }

  @Test func repsStepByOneAndHoldsByFiveSeconds() {
    #expect(WorkoutFocus.stepReps("10", by: 1) == "11")
    #expect(WorkoutFocus.stepReps("1", by: -1) == "1")
    #expect(WorkoutFocus.stepReps("", by: 1) == "1")
    #expect(WorkoutFocus.stepReps("45s", by: 1) == "50s")
    #expect(WorkoutFocus.stepReps("5s", by: -1) == "5s")
  }

  @Test func previewLinesUseOverridesOfTheFirstSet() {
    var p = DayProgress()
    p.rest["c1"] = 120
    p.repsText["p1"] = "45s"
    let lines = WorkoutFocus.preview(rows, p)
    #expect(lines.count == 2)
    #expect(lines[0].sets == 2 && lines[0].reps == "10" && lines[0].weightKg == 15 && lines[0].restSeconds == 120)
    #expect(lines[1].reps == "45s" && lines[1].weightKg == nil)
    #expect(WorkoutFocus.minutes(rows, p) > 0)
  }
}
