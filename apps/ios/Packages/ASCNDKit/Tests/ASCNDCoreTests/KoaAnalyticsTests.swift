import Testing

@testable import ASCNDCore

/// Thuộc tính sự kiện Koa Ecosystem (#793): chỉ nói "đã làm gì", số đếm theo khoảng, mỗi lần xảy
/// ra một sự kiện.
@Suite struct KoaAnalyticsTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  @Test func momentSaysKindAndPlaceNotTheNumber() {
    let m = KoaJourney.Moment(id: "rank:3", kind: .rankUp, date: d("2026-11-02"), value: 3)
    #expect(KoaAnalytics.momentProps(m, place: .today) == ["kind": "rankUp", "place": "today", "major": "true"])
    let r = KoaJourney.Moment(id: "record:2026-11-02", kind: .record, date: d("2026-11-02"), value: 0)
    #expect(KoaAnalytics.momentProps(r, place: .room)["major"] == "false")
  }

  @Test func momentKeyIsPerMomentAndPlace() {
    let m = KoaJourney.Moment(id: "first", kind: .firstSession, date: d("2026-11-02"), value: 1)
    #expect(KoaAnalytics.momentKey(m, place: .today) == "first@today")
    #expect(KoaAnalytics.momentKey(m, place: .today) != KoaAnalytics.momentKey(m, place: .room))
  }

  @Test func rhythmSendsABucketAndWhetherAPauseIsInTheWindow() {
    let s = KoaRhythm.State(days: [.trained, .paused, .open], sessions: 5, previous: 2)
    #expect(KoaAnalytics.rhythmProps(s) == ["sessions": "4_8", "paused": "true"])
    let none = KoaRhythm.State(days: [.open], sessions: 0, previous: 0)
    #expect(KoaAnalytics.rhythmProps(none) == ["sessions": "0", "paused": "false"])
    #expect(KoaAnalytics.rhythmKey(today: d("2026-11-03")) == "rhythm:2026-11-03")
  }

  @Test(arguments: [(0, "0"), (1, "1_3"), (3, "1_3"), (4, "4_8"), (8, "4_8"), (9, "9_15"), (15, "9_15"), (16, "16_plus")])
  func sessionBuckets(n: Int, want: String) {
    #expect(KoaAnalytics.sessions(n) == want)
  }

  @Test func pauseDaysAreClampedLikeThePause() {
    #expect(KoaAnalytics.pauseStartedProps(days: 3) == ["days": "3"])
    #expect(KoaAnalytics.pauseStartedProps(days: 0) == ["days": "1"])
    #expect(KoaAnalytics.pauseStartedProps(days: 40) == ["days": "\(KoaPause.maxDays)"])
  }

  @Test func endingEarlySaysHowMuchOfThePauseWasUsed() {
    let p = KoaPause(from: d("2026-11-01"), days: 5)  // 1…5/11
    #expect(KoaAnalytics.pauseEndedEarlyProps(p, today: d("2026-11-03")) == ["days_used": "2", "days_left": "3"])
    #expect(KoaAnalytics.pauseEndedEarlyProps(p, today: d("2026-11-01")) == ["days_used": "0", "days_left": "5"])
  }

  @Test func ledgerSendsEachKeyOnce() {
    var l = TelemetryLedger()
    let first = l.insert("first@today")
    let again = l.insert("first@today")
    let otherPlace = l.insert("first@room")
    #expect(first)
    #expect(!again)
    #expect(otherPlace)
  }

  @Test func ledgerKeepsTheNewestKeys() {
    var l = TelemetryLedger()
    for i in 0..<(TelemetryLedger.capacity + 5) { _ = l.insert("k\(i)") }
    #expect(l.keys.count == TelemetryLedger.capacity)
    #expect(l.keys.first == "k5")
    let newest = l.insert("k\(TelemetryLedger.capacity + 4)")
    #expect(!newest, "khoá mới nhất vẫn nhớ")
  }
}
