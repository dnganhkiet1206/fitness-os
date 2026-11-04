@testable import ASCNDCore
import Foundation
import Testing

/// `lib/session-load.ts`: tải nội sinh RPE × tổng rep. Trước 04/11 chỉ được kiểm gián tiếp qua golden
/// `daily_logs` (ACWR); đây là test trực tiếp cho từng luật.
@Suite struct SessionLoadTests {
  @Test func totalRepsCountsOnlyFinitePositiveReps() {
    let sets: JSONValue = .array([
      .object(["reps": .number(8)]), .object(["reps": .string("10")]), .object(["reps": .string("45s")]),
      .object(["reps": .number(0)]), .object(["reps": .number(-3)]), .object(["reps": .null]), .object([:]),
    ])
    #expect(SessionLoad.totalReps(sets) == 18)
    #expect(SessionLoad.totalReps(nil) == 0)
    #expect(SessionLoad.totalReps(.string("x")) == 0)
  }

  @Test func loadIsRpeTimesRepsOnlyWhenMeasurable() {
    let sets: JSONValue = .array([.object(["reps": .number(10)]), .object(["reps": .number(8)])])
    #expect(SessionLoad.load(rpe: .number(7), sets: sets) == 126)
    #expect(SessionLoad.load(rpe: .string("7"), sets: sets) == 126)
    #expect(SessionLoad.load(rpe: .number(1), sets: sets) == 18)
    #expect(SessionLoad.load(rpe: .number(10), sets: sets) == 180)
    #expect(SessionLoad.load(rpe: .number(0.5), sets: sets) == nil)
    #expect(SessionLoad.load(rpe: .number(11), sets: sets) == nil)
    #expect(SessionLoad.load(rpe: nil, sets: sets) == nil)
    // bài nhập từ đồng hồ: `sets` rỗng → không đo được, không phải tải 0
    #expect(SessionLoad.load(rpe: .number(7), sets: .array([])) == nil)
  }

  @Test func windowSkipsUnmeasuredSessions() {
    let lifted: JSONValue = .object(["session_rpe": .number(6), "sets": .array([.object(["reps": .number(10)])])])
    let watch: JSONValue = .object(["session_rpe": .number(8), "sets": .array([])])
    let noRpe: JSONValue = .object(["sets": .array([.object(["reps": .number(12)])])])
    #expect(SessionLoad.load(watch) == nil)
    #expect(SessionLoad.load(noRpe) == nil)
    #expect(SessionLoad.window([lifted, watch, noRpe]) == 60)
    #expect(SessionLoad.window([]) == 0)
  }
}
