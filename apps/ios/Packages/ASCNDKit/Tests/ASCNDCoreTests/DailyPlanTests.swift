@testable import ASCNDCore
import Testing

/// Daily Plan (#527 GĐ1, `docs/GD1-DAILY-PLAN.md`): đủ 8 luật, và khi nhiều luật
/// cùng đúng thì luật trên thắng.
struct DailyPlanTests {
  static let today = LocalDate("2026-10-21")!
  static let chest = DailyPlan.Session(templateId: "t-chest", name: "Chest day", minutes: 35)
  static let back = DailyPlan.Session(templateId: "t-back", name: "Back day", minutes: 35)
  static let tomorrow = today.adding(days: 1)

  static func input(
    loaded: Bool = true, inProgress: DailyPlan.Session? = nil, hasSchedule: Bool = true,
    today day: DailyPlan.Day = .planned([chest]), done: [String?] = [], daysOff: Int = 0,
    recovery: DailyPlan.Recovery? = nil, protein: Int? = nil, next: DailyPlan.Upcoming? = nil,
    canReschedule: Bool = true, postponeTo: LocalDate? = tomorrow
  ) -> DailyPlan.Input {
    .init(
      date: today, loaded: loaded, inProgress: inProgress, hasSchedule: hasSchedule, today: day, doneToday: done,
      daysOff: daysOff, recovery: recovery, proteinLeftG: protein, next: next, canReschedule: canReschedule,
      postponeTo: postponeTo)
  }

  static let sleepAndHRV: [DailyPlan.Signal] = [.shortSleep(minutes: 310, target: 480), .lowHRV(percentBelow: 18)]
  static func recovery(
    level: DailyPlan.Recovery.Level = .low, confident: Bool = true, date: LocalDate = today,
    signals: [DailyPlan.Signal] = sleepAndHRV
  ) -> DailyPlan.Recovery {
    .init(date: date, level: level, confident: confident, signals: signals)
  }

  // MARK: - Luật 0–2

  @Test func notLoadedNeverGuesses() {
    let r = DailyPlan.decide(Self.input(loaded: false, inProgress: Self.chest, done: ["t-chest"]))
    #expect(r.action == .loading && r.alternatives.isEmpty)
  }

  @Test func sessionInProgressBeatsEverythingElse() {
    let r = DailyPlan.decide(Self.input(inProgress: Self.back, hasSchedule: false, daysOff: 9))
    #expect(r.action == .resume(Self.back))
  }

  @Test func noScheduleAsksToSetUpTheWeekEvenAfterAFreeSession() {
    let r = DailyPlan.decide(Self.input(hasSchedule: false, today: .empty, done: [nil]))
    #expect(r.action == .setUpWeek && r.reason == .noSchedule && r.alternatives == [.logFree])
  }

  // MARK: - Luật 3: buổi trong lịch

  @Test func plannedSessionStartsWithRescheduleOptions() {
    let r = DailyPlan.decide(Self.input())
    #expect(r.action == .start(Self.chest) && r.reason == .planned)
    #expect(r.alternatives == [.postpone(to: Self.tomorrow), .makeRest])
  }

  @Test func noRescheduleOptionsWithoutTheTableOrAFreeDay() {
    #expect(DailyPlan.decide(Self.input(canReschedule: false)).alternatives.isEmpty)
    #expect(DailyPlan.decide(Self.input(postponeTo: nil)).alternatives == [.makeRest])
  }

  /// Điều kiện 01: một buổi tự do không chặn buổi trong lịch còn lại.
  @Test func aFreeSessionDoesNotHideThePlannedOne() {
    let r = DailyPlan.decide(Self.input(done: [nil], protein: 80))
    #expect(r.action == .start(Self.chest) && r.reason == .anotherSession)
  }

  /// Điều kiện 01: hai buổi trong ngày — xong buổi đầu thì tới buổi hai.
  @Test func twoPlannedSessionsInADay() {
    let r = DailyPlan.decide(Self.input(today: .planned([Self.chest, Self.back]), done: ["t-chest"]))
    #expect(r.action == .start(Self.back) && r.reason == .anotherSession)
  }

  /// ④: quay lại sau ≥ 3 ngày nghỉ — không nhắc mất mát; thắng cả phục hồi thấp.
  @Test func comebackAfterThreeDaysOff() {
    let r = DailyPlan.decide(Self.input(daysOff: 5, recovery: Self.recovery()))
    #expect(r.action == .comeback(Self.chest) && r.reason == .returning(daysOff: 5))
    #expect(r.alternatives == [.lighter, .viewPlan])
    #expect(DailyPlan.decide(Self.input(daysOff: 2)).action == .start(Self.chest))
  }

  @Test func comebackDoesNotRepeatOnceTrainedToday() {
    let r = DailyPlan.decide(Self.input(today: .planned([Self.chest, Self.back]), done: ["t-chest"], daysOff: 5))
    #expect(r.action == .start(Self.back))
  }

  // MARK: - Điều kiện 02: "tập nhẹ hơn"

  @Test func lighterOnlyWhenRecoveryIsLowSureAndFromToday() {
    let r = DailyPlan.decide(Self.input(recovery: Self.recovery()))
    #expect(r.action == .start(Self.chest) && r.reason == .lowRecovery(Self.sleepAndHRV))
    #expect(r.alternatives == [.lighter, .postpone(to: Self.tomorrow)], "tối đa hai phương án")
  }

  @Test func noLighterWhenDataIsMissingStaleOrOneSignal() {
    let cases: [DailyPlan.Recovery?] = [
      nil,
      Self.recovery(confident: false),
      Self.recovery(date: Self.today.adding(days: -1)),
      Self.recovery(signals: [.lowHRV(percentBelow: 25)]),
      Self.recovery(level: .normal),
    ]
    for c in cases {
      let r = DailyPlan.decide(Self.input(recovery: c))
      #expect(r.reason == .planned && !r.alternatives.contains(.lighter), "\(String(describing: c))")
    }
  }

  // MARK: - Luật 4–6

  @Test func afterTrainingSuggestsAMealOnlyWhenProteinIsKnownAndShort() {
    let done = Self.input(done: ["t-chest"], protein: 86)
    #expect(DailyPlan.decide(done).action == .postWorkoutMeal)
    #expect(DailyPlan.decide(done).reason == .proteinLeft(grams: 86))
    #expect(DailyPlan.decide(Self.input(done: ["t-chest"], protein: 10)).action == .progress)
    #expect(DailyPlan.decide(Self.input(done: ["t-chest"], protein: nil)).action == .progress, "không đoán đạm")
  }

  @Test func trainingOnARestDayCountsAsTrained() {
    let r = DailyPlan.decide(Self.input(today: .rest, done: [nil]))
    #expect(r.action == .progress && r.reason == .trainedToday)
  }

  @Test func restDayIsRecovery() {
    let r = DailyPlan.decide(Self.input(today: .rest, daysOff: 4))
    #expect(r.action == .recovery && r.reason == .restDay && r.alternatives == [.logFree])
  }

  @Test func emptyDayPointsToTheNextSession() {
    let next = DailyPlan.Upcoming(date: Self.today.adding(days: 2), session: Self.back)
    let r = DailyPlan.decide(Self.input(today: .empty, next: next))
    #expect(r.action == .nextSession(date: next.date, session: Self.back) && r.reason == .nextOn(next.date))
    #expect(DailyPlan.decide(Self.input(today: .empty)).action == .logFree)
  }

  @Test func eachLoggedSessionPaysForExactlyOnePlannedOne() {
    let same = [Self.chest, Self.chest]
    #expect(DailyPlan.remaining(same, done: ["t-chest"]).count == 1)
    #expect(DailyPlan.remaining(same, done: ["t-chest", "t-chest", nil]).isEmpty)
    #expect(DailyPlan.remaining([Self.chest], done: ["t-back"]) == [Self.chest])
  }
}
