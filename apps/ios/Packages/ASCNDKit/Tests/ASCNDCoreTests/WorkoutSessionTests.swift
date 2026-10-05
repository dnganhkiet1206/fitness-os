import ASCNDCore
import Foundation
import Testing

private let bench1 = PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7)
private let bench2 = PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7)
private let plank = PlannedSet(key: "p1", exerciseName: "Plank", ordinal: 1, of: 1, weightKg: 0, reps: 0, plannedRest: 0, plannedRpe: 6)

private func record(_ sets: [SessionSet], template: String = "Push A") -> WorkoutSessionRecord? {
  WorkoutSessionRecord(id: "sess-1", userId: "u1", dateTime: EpochMillis(0), templateId: "t1", templateName: template, sets: sets)
}

struct WorkoutSessionTests {
  /// Chỉ hàng đã tick, đúng thứ tự; RPE ghi đè thắng RPE kế hoạch.
  @Test func sessionSetsAreTheTickedRowsInOrder() {
    var p = DayProgress()
    p.done = ["b2": true, "p1": true, "b1": false]
    p.rpe["b2"] = 9
    p.repsText["p1"] = "45s"
    let sets = WorkoutDay.sessionSets([bench1, bench2, plank], p)
    #expect(sets.map(\.exerciseName) == ["Bench Press", "Plank"])
    #expect(sets[0].rpe == 9)
    #expect(sets[1].rpe == 6)
    #expect(sets[1].durationSec == 45)
    #expect(sets[0].exerciseId == "ex-bench")
    #expect(sets[1].exerciseId == "", "không biết bài là chuỗi rỗng, như baseline")
  }

  @Test func noSetsNoSession() {
    #expect(record([]) == nil)
  }

  /// RPE buổi = set nặng nhất ("remembered by its hardest part").
  @Test func sessionRpeIsTheHardestSet() throws {
    let r = try #require(record([
      SessionSet(exerciseId: "a", exerciseName: "A", weightKg: 50, reps: 5, rpe: 7),
      SessionSet(exerciseId: "a", exerciseName: "A", weightKg: 50, reps: 5, rpe: 9),
    ]))
    #expect(r.sessionRpe == 9)
  }

  /// Hình dạng hàng `workout_sessions` — đúng các luật làm sạch của baseline.
  @Test func rowShapeMatchesBaseline() throws {
    let r = try #require(record([
      SessionSet(exerciseId: "x", exerciseName: "  Bench  ", weightKg: 82.50000000000001, reps: 5, rpe: 8),
      SessionSet(exerciseId: "x", exerciseName: "   ", weightKg: 40, reps: 10, rpe: 0, warmup: true),
      SessionSet(exerciseId: "", exerciseName: "Plank", weightKg: 0, reps: 0, rpe: 11, durationSec: 45),
    ], template: "   "))
    let row = r.row
    #expect(row["template_name"] == .string("Workout"))
    #expect(row["template_id"] == .string("t1"))
    #expect(row["id"] == .string("sess-1"))
    #expect(row["pr_detected"] == .bool(false))
    #expect(row["session_rpe"] == .number(11))
    guard case .array(let sets)? = row["sets"] else {
      Issue.record("sets không phải mảng")
      return
    }
    #expect(sets[0]["exerciseName"] == .string("Bench"))
    #expect(sets[0]["setIndex"] == .number(1))
    #expect(sets[0]["weight"] == .number(82.5))
    #expect(sets[0]["rpe"] == .number(8))
    #expect(sets[0]["warmup"] == nil, "warmup chỉ có mặt khi true")
    #expect(sets[1]["exerciseName"] == .string("Exercise"))
    #expect(sets[1]["warmup"] == .bool(true))
    #expect(sets[1]["rpe"] == .null, "RPE ngoài 1…10 ghi null")
    #expect(sets[2]["rpe"] == .null)
    #expect(sets[2]["durationSec"] == .number(45))
    #expect(sets[0]["durationSec"] == nil)
  }

  /// Volume bỏ set khởi động, làm tròn như `Math.round`.
  @Test func volumeExcludesWarmupsAndRounds() throws {
    let r = try #require(record([
      SessionSet(exerciseId: "", exerciseName: "A", weightKg: 62.5, reps: 3, rpe: 7),
      SessionSet(exerciseId: "", exerciseName: "A", weightKg: 0.25, reps: 2, rpe: 7),
      SessionSet(exerciseId: "", exerciseName: "A", weightKg: 100, reps: 10, rpe: 5, warmup: true),
    ]))
    #expect(r.volumeLoad == 188)  // 187.5 + 0.5 = 188.0 → Math.round(188.0) = 188
    #expect(r.row["volume_load"] == .number(188))
  }

  @Test func iso8601MatchesToISOString() {
    #expect(WorkoutSessionRecord.iso8601(EpochMillis(0)) == "1970-01-01T00:00:00.000Z")
    #expect(WorkoutSessionRecord.iso8601(EpochMillis(1_791_183_600_123)) == "2026-10-05T07:00:00.123Z")
    #expect(WorkoutSessionRecord.iso8601(EpochMillis(-1)) == "1969-12-31T23:59:59.999Z")
  }

  /// Hôm nay → đúng lúc này; ngày khác → 12:00 trưa giờ địa phương của ngày ấy.
  @Test func stampTodayIsNowOtherDayIsLocalNoon() throws {
    let vn = try #require(TimeZone(identifier: "Asia/Ho_Chi_Minh"))
    let today = try #require(LocalDate("2026-10-05"))
    let now = EpochMillis(1_791_183_600_000)
    #expect(WorkoutSessionRecord.stamp(for: today, today: today, now: now, timeZone: vn) == now)
    let yesterday = try #require(LocalDate("2026-10-04"))
    let stamped = WorkoutSessionRecord.stamp(for: yesterday, today: today, now: now, timeZone: vn)
    #expect(WorkoutSessionRecord.iso8601(stamped) == "2026-10-04T05:00:00.000Z")
  }

  /// Ngày đổi giờ ở Lord Howe (04/10/2026, +10:30 → +11:00 lúc 2 giờ sáng):
  /// 12:00 trưa vẫn nằm trọn trong ngày ấy.
  @Test func noonSurvivesDSTDay() throws {
    let lh = try #require(TimeZone(identifier: "Australia/Lord_Howe"))
    let day = try #require(LocalDate("2026-10-04"))
    let today = try #require(LocalDate("2026-10-06"))
    let stamped = WorkoutSessionRecord.stamp(for: day, today: today, now: EpochMillis(0), timeZone: lh)
    #expect(WorkoutSessionRecord.iso8601(stamped) == "2026-10-04T01:00:00.000Z")
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = lh
    let c = cal.dateComponents([.year, .month, .day, .hour], from: stamped.date)
    #expect(c.year == 2026 && c.month == 10 && c.day == 4 && c.hour == 12)
  }
}
