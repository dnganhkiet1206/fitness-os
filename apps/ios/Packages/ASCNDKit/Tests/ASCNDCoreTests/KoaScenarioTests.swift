@testable import ASCNDCore
import Foundation
import Testing

/// 10 kịch bản của Koa trong phòng (30/10), chạy tất định trên `KoaDirector` với nhiều hạt:
/// mở phòng → chào → đi → khám phá → tương tác → hoàn thành buổi tập → phản ứng → nền /
/// trở lại → Giảm chuyển động → chạy dài. Phần app (đồng hồ, `scenePhase`) kiểm trên simulator.
struct KoaScenarioTests {
  static let seeds: [UInt64] = [1, 2, 3, 5, 8, 13, 21, 34]
  static let dt = 1.0 / 60

  /// Chạy `seconds` giây, gọi `each` mỗi khung.
  static func run(
    _ d: inout KoaDirector.Director, _ seconds: Double, ctx: KoaDirector.Context = .init(),
    each: ((KoaDirector.Frame) -> Void)? = nil
  ) {
    for _ in 0..<Int(seconds / dt) {
      let f = d.step(dt, ctx: ctx)
      each?(f)
    }
  }

  // 1 + 2. Mở phòng: việc đầu tiên là chào, Koa tới chỗ gần người xem, nhìn người xem.
  @Test(arguments: seeds) func opensAndGreets(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    d.request(.greet)
    let first = d.step(Self.dt, ctx: .init())
    #expect(first.behavior == "greet")
    Self.run(&d, 5)
    #expect(hypot(d.walker.x - KoaRoomMap.user.x, d.walker.y - KoaRoomMap.user.d) < 1)
    #expect(d.plane == .stage)
    if case .user = d.gaze.target {} else { Issue.record("chào mà không nhìn người xem") }
  }

  // 3. Đi tới các điểm: bục → sàn → bục, tới nơi, mọi khung hợp lệ.
  @Test(arguments: seeds) func walksToPoints(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    let points = [
      KoaRoomMap.Spot(.stage, 130, 440), KoaRoomMap.Spot(.floor, 170, 374), KoaRoomMap.Spot(.floor, 280, 372),
      KoaRoomMap.Spot(.stage, 260, 430),
    ]
    for p in points {
      d.request(.walkTo(p))
      var bad = 0
      Self.run(&d, 14) { f in
        if f.x.isNaN || f.depth.isNaN { bad += 1 }
      }
      #expect(bad == 0)
      #expect(d.plane == p.plane)
      #expect(hypot(d.walker.x - p.x, d.walker.y - p.d) < 40, "\(p) → \(d.walker.x),\(d.walker.y)")
    }
  }

  // 4. Khám phá: qua đủ các hạt, mọi đồ vật đều được ghé; không ghé một món hai lần liền.
  @Test func exploresEveryObject() {
    var seen = Set<String>()
    for seed in Self.seeds {
      var d = KoaDirector.Director(seed: seed)
      var last = ""
      var visits: [String] = []
      Self.run(&d, 600) { f in
        if f.behavior == "explore", last != "explore" { visits.append(f.why) }
        last = f.behavior
      }
      seen.formUnion(visits.compactMap { $0.split(separator: " ").last.map(String.init) })
      for (a, b) in zip(visits, visits.dropFirst()) { #expect(a != b) }
    }
    #expect(seen == Set(KoaRoomMap.anchors.map(\.name)))
  }

  // 5. Tương tác: chạm khi Koa đang nghỉ → Koa làm theo ngay ở điểm an toàn đầu tiên.
  @Test(arguments: seeds) func respondsToTouch(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    Self.run(&d, 30)
    d.request(.greet)
    var waited = 0.0
    while d.current != .greet, waited < 2 {
      _ = d.step(Self.dt, ctx: .init())
      waited += Self.dt
    }
    #expect(d.current == .greet, "sau \(waited) giây vẫn là \(String(describing: d.current))")
  }

  // 6 + 7. Buổi tập thật: tự hào đúng một lần; không có thì không bao giờ.
  @Test(arguments: seeds) func reactsToARealWorkoutOnce(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    var count = 0
    var last = ""
    func tally(_ f: KoaDirector.Frame) {
      if f.behavior == "proud", last != "proud" { count += 1 }
      last = f.behavior
    }
    for _ in 0..<Int(120 / Self.dt) { tally(d.step(Self.dt, ctx: .init())) }
    #expect(count == 0)
    var ctx = KoaDirector.Context()
    ctx.workoutToday = true
    for _ in 0..<Int(200 / Self.dt) { tally(d.step(Self.dt, ctx: ctx)) }
    #expect(count == 1)
  }

  // Tự hào không chen ngang cú nhảy; không đi được (ngồi thiền) thì không tự hào.
  @Test func proudWaitsWhenSeated() {
    var d = KoaDirector.Director(seed: 4)
    var ctx = KoaDirector.Context()
    ctx.workoutToday = true
    ctx.canWalk = false
    Self.run(&d, 60, ctx: ctx) { f in #expect(f.behavior != "proud") }
  }

  // 8. Nền / trở lại: đồng hồ dừng rồi chạy lại (app chặn dt ≤ 0,1 giây) — Koa không dịch chuyển tức thời.
  @Test(arguments: seeds) func survivesBackgrounding(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    d.request(.walkTo(KoaRoomMap.Spot(.floor, 280, 372)))
    Self.run(&d, 2)
    let x = d.walker.x, y = d.walker.y
    let f = d.step(0.1, ctx: .init())
    #expect(hypot(f.x - x, f.depth - y) < 8)
  }

  // 9. Giảm chuyển động: đặt chỗ là tới ngay, không có dáng đi, không có việc dở.
  @Test func reduceMotionPlacesInstantly() {
    var d = KoaDirector.Director(seed: 9)
    let s = KoaRoomMap.Spot(.floor, 200, 372)
    d.place(s)
    #expect(d.walker.x == 200 && d.walker.y == 372 && d.plane == .floor)
    #expect(!d.walker.isMoving && d.current == nil)
  }

  // 10. Chạy dài: 2 giờ mô phỏng mỗi hạt — không NaN, luôn hợp lệ, không kẹt một việc, chân
  // không trượt, chuyển động liên tục, lịch sử không phình.
  @Test(arguments: seeds) func longRunIsStable(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    var invalid = 0, nan = 0
    var kinds = Set<String>()
    var lastChange = 0.0, stuck = 0.0, t = 0.0
    var last = ""
    var prev: KoaDirector.Frame?
    var worstTurn = 0.0, worstScale = 0.0, worstAmount = 0.0
    for _ in 0..<(60 * 60 * 120 / 4) {
      // bước 4 lần 1/60 cho nhanh; kiểm liên tục theo từng bước 4 khung
      let f = d.step(4 * Self.dt, ctx: .init())
      t += 4 * Self.dt
      if f.x.isNaN || f.depth.isNaN || f.scale.isNaN || f.gaze.eyes.x.isNaN { nan += 1 }
      if !d.walker.isHopping, !KoaRoomMap.valid(KoaRoomMap.Spot(d.plane, f.x, f.depth)),
        !KoaRoomMap.valid(KoaRoomMap.clamp(KoaRoomMap.Spot(d.plane, f.x, f.depth)))
      {
        invalid += 1
      }
      kinds.insert(f.behavior)
      if f.behavior != last {
        stuck = max(stuck, t - lastChange)
        lastChange = t
        last = f.behavior
      }
      if let p = prev {
        worstTurn = max(worstTurn, abs((f.walk?.turn ?? 0) - (p.walk?.turn ?? 0)))
        worstScale = max(worstScale, abs(f.scale - p.scale))
        worstAmount = max(worstAmount, abs(f.gestureAmount - p.gestureAmount))
      }
      prev = f
    }
    #expect(nan == 0)
    #expect(invalid == 0)
    #expect(kinds.isSuperset(of: ["rest", "explore", "lookAround", "home"]))
    #expect(stuck < 120, "kẹt một việc \(stuck) giây")
    #expect(d.history.count <= 8 && d.visited.count <= 6)
    #expect(worstScale < 0.05)
    #expect(worstAmount < 0.5)
  }

  // Tất định: cùng hạt, cùng đầu vào → cùng chuỗi hành vi, cùng vị trí (để lỗi tái hiện được).
  @Test func deterministic() {
    func trace(_ seed: UInt64) -> [String] {
      var d = KoaDirector.Director(seed: seed)
      var out: [String] = []
      var last = ""
      Self.run(&d, 300) { f in
        if f.behavior != last {
          out.append("\(f.behavior)@\(Int(f.x)),\(Int(f.depth))")
          last = f.behavior
        }
      }
      return out
    }
    let first = trace(7), again = trace(7), other = trace(8)
    #expect(first == again)
    #expect(first != other)
  }

  // Quay người rồi đứng yên, rồi quay về: hướng người liên tục, không bật về giữa một khung
  // (Kiệt 30/10: "bị giật về trạng thái đầu").
  @Test(arguments: seeds) func heldTurnStaysContinuous(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    var last: Double?, worst = 0.0, held = false
    Self.run(&d, 240) { f in
      let t = f.walk?.turn ?? 0
      if let l = last { worst = max(worst, abs(t - l)) }
      last = t
      if !f.moving, abs(t) > 0.1 { held = true }
    }
    #expect(held, "kịch bản phải có lúc đứng yên mà còn quay một bên")
    #expect(worst < 0.15, "hướng người nhảy \(worst) trong một khung")
  }

  // Dáng của ngày nhường chỗ dần, không bật tắt; khi về thì hiện lại dần.
  @Test func dayGestureFades() {
    var d = KoaDirector.Director(seed: 6)
    var last: Double?, worst = 0.0, low = 1.0
    Self.run(&d, 240) { f in
      if let l = last { worst = max(worst, abs(f.dayAmount - l)) }
      last = f.dayAmount
      low = min(low, f.dayAmount)
    }
    #expect(low < 0.3)
    #expect(worst < 0.2)
  }

  // Ngữ cảnh: chạm lại ngay sau khi chào → chỉ nhìn, không chào lại, không đi.
  @Test func doesNotGreetTwice() {
    var d = KoaDirector.Director(seed: 3)
    d.request(.greet)
    Self.run(&d, 14)
    #expect(d.current != .greet)
    let x = d.walker.x, y = d.walker.y
    d.request(.greet)
    _ = d.step(Self.dt, ctx: .init())
    #expect(d.current == .notice)
    Self.run(&d, 1)
    #expect(d.walker.x == x && d.walker.y == y)
  }

  // Sân khấu khuất: Koa không đi đâu, dù 10 phút; hiện lại thì sống tiếp.
  @Test(arguments: seeds) func staysPutWhenQuiet(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    var ctx = KoaDirector.Context()
    ctx.quiet = true
    let x = d.walker.x, y = d.walker.y
    Self.run(&d, 600, ctx: ctx)
    #expect(d.walker.x == x && d.walker.y == y)
    var moved = false
    Self.run(&d, 300) { f in if hypot(f.x - x, f.depth - y) > 5 { moved = true } }
    #expect(moved)
  }

  // Người xem đặt Koa ở đâu thì Koa ở yên đó một lúc.
  @Test(arguments: seeds) func staysWhereTheUserPutIt(seed: UInt64) {
    var d = KoaDirector.Director(seed: seed)
    let s = KoaRoomMap.Spot(.stage, 130, 440)
    d.request(.walkTo(s))
    Self.run(&d, 8)
    #expect(hypot(d.walker.x - s.x, d.walker.y - s.d) < 1.5)
    Self.run(&d, KoaDirector.settleAfterUser - 9)
    #expect(hypot(d.walker.x - s.x, d.walker.y - s.d) < 1.5)
  }

  // Khuya: đi lại ít hơn hẳn ban ngày.
  @Test func quieterAtNight() {
    func trips(_ night: Bool) -> Int {
      var n = 0
      for seed in Self.seeds {
        var d = KoaDirector.Director(seed: seed)
        var ctx = KoaDirector.Context()
        ctx.night = night
        var last = ""
        Self.run(&d, 900, ctx: ctx) { f in
          if f.behavior != last, f.behavior == "explore" || f.behavior == "home" { n += 1 }
          last = f.behavior
        }
      }
      return n
    }
    let day = trips(false), night = trips(true)
    #expect(Double(night) < Double(day) * 0.75, "ngày \(day), đêm \(night)")
  }

  // Dáng biểu cảm hiện và tắt dần, không bật tắt trong một khung.
  @Test func gestureFadesInAndOut() {
    var d = KoaDirector.Director(seed: 2)
    var ctx = KoaDirector.Context()
    ctx.workoutToday = true
    var worst = 0.0, top = 0.0
    var last: Double?
    Self.run(&d, 40, ctx: ctx) { f in
      if let l = last { worst = max(worst, abs(f.gestureAmount - l)) }
      last = f.gestureAmount
      top = max(top, f.gestureAmount)
    }
    #expect(top > 0.9)
    #expect(worst < 0.12)
  }
}
