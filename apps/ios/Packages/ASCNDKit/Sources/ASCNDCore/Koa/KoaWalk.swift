public import Foundation

/// Koa đi trong phòng (29/10): mô hình đi bộ thuần — vị trí trên sàn, vận tốc có tăng /
/// giảm tốc, nhịp bước, hai bàn chân, hướng mặt. App chỉ việc gọi `step` mỗi khung rồi
/// đưa `pose` cho `KoaRender` (dời / nhấc từng bàn chân, nhún thân, đánh tay, quay mặt).
///
/// Vì sao chân không trượt: bàn chân đang chạm sàn được GHIM ở một điểm trên sàn (toạ độ
/// phòng); trong hình, nó lùi đúng bằng quãng thân vừa đi. Chỉ chân đang bước mới di
/// chuyển trên sàn — nhấc lên, đưa tới chỗ đặt dự tính (nửa quãng thân sẽ đi trong lúc
/// chân kia chạm sàn), đặt xuống, rồi ghim. Nhịp bước tăng theo tốc độ, bước dài =
/// tốc độ / nhịp, nên nhịp luôn khớp tốc độ ở mọi lúc, cả khi tăng / giảm tốc.
///
/// Dừng: tới đích thì thân đứng yên; chân nào còn lệch khỏi chỗ đứng thì bước thêm một
/// bước nhỏ về đúng chỗ (như người dừng lại khép chân), rồi mới về đứng yên.
///
/// Toạ độ: phòng 390 (`StudioScene`), x sang phải, y xuống; `x, y` là điểm giữa hai bàn
/// chân trên sàn. Mọi số của `Pose` ở toạ độ của hình Koa (240 × 300).
public enum KoaWalk {
  public struct Foot: Sendable, Hashable {
    /// Dời so với chỗ đứng, đơn vị hình.
    public var x = 0.0
    public var y = 0.0
    /// Nhấc lên khỏi sàn (dương = lên), đơn vị hình.
    public var lift = 0.0
    /// Nghiêng mũi chân (độ, theo chiều kim đồng hồ trên màn).
    public var tilt = 0.0
    public init() {}
  }

  /// Một khung dáng đi, đưa cho `KoaRender.Options.walk`.
  public struct Pose: Sendable, Hashable {
    /// Bàn chân bên trái / phải của HÌNH (x ≈ 95 / 145).
    public var left = Foot()
    public var right = Foot()
    /// Thân nhún lên (đơn vị hình) — cao nhất khi một chân đang bước giữa chừng.
    public var bob = 0.0
    /// Nghiêng sang bên chân đang đỡ (độ).
    public var sway = 0.0
    /// Nghiêng tới theo hướng đi (độ).
    public var lean = 0.0
    /// Tay đánh (độ, quanh vai) — ngược với chân cùng bên.
    public var armLeft = 0.0
    public var armRight = 0.0
    /// Hướng mặt: −1 quay hẳn sang trái màn, 0 nhìn thẳng, 1 quay sang phải.
    public var turn = 0.0
    /// 0 đứng yên … 1 đang đi — dáng biểu cảm (gesture) nhường dần cho dáng đi.
    public var weight = 0.0
    /// Bàn chân trái của hình ở gần người xem hơn (vẽ sau, đè lên chân kia).
    public var leftNear = false
    public init() {}
  }

  /// Vùng sàn hợp lệ cho điểm giữa hai bàn chân (toạ độ phòng).
  public struct Floor: Sendable, Hashable {
    public var minX: Double
    public var maxX: Double
    public var minY: Double
    public var maxY: Double
    public init(minX: Double, maxX: Double, minY: Double, maxY: Double) {
      self.minX = minX
      self.maxX = maxX
      self.minY = minY
      self.maxY = maxY
    }

    /// Sàn phòng studio: trước chân kệ (y ≈ 395) và quả bóng (y ≈ 399), sau mép dưới của
    /// cảnh (476, chữ KOA ở bục ~458), cách hai tường (26 / 364) đủ cho cả thân Koa.
    public static let studio = Floor(minX: 74, maxX: 316, minY: 403, maxY: 452)

    public func contains(_ x: Double, _ y: Double) -> Bool { x >= minX && x <= maxX && y >= minY && y <= maxY }

    public func clamp(_ x: Double, _ y: Double) -> (x: Double, y: Double) {
      (min(max(x, minX), maxX), min(max(y, minY), maxY))
    }
  }

  public struct Tuning: Sendable, Hashable {
    /// Tốc độ tối đa, đơn vị phòng / giây.
    public var maxSpeed = 44.0
    public var accel = 70.0
    /// Hãm: tốc độ mong muốn = √(2·hãm·quãng còn lại) → chậm dần đều tới đích.
    public var brake = 55.0
    /// Phần chu kỳ mỗi chân chạm sàn (> 0,5: luôn có lúc hai chân cùng chạm).
    public var duty = 0.58
    /// Nhịp (chu kỳ hai bước / giây) lúc rất chậm và lúc tối đa.
    public var cadenceSlow = 1.1
    public var cadenceFast = 1.7
    /// Tốc độ (tuyệt đối) ứng với `cadenceFast` — nhịp theo tốc độ thật, không theo `maxSpeed`.
    public var cadenceSpeed = 44.0
    /// Chân nhấc cao nhất (đơn vị hình) ở bước dài nhất.
    public var liftMax = 10.0
    /// Bước dài (đơn vị hình) được coi là bước "đủ" cho nhấc / nhún / lắc.
    public var fullStep = 18.0
    /// Bề ngang hình ở vạch đứng (`MascotStage.heroWidth`, đơn vị phòng).
    public var heroWidth = 138.0
    /// Chỗ đứng gốc trên bục (`StudioScene.stageMark`).
    public var homeY = 412.0
    /// Hình to / nhỏ theo chiều sâu: mỗi đơn vị y.
    public var depth = 0.0026
    /// Quay mặt: tần số riêng của lò xo (rad/giây) — tới hướng mới ~0,4 giây, không giật.
    public var turnRate = 8.0
    public init() {}
  }

  enum Phase: Sendable, Hashable {
    /// Ghim ở một điểm trên sàn (toạ độ phòng).
    case planted(x: Double, y: Double)
    /// Đang bước: rời sàn ở `from` (đơn vị hình, so với thân).
    case swing(fromX: Double, fromY: Double)
  }

  public struct Walker: Sendable {
    public var tuning: Tuning
    public var floor: Floor
    public private(set) var x: Double
    public private(set) var y: Double
    public private(set) var vx = 0.0
    public private(set) var vy = 0.0
    public private(set) var target: (x: Double, y: Double)?
    /// Pha bước 0…1: chân trái ở `phase`, chân phải lệch nửa chu kỳ.
    var phase = 0.0
    var feet: [Phase]
    var offsets = [(x: 0.0, y: 0.0), (x: 0.0, y: 0.0)]
    var lifts = [0.0, 0.0]
    var swingU = [0.0, 0.0]
    var stepping = false
    var turn = 0.0
    var turnVel = 0.0
    var lastSide = 1.0
    var weight = 0.0
    var lean = 0.0

    public init(x: Double, y: Double, floor: Floor = .studio, tuning: Tuning = Tuning()) {
      self.tuning = tuning
      self.floor = floor
      self.x = x
      self.y = y
      feet = [.planted(x: x, y: y), .planted(x: x, y: y)]
    }

    /// Hình to bao nhiêu ở độ sâu hiện tại (1 ở vạch đứng gốc).
    public var scale: Double { Self.scale(y, tuning) }

    static func scale(_ y: Double, _ t: Tuning) -> Double { 1 + (y - t.homeY) * t.depth }

    /// Một đơn vị hình bằng bao nhiêu đơn vị phòng ở độ sâu `y`.
    func unit(_ y: Double) -> Double { tuning.heroWidth * Self.scale(y, tuning) / KoaMath.width * KoaMath.inset }

    public var speed: Double { (vx * vx + vy * vy).squareRoot() }

    /// Đang đi, hoặc còn bước khép chân sau khi tới đích.
    public var isMoving: Bool { target != nil || stepping || abs(turn) > 0.01 || weight > 0.01 }

    /// Đi tới một điểm (ngoài sàn thì về điểm gần nhất trên sàn). Đi rồi vẫn đổi đích được:
    /// vận tốc bẻ dần sang hướng mới, không quay ngoắt.
    public mutating func walk(to px: Double, _ py: Double) {
      let p = floor.clamp(px, py)
      target = p
    }

    /// Đứng ngay ở một điểm (Giảm chuyển động: không đi, chỉ đổi chỗ).
    public mutating func place(at px: Double, _ py: Double) {
      let p = floor.clamp(px, py)
      x = p.x
      y = p.y
      vx = 0
      vy = 0
      target = nil
      stepping = false
      feet = [.planted(x: x, y: y), .planted(x: x, y: y)]
      offsets = [(0, 0), (0, 0)]
      lifts = [0, 0]
      turn = 0
      turnVel = 0
      weight = 0
      lean = 0
    }

    /// Một bước thời gian (giây). Bước dài thì chia nhỏ, để khung bị trễ không làm
    /// thân vượt đích hay chân nhảy cóc.
    public mutating func step(_ dt: Double) {
      guard dt > 0 else { return }
      var left = min(dt, 0.25)
      while left > 0 {
        let h = min(left, 1.0 / 120)
        advance(h)
        left -= h
      }
    }

    mutating func advance(_ dt: Double) {
      let t = tuning
      // ── thân: lái vận tốc về phía đích, hãm dần khi gần
      var dvx = -vx, dvy = -vy
      if let g = target {
        let ex = g.x - x, ey = g.y - y
        let d = (ex * ex + ey * ey).squareRoot()
        if d < 0.4 && speed < 3 {
          target = nil
        } else {
          let want = min(t.maxSpeed, (2 * t.brake * max(0, d - 0.3)).squareRoot())
          dvx = ex / max(d, 0.0001) * want - vx
          dvy = ey / max(d, 0.0001) * want - vy
        }
      }
      let dv = (dvx * dvx + dvy * dvy).squareRoot()
      // tăng / giảm tốc đều, kể cả lúc dừng hẳn — không khựng
      let maxDv = max(t.accel, t.brake) * dt
      if dv > maxDv {
        dvx *= maxDv / dv
        dvy *= maxDv / dv
      }
      vx += dvx
      vy += dvy
      if target == nil && speed < 0.3 {
        vx = 0
        vy = 0
      }
      x += vx * dt
      y += vy * dt
      let c = floor.clamp(x, y)
      x = c.x
      y = c.y

      // ── chân
      let u = unit(y)
      let s = speed
      let k = min(1, s / t.cadenceSpeed)
      let cadence = t.cadenceSlow + (t.cadenceFast - t.cadenceSlow) * k
      // chỗ đặt chân: nửa quãng thân sẽ đi trong lúc chân này chạm sàn (đơn vị hình)
      let half = s * t.duty / cadence / 2 / u
      let aimX = s > 0.01 ? vx / s * half : 0, aimY = s > 0.01 ? vy / s * half : 0
      let off = (0..<2).map { i in (offsets[i].x * offsets[i].x + offsets[i].y * offsets[i].y).squareRoot() }
      let swinging = feet.contains { if case .swing = $0 { true } else { false } }
      if s > 0.5 || target != nil {
        stepping = true
      } else if !swinging && off.allSatisfy({ $0 < 0.6 }) {
        stepping = false
      }
      if stepping { phase = (phase + cadence * dt).truncatingRemainder(dividingBy: 1) }
      for i in 0..<2 {
        let p = (phase + (i == 0 ? 0 : 0.5)).truncatingRemainder(dividingBy: 1)
        let inStance = p < t.duty
        switch feet[i] {
        case .planted(let px, let py):
          // chân ghim theo thân vừa đi TRƯỚC, rồi mới (có thể) nhấc lên từ đúng chỗ ấy
          offsets[i] = ((px - x) / u, (py - y) / u)
          lifts[i] = 0
          swingU[i] = 0
          // đứng yên mà chân đã đúng chỗ: không nhấc chân vô ích
          if stepping && !inStance && !(s < 0.5 && target == nil && off[i] < 0.6) {
            feet[i] = .swing(fromX: offsets[i].x, fromY: offsets[i].y)
          }
        case .swing(let fx, let fy):
          if inStance || !stepping {
            // đặt xuống đúng chỗ bàn chân đang ở → ghim, không giật
            lifts[i] = 0
            swingU[i] = 0
            feet[i] = .planted(x: x + offsets[i].x * u, y: y + offsets[i].y * u)
          } else {
            let q = (p - t.duty) / (1 - t.duty)
            let e = q * q * (3 - 2 * q)
            offsets[i] = (fx + (aimX - fx) * e, fy + (aimY - fy) * e)
            let reach = ((aimX - fx) * (aimX - fx) + (aimY - fy) * (aimY - fy)).squareRoot()
            lifts[i] = t.liftMax * min(1, reach / t.fullStep + 0.15) * sin(Double.pi * q)
            swingU[i] = q
          }
        }
      }

      // ── hướng mặt: lò xo tắt dần tới hạn (không vọt, không giật)
      var want = 0.0
      if s > 2 {
        let dir = vx / s
        if abs(dir) > 0.15 { lastSide = dir > 0 ? 1 : -1 }
        // đi lùi vào trong phòng: không có hình quay lưng — giữ nghiêng 3/4 về bên cũ
        want = vy < 0 ? lastSide * max(abs(dir), 0.7) : dir
      }
      let w = t.turnRate
      turnVel += (w * w * (want - turn) - 2 * w * turnVel) * dt
      turn += turnVel * dt
      let moving = s > 1 || stepping
      let wantW = moving ? min(1, 0.35 + s / (0.5 * t.maxSpeed)) : 0
      weight += (wantW - weight) * min(1, 5 * dt)
      lean += (3.2 * vx / t.maxSpeed - lean) * min(1, 6 * dt)
    }

    public var pose: Pose {
      var p = Pose()
      func foot(_ i: Int) -> Foot {
        var f = Foot()
        f.x = offsets[i].x
        f.y = offsets[i].y
        f.lift = lifts[i]
        // nhấc gót lúc rời sàn, hếch mũi lúc sắp đặt — theo hướng đi
        let q = swingU[i]
        f.tilt = lifts[i] > 0.05 ? (turn >= 0 ? 1 : -1) * -7 * sin(Double.pi * 2 * q) * min(1, lifts[i] / 3) : 0
        return f
      }
      p.left = foot(0)
      p.right = foot(1)
      let step = min(1, max(lifts[0], lifts[1]) / tuning.liftMax)
      // thân cao nhất khi chân bước ở giữa chừng
      p.bob = 3.0 * step
      // đỡ bằng chân đứng: chân trái đang bước → nghiêng về phải và ngược lại
      p.sway = 2.0 * (min(1, lifts[0] / tuning.liftMax) - min(1, lifts[1] / tuning.liftMax))
      p.lean = lean
      // tay ngược chân cùng bên: chân lùi ra sau thì tay đưa tới
      p.armLeft = max(-12, min(12, 0.75 * offsets[0].x))
      p.armRight = max(-12, min(12, 0.75 * offsets[1].x))
      p.turn = max(-1, min(1, turn))
      p.weight = weight
      if abs(turn) > 0.3 {
        // quay sang phải: bên trái của hình (vai / chân trái của Koa) ra phía người xem
        p.leftNear = turn > 0
      } else {
        p.leftNear = offsets[0].y > offsets[1].y
      }
      return p
    }
  }
}
