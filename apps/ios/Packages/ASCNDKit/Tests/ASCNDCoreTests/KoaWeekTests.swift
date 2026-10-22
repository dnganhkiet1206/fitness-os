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

  @Test func noPlanNoWeek() {
    let empty = TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1))
    #expect(KoaWeek.state(today: Self.mon, library: empty, trained: []) == nil)
    #expect(KoaWeek.state(today: Self.mon, library: nil, trained: []) == nil)
  }

  // MARK: - Thưởng

  final class Economy: MascotEconomy, @unchecked Sendable {
    var claims: [String] = []
    var failWith: MascotFailure?
    func claimReward(refKey: String, reason: String) async throws -> Int {
      if let failWith { throw failWith }
      if claims.contains(refKey) { throw MascotFailure.server(code: "23505") }
      claims.append(refKey)
      return KoaWeek.rewardCoins
    }
    func buyStreakFreeze(requestId: UUID) async throws -> Int { 0 }
  }

  static func complete() -> KoaWeek.State {
    let days = [Self.mon, Self.mon.adding(days: 2), Self.mon.adding(days: 4)]
    return KoaWeek.state(today: days[2], library: Self.lib(), trained: Set(days))!
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
    #expect(s.gains == 2 * KoaGains.plannedSession, "chỉ Gains của tuần này; buổi dời sang T5 vẫn là buổi trong lịch")
  }
}
