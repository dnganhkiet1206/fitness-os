@testable import ASCNDCore
import Foundation
import Testing

/// Koa có ý định (29/10, phần 2): bản đồ phòng, đường đi, đạo diễn hành vi, ánh nhìn.
struct KoaDirectorTests {
  // MARK: Bản đồ

  @Test func anchorsStepsAndUserSpotAreValid() {
    for a in KoaRoomMap.anchors { #expect(KoaRoomMap.valid(a.stand), "\(a.name)") }
    for s in KoaRoomMap.steps {
      #expect(KoaRoomMap.valid(s.floor) && KoaRoomMap.valid(s.stage))
    }
    #expect(KoaRoomMap.valid(KoaRoomMap.user) && KoaRoomMap.valid(KoaRoomMap.stageMark))
    // chỗ gần người xem: trước chỗ đứng gốc, nhưng không sát mép dưới của cảnh (476)
    #expect(KoaRoomMap.user.d > KoaRoomMap.stageMark.d)
    #expect(KoaRoomMap.screenY(KoaRoomMap.user) < 440)
  }

  /// Sàn → bục: đi tới bậc, nhảy, đi tiếp; mọi điểm trên đường đều hợp lệ.
  @Test func routesUseStepsAndStayValid() {
    let from = KoaRoomMap.anchor("shelf")!.stand
    let legs = KoaRoomMap.route(from: from, to: KoaRoomMap.user)
    #expect(legs.contains { if case .hop = $0 { true } else { false } })
    var at = from
    for leg in legs {
      switch leg {
      case .walk(let pts):
        for p in pts {
          for i in 0...20 {
            let t = Double(i) / 20
            let q = KoaRoomMap.Spot(p.plane, at.x + (p.x - at.x) * t, at.d + (p.d - at.d) * t)
            #expect(KoaRoomMap.valid(q), "\(q)")
          }
          at = p
        }
      case .hop(let a, let b):
        #expect(a.plane != b.plane)
        at = b
      }
    }
    #expect(at == KoaRoomMap.clamp(KoaRoomMap.user))
  }

  /// Chạm trên hình bục (cả mặt trước) → đứng trên bục; chạm sau bục → sàn.
  @Test func tapsMapToTheRightPlane() {
    #expect(KoaRoomMap.spot(screenX: 195, y: 412).plane == .stage)
    #expect(KoaRoomMap.spot(screenX: 140, y: 440).plane == .stage)
    #expect(KoaRoomMap.spot(screenX: 195, y: 458).plane == .stage)
    #expect(KoaRoomMap.spot(screenX: 260, y: 372).plane == .floor)
    // chạm sau bục nhưng thấp hơn dải sàn → vẫn là sàn, kéo lên sau mép bục
    #expect(KoaRoomMap.spot(screenX: 160, y: 379).plane == .floor)
    // tường / ngoài cảnh → điểm hợp lệ gần nhất
    #expect(KoaRoomMap.valid(KoaRoomMap.spot(screenX: 20, y: 300)))
  }

  /// Đứng sau chậu cây trên sàn → cây vẽ đè lên Koa; bục không bao giờ che (chân luôn cao
  /// hơn mép sau mặt bục); trên bục → không có gì che.
  @Test func occlusionByDepth() {
    let behindPlant = KoaRoomMap.Spot(.floor, 280, 376)
    #expect(KoaRoomMap.occluding(behindPlant, halfWidth: 50).map(\.name).contains("plant"))
    #expect(!KoaRoomMap.occluders.contains { $0.name == "stage" })
    #expect(KoaRoomMap.occluding(KoaRoomMap.stageMark, halfWidth: 50).isEmpty)
    // xa thì nhỏ, gần thì to
    #expect(KoaRoomMap.scale(380) < 1 && KoaRoomMap.scale(450) > 1)
  }

  /// Chân trên sàn luôn cao hơn mép sau mặt bục trên màn — bục không cắt ngang người Koa.
  @Test func floorStaysBehindTheStageRim() {
    let c = KoaRoomMap.stageCenter, r = KoaRoomMap.stageRadius
    for x in stride(from: 140.0, through: 300, by: 2) {
      for d in stride(from: 360.0, through: 410, by: 1) {
        let s = KoaRoomMap.Spot(.floor, x, d)
        guard KoaRoomMap.valid(s) else { continue }
        let ex = (x - c.x) / r.x
        guard abs(ex) < 1 else { continue }
        let rim = c.d - KoaRoomMap.stageHeight - r.d * (1 - ex * ex).squareRoot()
        #expect(KoaRoomMap.screenY(s) <= rim, "x \(x) d \(d) rim \(rim)")
      }
    }
  }

  /// Bước chân: lúc rời sàn gót nhấc trước (quay phải → xoay thuận, dương), lúc đặt thì mũi hếch.
  @Test func heelLiftsFirst() {
    var w = KoaWalk.Walker(x: 160, y: 374)
    w.walk(to: 290, 374)
    var early: [Double] = [], late: [Double] = []
    for _ in 0..<(60 * 3) {
      w.step(1.0 / 60)
      for i in 0..<2 where w.lifts[i] > 1 {
        let tilt = (i == 0 ? w.pose.left : w.pose.right).tilt
        if w.swingU[i] < 0.4 { early.append(tilt) } else if w.swingU[i] > 0.6 { late.append(tilt) }
      }
    }
    #expect(!early.isEmpty && early.allSatisfy { $0 >= 0 })
    #expect(!late.isEmpty && late.allSatisfy { $0 <= 0 })
  }

  /// Đi vào trong phòng, mặt quay một bên: người không ngả ngược phía mặt.
  @Test func leanFollowsFacing() {
    var w = KoaWalk.Walker(x: 200, y: 450)
    w.walk(to: 120, 450)
    for _ in 0..<90 { w.step(1.0 / 60) }
    // giờ đi thẳng vào trong, lệch phải một chút; mặt vẫn quay trái (bên cũ)
    w.walk(to: 205, 370)
    for _ in 0..<(60 * 2) {
      w.step(1.0 / 60)
      let p = w.pose
      if abs(p.turn) > 0.3, abs(p.lean) > 0.5 { #expect(p.lean * p.turn > 0, "lean \(p.lean) turn \(p.turn)") }
    }
  }

  // MARK: Đạo diễn

  static func run(_ d: inout KoaDirector.Director, _ seconds: Double, ctx: KoaDirector.Context = .init(),
    each: (KoaDirector.Frame, Double) -> Void = { _, _ in }) {
    var t = 0.0
    while t < seconds {
      let f = d.step(1.0 / 60, ctx: ctx)
      each(f, t)
      t += 1.0 / 60
    }
  }

  /// (a) Chào: mắt nhìn người xem TRƯỚC, rồi mặt đổi, rồi mới bước; tới chỗ gần người
  /// xem, vui, ở lại.
  @Test func greetLooksFirstThenApproachesAndStays() {
    var d = KoaDirector.Director(seed: 5)
    // bắt đầu từ chỗ ghé kệ (trên sàn) để có đường đi thật
    d.place(KoaRoomMap.anchor("shelf")!.stand)
    d.request(.greet)
    var faceAt: Double?, moveAt: Double?, eyesAt: Double?
    let start = (x: d.walker.x, y: d.walker.y)
    Self.run(&d, 14) { f, t in
      if eyesAt == nil, abs(f.gaze.eyes.y - 0.15) < 0.2, abs(f.gaze.eyes.x) < 0.3 { eyesAt = t }
      if faceAt == nil, f.expression != nil { faceAt = t }
      if moveAt == nil, hypot(f.x - start.x, f.depth - start.y) > 0.5 { moveAt = t }
    }
    #expect(eyesAt != nil && faceAt != nil && moveAt != nil)
    #expect(eyesAt! <= faceAt! && faceAt! < moveAt!)
    #expect(d.current == .greet)
    #expect(d.plane == .stage)
    #expect(hypot(d.walker.x - KoaRoomMap.user.x, d.walker.y - KoaRoomMap.user.d) < 1)
  }

  /// (c) Tự hào chỉ khi có buổi tập thật; một lần; không có thì không bao giờ.
  @Test func proudOnlyOnRealWorkoutAndOnce() {
    var d = KoaDirector.Director(seed: 9)
    var proud = 0
    var last: String?
    Self.run(&d, 300) { f, _ in
      if f.behavior == "proud", last != "proud" { proud += 1 }
      last = f.behavior
    }
    #expect(proud == 0)
    var ctx = KoaDirector.Context()
    ctx.workoutToday = true
    Self.run(&d, 120, ctx: ctx) { f, _ in
      if f.behavior == "proud", last != "proud" { proud += 1 }
      last = f.behavior
    }
    #expect(proud == 1)
  }

  /// Không lặp lại: 20 phút, không ghé cùng một đồ vật hai lần liền, có nhiều loại việc,
  /// và phần lớn thời gian là đứng yên / tại chỗ (không thành game chạy loăng quăng).
  @Test func variedAndCalm() {
    var d = KoaDirector.Director(seed: 21)
    var visits: [String] = []
    var kinds = Set<String>()
    var still = 0.0, total = 0.0
    var lastKind = ""
    var invalid = 0
    for _ in 0..<(60 * 1200) {
      let f = d.step(1.0 / 60, ctx: .init())
      total += 1
      if f.walk == nil || (f.walk?.weight ?? 0) < 0.05 { still += 1 }
      kinds.insert(f.behavior)
      if f.behavior != lastKind, f.behavior == "explore", let w = f.why.split(separator: " ").last {
        visits.append(String(w))
      }
      lastKind = f.behavior
      if !d.walker.isHopping, !KoaRoomMap.valid(KoaRoomMap.Spot(d.plane, f.x, f.depth)) { invalid += 1 }
    }
    #expect(invalid == 0)
    for (a, b) in zip(visits, visits.dropFirst()) { #expect(a != b, "\(visits)") }
    #expect(Set(visits).count >= 3)
    #expect(kinds.isSuperset(of: ["rest", "explore", "lookAround"]))
    #expect(still / total > 0.6)
  }

  /// Chạm khi đang nhảy: chỉ đổi việc khi đã chạm đất (điểm an toàn).
  @Test func interruptsOnlyAtSafePoints() {
    var d = KoaDirector.Director(seed: 3)
    d.place(KoaRoomMap.anchor("shelf")!.stand)
    d.request(.walkTo(KoaRoomMap.stageMark))
    var hopped = false
    for _ in 0..<(60 * 10) {
      _ = d.step(1.0 / 60, ctx: .init())
      if d.walker.isHopping {
        hopped = true
        d.request(.walkTo(KoaRoomMap.Spot(.stage, 260, 430)))
        // giữa cú nhảy: việc vẫn là việc cũ
        #expect(d.walker.isHopping)
        break
      }
    }
    #expect(hopped)
    Self.run(&d, 8)
    #expect(hypot(d.walker.x - 260, d.walker.y - 430) < 1.5)
  }

  /// Nhiều kiểu đi khác nhau thật (không chỉ tốc độ): nhịp, nhấc chân, lắc, tay, lấy đà.
  @Test func stylesDifferBeyondSpeed() {
    let all = KoaWalk.Style.all
    #expect(Set(all.map(\.name)).count == all.count)
    for (a, b) in zip(all, all.dropFirst()) {
      let differs = [a.cadence != b.cadence, a.lift != b.lift, a.sway != b.sway, a.arms != b.arms,
        a.anticipation != b.anticipation, a.settle != b.settle].filter { $0 }.count
      #expect(differs >= 3, "\(a.name) / \(b.name)")
    }
  }

  // MARK: Ánh nhìn

  /// Mắt tới đích trước đầu; chớp mắt không đều.
  @Test func eyesLeadHeadAndBlinksAreIrregular() {
    var g = KoaGaze.State(seed: 4)
    let koa = (x: 195.0, y: 412.0)
    for _ in 0..<60 { _ = g.step(1.0 / 60, koa: koa, turn: 0) }
    g.look(.point(x: 60, y: 300), from: koa, turn: 0)
    var out = g.step(0.06, koa: koa, turn: 0)
    for _ in 0..<3 { out = g.step(1.0 / 60, koa: koa, turn: 0) }
    // mắt (phần trong hốc + đầu) đã quay về trái nhiều hơn đầu
    #expect(out.eyes.x + out.head.x * 0.4 < out.head.x - 0.2)
    var blinks: [Double] = []
    var t = 0.0, closed = false
    for _ in 0..<(60 * 60) {
      let o = g.step(1.0 / 60, koa: koa, turn: 0)
      if o.blink > 0.5, !closed { blinks.append(t) }
      closed = o.blink > 0.5
      t += 1.0 / 60
    }
    let gaps = zip(blinks, blinks.dropFirst()).map { $1 - $0 }
    #expect(gaps.count >= 6)
    #expect((gaps.max() ?? 0) - (gaps.min() ?? 0) > 1.5)
  }
}
