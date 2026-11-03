import Testing

@testable import ASCNDCore

@Suite struct KoaTalkTests {
  private func facts(_ mood: KoaMood.Reason = .calm, trained: Bool = false, record: Bool = false) -> KoaCompanion.Facts {
    KoaCompanion.Facts(day: "2026-11-01", trainedToday: trained, recordToday: record, mood: mood)
  }

  @Test func saysOnlyWhatReallyHappened() {
    let log = KoaTalk.Log(day: "2026-11-01")
    #expect(KoaTalk.pick(facts(), log: log, greeting: false) == .calm)
    #expect(KoaTalk.pick(facts(trained: true, record: true), log: log, greeting: false) == .record)
    #expect(KoaTalk.pick(facts(trained: true), log: log, greeting: false) == .trained)
    #expect(KoaTalk.pick(facts(.shortSleep), log: log, greeting: false) == .shortSleep)
    #expect(KoaTalk.pick(facts(.overate), log: log, greeting: true) == .greet)
  }

  @Test func neverRepeatsAStoryTheSameDay() {
    var log = KoaTalk.Log(day: "2026-11-01")
    var heard: [KoaTalk.Topic] = []
    while let t = KoaTalk.pick(facts(.fed, trained: true), log: log, greeting: true) {
      heard.append(t)
      log.said.append(t)
    }
    #expect(heard == [.greet, .trained, .fed, .calm])
    #expect(log.today("2026-11-02").said.isEmpty)
  }

  @Test func everyFaceMatchesItsMood() {
    for t in KoaTalk.Topic.allCases {
      let f = KoaTalk.face(t)
      #expect(KoaTalk.variants(t) >= 1)
      // không chủ đề nào khép lại bằng mặt cười lớn đứng yên, trừ lúc bị chọc (rất ngắn)
      if t != .poke { #expect(f.settle != .grin && f.settle != .delighted, "\(t)") }
    }
    #expect(![.sad, .angry].contains(KoaTalk.face(.emptyLate).peak), "không trách người dùng")
    #expect(!KoaTalk.face(.shortSleep).flaps)
  }

  @Test func speechPeaksThenTalksThenSettles() {
    let beat = KoaTalk.Beat(topic: .trained, variant: 0, line: "Hôm nay tập tốt lắm, mai tiếp nhé")
    #expect(beat.expression(at: 0.2) == .grin)
    let mid = Set(stride(from: 0.8, to: 2.6, by: 0.05).map(beat.expression(at:)))
    #expect(mid.contains(.say1) && mid.contains(.say2) && mid.contains(.say3) && mid.contains(.content))
    #expect(beat.expression(at: 3.5) == .content)
  }

  @Test func speaksRarely() {
    var s = KoaTalk.Schedule(openedAt: 100)
    #expect(!s.due(at: 101))
    #expect(s.due(at: 102))
    s.spoke(at: 102, seconds: 3.6)
    #expect(!s.due(at: 120))
    #expect(s.due(at: 132))
    s.spoke(at: 132, seconds: 3.6)
    s.spoke(at: 170, seconds: 3.6)
    #expect(!s.due(at: 10_000))
  }

  @Test func bigSmileNeverStaysLikeASticker() {
    var r = KoaTalk.Rest(firstSmile: 1000)
    var last: KoaFlags.Expression?
    for _ in 0..<(6 * 30) { last = r.step(1.0 / 30, raw: .grin, day: .happy) { 10 } }
    #expect(last == .content)
    var quiet = KoaTalk.Rest(firstSmile: 2)
    var seen: Set<KoaFlags.Expression> = []
    for _ in 0..<(30 * 30) {
      if let f = quiet.step(1.0 / 30, raw: nil, day: .grin, gap: { 9 }) { seen.insert(f) }
    }
    #expect(seen == [.content, .warm], "có mỉm, nhưng không giữ mặt cười")
  }

  @Test func closedEyesAreNeverForcedToBlink() {
    var r = KoaTalk.Rest(firstSmile: 1)
    var blinks = 0
    for _ in 0..<(30 * 40) {
      _ = r.step(1.0 / 30, raw: nil, day: .happy) { 5 }
      if r.blinkDue { blinks += 1 }
    }
    #expect(blinks == 0, "mỉm nhắm mắt rồi về mặt nghỉ: không ép chớp")
    var s = KoaTalk.Rest(firstSmile: 1000)
    _ = s.step(0.1, raw: .surprised, day: .happy) { 9 }
    _ = s.step(KoaTalk.Rest.minHold + 0.1, raw: .confident, day: .happy) { 9 }
    #expect(s.blinkDue, "hai mặt mở mắt thì vẫn chớp để giấu bước đổi")
  }

  @Test func tiredFaceOfTheDayStaysItsOwn() {
    var r = KoaTalk.Rest()
    #expect(r.step(0.1, raw: nil, day: .meditate) { 9 } == nil)
    #expect(r.step(KoaTalk.Rest.minHold + 0.1, raw: nil, day: .surprised) { 9 } == .content)
  }

  /// Hành vi đổi mặt dồn dập thì mặt đang hiện vẫn ở lại đủ lâu để đọc.
  @Test func facesStayLongEnoughToRead() {
    var r = KoaTalk.Rest(firstSmile: 1000)
    #expect(r.step(0.1, raw: .surprised, day: .happy) { 9 } == .surprised)
    #expect(r.step(0.5, raw: .confident, day: .happy) { 9 } == .surprised)
    #expect(r.step(0.5, raw: .happy, day: .happy) { 9 } == .surprised)
    #expect(r.step(1, raw: .happy, day: .happy) { 9 } == .happy)
  }

  /// Nói xong không quay lại mặt đỉnh cũ: đồng hồ vẫn chạy trong lúc nói.
  @Test func oldPeakDoesNotReturnAfterSpeech() {
    var r = KoaTalk.Rest(firstSmile: 1000)
    _ = r.step(0.1, raw: .delighted, day: .happy) { 9 }
    r.speaking(KoaTalk.Rest.softHold, raw: .delighted, face: .content)
    #expect(r.step(0.1, raw: .delighted, day: .happy) { 9 } == .content)
  }

  @Test func newFacesChangeOnlyWhatTheyShould() {
    let f = KoaFlags.flags(.say2, .idle)
    #expect(f["mouthSay2"]?.truthy == true && f["mouthSmile"]?.truthy == false)
    #expect(KoaFlags.flags(.happy, .idle)["mouthSoft"] == nil, "bộ cờ của nét mặt cũ giữ nguyên")
    #expect(KoaPaint.plan(KoaRender.figure(.init())).count > 0)
  }
}

@Suite struct KoaMotesTests {
  /// Bụi không có hướng chung: như tuyết là lỗi 02/11.
  @Test func dustDriftsEveryWay() {
    var quadrants = Set<Int>(), meanY = 0.0, n = 0.0
    var field = KoaMotes(count: 48, x: 0...390, y: -160...470)
    for f in 0..<600 {
      let t = Double(f) / 30
      let before = field.motes
      field.step(1.0 / 30, t: t)
      for (a, b) in zip(before, field.motes) where abs(b.x - a.x) < 2 && abs(b.y - a.y) < 2 {
        quadrants.insert((b.x > a.x ? 1 : 0) + (b.y > a.y ? 2 : 0))
        meanY += b.y - a.y
        n += 1
      }
      #expect(field.motes.allSatisfy { (0...390).contains($0.x) })
    }
    #expect(quadrants.count == 4, "đủ bốn hướng")
    #expect(abs(meanY / n) * 30 < 3, "trung bình không trôi một chiều")
  }

  @Test func dustFadesInAndOut() {
    var field = KoaMotes(count: 8, x: 0...390, y: 0...400)
    for _ in 0..<3000 { field.step(1.0 / 30, t: 0) }
    #expect(field.motes.count == 8 && field.motes.allSatisfy { (0...1).contains($0.fade) })
    field.resize(0)
    #expect(field.motes.isEmpty)
  }

  @Test func roomFollowsTheClock() {
    #expect(KoaDaylight.isDay(hour: 6) && KoaDaylight.isDay(hour: 17))
    #expect(!KoaDaylight.isDay(hour: 18) && !KoaDaylight.isDay(hour: 5))
  }
}

@Suite struct GainsBreakdownTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  /// Màn tổng kết đọc phần cộng từ chính phép tính: ngày đổi lịch được tính là buổi trong lịch.
  @Test func breakdownMatchesComputeAndHonoursOverrides() {
    let mon = d("2026-11-02")
    let override = DayOverride(date: mon, templateId: "t", isRest: false)
    let week = KoaGains.Week(planned: [], rest: [], overrides: [mon: override])
    let days = [KoaGains.Day(date: mon, personalRecord: true)]
    let b = KoaGains.breakdown(days, week: week, on: mon)
    #expect(b?.planned == true && b?.personalRecord == true)
    #expect(b?.points == KoaGains.compute(days, week: week, today: mon).points)
    #expect(KoaGains.breakdown(days, week: week, on: d("2026-11-03")) == nil)
  }

  @Test func fullWeekBonusIsReportedOnTheDayItLands() {
    let week = KoaGains.Week(planned: [0, 2, 4], rest: [])
    let days = ["2026-11-02", "2026-11-04", "2026-11-06"].map { KoaGains.Day(date: d($0), personalRecord: false) }
    #expect(KoaGains.breakdown(days, week: week, on: d("2026-11-04"))?.fullWeek == false)
    #expect(KoaGains.breakdown(days, week: week, on: d("2026-11-06"))?.fullWeek == true)
  }
}

@Suite struct FirstSessionGainsTests {
  private let day = LocalDate("2026-11-02")!

  @Test func secondSessionRecordEarnsNothing() {
    let morning = KoaGains.Day(date: day, personalRecord: false, at: EpochMillis(1000))
    let evening = KoaGains.Day(date: day, personalRecord: true, at: EpochMillis(9000))
    let days = KoaGains.firstSessionBonus([evening, morning])
    #expect(days.allSatisfy { !$0.personalRecord })
    let one = KoaGains.compute([morning], week: .none, today: day)
    let two = KoaGains.compute(days, week: .none, today: day)
    #expect(two.points == one.points)
  }

  @Test func firstSessionKeepsItsRecord() {
    let morning = KoaGains.Day(date: day, personalRecord: true, at: EpochMillis(1000))
    let evening = KoaGains.Day(date: day, personalRecord: false, at: EpochMillis(9000))
    #expect(KoaGains.firstSessionBonus([evening, morning]).contains { $0.personalRecord })
  }

  @Test func morningWalkDoesNotTakeTheLiftersSlot() {
    let walk = KoaGains.Day(date: day, personalRecord: false, kind: .walk, at: EpochMillis(1000))
    let lift = KoaGains.Day(date: day, personalRecord: true, at: EpochMillis(9000))
    #expect(KoaGains.firstSessionBonus([walk, lift]).contains { $0.personalRecord })
    #expect(!KoaGains.hasEarlierSession([walk, lift], on: day, before: EpochMillis(9000)))
    #expect(KoaGains.hasEarlierSession([walk, lift], on: day, before: EpochMillis(9001)))
  }
}

@Suite struct KoaSquashTests {
  @Test func stretchesInTheAirSquashesOnLandingThenSettles() {
    var s = KoaSquash()
    for _ in 0..<20 { s.step(1.0 / 60, hop: 12) }
    #expect(s.y > 1.05 && s.x < 1)
    s.step(1.0 / 60, hop: 0)
    #expect(s.y < 0.92 && s.x > 1.05, "bẹp xuống lúc chạm đất")
    for _ in 0..<90 { s.step(1.0 / 60, hop: 0) }
    #expect(abs(s.y - 1) < 0.005)
  }
}

@Suite struct KoaCameraTests {
  @Test func cameraStaysStillWhileKoaStandsStill() {
    var c = KoaParallax.Camera()
    var pans: [Double] = []
    for _ in 0..<(60 * 20) {
      c.step(1.0 / 60, koaX: StudioScene.stageMark.x)
      pans.append(c.shot().pan)
    }
    #expect((pans.max() ?? 0) - (pans.min() ?? 0) < 0.001, "Koa đứng yên thì máy không tự lắc")
  }

  @Test func revealSweepsInFromTheSide() {
    var c = KoaParallax.Camera()
    c.step(1.0 / 60, koaX: StudioScene.stageMark.x)
    c.reveal()
    c.step(1.0 / 60, koaX: StudioScene.stageMark.x)
    #expect(c.shot().pan < -0.8)
    for _ in 0..<(60 * 4) { c.step(1.0 / 60, koaX: StudioScene.stageMark.x) }
    #expect(abs(c.shot().pan) < 0.02)
  }
}
