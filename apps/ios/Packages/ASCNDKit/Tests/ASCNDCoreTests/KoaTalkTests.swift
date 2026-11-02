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
    let beat = KoaTalk.Beat(topic: .trained, variant: 0)
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

  @Test func tiredFaceOfTheDayStaysItsOwn() {
    var r = KoaTalk.Rest()
    #expect(r.step(0.1, raw: nil, day: .meditate) { 9 } == nil)
    #expect(r.step(0.1, raw: nil, day: .surprised) { 9 } == .content)
  }

  @Test func newFacesChangeOnlyWhatTheyShould() {
    let f = KoaFlags.flags(.say2, .idle)
    #expect(f["mouthSay2"]?.truthy == true && f["mouthSmile"]?.truthy == false)
    #expect(KoaFlags.flags(.happy, .idle)["mouthSoft"] == nil, "bộ cờ của nét mặt cũ giữ nguyên")
    #expect(KoaPaint.plan(KoaRender.figure(.init())).count > 0)
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
