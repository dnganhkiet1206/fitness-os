import Foundation
import Testing

@testable import ASCNDCore

/// Ký ức và khí sắc của Koa: chỉ từ sự kiện thật, mỗi khoảnh khắc một lần, phai theo giờ thật.
@Suite struct KoaCompanionTests {
  typealias Memory = KoaCompanion.Memory
  typealias Facts = KoaCompanion.Facts

  @Test func nothingHappenedMeansNoMoment() {
    var m = Memory()
    let f = Facts(day: "2026-10-30", rank: 3)
    m.observe(f)
    #expect(m.moment(f) == nil)
    // hạng có sẵn lúc mới cài không phải chuyện để ăn mừng
    #expect(m.rank == 3)
  }

  @Test func eachMomentOnlyOnce() {
    var m = Memory()
    m.observe(Facts(day: "d1", rank: 1))
    let f = Facts(day: "d1", trainedToday: true, rank: 1)
    #expect(m.moment(f) == .workout)
    m.react(.workout, f, at: 100)
    #expect(m.moment(f) == nil)
    // hôm sau tập nữa thì là một lần mới
    #expect(m.moment(Facts(day: "d2", trainedToday: true, rank: 1)) == .workout)
  }

  /// Một buổi tập vừa lên hạng vừa có kỷ lục chỉ ăn mừng một lần, không ba lần liền.
  @Test func oneSessionOneCelebration() {
    var m = Memory()
    m.observe(Facts(day: "d1", rank: 1))
    let f = Facts(day: "d1", trainedToday: true, recordToday: true, rank: 2)
    #expect(m.moment(f) == .rankUp)
    m.react(.rankUp, f, at: 0)
    #expect(m.moment(f) == nil)
  }

  @Test func comebackOncePerReturnAndBeforeTheRest() {
    var m = Memory()
    m.observe(Facts(day: "d1", rank: 1))
    let f = Facts(day: "d9", trainedToday: true, comebackKey: "d1", rank: 1)
    #expect(m.moment(f) == .comeback)
    m.react(.comeback, f, at: 0)
    #expect(m.moment(f) == .workout)
    #expect(m.moment(Facts(day: "d9", comebackKey: "d1", rank: 1)) == nil)
    // đợt quay lại khác
    #expect(m.moment(Facts(day: "d20", comebackKey: "d15", rank: 1)) == .comeback)
  }

  /// Sau buổi tập, khí sắc còn đó khi quay lại phòng, rồi phai theo giờ thật. Vắng mặt chỉ
  /// làm phai về trung tính, không bao giờ âm.
  @Test func prideCarriesOverAndFades() {
    var m = Memory()
    let f = Facts(day: "d1", trainedToday: true)
    m.react(.record, f, at: 0)
    #expect(m.affect(f, at: 60).pride > 0.95)
    #expect(abs(m.affect(f, at: KoaCompanion.prideHalfLife).pride - 0.5) < 0.01)
    #expect(m.affect(f, at: 30 * 24 * 3600).pride >= 0)
    #expect(m.affect(f, at: 30 * 24 * 3600).pride < 0.01)
  }

  /// Vắng mặt, lỡ buổi không làm khí sắc xấu đi: năng lượng chỉ theo hôm nay.
  @Test func absenceIsNotPunished() {
    let away = Facts(day: "d9", comebackKey: "d1", mood: .calm)
    let here = Facts(day: "d9", mood: .calm)
    #expect(KoaCompanion.energy(away) == KoaCompanion.energy(here))
  }

  @Test func restDayIsCalmNotTired() {
    let f = Facts(day: "d1", restDay: true, mood: .rested)
    #expect(KoaCompanion.energy(f) == 0.55)
    #expect(Memory().affect(f, at: 0).calm)
  }

  @Test func factsReadFromRealGains() {
    let today = LocalDate("2026-10-30")!
    let days = [KoaGains.Day(date: today, personalRecord: true, overload: false, kind: .heavy)]
    let s = KoaGains.compute(days, week: .none, today: today)
    let f = Facts(gains: s, today: today, mood: .trained)
    #expect(f.trainedToday && f.recordToday && !f.restDay && f.comebackKey == nil)
    let old = KoaGains.compute(days, week: .none, today: today.adding(days: 5))
    let g = Facts(gains: old, today: today.adding(days: 5), mood: .calm)
    #expect(!g.trainedToday && !g.recordToday && g.comebackKey != nil)
  }

  @Test func spotOnlyResumesShortlyAfterLeaving() {
    var m = Memory()
    let shelf = KoaRoomMap.anchor("shelf")!.stand
    m.remember(shelf, visited: ["plant", "window", "board", "shelf"], at: 1000)
    #expect(m.resumeSpot(at: 1000 + 60) == shelf)
    #expect(m.resumeSpot(at: 1000 + KoaCompanion.spotMemory + 1) == nil)
    #expect(m.visited == ["window", "board", "shelf"])
    // chỗ cũ không còn hợp lệ (bản đồ phòng đổi): về bục
    m.x = 5
    #expect(m.resumeSpot(at: 1001) == nil)
    // ký ức đọc lại được
    let back = try? JSONDecoder().decode(Memory.self, from: JSONEncoder().encode(m))
    #expect(back == m)
  }
}

/// Đạo diễn dùng khí sắc: cùng hạt, khí sắc khác thì hành vi khác theo đúng hướng.
@Suite struct KoaUtilityTests {
  typealias Affect = KoaCompanion.Affect

  static func tally(_ affect: Affect, seed: UInt64, minutes: Double = 15, night: Bool = false) -> (visits: [String], walked: Double, rest: Double) {
    var d = KoaDirector.Director(seed: seed)
    var ctx = KoaDirector.Context()
    ctx.affect = affect
    ctx.night = night
    var visits: [String] = []
    var walked = 0.0, rest = 0.0, t = 0.0
    var px = d.walker.x, py = d.walker.y
    var last = ""
    while t < minutes * 60 {
      let f = d.step(1.0 / 30, ctx: ctx)
      walked += hypot(f.x - px, f.depth - py)
      px = f.x
      py = f.depth
      if f.behavior == "rest" { rest += 1.0 / 30 }
      if f.why != last, f.behavior == "explore" { visits.append(f.why) }
      last = f.why
      t += 1.0 / 30
    }
    return (visits, walked, rest)
  }

  static let seeds: [UInt64] = [1, 2, 3, 5, 8, 13, 21, 34]

  @Test func tiredKoaMovesLess() {
    var low = 0.0, high = 0.0, restLow = 0.0, restHigh = 0.0
    for s in Self.seeds {
      let a = Self.tally(Affect(energy: 0.3), seed: s)
      let b = Self.tally(Affect(energy: 0.9), seed: s)
      low += a.walked
      high += b.walked
      restLow += a.rest
      restHigh += b.rest
    }
    #expect(low < high * 0.8)
    #expect(restLow > restHigh)
  }

  @Test func proudKoaReadsTheBoardMore() {
    func board(_ a: Affect) -> Int {
      Self.seeds.reduce(0) { $0 + Self.tally(a, seed: $1).visits.filter { $0.contains("board") }.count }
    }
    #expect(board(Affect(energy: 0.7, pride: 0.9)) > board(Affect(energy: 0.7)))
  }

  /// Ngày nghỉ: phần lớn thời gian Koa ở phía cửa sổ, ít ra kệ tạ.
  @Test func restDayStaysByTheWindow() {
    let window = KoaRoomMap.anchor("window")!.stand, shelf = KoaRoomMap.anchor("shelf")!.stand
    var near = 0, gym = 0
    for s in Self.seeds {
      var d = KoaDirector.Director(seed: s)
      var ctx = KoaDirector.Context()
      ctx.affect = Affect(energy: 0.55, calm: true)
      for _ in 0..<(30 * 900) {
        let f = d.step(1.0 / 30, ctx: ctx)
        if f.plane == .floor, hypot(f.x - window.x, f.depth - window.d) < 30 { near += 1 }
        if f.plane == .floor, hypot(f.x - shelf.x, f.depth - shelf.d) < 30 { gym += 1 }
      }
    }
    #expect(near > gym * 2)
  }

  /// Không có vòng lặp cố định: chuỗi việc không tự lặp theo chu kỳ ngắn (30/10: từng là 6
  /// bước lặp mãi, xoay đúng thứ tự đồ vật).
  @Test func noMechanicalLoop() {
    for s in Self.seeds {
      var d = KoaDirector.Director(seed: s)
      let ctx = KoaDirector.Context()
      var seq: [String] = []
      for _ in 0..<(30 * 3600) {
        let f = d.step(1.0 / 30, ctx: ctx)
        if seq.last != f.why { seq.append(f.why) }
      }
      #expect(seq.count > 30)
      for period in 1...12 {
        let same = zip(seq, seq.dropFirst(period)).filter { $0 == $1 }.count
        #expect(Double(same) / Double(seq.count - period) < 0.7, "chu kỳ \(period), hạt \(s)")
      }
      #expect(Set(seq.filter { $0.contains("tò mò") }).count == KoaRoomMap.anchors.count)
    }
  }

  @Test func tiredKoaRestsByTheWindow() {
    var d = KoaDirector.Director(seed: 3)
    var ctx = KoaDirector.Context()
    ctx.affect = Affect(energy: 0.3)
    #expect(d.restSpot(ctx) == KoaRoomMap.anchor("window")!.stand)
    ctx.affect = Affect(energy: 0.7)
    #expect(d.restSpot(ctx) == KoaRoomMap.stageMark)
    ctx.affect = Affect(energy: 0.7, warmth: 0.8)
    #expect(d.restSpot(ctx) == KoaRoomMap.user)
    _ = d.step(0.1, ctx: ctx)
  }

  /// Không có sự kiện thật thì không bao giờ ăn mừng, dù khí sắc tự hào còn cao.
  @Test func noMomentNoCelebration() {
    for s in Self.seeds {
      var d = KoaDirector.Director(seed: s)
      var ctx = KoaDirector.Context()
      ctx.affect = Affect(energy: 0.9, pride: 1, warmth: 1)
      for _ in 0..<(60 * 30 * 10) {
        let f = d.step(1.0 / 30, ctx: ctx)
        #expect(f.behavior != "proud" && f.behavior != "welcome")
      }
    }
  }

  @Test func momentReportedExactlyOnceAndWaitsWhenHidden() {
    var d = KoaDirector.Director(seed: 4)
    var ctx = KoaDirector.Context()
    ctx.moment = .record
    ctx.quiet = true
    var fired = 0
    for _ in 0..<300 where d.step(1.0 / 30, ctx: ctx).reacted != nil { fired += 1 }
    #expect(fired == 0)
    ctx.quiet = false
    var kinds: Set<String> = []
    for _ in 0..<600 {
      let f = d.step(1.0 / 30, ctx: ctx)
      if f.reacted != nil { fired += 1 }
      kinds.insert(f.behavior)
    }
    #expect(fired == 1)
    #expect(kinds.contains("proud"))
  }

  @Test func comebackIsWarmNotACelebration() {
    var d = KoaDirector.Director(seed: 4)
    var ctx = KoaDirector.Context()
    ctx.moment = .comeback
    var gestures: Set<KoaGesture> = []
    var saw = false
    for _ in 0..<600 {
      let f = d.step(1.0 / 30, ctx: ctx)
      if f.behavior == "welcome" { saw = true }
      if let g = f.gesture { gestures.insert(g) }
      #expect(f.expression != .delighted)
    }
    #expect(saw)
    #expect(gestures.isEmpty)
  }

  @Test func touchedKoaStaysWithTheViewer() {
    var d = KoaDirector.Director(seed: 6)
    let ctx = KoaDirector.Context()
    for _ in 0..<60 { _ = d.step(1.0 / 30, ctx: ctx) }
    d.interacted()
    let x0 = d.walker.x
    for _ in 0..<(30 * 10) {
      if d.current == .rest || d.current == nil { d.interacted() }
      _ = d.step(1.0 / 30, ctx: ctx)
    }
    if d.current == .rest { #expect(abs(d.walker.x - x0) < 40) }
  }

  @Test func changedObjectGetsAGlance() {
    var d = KoaDirector.Director(seed: 6)
    let ctx = KoaDirector.Context()
    for _ in 0..<30 { _ = d.step(1.0 / 30, ctx: ctx) }
    d.request(.look("board"))
    var saw = false
    for _ in 0..<60 where d.step(1.0 / 30, ctx: ctx).why.contains("board") { saw = true }
    #expect(saw)
  }

  /// Nhịp nghỉ: nhanh sau khi đi, liên tục (không nhảy), và không đều.
  @Test func idleClockFollowsExertionAndNeverJumps() {
    var d = KoaDirector.Director(seed: 2)
    let ctx = KoaDirector.Context()
    var prev = 0.0
    var rates: [Double] = []
    d.request(.walkTo(KoaRoomMap.Spot(.stage, 120, 440)))
    for _ in 0..<(30 * 60) {
      let f = d.step(1.0 / 30, ctx: ctx)
      let r = (f.idleClock - prev) / (1000.0 / 30)
      #expect(r > 0.6 && r < 2.2)
      rates.append(r)
      prev = f.idleClock
    }
    #expect(Set(rates.map { ($0 * 100).rounded() }).count > 10)
  }

  /// Giật tai không đều: khoảng cách giữa các lần khác nhau.
  @Test func earFlicksAreIrregular() {
    var d = KoaDirector.Director(seed: 9)
    var ctx = KoaDirector.Context()
    ctx.canWalk = false
    var starts: [Double] = []
    var was = false, t = 0.0
    for _ in 0..<(60 * 60 * 3) {
      let p = d.step(1.0 / 60, ctx: ctx).walk
      let on = abs(p?.earLeft ?? 0) + abs(p?.earRight ?? 0) > 0.3
      if on, !was { starts.append(t) }
      was = on
      t += 1.0 / 60
    }
    #expect(starts.count >= 8)
    let gaps = zip(starts.dropFirst(), starts).map { $0 - $1 }
    #expect((gaps.max() ?? 0) - (gaps.min() ?? 0) > 4)
  }

  @Test func earsReflectAffect() {
    func ear(_ a: Affect) -> Double {
      var d = KoaDirector.Director(seed: 1)
      var ctx = KoaDirector.Context()
      ctx.affect = a
      ctx.canWalk = false
      return d.step(1.0 / 60, ctx: ctx).walk?.earLeft ?? 0
    }
    #expect(ear(Affect(energy: 0.3)) > 0)
    #expect(ear(Affect(energy: 0.7, pride: 1)) < 0)
    #expect(ear(Affect(energy: 0.7)) == 0)
  }

  /// Chạy dài: mọi hàng đợi trong đạo diễn có chặn, không lớn dần.
  @Test func longRunIsBounded() {
    var d = KoaDirector.Director(seed: 11)
    var ctx = KoaDirector.Context()
    ctx.affect = Affect(energy: 0.9, pride: 0.6)
    for _ in 0..<(30 * 3600 * 2) { _ = d.step(1.0 / 30, ctx: ctx) }
    #expect(d.history.count <= 8 && d.visited.count <= 6)
    #expect(KoaRoomMap.valid(d.spot()))
  }
}

/// Tới giờ ngủ / thiền: Koa không ngồi tại chỗ giữa sàn (Kiệt 30/10, Koa ngồi sau chân kệ).
@Suite struct KoaSettleTests {
  @Test(arguments: [UInt64(1), 2, 3, 5, 8]) func walksBackToTheStageBeforeSitting(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    d.place(KoaRoomMap.anchor("shelf")!.stand)
    var ctx = KoaDirector.Context()
    ctx.canWalk = false
    ctx.settle = true
    var moved = false, settledAt: Double?, t = 0.0
    while t < 30, settledAt == nil {
      let f = d.step(1.0 / 60, ctx: ctx)
      if f.moving { moved = true }
      if f.settled { settledAt = t }
      t += 1.0 / 60
    }
    #expect(moved)
    #expect(settledAt != nil)
    #expect(d.plane == .stage)
    // ở yên đó, ngồi rồi không tự đi đâu
    for _ in 0..<(60 * 120) { #expect(d.step(1.0 / 60, ctx: ctx).settled) }
  }

  @Test func alreadyHomeSitsAtOnce() {
    var d = KoaDirector.Director(seed: 1)
    var ctx = KoaDirector.Context()
    ctx.settle = true
    ctx.canWalk = false
    #expect(d.step(1.0 / 60, ctx: ctx).settled)
  }

  @Test func hiddenStageWaits() {
    var d = KoaDirector.Director(seed: 1)
    d.place(KoaRoomMap.anchor("shelf")!.stand)
    var ctx = KoaDirector.Context()
    ctx.settle = true
    ctx.canWalk = false
    ctx.quiet = true
    for _ in 0..<600 { #expect(!d.step(1.0 / 60, ctx: ctx).moving) }
    #expect(d.plane == .floor)
  }

  /// Bị gọi về giữa đường đang đi tới đồ vật: tới điểm an toàn thì đổi hướng về bục.
  @Test func interruptsAnErrandSafely() {
    var d = KoaDirector.Director(seed: 4)
    var ctx = KoaDirector.Context()
    d.request(.walkTo(KoaRoomMap.anchor("plant")!.stand))
    for _ in 0..<150 { _ = d.step(1.0 / 60, ctx: ctx) }
    ctx.settle = true
    ctx.canWalk = false
    var ok = false
    for _ in 0..<(60 * 30) where d.step(1.0 / 60, ctx: ctx).settled { ok = true }
    #expect(ok)
  }
}

/// Phòng ngủ gác mái dựng được ở cả hai giao diện, không tham chiếu dải màu thiếu.
@Suite struct KoaBedroomTests {
  @Test(arguments: [false, true]) func layersPlan(light: Bool) {
    for (kids, least) in [
      (KoaBedroom.back(light: light), 40), (KoaBedroom.cover(light: light), 15), (KoaBedroom.moonlight(light: light), 2),
      (KoaBedroom.shade(light: light), 1),
    ] {
      let plan = KoaPaint.plan(KoaRender.Element("Svg", kids: kids))
      #expect(plan.count >= least)
    }
  }

  @Test func coverBottomInsideScene() {
    #expect(KoaBedroom.coverBottom < StudioScene.sceneBottom)
    #expect(KoaBedroom.head.x > 22 && KoaBedroom.head.x < 140)
  }
}

/// Tới giờ ngủ Koa đi tới cửa phòng ngủ, cửa mở khi tới gần.
@Suite struct KoaBedtimeTests {
  @Test(arguments: [UInt64(1), 2, 3, 5]) func walksToTheDoor(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    var ctx = KoaDirector.Context()
    ctx.canWalk = false
    ctx.settle = true
    ctx.bedtime = true
    var opened = false, arrived = false
    for _ in 0..<(60 * 40) {
      let f = d.step(1.0 / 60, ctx: ctx)
      if f.doorOpen { opened = true }
      if f.settled {
        arrived = true
        break
      }
    }
    #expect(arrived && opened)
    #expect(d.plane == .floor)
    #expect(hypot(d.walker.x - KoaRoomMap.door.x, d.walker.y - KoaRoomMap.door.d) <= 12)
  }

  @Test func doorSpotIsWalkable() {
    #expect(KoaRoomMap.valid(KoaRoomMap.door))
  }

  @Test(arguments: [false, true]) func doorPlans(light: Bool) {
    for open in [false, true] {
      #expect(!KoaPaint.plan(KoaRender.Element("Svg", kids: KoaBedroom.door(open: open, light: light))).isEmpty)
    }
  }
}
