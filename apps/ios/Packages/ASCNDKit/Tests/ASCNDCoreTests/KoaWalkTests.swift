@testable import ASCNDCore
import Foundation
import Testing

/// Koa đi trong phòng (29/10): chân không trượt, tới đích rồi dừng, nhịp theo tốc độ,
/// quay mặt không giật, chỉ trong vùng sàn.
struct KoaWalkTests {
  /// Toạ độ phòng của một bàn chân (0 trái, 1 phải) theo dáng đang có.
  static func foot(_ w: KoaWalk.Walker, _ i: Int) -> (x: Double, y: Double, lift: Double) {
    let p = w.pose
    let f = i == 0 ? p.left : p.right
    let u = w.unit(w.y)
    return (w.x + f.x * u, w.y + f.y * u, f.lift)
  }

  /// Đi qua nhiều điểm, đổi đích giữa chừng: bàn chân đang chạm sàn không bao giờ dời chỗ.
  @Test func plantedFeetNeverSlide() {
    var w = KoaWalk.Walker(x: 195, y: 436)
    let route: [(at: Int, x: Double, y: Double)] = [(0, 300, 440), (200, 90, 450), (420, 230, 380), (440, 120, 400)]
    var prev = [Self.foot(w, 0), Self.foot(w, 1)]
    var worst = 0.0
    for frame in 0..<900 {
      for r in route where r.at == frame { w.walk(to: r.x, r.y) }
      w.step(1.0 / 60)
      let now = [Self.foot(w, 0), Self.foot(w, 1)]
      for i in 0..<2 where prev[i].lift == 0 && now[i].lift == 0 {
        worst = max(worst, hypot(now[i].x - prev[i].x, now[i].y - prev[i].y))
      }
      prev = now
    }
    #expect(worst < 0.001, "chân chạm sàn trượt \(worst) đơn vị phòng")
  }

  /// Tới đích, đứng yên hẳn, hai chân về đúng chỗ đứng, mặt quay về người xem.
  @Test func arrivesAndSettlesToIdle() {
    var w = KoaWalk.Walker(x: 195, y: 412)
    w.walk(to: 280, 430)
    for _ in 0..<(60 * 8) { w.step(1.0 / 60) }
    #expect(abs(w.x - 280) < 0.5 && abs(w.y - 430) < 0.5)
    #expect(!w.isMoving)
    let p = w.pose
    #expect(hypot(p.left.x, p.left.y) < 0.6 && hypot(p.right.x, p.right.y) < 0.6)
    #expect(p.left.lift == 0 && p.right.lift == 0 && abs(p.turn) < 0.01)
  }

  /// Tăng tốc rồi giảm tốc: không nhảy vận tốc, không vượt quá tốc độ tối đa.
  @Test func acceleratesAndBrakesSmoothly() {
    var w = KoaWalk.Walker(x: 80, y: 420)
    w.walk(to: 310, 420)
    var last = 0.0, top = 0.0
    var jumps = 0.0
    for _ in 0..<(60 * 9) {
      w.step(1.0 / 60)
      jumps = max(jumps, abs(w.speed - last))
      last = w.speed
      top = max(top, w.speed)
    }
    #expect(top <= w.tuning.maxSpeed + 0.001)
    #expect(top > w.tuning.maxSpeed * 0.9)
    // tăng tốc 70 / giây → mỗi khung 60 Hz đổi tối đa ~1,2
    #expect(jumps <= w.tuning.accel / 60 + 0.01)
  }

  /// Nhịp bước theo tốc độ: đi nhanh thì bước nhiều hơn mỗi giây VÀ bước dài hơn.
  @Test func cadenceMatchesSpeed() {
    func steps(maxSpeed: Double) -> (perSecond: Double, stride: Double) {
      var t = KoaWalk.Tuning()
      t.maxSpeed = maxSpeed
      var w = KoaWalk.Walker(x: 74, y: 420, tuning: t)
      w.walk(to: 316, 420)
      var count = 0, time = 0.0, lifted = [false, false]
      // chỉ đếm đoạn giữa, khi đã chạy đều
      for _ in 0..<(60 * 20) {
        w.step(1.0 / 60)
        let cruising = abs(w.speed - maxSpeed) < 0.01
        if cruising { time += 1.0 / 60 }
        let p = w.pose
        for (i, f) in [p.left, p.right].enumerated() {
          if f.lift > 0, !lifted[i], cruising { count += 1 }
          lifted[i] = f.lift > 0
        }
      }
      let rate = Double(count) / time
      return (rate, maxSpeed / rate)
    }
    let slow = steps(maxSpeed: 20), fast = steps(maxSpeed: 44)
    #expect(fast.perSecond > slow.perSecond)
    #expect(fast.stride > slow.stride)
  }

  /// Quay đầu 180°: hướng mặt đổi liên tục, không nhảy trong một khung.
  @Test func turnsWithoutSnapping() {
    var w = KoaWalk.Walker(x: 120, y: 420)
    w.walk(to: 300, 420)
    for _ in 0..<120 { w.step(1.0 / 60) }
    #expect(w.pose.turn > 0.9)
    w.walk(to: 80, 420)
    var last = w.pose.turn, worst = 0.0
    for _ in 0..<240 {
      w.step(1.0 / 60)
      worst = max(worst, abs(w.pose.turn - last))
      last = w.pose.turn
    }
    #expect(last < -0.9)
    #expect(worst < 0.15, "hướng mặt nhảy \(worst) trong một khung")
  }

  /// Chạm ngoài sàn (tường, kệ, ngoài cảnh) → đi tới điểm gần nhất trên sàn, không ra ngoài.
  @Test func staysOnTheFloor() {
    var w = KoaWalk.Walker(x: 195, y: 412)
    let f = w.floor
    for (x, y) in [(0.0, 300.0), (500, 500), (10, 470), (380, 380)] {
      w.walk(to: x, y)
      for _ in 0..<(60 * 10) {
        w.step(1.0 / 60)
        #expect(f.contains(w.x, w.y))
      }
    }
    #expect(abs(w.x - f.maxX) < 0.5 && abs(w.y - 380) < 0.5)
  }

  /// Follow-through: dừng lại thì tai lắc qua rồi lắng; có chặn biên độ, không phóng đại.
  @Test func earsAndHeadFollowThrough() {
    var w = KoaWalk.Walker(x: 120, y: 436)
    w.walk(to: 300, 436)
    var peakEar = 0.0, peakHead = 0.0
    var signs = Set<Bool>()
    for _ in 0..<(60 * 7) {
      w.step(1.0 / 60)
      let p = w.pose
      peakEar = max(peakEar, abs(p.earLag))
      peakHead = max(peakHead, abs(p.headLag))
      if abs(p.earLag) > 0.3 { signs.insert(p.earLag > 0) }
    }
    #expect(peakEar > 0.5 && peakEar <= 6)
    #expect(peakHead > 0.2 && peakHead <= 3)
    #expect(signs.count == 2, "tai phải lắc qua hai phía")
    for _ in 0..<120 { w.step(1.0 / 60) }
    #expect(abs(w.pose.earLag) < 0.05 && abs(w.pose.headLag) < 0.05)
    #expect(!w.isMoving)
  }

  /// Chuyển trọng tâm: bước chân trái → thân sang phải; ổn định theo mức nhấc chân.
  @Test func weightShiftsToSupportFoot() {
    var w = KoaWalk.Walker(x: 120, y: 436)
    w.walk(to: 300, 436)
    var checked = 0
    for _ in 0..<(60 * 4) {
      w.step(1.0 / 60)
      let p = w.pose
      if p.left.lift > 2, p.right.lift == 0 {
        #expect(p.shift > 0)
        checked += 1
      }
      if p.right.lift > 2, p.left.lift == 0 {
        #expect(p.shift < 0)
        checked += 1
      }
      #expect(abs(p.shift) < 3)
    }
    #expect(checked > 20)
  }

  /// Dịch trọng tâm được bù ở bàn chân: chân chạm sàn không rời chỗ trong hình.
  @Test func rendererCompensatesBodyShift() {
    var p = KoaWalk.Pose()
    p.shift = 2
    p.bob = 1
    let f = KoaRender.walkFlags(p)
    #expect(f["footL"]?.text.contains("translate(-2.000,1.000)") == true)
  }

  /// Giảm chuyển động: đứng ngay ở chỗ mới, không có dáng đi.
  @Test func placeJumpsWithoutWalking() {
    var w = KoaWalk.Walker(x: 195, y: 412)
    w.place(at: 100, 440)
    #expect(w.x == 100 && w.y == 440 && !w.isMoving)
  }

  /// Không đi thì hình vẽ y như trước; đi thì hai bàn chân có biến đổi riêng.
  @Test func renderUsesFootGroups() {
    var o = KoaRender.Options()
    #expect(KoaRender.flags(o)["footL"] == nil)
    var p = KoaWalk.Pose()
    p.left.lift = 6
    p.turn = 0.5
    o.walk = p
    let f = KoaRender.flags(o)
    #expect(f["footL"]?.text.contains("translate") == true)
    #expect(f["faceShift"]?.text == "translate(7.000,0)")
    // tư thế khác (ngồi, cầm tạ) không đi
    o.pose = .relaxing
    #expect(KoaRender.flags(o)["footL"] == nil)
  }

  /// Cảnh tủ đồ có đúng hai nhóm bàn chân, mỗi món ở chân có ở cả hai bên.
  @Test func wardrobeSplitsTheFeet() {
    func find(_ ns: [KoaScene.Node], _ id: String) -> KoaScene.Node? {
      for n in ns {
        if n.id == id { return n }
        if let k = find(n.kids ?? [], id) { return k }
      }
      return nil
    }
    let legs = find(KoaScene.wardrobePayload.nodes, "LEGS")
    #expect(legs?.kids?.map(\.id) == ["FOOT_L", "FOOT_R"])
    let l = Set((legs?.kids?[0].kids ?? []).compactMap(\.cond))
    let r = Set((legs?.kids?[1].kids ?? []).compactMap(\.cond))
    #expect(l == r && l.contains("it_shoes_sneaker") && l.contains("it_bottom_jogger"))
  }
}
