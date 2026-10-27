import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

// Kiệt 27/10: set kế của cùng bài mang tạ VÀ reps của set vừa xong — một chạm
// "Xong set" mỗi set (trước: "Như set trước" + "Xong set").

/// Mẫu không ghi tạ (như hầu hết mẫu người dùng tự tạo): ô tạ mở ở 0.
private func set(_ n: Int, of: Int = 3, name: String = "Incline Press", id: String? = "ex-incline", warmup: Bool = false) -> PlannedSet {
  PlannedSet(key: "\(name)-\(n)", exerciseId: id, exerciseName: name, ordinal: n, of: of, weightKg: 0, reps: 10, plannedRest: 90, warmup: warmup)
}

private let s1 = set(1), s2 = set(2), s3 = set(3)
private let other = set(1, of: 1, name: "Shoulder Press", id: "ex-shoulder")

struct SetCarryForwardTests {
  private func tick(_ row: PlannedSet, in rows: [PlannedSet], _ p: inout DayProgress) {
    WorkoutDay.toggle(row, &p)
    WorkoutDay.carryForward(from: row, in: rows, &p)
  }

  @Test func nextSetOfTheSameExerciseGetsWeightAndReps() {
    var p = DayProgress()
    p.weightText[s1.key] = "27.2"
    p.repsText[s1.key] = "8"
    tick(s1, in: [s1, s2, s3], &p)
    #expect(p.weightText[s2.key] == "27.2")
    #expect(p.repsText[s2.key] == "8")
    #expect(WorkoutDay.performed(s2, p) == PerformedSet(weightKg: 27.2, reps: 8, durationSec: nil))
    // Chỉ set KẾ — set 3 nhận khi set 2 xong (và mang số của set 2).
    #expect(p.weightText[s3.key] == nil)
    p.weightText[s2.key] = "30"
    tick(s2, in: [s1, s2, s3], &p)
    #expect(p.weightText[s3.key] == "30")
    #expect(p.repsText[s3.key] == "8")
  }

  /// Số người dùng đã gõ ở set kế không bị ghi đè — kể cả ô xoá trống.
  @Test func typedValuesOnTheNextSetWin() {
    var p = DayProgress()
    p.weightText[s1.key] = "40"
    p.repsText[s1.key] = "10"
    p.weightText[s2.key] = "45"
    p.repsText[s2.key] = ""
    tick(s1, in: [s1, s2], &p)
    #expect(p.weightText[s2.key] == "45")
    #expect(p.repsText[s2.key] == "")
  }

  /// Bài không tạ: ô tạ của set kế để trống (không thành "0").
  @Test func bodyweightLeavesWeightEmpty() {
    var p = DayProgress()
    p.weightText[s1.key] = ""
    p.repsText[s1.key] = "12"
    tick(s1, in: [s1, s2], &p)
    #expect(p.weightText[s2.key] == nil)
    #expect(p.repsText[s2.key] == "12")
    #expect(WorkoutDay.performed(s2, p).weightKg == 0)
  }

  /// Bài khác không nhận gì; set cuối của bài thì không có đích.
  @Test func otherExercisesAreUntouched() {
    var p = DayProgress()
    p.weightText[s2.key] = "50"
    tick(s2, in: [s1, s2, other], &p)
    #expect(p.weightText[other.key] == nil)
    #expect(p.repsText[other.key] == nil)
  }

  /// Tạ khởi động không sang set làm việc; set làm việc kế (đã bỏ qua khởi động) nhận.
  @Test func warmupDoesNotCarryIntoWorkingSets() {
    let w = set(1, of: 3, warmup: true)
    var p = DayProgress()
    p.weightText[w.key] = "20"
    tick(w, in: [w, s2, s3], &p)
    #expect(p.weightText[s2.key] == nil)
    p.weightText[s2.key] = "40"
    tick(s2, in: [w, s2, s3], &p)
    #expect(p.weightText[s3.key] == "40")
  }

  /// Đích là set chưa tích đầu tiên — set đã tích ở giữa bị bỏ qua.
  @Test func skipsSetsAlreadyDone() {
    var p = DayProgress()
    p.done[s2.key] = true
    p.weightText[s1.key] = "35"
    tick(s1, in: [s1, s2, s3], &p)
    #expect(p.weightText[s2.key] == nil)
    #expect(p.weightText[s3.key] == "35")
  }

  /// Chữ kế hoạch (người dùng không gõ) không được chép: set kế theo kế hoạch
  /// của chính nó (kim tự tháp 60 → 70 giữ nguyên).
  @Test func plannedValuesAreNotFlattened() {
    let a = PlannedSet(key: "a", exerciseName: "Squat", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90)
    let b = PlannedSet(key: "b", exerciseName: "Squat", ordinal: 2, of: 2, weightKg: 70, reps: 6, plannedRest: 90)
    var p = DayProgress()
    tick(a, in: [a, b], &p)
    #expect(WorkoutDay.performed(b, p) == PerformedSet(weightKg: 70, reps: 6, durationSec: nil))
  }

  /// Giữ (plank "45s") mang sang như reps.
  @Test func holdTimeCarries() {
    var p = DayProgress()
    p.repsText[s1.key] = "45s"
    tick(s1, in: [s1, s2], &p)
    #expect(WorkoutDay.performed(s2, p).durationSec == 45)
  }

  /// Bỏ tích không mang gì.
  @Test func untickDoesNotCarry() {
    var p = DayProgress()
    p.done[s1.key] = true
    p.weightText[s1.key] = "25"
    WorkoutDay.toggle(s1, &p)
    WorkoutDay.carryForward(from: s1, in: [s1, s2], &p)
    #expect(p.weightText[s2.key] == nil)
  }

  /// Số chạm mỗi set (đo 27/10). Trước: set 2, 3 mở ở 0 kg → "Như set trước"
  /// + "Xong set" = 2 chạm. Sau: số đã điền → chỉ "Xong set" = 1 chạm.
  @Test func oneTapPerSetAfterTheFirst() {
    var p = DayProgress()
    p.weightText[s1.key] = "27.2"
    var taps = 0
    for (i, row) in [s1, s2, s3].enumerated() {
      if i > 0 {
        // Ô tạ trống ở set sau = phải chạm "Như set trước" (như trước 27/10).
        if WorkoutDay.performed(row, p).weightKg == 0 { taps += 1 }
      }
      #expect(WorkoutDay.isReady(row, p))
      tick(row, in: [s1, s2, s3], &p)
      taps += 1
    }
    #expect(taps == 3, "1 chạm / set (sau set đầu đã gõ tạ)")
  }
}
