import Foundation
import Testing

@testable import ASCNDCore

/// Lời nhắc buổi tập của Koa không lặp và không làm phiền (#800).
@Suite struct KoaNudgeTests {
  private static let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
  }()
  /// Thứ Hai 2026-10-19 08:00 UTC.
  private static let monday = ISO8601DateFormatter().date(from: "2026-10-19T08:00:00Z")!
  private static let lines = ReminderCopyTable.koaTraining(.vi)

  private func ctx() -> ReminderContext {
    var c = ReminderContext()
    c.trainingDays = [0, 1, 2, 3, 4, 5, 6]
    c.missedDays = 0
    c.koaWorkoutCopy = ReminderCopyTable.koaWorkout(.vi)
    c.koaTrainingLines = Self.lines
    return c
  }

  private func plan(_ c: ReminderContext) -> [PlannedReminder] {
    ReminderPlan.plan(ReminderPrefs.defaults, c, now: Self.monday, calendar: Self.utc).filter { $0.key == .koaTraining }
  }

  @Test func everyLanguageHasFiveDistinctLines() {
    for lang: AppPreferences.Lang in [.vi, .en, .es] {
      let l = ReminderCopyTable.koaTraining(lang)
      #expect(l.count == 5)
      #expect(Set(l.map(\.title)).count == l.count, "\(lang)")
      #expect(l.first?.title == ReminderCopyTable.copy(lang)[.koaTraining]?.title, "câu đầu là câu chung cũ")
      #expect(l.allSatisfy { $0.habitBody != nil })
    }
  }

  @Test func linesRotateAndNeverRepeatTheOneJustUsed() {
    let w = plan(ctx())
    #expect(w.count == 7)
    for (a, b) in zip(w, w.dropFirst()) { #expect(a.title != b.title, "hai lần nhắc liền nhau khác câu") }
    #expect(Set(w.compactMap(\.title)).count >= 3)
    #expect(plan(ctx()).map(\.title) == w.map(\.title), "cùng ngày ra cùng câu: đặt lại lịch không đổi chữ")
  }

  @Test func returningUserStillGetsTheWelcomeLine() {
    var c = ctx()
    c.missedDays = 4
    #expect(plan(c).first?.title == "Koa vẫn ở đây 💪")
  }

  @Test func habitTimeUsesTheHabitLine() {
    var c = ctx()
    c.habitTimes[.workout] = ReminderClock(hour: 19, minute: 0)
    let w = plan(c)
    #expect(w.allSatisfy { $0.habit })
    #expect(w.allSatisfy { r in Self.lines.contains { $0.habitBody == r.body } })
  }

  @Test func noLinesKeepsTheOldPlan() {
    var c = ctx()
    c.koaTrainingLines = []
    #expect(plan(c).allSatisfy { $0.title == nil && $0.body == nil })
  }

  @Test func spacedOutAfterBeingIgnored() {
    var c = ctx()
    c.koaTrainingEvery = 2
    c.lastKoaTrainingOffset = -1  // hôm qua đã bắn
    let w = plan(c)
    let days = w.map { Self.utc.dateComponents([.day], from: Self.utc.startOfDay(for: Self.monday), to: $0.at).day! }
    #expect(days == [1, 3, 5], "hôm nay bỏ (hôm qua vừa nhắc), rồi 2 ngày một lần")
    c.lastKoaTrainingOffset = -2
    #expect(plan(c).count == 4, "hai ngày trước mới nhắc → hôm nay được nhắc")
  }

  @Test func dueRule() {
    #expect(KoaNudge.due(day: 0, lastOffset: nil, every: 2))
    #expect(KoaNudge.due(day: 0, lastOffset: -1, every: 1))
    #expect(!KoaNudge.due(day: 0, lastOffset: -1, every: 2))
    #expect(KoaNudge.due(day: 1, lastOffset: -1, every: 2))
  }

  @Test func threeIgnoredInARowSpacesOutAndOneOpenResets() {
    var l = KoaNudge.Ledger()
    let t0 = Self.monday
    l.record([t0, t0.addingTimeInterval(86_400), t0.addingTimeInterval(2 * 86_400)])
    l.settle(now: t0.addingTimeInterval(86_400 + 60))
    #expect(l.ignored == 2 && l.every == 1)
    l.settle(now: t0.addingTimeInterval(2 * 86_400 + 60))
    #expect(l.ignored == 3 && l.every == 2)
    #expect(l.lastFiredOffset(now: t0.addingTimeInterval(3 * 86_400), calendar: Self.utc) == -1)
    l.opened(at: t0.addingTimeInterval(2 * 86_400 + 120))
    #expect(l.ignored == 0 && l.every == 1)
  }

  @Test func anOpenedReminderIsNotIgnored() {
    var l = KoaNudge.Ledger()
    l.record([Self.monday])
    l.opened(at: Self.monday.addingTimeInterval(30))
    l.settle(now: Self.monday.addingTimeInterval(3600))
    #expect(l.ignored == 0 && l.scheduled.isEmpty)
  }

  @Test func ledgerRoundTrips() throws {
    var l = KoaNudge.Ledger()
    l.record([Self.monday])
    l.settle(now: Self.monday.addingTimeInterval(1))
    let back = try JSONDecoder().decode(KoaNudge.Ledger.self, from: JSONEncoder().encode(l))
    #expect(back == l)
  }
}
