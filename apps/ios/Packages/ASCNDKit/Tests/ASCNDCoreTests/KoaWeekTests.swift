@testable import ASCNDCore
import Foundation
import Testing

/// "Tuần của Koa" (#527 GĐ2): đích theo lịch thật, đếm buổi ghi thật, thưởng một lần.
@MainActor
struct KoaWeekTests {
  /// 2026-10-19 là thứ Hai.
  static let mon = LocalDate("2026-10-19")!
  static let t = WorkoutTemplate(id: "t", name: "Full body", exercises: [
    TemplateExercise(exerciseName: "Squat", sets: 3, reps: 8, weightKg: 60)
  ])
  /// T2, T4, T6 có buổi; T7, CN nghỉ.
  static func lib(_ overrides: [DayOverride] = []) -> TemplateSnapshot {
    TemplateSnapshot(
      routine: [0, 2, 4].map { RoutineDay(dayOfWeek: $0, isRest: false, templateId: "t") }
        + [5, 6].map { RoutineDay(dayOfWeek: $0, isRest: true, templateId: nil) },
      templates: [t], overrides: overrides, fetchedAt: EpochMillis(1))
  }

  @Test func targetIsThePlannedSessionsAndDoneCountsRealSessions() throws {
    let s = try #require(KoaWeek.state(today: Self.mon.adding(days: 3), library: Self.lib(), trained: [Self.mon, Self.mon.adding(days: 2)]))
    #expect(s.weekStart == Self.mon && s.target == 3 && s.done == 2 && !s.complete)
    #expect(s.days.filter(\.rest).count == 2, "ngày nghỉ đã đặt")
    #expect(s.refKey == "ch:silver:2026-10-19:koa_week")
  }

  /// Lỡ một buổi vẫn giữ buổi đã tập; tập bù ngày khác (hay ngày dời tới) vẫn tính.
  @Test func missedSessionKeepsProgressAndAMakeUpCounts() throws {
    let trained: Set<LocalDate> = [Self.mon, Self.mon.adding(days: 3), Self.mon.adding(days: 4)]
    let s = try #require(KoaWeek.state(today: Self.mon.adding(days: 4), library: Self.lib(), trained: trained))
    #expect(s.done == 3 && s.complete)
  }

  /// Cùng một sự kiện "đủ tuần" với Gains (+15).
  @Test func completeMatchesTheGainsFullWeekBonus() throws {
    let days = [Self.mon, Self.mon.adding(days: 2), Self.mon.adding(days: 4)]
    let s = try #require(KoaWeek.state(today: days[2], library: Self.lib(), trained: Set(days)))
    let g = KoaGains.compute(days.map { KoaGains.Day(date: $0, personalRecord: false) }, week: KoaGains.Week(Self.lib()), today: days[2])
    #expect(s.complete && g.points == 3 * KoaGains.plannedSession + KoaGains.fullWeek)
  }

  // MARK: - Một luật đủ tuần cho +15 Gains và +50 xu (KOA-T20, Kiệt 21/11)

  /// thưởng đủ tuần của Gains có trong tuần không
  static func gainsPaid(_ days: [KoaGains.Day], week: KoaGains.Week, through: LocalDate) -> Bool {
    KoaGains.ledger(days, week: week, today: through).contains { $0.0 >= Self.mon && $0.0 <= Self.mon.adding(days: 6) && $0.1.fullWeek }
  }
  static func heavy(_ o: Int...) -> [KoaGains.Day] { o.map { KoaGains.Day(date: Self.mon.adding(days: $0), personalRecord: false) } }

  /// Tuần có Tạm nghỉ (T6 nghỉ, T2 + T4 đã tập): cả Tuần của Koa lẫn Gains đều coi là đủ (đích 2).
  @Test func pausedDayLowersBothTargets() throws {
    let pause = KoaPauseLog([KoaPause(start: Self.mon.adding(days: 4), last: Self.mon.adding(days: 4))])
    let s = try #require(KoaWeek.state(
      today: Self.mon.adding(days: 5), library: Self.lib(), trained: [Self.mon, Self.mon.adding(days: 2)],
      paused: pause.contains))
    #expect(s.target == 2 && s.complete)
    var week = KoaGains.Week(Self.lib())
    #expect(!Self.gainsPaid(Self.heavy(0, 2), week: week, through: Self.mon.adding(days: 5)), "không có sổ nghỉ: Gains chưa đủ")
    week.pauses = pause
    #expect(Self.gainsPaid(Self.heavy(0, 2), week: week, through: Self.mon.adding(days: 5)), "có sổ nghỉ: Gains đủ cùng lúc")
  }

  /// Tổng kết tuần: tuần đủ nhờ Tạm nghỉ có cả +15 Gains (cùng sổ với Hành trình — Devin #1002).
  @Test func summaryGainsIncludeTheBonusEarnedThroughAPause() {
    let pause = KoaPauseLog([KoaPause(start: Self.mon.adding(days: 4), last: Self.mon.adding(days: 4))])
    let history = Self.heavy(0, 2)
    let without = KoaWeek.summary(weekStart: Self.mon, today: Self.mon.adding(days: 6), library: Self.lib(), history: history,
      paused: pause.contains)
    let with = KoaWeek.summary(weekStart: Self.mon, today: Self.mon.adding(days: 6), library: Self.lib(), history: history,
      paused: pause.contains, pauses: pause)
    #expect(with.target == 2 && with.done == 2)
    #expect(with.gains == without.gains + KoaGains.fullWeek)
  }

  /// Đợt Tạm nghỉ chỉ rơi khỏi sổ máy vì đã cũ (> 60 ngày) KHÔNG bị gửi lên như huỷ (Devin #1002).
  @Test func prunedOldSpellIsNotPushedAsCancelled() {
    let today = LocalDate("2026-11-22")!
    let old = KoaPause(start: today.adding(days: -90), last: today.adding(days: -80))
    let recent = KoaPause(start: today.adding(days: -10), last: today.adding(days: -8))
    let synced = KoaPauseLog([old, recent])
    let local = synced.pruned(today: today)
    #expect(!local.spells.contains(old), "sổ máy đã cắt đợt cũ")
    #expect(KoaPauseLogSync.pushRows(synced: synced, local: local, today: today, userId: "u").isEmpty, "không gửi gì")
    // huỷ thật một đợt còn trong 60 ngày thì vẫn gửi
    let cancelled = KoaPauseLog([])
    let rows = KoaPauseLogSync.pushRows(synced: synced, local: cancelled, today: today, userId: "u")
    #expect(rows.count == 1 && rows[0]["starts_on"] == .string(recent.start.description))
  }

  /// Ngày chỉ đi bộ không tính "đã tập" ở cả hai.
  @Test func walkOnlyDaysCountForNeither() throws {
    let walk = KoaGains.Day(date: Self.mon.adding(days: 4), personalRecord: false, kind: .walk)
    let history = Self.heavy(0, 2) + [walk]
    let wo = KoaWeek.walkOnly(history)
    #expect(wo == [Self.mon.adding(days: 4)])
    let s = try #require(KoaWeek.state(
      today: Self.mon.adding(days: 5), library: Self.lib(), trained: Set(history.map(\.date)), walkOnly: wo))
    #expect(s.done == 2 && !s.complete)
    #expect(!Self.gainsPaid(history, week: KoaGains.Week(Self.lib()), through: Self.mon.adding(days: 5)))
    let sum = KoaWeek.summary(weekStart: Self.mon, today: Self.mon.adding(days: 6), library: Self.lib(), history: history)
    #expect(sum.done == 2, "tổng kết tuần cũng không tính ngày đi bộ")
    #expect(KoaWeek.walkOnly(Self.heavy(4) + [walk]).isEmpty, "cùng ngày có buổi tạ thì không phải ngày chỉ đi bộ")
  }

  /// Tuần nghỉ trọn (mọi buổi theo lịch đều Tạm nghỉ): không có thưởng đủ tuần.
  @Test func fullyPausedWeekPaysNothing() {
    var week = KoaGains.Week(Self.lib())
    week.pauses = KoaPauseLog([KoaPause(start: Self.mon, last: Self.mon.adding(days: 6))])
    // một buổi cardio ngày thứ Ba (ngoài lịch) trong tuần nghỉ trọn: có Gains buổi, không có thưởng đủ tuần
    let extra = [KoaGains.Day(date: Self.mon.adding(days: 1), personalRecord: false, kind: .cardio)]
    #expect(week.target(week: Self.mon, active: { _ in false }) == 0)
    #expect(!Self.gainsPaid(extra, week: week, through: Self.mon.adding(days: 6)))
  }

  /// Buổi thứ 7 tập liền: không có Gains riêng nhưng vẫn tính cho đủ tuần (như Tuần của Koa).
  @Test func seventhStraightDayStillCountsTowardTheWeek() {
    // tuần trước tập 6 ngày liền tới CN → T2 tuần này là ngày thứ 7 liền
    let prev = (1...6).map { KoaGains.Day(date: Self.mon.adding(days: -$0), personalRecord: false) }
    let wk = KoaGains.Week(planned: [0], rest: [])   // đích 1: buổi T2
    let b = KoaGains.breakdown(prev + Self.heavy(0), week: wk, on: Self.mon)
    #expect(b?.streak == 7)
    #expect(b?.fullWeek == true, "buổi thứ 7 liền vẫn làm đủ tuần")
  }

  @Test func noPlanNoWeek() {
    let empty = TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1))
    #expect(KoaWeek.state(today: Self.mon, library: empty, trained: []) == nil)
    #expect(KoaWeek.state(today: Self.mon, library: nil, trained: []) == nil)
  }

  // MARK: - Thưởng

  final class Economy: MascotEconomy, @unchecked Sendable {
    var claims: [String] = []
    var failWith: MascotFailure?
    /// Số xu server trả (mặc định giá hiện tại) và độ trễ (thử chạy chồng).
    var amount = KoaWeek.rewardCoins
    var delayMs = 0
    func claimReward(refKey: String, reason: String) async throws -> Int {
      if delayMs > 0 { try? await Task.sleep(for: .milliseconds(delayMs)) }
      if let failWith { throw failWith }
      if claims.contains(refKey) { return 0 }  // server mới: trùng → 0 (KOA-T01)
      claims.append(refKey)
      return amount
    }
  }

  static func complete() -> KoaWeek.State {
    let days = [Self.mon, Self.mon.adding(days: 2), Self.mon.adding(days: 4)]
    return KoaWeek.state(today: days[2], library: Self.lib(), trained: Set(days))!
  }

  /// KOA-T05: tải lại Hôm nay không mừng lần hai — chỉ lượt vừa nhận trả số xu; số đó là
  /// số server trả, không phải hằng 50.
  @Test func onlyAFreshClaimReturnsCoinsAndItUsesTheServerAmount() async throws {
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let econ = Economy()
    econ.amount = 70
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    #expect(await book.claimIfComplete(Self.complete()) == 70)
    #expect(book.claim == .justClaimed(coins: 70))
    #expect(await book.claimIfComplete(Self.complete()) == nil, "tải lại: không có tín hiệu mừng")
    #expect(book.claim == .justClaimed(coins: 70), "thẻ vẫn hiện 'vừa nhận'")
    #expect(econ.claims.count == 1)
  }

  /// KOA-T17: phòng, Hôm nay và lượt "có mạng lại" gọi chồng nhau → một lượt nhận.
  @Test func overlappingClaimsSendOneRequest() async throws {
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let econ = Economy()
    econ.delayMs = 80
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    async let a = book.claimIfComplete(Self.complete())
    async let b = book.claimIfComplete(Self.complete())
    let got = await [a, b]
    #expect(econ.claims.count == 1)
    #expect(got.compactMap { $0 } == [50], "chỉ một lượt mừng")
  }

  @Test func claimsOncePerWeekEvenWhenCalledAgainOrFromAnotherDevice() async throws {
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let econ = Economy()
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    await book.claimIfComplete(Self.complete())
    #expect(book.claim == .justClaimed(coins: 50))
    await book.claimIfComplete(Self.complete())
    #expect(econ.claims.count == 1, "máy nhớ đã nhận — không gọi lại")
    // máy khác (bộ nhớ trống) — server bỏ trùng theo ref_key
    let other = KoaWeekBook(userId: "u", economy: econ, defaults: try #require(UserDefaults(suiteName: "koaweek-\(UUID())")))
    await other.claimIfComplete(Self.complete())
    #expect(other.claim == .claimed && econ.claims.count == 1)
  }

  @Test func notCompleteOrOfflineNeverMarksClaimed() async throws {
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let econ = Economy()
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    let partial = KoaWeek.state(today: Self.mon, library: Self.lib(), trained: [Self.mon])
    await book.claimIfComplete(partial)
    #expect(book.claim == .notYet && econ.claims.isEmpty)
    econ.failWith = .offline
    await book.claimIfComplete(Self.complete())
    #expect(book.claim == .failed)
    econ.failWith = nil
    await book.claimIfComplete(Self.complete())
    #expect(book.claim == .justClaimed(coins: 50) && econ.claims.count == 1, "mất mạng rồi thử lại vẫn một lần")
  }

  /// Đủ tuần lúc mất mạng, sang tuần mới mới có mạng: nhận bù tuần trước một lần,
  /// không đụng trạng thái nhận của tuần này.
  /// KOA-T01: tuần đã nhận ở máy khác — nhận bù trả 0 → không báo "+50", nhớ đã nhận.
  @Test func missedWeekPaidElsewhereIsNotCelebrated() async throws {
    let econ = Economy()
    econ.claims = [Self.complete().refKey]  // máy khác đã nhận
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    #expect(await book.claimMissed(Self.complete()) == nil)
    await book.claimIfComplete(Self.complete())
    #expect(book.claim == .claimed, "đã nhận ở máy khác: hiện 'đã nhận', không 'vừa nhận'")
  }

  @Test func missedWeekIsClaimedOnceLaterWithoutTouchingThisWeek() async throws {
    let defaults = try #require(UserDefaults(suiteName: "koaweek-\(UUID())"))
    let econ = Economy()
    let book = KoaWeekBook(userId: "u", economy: econ, defaults: defaults)
    econ.failWith = .offline
    await book.claimIfComplete(Self.complete())
    #expect(book.claim == .failed)
    #expect(await book.claimMissed(Self.complete()) == nil, "vẫn mất mạng")
    econ.failWith = nil
    #expect(await book.claimMissed(Self.complete()) == 50)
    #expect(book.claim == .failed, "tuần trước không ghi đè trạng thái tuần này")
    #expect(await book.claimMissed(Self.complete()) == nil && econ.claims.count == 1, "một lần")
    let partial = KoaWeek.state(today: Self.mon, library: Self.lib(), trained: [Self.mon])
    #expect(await book.claimMissed(partial) == nil, "chưa đủ tuần thì không nhận")
  }

  @Test func weeklySummaryReadsTheAppliedPlanAndGains() {
    let wed = Self.mon.adding(days: 2), thu = Self.mon.adding(days: 3), fri = Self.mon.adding(days: 4)
    let lib = Self.lib([
      DayOverride(date: wed, templateId: nil, isRest: true, movedTo: thu),
      DayOverride(date: thu, templateId: "t", isRest: false, movedFrom: wed),
      DayOverride(date: fri, templateId: nil, isRest: true),
    ])
    let history = [Self.mon, thu].map { KoaGains.Day(date: $0, personalRecord: false) }
      + [KoaGains.Day(date: Self.mon.adding(days: -7), personalRecord: false)]
    let s = KoaWeek.summary(weekStart: Self.mon, today: Self.mon.adding(days: 6), library: lib, history: history)
    #expect(s.target == 3 && s.done == 2 && s.moved == 1 && s.chosenRest == 1)
    // + hai ngày nghỉ có kế hoạch (T4 đổi thành nghỉ, T6 nghỉ) — 29/10, tối đa 2 / tuần
    #expect(
      s.gains == 2 * KoaGains.plannedSession + KoaGains.restPerWeek * KoaGains.plannedRest,
      "chỉ Gains của tuần này; buổi dời sang T5 vẫn là buổi trong lịch")
  }

  /// KOA-T22: Hôm nay / phòng (`state`) và Tổng kết tuần (`summary`) cùng một đích khi có Tạm nghỉ.
  @Test func stateAndSummaryAgreeOnTheTargetWithAPause() throws {
    let fri = Self.mon.adding(days: 4), sun = Self.mon.adding(days: 6)
    let paused: (LocalDate) -> Bool = { $0 == fri }
    let trained: Set<LocalDate> = [Self.mon]
    let st = try #require(KoaWeek.state(today: sun, library: Self.lib(), trained: trained, paused: paused))
    let su = KoaWeek.summary(
      weekStart: Self.mon, today: sun, library: Self.lib(),
      history: trained.map { KoaGains.Day(date: $0, personalRecord: false) }, paused: paused)
    #expect(st.target == 2 && su.target == st.target && su.done == st.done)
  }

  /// KOA-T22: buổi T6 dời sang T2 tuần sau — đích tuần này không đổi, buổi được tính ở tuần tập thật.
  @Test func crossWeekMoveCountsWhereItIsTrained() throws {
    let fri = Self.mon.adding(days: 4), nextMon = Self.mon.adding(days: 7)
    let lib = Self.lib([
      DayOverride(date: fri, templateId: nil, isRest: true, movedTo: nextMon),
      DayOverride(date: nextMon, templateId: "t", isRest: false, movedFrom: fri),
    ])
    let history = [Self.mon, Self.mon.adding(days: 2), nextMon].map { KoaGains.Day(date: $0, personalRecord: false) }
    let this = KoaWeek.summary(weekStart: Self.mon, today: nextMon, library: lib, history: history)
    let next = KoaWeek.summary(weekStart: nextMon, today: nextMon, library: lib, history: history)
    #expect(this.target == 3 && this.done == 2 && this.moved == 0)
    #expect(next.done == 1 && next.moved == 1)
  }

  /// KOA-T22: 14 ngày lịch sử của Hôm nay phủ trọn tuần trước từ mọi ngày trong tuần (thẻ đầu tuần,
  /// nhận bù Tuần của Koa đều đọc tuần trước từ nguồn này).
  @Test func todayHistoryWindowCoversLastWeek() {
    for o in 0..<7 {
      let today = Self.mon.adding(days: o)
      let firstRead = today.adding(days: -(TodayController.historyDays - 1))
      #expect(firstRead <= today.weekStart.adding(days: -7), "thứ \(o + 2)")
    }
  }

  /// KOA-T22: chưa có lịch — Tuần của Koa không có đích (ẩn), dải tuần Tập luyện vẫn hiện ngày đã tập.
  @Test func noLibraryModelIsPinned() {
    let trained: Set<LocalDate> = [Self.mon]
    #expect(KoaWeek.state(today: Self.mon, library: nil, trained: trained) == nil)
    let strip = WorkoutHome.week(today: Self.mon, library: nil, trained: trained)
    #expect(strip.first?.status == .done && strip.dropFirst().allSatisfy { $0.status == .unplanned })
  }

  /// Vòng ngày của màn Tổng kết tuần: một tuần đã qua vẫn đọc đúng lịch và buổi đã tập.
  @Test func daysOfAPastWeekFollowThePlan() {
    let prev = Self.mon.adding(days: -7)
    let d = KoaWeek.days(
      weekStart: prev, today: Self.mon.adding(days: 3), library: Self.lib(), trained: [prev.adding(days: 2), Self.mon])
    #expect(d.map(\.date) == (0..<7).map { prev.adding(days: $0) })
    #expect(d.map(\.planned) == [true, false, true, false, true, false, false])
    #expect(d.map(\.rest) == [false, false, false, false, false, true, true])
    #expect(d.map(\.trained) == [false, false, true, false, false, false, false], "buổi tuần khác không lọt vào")
  }
}
