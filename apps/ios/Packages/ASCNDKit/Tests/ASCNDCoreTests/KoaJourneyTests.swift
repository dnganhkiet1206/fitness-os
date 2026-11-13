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

  /// 20 tuần tập đủ lịch, mỗi tuần một kỷ lục vào thứ Tư.
  private func longRun() -> [KoaGains.Day] {
    let monday = d("2026-01-05")
    return (0..<20).flatMap { w in
      [0, 2, 4].map { KoaGains.Day(date: monday.adding(days: w * 7 + $0), personalRecord: $0 == 2) }
    }
  }

  @Test func tierUpsAreSmallMilestonesBetweenRanks() {
    let days = longRun()
    let today = d("2026-05-24")
    let m = KoaJourney.moments(days, week: week, today: today)
    let total = KoaGains.compute(days, week: week, today: today).points
    let now = KoaGains.tier(total)
    let tiers = m.filter { $0.kind == .tierUp }
    #expect(!tiers.isEmpty && tiers.allSatisfy { !$0.major }, "lên bậc là mốc nhỏ")
    #expect(tiers.allSatisfy { KoaGains.tier(step: $0.value).tier > 1 }, "bậc I là lúc lên hạng, không thêm mốc")
    #expect(m.filter { $0.kind == .rankUp }.map(\.value).sorted() == Array(1...now.rank), "mốc lên hạng giữ nguyên")
    #expect(tiers.count + now.rank == now.step, "mỗi bậc đã đạt đúng một mốc")
    #expect(Set(m.map(\.id)).count == m.count)
    #expect(m.contains { $0.id == "tier:2" }, "Gym Rat II")
  }

  @Test func stepsCarryTheStretchBehindThem() {
    let days = longRun()
    let today = d("2026-05-24")
    let steps = KoaJourney.steps(days, week: week, today: today)
    #expect(steps.map(\.step) == Array(1...steps.count), "cũ → mới, không sót bậc")
    #expect(steps.reduce(0) { $0 + $1.sessions } <= 60 && steps.reduce(0) { $0 + $1.records } <= 20)
    // Gym Rat II (110 Gains): tới sau Gym Rat I, chặng có buổi thật.
    let two = steps[1]
    #expect(two.rank == 1 && two.tier == 2 && two.total >= 110 && two.sessions > 0)
    #expect(two.date > steps[0].date)
    // Thêm buổi về sau không đổi các bậc đã đạt.
    let later = KoaJourney.steps(days + [KoaGains.Day(date: d("2026-05-25"), personalRecord: false)], week: week, today: d("2026-05-25"))
    #expect(Array(later.prefix(steps.count)) == steps)
  }

  @Test func aTierUpIsMentionedForOneDayOnly() {
    let days = longRun()
    let m = KoaJourney.moments(days, week: week, today: d("2026-05-24"))
    let tier = m.first { $0.kind == .tierUp }!
    let only = [tier]
    #expect(KoaMomentFeed.next(only, seen: [], today: tier.date) == tier)
    #expect(KoaMomentFeed.next(only, seen: [], today: tier.date.adding(days: 1)) == tier)
    #expect(KoaMomentFeed.next(only, seen: [], today: tier.date.adding(days: 2)) == nil)
    #expect(KoaMomentFeed.next(only, seen: [tier.id], today: tier.date) == nil)
  }

  // MARK: Mốc ghi đều (10/11)

  @Test func loggingMilestonesCountDaysNotStreaks() {
    // ghi cách ngày: 10 ngày ghi trong 19 ngày
    let logged = Set((0..<10).map { d("2026-10-01").adding(days: $0 * 2) })
    let m = KoaJourney.logMoments(logged, today: d("2026-10-31"))
    #expect(m.map(\.id) == ["log:3", "log:7"])
    #expect(m[0].date == d("2026-10-05") && m[1].date == d("2026-10-13"), "ngày chạm mốc là ngày ghi thứ 3 và thứ 7")
    #expect(!m[0].major && m[1].major, "3 ngày là mốc nhỏ, 7 ngày là mốc lớn")
    // hôm nay chưa tới ngày ghi thứ 7 thì chưa có mốc; ngày ghi ở tương lai không tính
    #expect(KoaJourney.logMoments(logged, today: d("2026-10-12")).map(\.id) == ["log:3"])
    #expect(KoaJourney.logMoments([], today: d("2026-10-12")).isEmpty)
    // ghi thêm về sau không dời mốc đã đạt
    let more = logged.union([d("2026-10-30")])
    #expect(Array(KoaJourney.logMoments(more, today: d("2026-10-31")).prefix(2)) == m)
  }

  @Test func loggingMilestonesSitInTheJourneyWithoutTouchingTraining() {
    let days = sessions(["2026-10-05", "2026-10-07", "2026-10-09"])
    let logged = Set((0..<7).map { d("2026-10-03").adding(days: $0) })
    let plain = KoaJourney.moments(days, week: week, today: d("2026-10-10"))
    let all = KoaJourney.moments(days, week: week, logged: logged, today: d("2026-10-10"))
    #expect(all.filter { $0.kind != .logDays } == plain, "mốc tập không đổi")
    #expect(all.filter { $0.kind == .logDays }.map(\.value) == [7, 3])
    #expect(Set(all.map(\.id)).count == all.count)
    // người chỉ ghi, chưa tập buổi nào, vẫn có hành trình
    #expect(KoaJourney.moments([], week: week, logged: logged, today: d("2026-10-10")).map(\.id) == ["log:7", "log:3"])
  }

  @Test func logDaysNeedARealEntryThatDay() {
    func row(_ date: String, kcal: Double? = nil, water: Double? = nil, sleep: Double? = nil) -> JSONValue {
      .object([
        "date": .string(date), "kcal": kcal.map(JSONValue.number) ?? .null, "water_ml": water.map(JSONValue.number) ?? .null,
        "sleep_duration_min": sleep.map(JSONValue.number) ?? .null, "steps": .number(9000),
      ])
    }
    let rows = [
      row("2026-10-01", kcal: 1800, water: 0, sleep: 0), row("2026-10-02", kcal: 0, water: 500),
      row("2026-10-03", sleep: 420), row("2026-10-04", kcal: 0, water: 0, sleep: 0), row("bad", kcal: 500),
    ]
    #expect(KoaLogDaysSync.days(rows) == [d("2026-10-01"), d("2026-10-02"), d("2026-10-03")], "chỉ bước chân thì không tính")
    let q = KoaLogDaysSync.query(userId: "u1")
    #expect(q.table == "daily_logs" && q.limit == KoaLogDaysSync.limit)
  }

  // MARK: Nhịp ghi 30 ngày (12/11)

  @Test func logKindsSplitPerDayAndSkipStepsOnly() {
    let rows: [JSONValue] = [
      .object(["date": .string("2026-10-01"), "kcal": .number(1800), "water_ml": .number(500), "sleep_duration_min": .null]),
      .object(["date": .string("2026-10-02"), "kcal": .number(0), "water_ml": .null, "sleep_duration_min": .number(420)]),
      .object(["date": .string("2026-10-03"), "kcal": .number(0), "water_ml": .number(0), "steps": .number(9000)]),
    ]
    let k = KoaLogDaysSync.kinds(rows)
    #expect(k == [d("2026-10-01"): [.meal, .water], d("2026-10-02"): [.sleep]])
    #expect(KoaLogDaysSync.days(rows) == Set(k.keys))
  }

  @Test func logRhythmCountsTheLast30DaysAndComparesWithTheOnesBefore() {
    let today = d("2026-10-31")
    var kinds: [LocalDate: Set<KoaLogDaysSync.Kind>] = [:]
    // 30 ngày này: ghi cách ngày, 15 ngày; bữa mỗi lần, nước 5 lần, ngủ 3 lần
    for i in 0..<15 {
      var k: Set<KoaLogDaysSync.Kind> = [.meal]
      if i < 5 { k.insert(.water) }
      if i < 3 { k.insert(.sleep) }
      kinds[today.adding(days: -i * 2)] = k
    }
    // 30 ngày trước đó: 9 ngày; cũ hơn nữa và ngày tương lai không tính
    for i in 0..<9 { kinds[today.adding(days: -30 - i)] = [.water] }
    kinds[today.adding(days: -70)] = [.meal]
    kinds[today.adding(days: 1)] = [.meal]
    let s = KoaLogRhythm.state(kinds, today: today)
    #expect(s.days.count == KoaLogRhythm.window)
    #expect(s.days.last == true, "ô cuối là hôm nay")
    #expect(s.logged == 15 && s.previous == 9 && s.change == 6)
    #expect(s.meals == 15 && s.water == 5 && s.sleep == 3)
    // bỏ một ngày chỉ bớt 1, không có gì "gãy"
    var gap = kinds
    gap[today] = nil
    #expect(KoaLogRhythm.state(gap, today: today).logged == 14)
    #expect(KoaLogRhythm.state([:], today: today).logged == 0)
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
