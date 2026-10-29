@testable import ASCNDCore
import Foundation
import Testing

/// Bảng số trên tường phòng Koa (29/10): ba lựa chọn, chữ theo ngôn ngữ.
struct RoomBoardTests {
  static func perf(_ at: Int64, records: [PersonalRecord]) -> ExercisePerformance {
    ExercisePerformance(
      exerciseKey: "bench", exerciseName: "Bench", sessionId: "s\(at)", at: EpochMillis(at),
      date: LocalDate("2026-10-27")!, kind: .compound, setCount: 3, totalReps: 24, totalVolumeKg: 0,
      bestWeightKg: 60, bestReps: 8, bestE1rmKg: nil, bestDurationSec: nil, records: records, bodyweightKg: nil,
      topSetReps: 8)
  }

  @Test func rankShowsOneBasedRankAndAPipPerRank() {
    let b = RoomBoard.rank(1, of: 6, lang: "vi")
    #expect(b == .init(word: "HẠNG", value: "2", icon: .dumbbell, dots: 6, lit: 2))
    #expect(RoomBoard.rank(9, of: 6, lang: "en").value == "6")
  }

  @Test func weekCountsSessionsAgainstThePlan() {
    #expect(
      RoomBoard.week(done: 2, target: 4, lang: "es")
        == .init(word: "ESTA SEMANA", value: "2", icon: .check, dots: 4, lit: 2))
    #expect(RoomBoard.week(done: 9, target: 9, lang: "en").dots == 7)
  }

  @Test func recordIsTheNewestSessionsBestRecord() {
    let older = PersonalRecord(exercise: "Bench", kind: .weight, value: 100, previous: 95, atWeight: nil)
    let newer = PersonalRecord(exercise: "Squat", kind: .reps, value: 9, previous: 8, atWeight: 80)
    let perfs = [Self.perf(1, records: [older]), Self.perf(3, records: [newer]), Self.perf(5, records: [])]
    #expect(RoomBoard.latestRecord(perfs) == newer)
    #expect(RoomBoard.record(newer, unit: .kg, lang: "vi").word == "KỶ LỤC · REP")
    let kg = RoomBoard.record(older, unit: .kg, lang: "vi")
    #expect(kg.word == "KỶ LỤC · KG" && kg.value == "100" && kg.dots == 0)
    #expect(RoomBoard.record(older, unit: .lbs, lang: "en").word == "BEST · LB")
    #expect(RoomBoard.record(nil, unit: .kg, lang: "en").value == "–")
  }

  @Test func tappingCyclesThroughTheThreeStats() {
    #expect(RoomBoard.Stat.rank.next == .week && RoomBoard.Stat.week.next == .record && RoomBoard.Stat.record.next == .rank)
  }
}
