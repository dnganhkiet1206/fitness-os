import Foundation
import Testing

@testable import ASCNDCore

@Suite struct KoaPauseTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  @Test func pauseIsCappedAndEndsByItself() {
    let p = KoaPause(from: d("2026-11-03"), days: 30)
    #expect(p.last == d("2026-11-16"), "tối đa 14 ngày")
    #expect(p.contains(d("2026-11-10")) && !p.contains(d("2026-11-17")))
    #expect(p.active(on: d("2026-11-16")) && !p.active(on: d("2026-11-17")))
    #expect(p.returnDay == d("2026-11-17"))
    #expect(p.daysLeft(from: d("2026-11-15")) == 2)
  }

  @Test func endingEarlyKeepsThePastDaysOnly() {
    let p = KoaPause(from: d("2026-11-03"), days: 7)
    #expect(p.ended(on: d("2026-11-03")) == nil, "huỷ ngay hôm đầu thì như chưa nghỉ")
    #expect(p.ended(on: d("2026-11-06"))?.last == d("2026-11-05"))
  }

  @Test func noTrainingRemindersWhilePaused() {
    var ctx = ReminderContext()
    ctx.plannedByOffset = [0: true, 1: true, 2: true]
    let paused = ctx.paused(KoaPause(from: d("2026-11-03"), days: 2), today: d("2026-11-03"))
    #expect(paused.plannedByOffset?[0] == false && paused.plannedByOffset?[1] == false)
    #expect(paused.plannedByOffset?[2] == true, "ngày quay lại vẫn nhắc")
  }

  @Test func dustDoesNotSettleWhilePaused() {
    let today = d("2026-11-12")
    let sessions: Set<LocalDate> = [d("2026-11-01")]
    let open = KoaDust.compute(sessions: sessions, logs: [:], cleaned: [], isRest: { _ in false }, today: today)
    let pause = KoaPause(from: d("2026-11-02"), days: 10)
    let rested = KoaDust.compute(sessions: sessions, logs: [:], cleaned: [], isRest: { pause.contains($0) }, today: today)
    #expect(open.level > 0)
    #expect(rested.level == 0)
  }

  @Test func rhythmNamesPausedDays() {
    let week = KoaGains.Week(planned: [0, 2, 4], rest: [])
    let pause = KoaPause(from: d("2026-11-01"), days: 3)
    let s = KoaRhythm.state([], week: week, paused: pause.contains, today: d("2026-11-03"))
    #expect(s.days.suffix(3).allSatisfy { $0 == .paused })
  }

  @Test func serverRowRoundTripsAndEndingWritesAPastDay() {
    let today = d("2026-11-03")
    let p = KoaPause(from: today, days: 4)
    let row = KoaPauseSync.row(p, userId: "u", today: today)
    let back = KoaPauseSync.decode(.object(row))
    #expect(back == p)
    let none = KoaPauseSync.decode(.object(KoaPauseSync.row(nil, userId: "u", today: today)))
    #expect(none?.active(on: today) == false, "kết thúc sớm: dòng cũ hết hiệu lực")
    #expect(KoaPauseSync.decode(nil) == nil)
  }

  @Test func pastSpellsStayInTheLog() {
    let log = KoaPauseLog().setting(KoaPause(from: d("2026-11-01"), days: 3), today: d("2026-11-01"))
    // hết hẹn: đợt đã qua vẫn là ngày nghỉ (trước đây vừa quay lại là phòng bám bụi những ngày ấy)
    #expect(log.contains(d("2026-11-02")) && !log.contains(d("2026-11-05")))
    let again = log.setting(KoaPause(from: d("2026-11-10"), days: 2), today: d("2026-11-10"))
    #expect(again.spells.count == 2 && again.contains(d("2026-11-03")) && again.contains(d("2026-11-11")))
  }

  @Test func endingEarlyOrReplacingStopsTheCurrentSpellYesterday() {
    let log = KoaPauseLog().setting(KoaPause(from: d("2026-11-01"), days: 7), today: d("2026-11-01"))
    let ended = log.setting(nil, today: d("2026-11-04"))
    #expect(ended.spells == [KoaPause(start: d("2026-11-01"), last: d("2026-11-03"))])
    let replaced = log.setting(KoaPause(from: d("2026-11-04"), days: 2), today: d("2026-11-04"))
    #expect(replaced.spells.map(\.last) == [d("2026-11-03"), d("2026-11-05")])
    #expect(log.setting(nil, today: d("2026-11-01")).spells.isEmpty, "huỷ ngay hôm đầu thì như chưa nghỉ")
  }

  @Test func oldSpellsArePruned() {
    let log = KoaPauseLog([KoaPause(from: d("2026-08-01"), days: 3), KoaPause(from: d("2026-10-20"), days: 3)])
    #expect(log.pruned(today: d("2026-11-04")).spells.map(\.start) == [d("2026-10-20")])
  }

  @Test func currentPauseFromAnotherDeviceJoinsTheLog() {
    let past = KoaPauseLog([KoaPause(from: d("2026-10-20"), days: 3)])
    let current = KoaPause(from: d("2026-11-03"), days: 4)
    let log = past.including(current, today: d("2026-11-04"))
    #expect(log.spells.count == 2 && log.contains(d("2026-11-05")))
    #expect(log.including(current, today: d("2026-11-04")) == log)
  }

  @Test func logRowsWriteChangesAndCancelWithoutDeleting() {
    let today = d("2026-11-04")
    let old = KoaPauseLog([KoaPause(from: d("2026-10-20"), days: 3), KoaPause(from: today, days: 5)])
    let new = old.setting(nil, today: today)
    let rows = KoaPauseLogSync.rows(from: old, to: new, userId: "u")
    #expect(rows.count == 1, "đợt cũ không đổi thì không gửi lại")
    #expect(rows.first?["ends_on"] == .string("2026-11-03"), "huỷ = ngày cuối trước ngày đầu")
    let back = KoaPauseLogSync.decode(rows.map { .object($0) }, today: today)
    #expect(back.spells.isEmpty, "dòng đã huỷ bị bỏ qua khi đọc")
    let all = KoaPauseLogSync.decode(KoaPauseLogSync.rows(old, userId: "u").map { .object($0) }, today: today)
    #expect(all == old)
  }

  @Test func dustCountsPastPauseDays() {
    let past = KoaPauseLog([KoaPause(from: d("2026-11-02"), days: 10)])
    let today = d("2026-11-13")
    let dust = KoaDust.compute(
      sessions: [d("2026-11-01")], logs: [:], cleaned: [], isRest: past.contains, today: today)
    #expect(dust.level == 0, "đợt nghỉ đã hết hẹn vẫn không để lại bụi")
  }
}
