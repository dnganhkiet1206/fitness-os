@testable import ASCNDCore
import Testing

/// Gains — vóc dáng theo tập (#527 đợt 1, `koa-train-loop.html`).
struct KoaGainsTests {
  /// 2026-10-19 là thứ Hai (routineIndex 0).
  static let monday = LocalDate("2026-10-19")!
  static func d(_ offset: Int, pr: Bool = false) -> KoaGains.Day {
    KoaGains.Day(date: monday.adding(days: offset), personalRecord: pr)
  }
  /// Lịch: T2, T4, T6 tập; T7, CN nghỉ.
  static let plan = KoaGains.Week(planned: [0, 2, 4], rest: [5, 6])

  @Test func rankThresholdsMatchTheRankTable() {
    #expect(KoaGains.thresholds.count == MascotRules.ranks.count)
    #expect(KoaGains.rank(0) == 0 && KoaGains.rank(39) == 0 && KoaGains.rank(40) == 1)
    #expect(KoaGains.rank(700) == 5 && KoaGains.rank(5000) == 5)
    #expect(KoaGains.toNext(50)! == (10, 80))
    #expect(KoaGains.toNext(700) == nil)
  }

  @Test func plannedOffPlanPRAndFullWeek() {
    // T2 trong lịch (+10), T3 ngoài lịch có PR (+6 +4), T4 trong lịch đủ 3 buổi (+10 +15)
    let s = KoaGains.compute([Self.d(0), Self.d(1, pr: true), Self.d(2)], week: Self.plan, today: Self.monday.adding(days: 2))
    #expect(s.points == 10 + 10 + 25)
    #expect(s.rank == 1)
    #expect(s.missedDays == 0 && !s.pumpLost)
    // hai buổi một ngày chỉ tính một lần
    let twice = KoaGains.compute([Self.d(0), Self.d(0)], week: Self.plan, today: Self.monday)
    #expect(twice.points == 10)
  }

  @Test func noTrainingNoGains() {
    #expect(KoaGains.compute([], week: Self.plan, today: Self.monday) == .zero)
  }

  @Test func restDaysAreNotMissedDays() {
    // tập T6, rồi T7 + CN nghỉ đã đặt → thứ Hai vẫn 0 ngày lỡ
    let s = KoaGains.compute([Self.d(4)], week: Self.plan, today: Self.monday.adding(days: 7))
    #expect(s.missedDays == 1)  // chỉ chính thứ Hai
    let three = KoaGains.compute([Self.d(4)], week: Self.plan, today: Self.monday.adding(days: 9))
    #expect(three.missedDays == 3 && three.pumpLost)
  }

  @Test func layoffDropsAtMostOneRank() {
    // lên Lifter (≥120) rồi nghỉ rất lâu, không lịch nghỉ nào
    let week = KoaGains.Week(planned: [0, 1, 2, 3, 4, 5, 6], rest: [])
    let days = (0..<12).map { Self.d($0) }  // 12 ngày liền: 120 + tuần đủ
    let built = KoaGains.compute(days, week: week, today: Self.monday.adding(days: 11))
    #expect(built.rank == 2)
    let peak = built.points
    // 7 ngày nghỉ → −8
    let week1 = KoaGains.compute(days, week: week, today: Self.monday.adding(days: 18))
    #expect(week1.points == peak - 8)
    // 10 tuần nghỉ → không xuống dưới mốc Gym Rat (40)
    let long = KoaGains.compute(days, week: week, today: Self.monday.adding(days: 11 + 70))
    #expect(long.points == max(40, peak - 80))
    #expect(long.rank >= 1)
    #expect(long.peak == peak && long.rebuilding)
  }

  @Test func muscleMemoryDoublesBackToThePeak() {
    #expect(KoaGains.add(10, to: 100, peak: 130) == 120)
    #expect(KoaGains.add(10, to: 125, peak: 130) == 130 + 7)  // 3 gốc ×2 = 5 tới đỉnh… phần còn lại thường
    #expect(KoaGains.add(10, to: 130, peak: 130) == 140)
  }

  @Test func previewShowsTodaysGain() {
    let (before, after) = KoaGains.preview([Self.d(0)], week: Self.plan, today: Self.monday.adding(days: 2), personalRecord: true)
    #expect(after.points - before.points == 10 + 4)
  }

  @Test func weekFromTemplates() {
    let tpl = WorkoutTemplate(id: "a", name: "A", exercises: [])
    let snap = TemplateSnapshot(
      routine: [
        RoutineDay(dayOfWeek: 0, isRest: false, templateId: "a"), RoutineDay(dayOfWeek: 1, isRest: true, templateId: nil),
        RoutineDay(dayOfWeek: 2, isRest: false, templateId: "gone"),
      ], templates: [tpl], fetchedAt: EpochMillis(1))
    let w = KoaGains.Week(snap)
    #expect(w.planned == [0] && w.rest == [1] && w.target == 1)
    #expect(KoaGains.Week.none.target == KoaGains.defaultWeeklyTarget)
  }
}
