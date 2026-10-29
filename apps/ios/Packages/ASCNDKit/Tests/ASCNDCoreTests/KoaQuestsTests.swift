@testable import ASCNDCore
import Foundation
import Testing

/// Nhiệm vụ Koa phần 4 (Kiệt duyệt 29/10): tăng tải theo gợi ý, khám phá app.
struct KoaQuestsTests {
  static func perf(
    _ key: String, _ date: String, at: Int64, kind: ExerciseKind = .compound, weight: Double?, reps: Int?
  ) -> ExercisePerformance {
    ExercisePerformance(
      exerciseKey: key, exerciseName: key, sessionId: "s\(at)", at: EpochMillis(at), date: LocalDate(date)!, kind: kind,
      setCount: 3, totalReps: 24, totalVolumeKg: 0, bestWeightKg: weight, bestReps: reps, bestE1rmKg: nil,
      bestDurationSec: nil, records: [], bodyweightKg: nil, topSetReps: reps)
  }

  static let today = LocalDate("2026-10-29")!

  @Test func heavierOrMoreRepsThanLastTimeCounts() {
    let last = Self.perf("bench", "2026-10-27", at: 1, weight: 60, reps: 8)
    #expect(OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 62.5, reps: 8)]))
    #expect(OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 60, reps: 9)]))
    // nặng hơn mà tụt quá 2 rep ở set đỉnh thì không tính
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 65, reps: 5)]))
    // y như lần trước, hay nhẹ hơn
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 60, reps: 8)]))
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 55, reps: 12)]))
  }

  @Test func needsAPreviousSessionOfTheSameLift() {
    let first = Self.perf("squat", "2026-10-29", at: 2, weight: 100, reps: 5)
    #expect(!OverloadQuest.achieved(on: Self.today, [first]))
    let other = Self.perf("bench", "2026-10-27", at: 1, weight: 40, reps: 5)
    #expect(!OverloadQuest.achieved(on: Self.today, [other, first]))
  }

  @Test func bodyweightCountsRepsAndTimedNeverCounts() {
    let dips = [
      Self.perf("dips", "2026-10-27", at: 1, kind: .bodyweight, weight: nil, reps: 10),
      Self.perf("dips", "2026-10-29", at: 2, kind: .bodyweight, weight: nil, reps: 11),
    ]
    #expect(OverloadQuest.achieved(on: Self.today, dips))
    let plank = [
      Self.perf("plank", "2026-10-27", at: 1, kind: .timed, weight: nil, reps: 1),
      Self.perf("plank", "2026-10-29", at: 2, kind: .timed, weight: nil, reps: 2),
    ]
    #expect(!OverloadQuest.achieved(on: Self.today, plank))
  }

  @Test func keysRoundTrip() {
    #expect(OverloadQuest.refKey(Self.today) == "d:2026-10-29:overload")
    #expect(OverloadQuest.day(of: "d:2026-10-29:overload") == Self.today)
    #expect(OverloadQuest.day(of: "d:2026-10-29:meal") == nil)
    #expect(ExploreQuest.photo.refKey == "x:photo")
    // khớp migration koa_quests_v2 (Q1 của supabase/tests/core/rpc_koa_quests.test.sql)
    #expect(ExploreQuest.allCases.map(\.coins).reduce(0, +) == 195)
  }

  @Test func overloadDayAddsThreeGains() {
    let week = KoaGains.Week(planned: [2], rest: [])
    let plain = KoaGains.compute([.init(date: Self.today, personalRecord: false)], week: week, today: Self.today)
    let marked = KoaGainsSync.mark([.init(date: Self.today, personalRecord: false)], overload: [Self.today])
    let up = KoaGains.compute(marked, week: week, today: Self.today)
    #expect(up.points - plain.points == KoaGains.overload)
    // ngày không tập thì cờ tăng tải không cho gì
    let noSession = KoaGainsSync.mark([], overload: [Self.today])
    #expect(KoaGains.compute(noSession, week: week, today: Self.today).points == 0)
  }

  @Test func overloadDaysComeFromTheCoinLedger() {
    let rows: [JSONValue] = [
      .object(["ref_key": .string("d:2026-10-27:overload")]), .object(["ref_key": .string("d:2026-10-27:meal")]),
      .object(["ref_key": .string("x:photo")]),
    ]
    #expect(KoaGainsSync.overloadDays(rows) == [LocalDate("2026-10-27")!])
    let q = KoaGainsSync.overloadQuery(userId: "u")
    #expect(q.table == "mascot_transactions" && q.filters.contains(.or("ref_key.like.\"*:overload\"")))
  }
}
