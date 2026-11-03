import Testing

@testable import ASCNDCore

/// Kỷ lục ngay lúc tick set (Koa trong buổi tập).
@Suite struct NewRecordTests {
  @Test func judgesOnlyTheSetJustDone() {
    let bests = PersonalRecords.bests(from: [RecordSet(exerciseName: "Squat", weightKg: 100, reps: 5)])
    let heavy = RecordSet(exerciseName: "Squat", weightKg: 105, reps: 5)
    #expect(PersonalRecords.newRecord(heavy, earlier: [], bests: bests)?.kind == .weight)
    // cùng buổi đã nâng 105 kg: set 105 kg sau không phải kỷ lục nữa
    #expect(PersonalRecords.newRecord(heavy, earlier: [heavy], bests: bests) == nil)
    // nhiều reps hơn chính set trước của buổi thì vẫn là kỷ lục
    let more = RecordSet(exerciseName: "Squat", weightKg: 105, reps: 6)
    #expect(PersonalRecords.newRecord(more, earlier: [heavy], bests: bests)?.kind == .reps)
    #expect(PersonalRecords.newRecord(RecordSet(exerciseName: "Squat", weightKg: 90, reps: 5), earlier: [], bests: bests) == nil)
  }

  @Test func firstEverExerciseIsNotARecord() {
    #expect(PersonalRecords.newRecord(RecordSet(exerciseName: "Row", weightKg: 50, reps: 8), earlier: [], bests: [:]) == nil)
  }
}
