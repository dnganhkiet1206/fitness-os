import Testing

@testable import ASCNDCore

@Suite struct KoaJourneyTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }
  private let week = KoaGains.Week(planned: [0, 2, 4], rest: [1, 3, 5, 6])

  private func sessions(_ dates: [String], pr: Set<String> = []) -> [KoaGains.Day] {
    dates.map { KoaGains.Day(date: d($0), personalRecord: pr.contains($0)) }
  }

  @Test func milestonesComeFromRealSessionsOnly() {
    let days = sessions(["2026-10-05", "2026-10-07", "2026-10-09"], pr: ["2026-10-07"])
    let m = KoaJourney.moments(days, week: week, today: d("2026-10-10"))
    #expect(m.contains { $0.id == "first" && $0.date == d("2026-10-05") })
    #expect(m.contains { $0.id == "record:2026-10-07" })
    #expect(m.contains { $0.kind == .firstFullWeek && $0.date == d("2026-10-09") })
    #expect(m.contains { $0.id == "rank:1" }, "40 Gains đầu tiên lên hạng 1")
    #expect(Set(m.map(\.id)).count == m.count, "khoá không trùng")
    #expect(m.first?.date == d("2026-10-09"), "mới nhất ở trên")
  }

  @Test func recomputeIsStableSoNothingIsCountedTwice() {
    let days = sessions(["2026-10-05", "2026-10-07"])
    let a = KoaJourney.moments(days, week: week, today: d("2026-10-10"))
    let b = KoaJourney.moments(days + days, week: week, today: d("2026-10-10"))
    #expect(a == b, "gửi lại cùng buổi không thêm mốc")
  }

  @Test func comebackAfterAWeekOffIsNamedNotPunished() {
    let days = sessions(["2026-10-01", "2026-10-12"])
    let m = KoaJourney.moments(days, week: week, today: d("2026-10-12"))
    #expect(m.contains { $0.kind == .comeback && $0.value == 10 })
  }

  @Test func walksAreNotSessions() {
    let days = [KoaGains.Day(date: d("2026-10-05"), personalRecord: false, kind: .walk)]
    #expect(!KoaJourney.moments(days, week: week, today: d("2026-10-06")).contains { $0.kind == .firstSession })
  }

  @Test func monthSummaryCountsRealDays() {
    let days = sessions(["2026-10-05", "2026-10-05", "2026-10-07", "2026-11-01"], pr: ["2026-10-07"])
    let m = KoaJourney.moments(days, week: week, today: d("2026-11-02"))
    let oct = KoaJourney.month(m, days: days, year: 2026, month: 10)
    #expect(oct.sessions == 2 && oct.records == 1)
  }

  @Test func feedPrefersFreshMajorAndNeverRepeats() {
    let days = sessions(["2026-10-05", "2026-10-07", "2026-10-09"], pr: ["2026-10-09"])
    let m = KoaJourney.moments(days, week: week, today: d("2026-10-09"))
    let first = KoaMomentFeed.next(m, seen: [], today: d("2026-10-09"))
    #expect(first?.major == true)
    var seen: Set<String> = []
    var shown = 0
    while let n = KoaMomentFeed.next(m, seen: seen, today: d("2026-10-09")) {
      seen.insert(n.id)
      shown += 1
    }
    #expect(shown <= m.count)
    #expect(KoaMomentFeed.next(m, seen: [], today: d("2026-10-20")) == nil, "mốc cũ không nhắc lại")
  }
}

@Suite struct KoaMilestoneTalkTests {
  @Test func koaGreetsThenTalksAboutTheNewMilestoneFirst() {
    var f = KoaCompanion.Facts(day: "2026-11-02", trainedToday: true)
    f.milestone = true
    let log = KoaTalk.Log(day: "2026-11-02")
    #expect(KoaTalk.pick(f, log: log, greeting: true) == .greet)
    #expect(KoaTalk.pick(f, log: KoaTalk.Log(day: "2026-11-02", said: [.greet]), greeting: true) == .milestone)
    f.milestone = false
    #expect(KoaTalk.pick(f, log: log, greeting: false) == .trained)
  }
}

@Suite struct KoaRhythmTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  @Test func rhythmCountsTheWindowAndNamesRestDays() {
    let week = KoaGains.Week(planned: [0, 2, 4], rest: [5, 6])
    let days = ["2026-10-06", "2026-10-20", "2026-10-30", "2026-09-10"].map { KoaGains.Day(date: d($0), personalRecord: false) }
    let s = KoaRhythm.state(days, week: week, paused: { $0 == d("2026-10-28") }, today: d("2026-11-02"))
    #expect(s.days.count == 30)
    #expect(s.sessions == 3, "cửa sổ từ 04/10 tới hôm nay")
    #expect(s.previous == 1, "10/09 thuộc 30 ngày trước đó")
    #expect(s.days.contains(.rest) && s.days.contains(.paused))
    #expect(s.days.last == .open)
  }
}
