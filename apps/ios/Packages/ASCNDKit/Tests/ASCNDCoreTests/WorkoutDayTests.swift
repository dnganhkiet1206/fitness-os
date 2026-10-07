import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private let bench = PlannedSet(key: "bench-1", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90)
private let bench2 = PlannedSet(key: "bench-2", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90)
private let row1 = PlannedSet(key: "row-1", exerciseName: "Row", ordinal: 1, of: 1, weightKg: 50, reps: 10, plannedRest: 0)
private let day = [bench, bench2, row1]

struct WorkoutDayTests {
  @Test func tickStartsRestUntickCancels() {
    var p = DayProgress()
    #expect(WorkoutDay.toggle(bench, &p) == .start(seconds: 90))
    #expect(p.done["bench-1"] == true)
    // RT-2: bỏ tick không sinh nghỉ — và huỷ quãng nghỉ đang chạy.
    #expect(WorkoutDay.toggle(bench, &p) == .cancel)
    #expect(p.done["bench-1"] == false)
  }

  /// RT-3: hàng nghỉ 0 → không mở thẻ nghỉ (và quãng nghỉ cũ, nếu có, dừng).
  @Test func zeroRestRowDoesNotStartRest() {
    var p = DayProgress()
    #expect(WorkoutDay.toggle(row1, &p) == .cancel)
  }

  @Test func restOverrideWinsAndIsClamped() {
    var p = DayProgress()
    WorkoutDay.setRest(700, for: bench, &p)
    #expect(WorkoutDay.restSeconds(bench, p) == 600)
    WorkoutDay.setRest(-5, for: bench, &p)
    #expect(WorkoutDay.toggle(bench, &p) == .cancel)
  }

  /// RT-12: kế tiếp là hàng NGAY SAU, kể cả khi nó là bài khác; hết danh sách thì không có.
  @Test func nextIsTheFollowingRow() {
    #expect(WorkoutDay.next(after: bench, in: day) == bench2)
    #expect(WorkoutDay.next(after: bench2, in: day) == row1)
    #expect(WorkoutDay.next(after: row1, in: day) == nil)
  }

  @Test func performedFallsBackToPlan() {
    let s = WorkoutDay.performed(bench, DayProgress())
    #expect(s == PerformedSet(weightKg: 60, reps: 8, durationSec: nil))
  }

  @Test func typedValuesWinAndHoldIsRecorded() {
    var p = DayProgress()
    p.weightText["bench-1"] = "62.5"
    p.repsText["bench-1"] = "45s"
    #expect(WorkoutDay.performed(bench, p) == PerformedSet(weightKg: 62.5, reps: 0, durationSec: 45))
  }

  /// Ô tạ bị xoá trống / gõ rác → bodyweight (0), KHÔNG quay về tạ kế hoạch
  /// (`Number("")` = 0 ở baseline). WS-3: set vẫn được ghi.
  @Test(arguments: ["", "  ", "abc", "-5", "0"])
  func clearedOrJunkWeightIsBodyweight(text: String) {
    var p = DayProgress()
    p.weightText["bench-1"] = text
    #expect(WorkoutDay.performed(bench, p).weightKg == 0, "\"\(text)\"")
  }

  @Test func unitConversionAppliesOnlyToTypedWeight() {
    var p = DayProgress()
    p.weightText["bench-1"] = "135"
    let lbToKg = { (lb: Double) in lb * 0.45359237 }
    #expect(abs(WorkoutDay.performed(bench, p, toKg: lbToKg).weightKg - 61.23497) < 1e-4)
    #expect(WorkoutDay.performed(bench2, p, toKg: lbToKg).weightKg == 60)
  }

  @Test func unreadableRepsFallBackToPlan() {
    var p = DayProgress()
    p.repsText["bench-1"] = "abc"
    #expect(WorkoutDay.performed(bench, p).reps == 8)
  }

  @Test func readiness() {
    let unnamed = PlannedSet(key: "x", exerciseName: "  ", ordinal: 1, of: 1, weightKg: 0, reps: 8, plannedRest: 0)
    let noReps = PlannedSet(key: "y", exerciseName: "Plank", ordinal: 1, of: 1, weightKg: 0, reps: 0, plannedRest: 0)
    #expect(WorkoutDay.isReady(bench, DayProgress()))
    #expect(!WorkoutDay.isReady(unnamed, DayProgress()))
    #expect(!WorkoutDay.isReady(noReps, DayProgress()))
    var p = DayProgress()
    p.repsText["y"] = "45s"
    #expect(WorkoutDay.isReady(noReps, p))
  }

  /// Điểm quay lại sống qua tắt app; blob cũ thiếu trường thì trường ấy rỗng.
  @Test func progressRoundTripsAndToleratesOldBlobs() throws {
    var p = DayProgress()
    WorkoutDay.toggle(bench, &p)
    p.repsText["bench-1"] = "10"
    let back = try JSONDecoder().decode(DayProgress.self, from: JSONEncoder().encode(p))
    #expect(back == p)
    let old = try JSONDecoder().decode(DayProgress.self, from: Data(#"{"done":{"bench-1":true}}"#.utf8))
    #expect(old.done == ["bench-1": true])
    #expect(old.weightText.isEmpty && old.repsText.isEmpty)
  }

  /// Tick bật trên một hàng + vòng nghỉ: chuỗi đầy đủ qua `RestTimer.reduce`.
  @Test func tickFeedsRestTimer() {
    var p = DayProgress()
    var rest: RestTimer?
    rest = RestTimer.reduce(rest, WorkoutDay.toggle(bench, &p), at: EpochMillis(0))
    #expect(rest?.remaining(at: EpochMillis(0)) == 90)
    rest = RestTimer.reduce(rest, WorkoutDay.toggle(bench, &p), at: EpochMillis(5000))
    #expect(rest == nil)
  }
}

struct DayProgressStoreTests {
  @Test func keyShape() throws {
    #expect(DayProgressStore.key(date: try #require(LocalDate("2026-10-05")), templateId: "t1") == "routine-day:2026-10-05:t1")
  }

  /// Giữ hôm nay + 13 ngày trước; ngày thứ 14 trở về trước là cũ (`<=`).
  @Test func keepsExactlyFourteenDays() throws {
    let today = try #require(LocalDate("2026-10-05"))
    let keys = (0...15).map { DayProgressStore.key(date: today.adding(days: -$0), templateId: "t") }
    let stale = Set(DayProgressStore.stale(keys, today: today))
    for (i, k) in keys.enumerated() {
      #expect(stale.contains(k) == (i >= 14), "\(i) ngày trước")
    }
  }

  @Test func unparseableDatesAreDroppedOtherKeysUntouched() throws {
    let today = try #require(LocalDate("2026-10-05"))
    let keys = ["routine-day:05/10/2026:t", "routine-day:2026-02-30:t", "routine-day::t", "other:2020-01-01", "ascnd_rq_cache"]
    #expect(DayProgressStore.stale(keys, today: today) == Array(keys.prefix(3)))
  }

  /// Qua tháng, qua năm, năm nhuận — số học lịch, không qua múi giờ.
  @Test func crossesMonthAndYearBoundaries() throws {
    let today = try #require(LocalDate("2026-01-10"))
    let keys = ["routine-day:2025-12-27:t", "routine-day:2025-12-28:t"]
    #expect(DayProgressStore.stale(keys, today: today) == ["routine-day:2025-12-27:t"])
  }
}

struct LocalDateTests {
  @Test(arguments: ["2026-10-05", "2024-02-29", "2000-02-29", "1999-12-31", "2026-01-01"])
  func roundTrips(text: String) throws {
    #expect(try #require(LocalDate(text)).description == text)
  }

  @Test(arguments: ["2026-02-29", "1900-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-10-05", "2026-1-5", "2026-10-05T00:00", "abcd-ef-gh", ""])
  func rejects(text: String) {
    #expect(LocalDate(text) == nil, "\(text)")
  }

  /// Days-from-civil khớp với lịch Gregory thật, trên 200 năm từng ngày.
  @Test func arithmeticMatchesCalendarEveryDay() throws {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = try #require(TimeZone(identifier: "UTC"))
    var date = try #require(cal.date(from: DateComponents(year: 1900, month: 1, day: 1)))
    var local = try #require(LocalDate("1900-01-01"))
    for _ in 0..<(365 * 200) {
      let c = cal.dateComponents([.year, .month, .day], from: date)
      #expect(local.year == c.year && local.month == c.month && local.day == c.day)
      if local.year != c.year || local.month != c.month || local.day != c.day { return }
      date = try #require(cal.date(byAdding: .day, value: 1, to: date))
      local = local.adding(days: 1)
    }
  }

  @Test func epochAnchor() throws {
    #expect(try #require(LocalDate("1970-01-01")).daysSinceEpoch == 0)
    #expect(LocalDate(daysSinceEpoch: -1).description == "1969-12-31")
  }
}
