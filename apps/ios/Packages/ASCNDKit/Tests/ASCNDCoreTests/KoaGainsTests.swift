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
    #expect(KoaGains.rank(2300) == 5 && KoaGains.rank(9000) == 5)
    #expect(KoaGains.toNext(50)! == (10, 140))
    #expect(KoaGains.toNext(2300) == nil)
  }

  /// Nhanh lúc đầu, chậm dần (Kiệt 24/10): tập đủ lịch 3 buổi / tuần, không kỷ lục,
  /// tuần thứ mấy thì lên từng hạng.
  @Test func ranksFollowRealTrainingTime() {
    var days: [KoaGains.Day] = []
    var reached: [Int: Int] = [:]
    let monday = LocalDate("2026-01-05")!
    for week in 0..<60 {
      for dow in [0, 2, 4] { days.append(.init(date: monday.adding(days: week * 7 + dow), personalRecord: false)) }
      let r = KoaGains.compute(days, week: Self.plan, today: monday.adding(days: week * 7 + 6)).rank
      if reached[r] == nil { reached[r] = week + 1 }
    }
    // 29/10: hai ngày nghỉ có kế hoạch +3 mỗi tuần (45 → 51) — trước: 12 / 26 / 52 tuần.
    #expect(KoaGains.weeklyReference == 51)
    #expect(reached[1] == 1)
    #expect(reached[2] == 4)
    #expect(reached[3] == 11)
    #expect(reached[4] == 23)
    #expect(reached[5] == 46)
  }

  @Test func plannedOffPlanPRAndFullWeek() {
    // T2 trong lịch (+10), T3 ngoài lịch có PR (+6 +4), T4 trong lịch đủ 3 buổi (+10 +15)
    let s = KoaGains.compute([Self.d(0), Self.d(1, pr: true), Self.d(2)], week: Self.plan, today: Self.monday.adding(days: 2))
    #expect(s.points == 10 + 10 + 25)
    #expect(s.rank == 1)
    #expect(s.missedDays == 0 && !s.returning)
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
    #expect(three.missedDays == 3 && three.returning)
  }

  /// Kiệt 21/10 (duyệt GĐ1): nghỉ bao lâu cũng không mất Gains đã kiếm.
  @Test func timeOffNeverTakesGainsAway() {
    let week = KoaGains.Week(planned: [0, 1, 2, 3, 4, 5, 6], rest: [])
    let days = (0..<12).map { Self.d($0) }
    let built = KoaGains.compute(days, week: week, today: Self.monday.adding(days: 11))
    #expect(built.rank == 1)
    let long = KoaGains.compute(days, week: week, today: Self.monday.adding(days: 11 + 70))
    #expect(long.points == built.points && long.peak == built.peak && !long.rebuilding)
    #expect(long.missedDays == 70 && long.returning)
  }

  /// Đổi lịch theo ngày (GĐ1): ngày đổi thành nghỉ không tính là lỡ; buổi dời
  /// sang ngày trống được tính là buổi TRONG lịch (+10, không phải +6).
  @Test func dayOverridesCountForPlannedAndRest() {
    let monday = Self.monday
    let moved = KoaGains.Week(
      planned: [0, 2, 4], rest: [5, 6],
      overrides: [
        monday: DayOverride(date: monday, templateId: nil, isRest: true, movedTo: monday.adding(days: 1)),
        monday.adding(days: 1): DayOverride(date: monday.adding(days: 1), templateId: "a", isRest: false, movedFrom: monday),
      ])
    let s = KoaGains.compute([Self.d(1)], week: moved, today: monday.adding(days: 1))
    #expect(s.points == KoaGains.plannedSession, "buổi dời sang thứ Ba vẫn là buổi trong lịch")
    let rested = KoaGains.compute([Self.d(-3)], week: moved, today: monday)
    #expect(rested.missedDays == 0, "T6 trước tập, T7–CN nghỉ đặt, T2 đổi thành nghỉ")
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

  // MARK: - Nghỉ là một phần của tập (29/10, Kiệt)

  static let noPlan = KoaGains.Week(planned: [], rest: [])

  @Test func seventhHeavyDayInARowEarnsNothing() {
    let days = (0..<8).map { Self.d($0) }
    let six = KoaGains.compute(Array(days.prefix(6)), week: Self.noPlan, today: Self.monday.adding(days: 5))
    let seven = KoaGains.compute(Array(days.prefix(7)), week: Self.noPlan, today: Self.monday.adding(days: 6))
    let eight = KoaGains.compute(days, week: Self.noPlan, today: Self.monday.adding(days: 7))
    #expect(seven.points == six.points && eight.points == six.points)
    #expect(KoaGains.activeStreak(days, through: Self.monday.adding(days: 6)) == 7)
    // một ngày nghỉ rồi tập lại: có Gains trở lại
    let rested = Array(days.prefix(6)) + [Self.d(7)]
    #expect(KoaGains.compute(rested, week: Self.noPlan, today: Self.monday.adding(days: 7)).points > six.points)
  }

  @Test func walkingIsRecoveryAndCardioIsAnOffPlanSession() {
    let walk = KoaGains.Day(date: Self.monday, personalRecord: false, kind: .walk)
    #expect(KoaGains.compute([walk], week: Self.noPlan, today: Self.monday).points == KoaGains.walkSession)
    let run = KoaGains.Day(date: Self.monday, personalRecord: true, kind: .cardio)
    #expect(KoaGains.compute([run], week: Self.plan, today: Self.monday).points == KoaGains.cardioSession)
    // đi bộ không nối chuỗi: 6 ngày nặng, đi bộ, rồi nặng — ngày thứ 8 vẫn có Gains
    var days = (0..<6).map { Self.d($0) }
    days.append(.init(date: Self.monday.adding(days: 6), personalRecord: false, kind: .walk))
    #expect(KoaGains.activeStreak(days + [Self.d(7)], through: Self.monday.adding(days: 7)) == 1)
  }

  @Test func plannedRestEarnsUpToTwoDaysInATrainingWeek() {
    // lịch T2/T4/T6, nghỉ T7/CN; tập T2 → T7 và CN đều +3
    let s = KoaGains.compute([Self.d(0)], week: Self.plan, today: Self.monday.adding(days: 6))
    #expect(s.points == KoaGains.plannedSession + 2 * KoaGains.plannedRest)
    // nghỉ ba ngày trong lịch: chỉ hai ngày có Gains (lịch một buổi: T2 đã đủ tuần)
    let three = KoaGains.Week(planned: [0], rest: [4, 5, 6])
    #expect(
      KoaGains.compute([Self.d(0)], week: three, today: Self.monday.adding(days: 6)).points
        == KoaGains.plannedSession + KoaGains.fullWeek + KoaGains.restPerWeek * KoaGains.plannedRest)
    // tuần không có buổi nào: ngày nghỉ không có Gains
    let nextWeek = KoaGains.compute([Self.d(0)], week: Self.plan, today: Self.monday.adding(days: 13))
    #expect(nextWeek.points == s.points)
    // tập vào ngày nghỉ: không +3 cho hôm ấy (thành buổi ngoài lịch)
    let trainedRest = KoaGains.compute([Self.d(0), Self.d(5)], week: Self.plan, today: Self.monday.adding(days: 5))
    #expect(trainedRest.points == KoaGains.plannedSession + KoaGains.offPlanSession)
  }

  @Test func healthSessionsAreClassifiedByActivity() {
    func row(_ name: String) -> JSONValue {
      .object(["source": .string(HealthData.appleSource), "template_name": .string("\(name) · 30′ · 120 kcal")])
    }
    #expect(KoaGainsSync.kind(row("Đi bộ")) == .walk)
    #expect(KoaGainsSync.kind(row("Hiking")) == .walk)
    #expect(KoaGainsSync.kind(row("Chạy bộ")) == .cardio)
    #expect(KoaGainsSync.kind(row("Strength training")) == .heavy)
    #expect(KoaGainsSync.kind(row("HIIT")) == .heavy)
    #expect(KoaGainsSync.kind(row("Một thứ lạ")) == .cardio)
    #expect(KoaGainsSync.kind(.object(["source": .string("manual"), "template_name": .string("Đi bộ")])) == .heavy)
  }
}
