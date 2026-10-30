public import Foundation

/// Koa đi trong phòng (29/10): mô hình đi bộ thuần — vị trí trên sàn, vận tốc có tăng /
/// giảm tốc, nhịp bước, hai bàn chân, hướng mặt, nhảy lên / xuống bục. App chỉ việc gọi
/// `step` mỗi khung rồi đưa `pose` cho `KoaRender` (dời / nhấc từng bàn chân, nhún thân,
/// đánh tay, quay mặt).
///
/// Vì sao chân không trượt: bàn chân đang chạm sàn được GHIM ở một điểm trên sàn (toạ độ
/// phòng); trong hình, nó lùi đúng bằng quãng thân vừa đi. Chỉ chân đang bước mới di
/// chuyển trên sàn — nhấc lên, đưa tới chỗ đặt dự tính (nửa quãng thân sẽ đi trong lúc
/// chân kia chạm sàn), đặt xuống, rồi ghim. Nhịp bước tăng theo tốc độ, bước dài =
/// tốc độ / nhịp, nên nhịp luôn khớp tốc độ ở mọi lúc, cả khi tăng / giảm tốc.
///
/// Kiểu đi (`Style`, 29/10 phần 2): không chỉ đổi tốc độ — mỗi kiểu có nhịp, độ nhấc chân,
/// nhún, lắc, đánh tay, nghiêng người, lấy đà khi bắt đầu và độ "lắng" khi dừng riêng.
///
/// Dừng: tới đích thì thân đứng yên; chân nào còn lệch khỏi chỗ đứng thì bước thêm một
/// bước nhỏ về đúng chỗ (như người dừng lại khép chân), rồi mới về đứng yên.
///
/// Toạ độ: phòng 390 (`StudioScene`), x sang phải; `y` là ĐỘ SÂU trên sàn (`KoaRoomMap`),
/// chân trên màn ở `y − elevation`. Mọi số của `Pose` ở toạ độ của hình Koa (240 × 300).
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
    /// Thân nhún lên (đơn vị hình; âm = khuỵu xuống lấy đà / tiếp đất).
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
    /// Trọng tâm dịch ngang sang chân đang đỡ (đơn vị hình; chân chạm sàn được bù, không trượt).
    public var shift = 0.0
    /// Đầu trễ theo quán tính (độ): lò xo, lắng lại sau khi tăng tốc / dừng.
    public var headLag = 0.0
    /// Tai trễ theo quán tính (độ): lò xo mềm hơn đầu, đung đưa nhẹ rồi tắt.
    public var earLag = 0.0
    public init() {}
  }

  /// Khung chặn thô cho điểm giữa hai bàn chân (toạ độ phòng; `KoaRoomMap` lo hợp lệ chi tiết).
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

    /// Phòng studio: từ chân tường (độ sâu ≈ 366) tới mép trước bục, cách hai tường.
    public static let studio = Floor(minX: 80, maxX: 310, minY: 366, maxY: 456)

    public func contains(_ x: Double, _ y: Double) -> Bool { x >= minX && x <= maxX && y >= minY && y <= maxY }

    public func clamp(_ x: Double, _ y: Double) -> (x: Double, y: Double) {
      (min(max(x, minX), maxX), min(max(y, minY), maxY))
    }
  }

  /// Kiểu đi: mỗi kiểu là một bộ số cho tốc độ, nhịp, chân, thân, tay, lấy đà, dừng.
  public struct Style: Sendable, Hashable {
    public var name: String
    /// Tốc độ tối đa, đơn vị phòng / giây.
    public var maxSpeed: Double
    public var accel: Double
    public var brake: Double
    /// Nhịp nhân thêm (1 = nhịp thường).
    public var cadence: Double
    /// Chân nhấc cao nhất (đơn vị hình).
    public var lift: Double
    /// Biên độ nhún / lắc / đánh tay / nghiêng tới (1 = thường).
    public var bob: Double
    public var sway: Double
    public var arms: Double
    public var lean: Double
    /// Lấy đà trước khi bước (giây): khuỵu nhẹ, ngả ngược hướng đi.
    public var anticipation: Double
    /// Độ tắt dần của nghiêng người khi dừng: nhỏ = lắng nhiều (người ngả tới rồi về).
    public var settle: Double

    /// Đi dạo thong thả.
    public static let casual = Style(
      name: "casual", maxSpeed: 34, accel: 55, brake: 45, cadence: 0.95, lift: 8.5, bob: 1, sway: 1, arms: 0.9,
      lean: 0.8, anticipation: 0.16, settle: 0.55)
    /// Tò mò: chậm, bước ngắn nhấc cao, tay ít đánh, đầu chồm tới.
    public static let curious = Style(
      name: "curious", maxSpeed: 26, accel: 45, brake: 40, cadence: 1.05, lift: 9, bob: 0.7, sway: 0.6, arms: 0.45,
      lean: 1.4, anticipation: 0.22, settle: 0.5)
    /// Có việc: nhanh, bước dài, tay đánh mạnh, ít lắc.
    public static let purposeful = Style(
      name: "purposeful", maxSpeed: 46, accel: 80, brake: 60, cadence: 1.05, lift: 10, bob: 0.9, sway: 0.6, arms: 1.25,
      lean: 1.2, anticipation: 0.12, settle: 0.7)
    /// Lại gần người xem: nảy, lắc nhiều, tay đánh vui.
    public static let friendly = Style(
      name: "friendly", maxSpeed: 36, accel: 60, brake: 50, cadence: 1.1, lift: 10.5, bob: 1.4, sway: 1.35, arms: 1.15,
      lean: 0.7, anticipation: 0.18, settle: 0.45)
    /// Bước chỉnh chỗ: vài bước rất ngắn.
    public static let adjust = Style(
      name: "adjust", maxSpeed: 14, accel: 45, brake: 45, cadence: 1.15, lift: 5, bob: 0.6, sway: 0.7, arms: 0.4,
      lean: 0.4, anticipation: 0.08, settle: 0.8)
    /// Thư thả: chậm, nhịp chậm, người thả lỏng.
    public static let relaxed = Style(
      name: "relaxed", maxSpeed: 24, accel: 35, brake: 32, cadence: 0.8, lift: 7, bob: 0.9, sway: 1.25, arms: 0.7,
      lean: 0.5, anticipation: 0.2, settle: 0.5)

    public static let all = [casual, curious, purposeful, friendly, adjust, relaxed]
  }

  public struct Tuning: Sendable, Hashable {
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
    /// Quay mặt: tần số riêng của lò xo (rad/giây) — tới hướng mới ~0,4 giây, không giật.
    public var turnRate = 8.0
    /// Kiểu đi hiện tại (nhân vào các biên độ).
    public var style = Style.casual
    public init() {}

    public mutating func apply(_ s: Style) {
      style = s
      maxSpeed = s.maxSpeed
      accel = s.accel
      brake = s.brake
      liftMax = s.lift
    }
  }

  enum Phase: Sendable, Hashable {
    /// Ghim ở một điểm trên sàn (toạ độ phòng).
    case planted(x: Double, y: Double)
    /// Đang bước: rời sàn ở `from` (đơn vị hình, so với thân).
    case swing(fromX: Double, fromY: Double)
  }

  /// Nhảy lên / xuống bục: lấy đà (khuỵu) → bay (vòng cung) → tiếp đất (khuỵu, lắng).
  struct Hop: Sendable, Hashable {
    var fromX, fromY, fromE: Double
    var toX, toY, toE: Double
    var t = 0.0
    static let crouch = 0.2, air = 0.38, land = 0.24
    var total: Double { Self.crouch + Self.air + Self.land }
  }

  public struct Walker: Sendable {
    public var tuning: Tuning
    public var floor: Floor
    public private(set) var x: Double
    /// Độ sâu trên sàn.
    public private(set) var y: Double
    /// Độ cao của chân so với sàn (0 sàn, `KoaRoomMap.stageHeight` trên bục).
    public private(set) var elevation: Double
    public private(set) var vx = 0.0
    public private(set) var vy = 0.0
    public private(set) var target: (x: Double, y: Double)?
    /// Các điểm còn phải qua trước `target` (không hãm ở điểm giữa).
    var via: [(x: Double, y: Double)] = []
    var hop: Hop?
    /// Lấy đà trước khi bước: còn bao nhiêu giây.
    var windup = 0.0
    var windupTotal = 0.0
    /// Hướng mặt mong muốn khi đứng yên (`nil` = nhìn thẳng).
    public var faceTurn: Double?
    /// Pha bước 0…1: chân trái ở `phase`, chân phải lệch nửa chu kỳ.
    var phase = 0.0
    var feet: [Phase]
    var offsets = [(x: 0.0, y: 0.0), (x: 0.0, y: 0.0)]
    var lifts = [0.0, 0.0]
    var swingU = [0.0, 0.0]
    var stepping = false
    /// Bước tại chỗ khi quay người (số bước còn lại).
    var shuffle = 0
    var turn = 0.0
    var turnVel = 0.0
    var lastSide = 1.0
    var weight = 0.0
    var lean = 0.0
    var leanVel = 0.0
    var crouch = 0.0
    /// Quán tính phụ: đầu, tai (lò xo tắt dần), vận tốc trước để biết gia tốc.
    var headLag = 0.0, headLagVel = 0.0
    var earLag = 0.0, earLagVel = 0.0
    var prevVx = 0.0, prevCrouch = 0.0
    /// Đung đưa khi đứng (đơn vị hình), đạo diễn đưa vào — rất chậm.
    public var idleShift = 0.0

    public init(x: Double, y: Double, elevation: Double = 0, floor: Floor = .studio, tuning: Tuning = Tuning()) {
      self.tuning = tuning
      self.floor = floor
      self.x = x
      self.y = y
      self.elevation = elevation
      feet = [.planted(x: x, y: y), .planted(x: x, y: y)]
    }

    /// Hình to bao nhiêu ở độ sâu hiện tại (1 ở chỗ đứng gốc).
    public var scale: Double { KoaRoomMap.scale(y) }

    /// Một đơn vị hình bằng bao nhiêu đơn vị phòng ở độ sâu `y`.
    func unit(_ y: Double) -> Double { tuning.heroWidth * KoaRoomMap.scale(y) / KoaMath.width * KoaMath.inset }

    public var speed: Double { (vx * vx + vy * vy).squareRoot() }

    public var isHopping: Bool { hop != nil }

    /// Có đang làm gì không (đi, nhảy, khép chân, quay người).
    public var isMoving: Bool {
      target != nil || hop != nil || stepping || windup > 0 || shuffle > 0
        || abs(turn - (faceTurn ?? 0)) > 0.01 || abs(turnVel) > 0.01 || weight > 0.01 || abs(lean) > 0.05
        || crouch > 0.05 || abs(earLag) > 0.05 || abs(headLag) > 0.05
    }

    /// Điểm an toàn để đổi việc: không giữa cú nhảy, và cả hai chân đang chạm sàn.
    public var atSafePoint: Bool {
      hop == nil && windup <= 0 && feet.allSatisfy { if case .planted = $0 { true } else { false } }
    }

    /// Đi tới một điểm (ngoài khung thì về điểm gần nhất). Đi rồi vẫn đổi đích được:
    /// vận tốc bẻ dần sang hướng mới, không quay ngoắt.
    public mutating func walk(to px: Double, _ py: Double) { walk(via: [], to: px, py) }

    /// Đi qua các điểm giữa (không dừng) rồi tới đích.
    public mutating func walk(via points: [(x: Double, y: Double)], to px: Double, _ py: Double) {
      let starting = target == nil && speed < 1 && hop == nil
      via = points.map { floor.clamp($0.x, $0.y) }
      target = floor.clamp(px, py)
      if starting, tuning.style.anticipation > 0, hypot(px - x, py - y) > 8 {
        windup = tuning.style.anticipation
        windupTotal = windup
      }
    }

    /// Nhảy lên / xuống bục từ chỗ đang đứng tới `(px, py)` ở độ cao `e`.
    public mutating func hop(to px: Double, _ py: Double, elevation e: Double) {
      target = nil
      via = []
      hop = Hop(fromX: x, fromY: y, fromE: elevation, toX: px, toY: py, toE: e)
    }

    /// Quay người tại chỗ: vài bước nhỏ trong lúc người xoay về `turn`.
    public mutating func turnInPlace(to t: Double) {
      faceTurn = t
      if abs(t - turn) > 0.35 { shuffle = 2 }
    }

    /// Đứng ngay ở một điểm (Giảm chuyển động: không đi, chỉ đổi chỗ).
    public mutating func place(at px: Double, _ py: Double, elevation e: Double? = nil) {
      let p = floor.clamp(px, py)
      x = p.x
      y = p.y
      if let e { elevation = e }
      vx = 0
      vy = 0
      target = nil
      via = []
      hop = nil
      windup = 0
      shuffle = 0
      stepping = false
      feet = [.planted(x: x, y: y), .planted(x: x, y: y)]
      offsets = [(0, 0), (0, 0)]
      lifts = [0, 0]
      turn = faceTurn ?? 0
      turnVel = 0
      weight = 0
      lean = 0
      leanVel = 0
      crouch = 0
      headLag = 0
      headLagVel = 0
      earLag = 0
      earLagVel = 0
      prevVx = 0
      prevCrouch = 0
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

    /// Lò xo tắt dần: tần số `w` (rad/giây), độ tắt `z` (< 1: lắc nhẹ rồi lắng).
    static func spring(_ x: inout Double, _ v: inout Double, to want: Double, w: Double, z: Double, dt: Double) {
      v += (w * w * (want - x) - 2 * z * w * v) * dt
      x += v * dt
    }

    /// Chuyển động phụ: đầu và tai đi sau thân. Dựa trên gia tốc thật nên dừng / khởi hành /
    /// tiếp đất đều tự có follow-through, không cần hoạt ảnh riêng. Biên độ nhỏ, có chặn.
    mutating func advanceSecondary(_ dt: Double) {
      let ax = (vx - prevVx) / dt
      prevVx = vx
      let drop = (crouch - prevCrouch) / dt
      prevCrouch = crouch
      let side = max(-1, min(1, ax / 80))
      // tăng tốc sang phải: đầu, tai ngả về trái (đi sau thân)
      Self.spring(&headLag, &headLagVel, to: -2.0 * side, w: 11, z: 0.62, dt: dt)
      Self.spring(&earLag, &earLagVel, to: -4.0 * side + max(-1, min(1, drop / 40)) * 2.5, w: 13, z: 0.32, dt: dt)
      headLag = max(-3, min(3, headLag))
      earLag = max(-6, min(6, earLag))
    }

    mutating func advance(_ dt: Double) {
      defer { advanceSecondary(dt) }
      if hop != nil {
        advanceHop(dt)
        return
      }
      let t = tuning
      let st = t.style
      // ── lấy đà: đứng yên, khuỵu nhẹ, ngả ngược hướng sắp đi
      if windup > 0 {
        windup -= dt
        let q = 1 - max(0, windup) / max(windupTotal, 0.001)
        crouch = sin(Double.pi * q) * 1.6
        if let g = target {
          if abs(g.x - x) > 6 { lastSide = g.x - x > 0 ? 1 : -1 }
          // lấy đà: ngả NGƯỢC hướng mặt sắp quay tới (không theo hướng ngang khi đi vào trong)
          leanVel += (64 * (-1.2 * lastSide * st.lean - lean) - 16 * leanVel) * dt
          lean += leanVel * dt
        }
        advanceTurn(dt, moving: true)
        return
      }
      crouch += (0 - crouch) * min(1, 10 * dt)
      // ── thân: lái vận tốc về phía đích, hãm dần khi gần (điểm giữa: không hãm)
      var dvx = -vx, dvy = -vy
      if let g = via.first ?? target {
        let ex = g.x - x, ey = g.y - y
        let d = (ex * ex + ey * ey).squareRoot()
        if !via.isEmpty, d < 7 {
          via.removeFirst()
        } else if via.isEmpty, d < 0.4 && speed < 3 {
          target = nil
        } else {
          let rest = via.isEmpty ? d : d + 40
          let want = min(t.maxSpeed, (2 * t.brake * max(0, rest - 0.3)).squareRoot())
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
      let cadence = (t.cadenceSlow + (t.cadenceFast - t.cadenceSlow) * k) * st.cadence
      // chỗ đặt chân: nửa quãng thân sẽ đi trong lúc chân này chạm sàn (đơn vị hình)
      let half = s * t.duty / cadence / 2 / u
      let aimX = s > 0.01 ? vx / s * half : 0, aimY = s > 0.01 ? vy / s * half : 0
      let off = (0..<2).map { i in (offsets[i].x * offsets[i].x + offsets[i].y * offsets[i].y).squareRoot() }
      let swinging = feet.contains { if case .swing = $0 { true } else { false } }
      if s > 0.5 || target != nil || shuffle > 0 {
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
          // đứng yên mà chân đã đúng chỗ: không nhấc chân vô ích (trừ khi đang quay tại chỗ)
          let idle = s < 0.5 && target == nil && off[i] < 0.6 && shuffle == 0
          if stepping && !inStance && !idle {
            feet[i] = .swing(fromX: offsets[i].x, fromY: offsets[i].y)
          }
        case .swing(let fx, let fy):
          if inStance || !stepping {
            // đặt xuống đúng chỗ bàn chân đang ở → ghim, không giật
            lifts[i] = 0
            swingU[i] = 0
            feet[i] = .planted(x: x + offsets[i].x * u, y: y + offsets[i].y * u)
            if shuffle > 0 { shuffle -= 1 }
          } else {
            let q = (p - t.duty) / (1 - t.duty)
            let e = q * q * (3 - 2 * q)
            offsets[i] = (fx + (aimX - fx) * e, fy + (aimY - fy) * e)
            let reach = ((aimX - fx) * (aimX - fx) + (aimY - fy) * (aimY - fy)).squareRoot()
            // bước tại chỗ (quay người): nhấc nhẹ cho thấy bước
            let floorLift = shuffle > 0 ? 0.45 : 0.15
            lifts[i] = t.liftMax * min(1, reach / t.fullStep + floorLift) * sin(Double.pi * q)
            swingU[i] = q
          }
        }
      }
      advanceTurn(dt, moving: s > 2)
      let moving = s > 1 || stepping
      let wantW = moving ? min(1, 0.35 + s / (0.5 * max(t.maxSpeed, 20))) : 0
      weight += (wantW - weight) * min(1, 5 * dt)
      // nghiêng tới theo tốc độ, VỀ PHÍA MẶT ĐANG QUAY (29/10, Kiệt: đi vào trong phòng mà ngả
      // theo hướng ngang thì có lúc mặt một bên, người ngả về sau). Lò xo tắt dần dưới hạn →
      // dừng thì người ngả tới rồi lắng về.
      let leanWant = 3.2 * min(1, s / 44) * max(-1, min(1, turn)) * st.lean
      let w = 8.0
      leanVel += (w * w * (leanWant - lean) - 2 * st.settle * w * leanVel) * dt
      lean += leanVel * dt
    }

    mutating func advanceTurn(_ dt: Double, moving: Bool) {
      var want = faceTurn ?? 0
      let s = speed
      if moving, s > 2 {
        let dir = vx / s
        if abs(dir) > 0.15 { lastSide = dir > 0 ? 1 : -1 }
        // đi lùi vào trong phòng: không có hình quay lưng — giữ nghiêng 3/4 về bên cũ
        want = vy < 0 ? lastSide * max(abs(dir), 0.7) : dir
      } else if windup > 0, target != nil {
        want = lastSide * 0.8
      }
      let w = tuning.turnRate
      turnVel += (w * w * (want - turn) - 2 * w * turnVel) * dt
      turn += turnVel * dt
    }

    mutating func advanceHop(_ dt: Double) {
      guard var h = hop else { return }
      h.t += dt
      let c = Hop.crouch, a = Hop.air
      if abs(h.toX - h.fromX) > 4 { lastSide = h.toX - h.fromX > 0 ? 1 : -1 }
      if h.t < c {
        // lấy đà: khuỵu, chân ghim
        crouch = sin(Double.pi / 2 * h.t / c) * 4
      } else if h.t < c + a {
        let q = (h.t - c) / a
        let e = q * q * (3 - 2 * q)
        x = h.fromX + (h.toX - h.fromX) * e
        y = h.fromY + (h.toY - h.fromY) * e
        let rise = max(h.toE, h.fromE) - min(h.toE, h.fromE)
        elevation = h.fromE + (h.toE - h.fromE) * e + (14 + rise * 0.4) * sin(Double.pi * q)
        crouch = -2.5 * sin(Double.pi * q)
        // hai chân co lên, rời sàn
        for i in 0..<2 {
          offsets[i] = (0, 0)
          lifts[i] = 5 * sin(Double.pi * min(1, q * 1.4))
        }
      } else if h.t < h.total {
        x = h.toX
        y = h.toY
        elevation = h.toE
        lifts = [0, 0]
        offsets = [(0, 0), (0, 0)]
        feet = [.planted(x: x, y: y), .planted(x: x, y: y)]
        // tiếp đất: khuỵu rồi đứng lên
        let q = (h.t - c - a) / Hop.land
        crouch = 3.4 * sin(Double.pi * q) * (1 - q * 0.3)
      } else {
        crouch = 0
        hop = nil
        advanceTurn(dt, moving: false)
        return
      }
      hop = h
      let w = tuning.turnRate
      turnVel += (w * w * (lastSide * 0.75 - turn) - 2 * w * turnVel) * dt
      turn += turnVel * dt
      weight += (1 - weight) * min(1, 6 * dt)
    }

    public var pose: Pose {
      var p = Pose()
      let st = tuning.style
      func foot(_ i: Int) -> Foot {
        var f = Foot()
        f.x = offsets[i].x
        f.y = offsets[i].y
        f.lift = lifts[i]
        // nhấc GÓT lúc rời sàn, hếch MŨI lúc sắp đặt — theo hướng mặt. Quay phải: gót bên trái
        // lên = xoay thuận chiều kim đồng hồ (dương). (Trước 29/10 ngược dấu: mũi hếch lúc nhấc.)
        let q = swingU[i]
        let side = abs(turn) > 0.15 ? (turn > 0 ? 1.0 : -1.0) : 0
        f.tilt = lifts[i] > 0.05 ? side * 7 * sin(Double.pi * 2 * q) * min(1, lifts[i] / 3) : 0
        return f
      }
      p.left = foot(0)
      p.right = foot(1)
      let step = hop == nil ? min(1, max(lifts[0], lifts[1]) / max(tuning.liftMax, 1)) : 0
      // thân cao nhất khi chân bước ở giữa chừng; khuỵu khi lấy đà / tiếp đất
      p.bob = 3.0 * step * st.bob - crouch
      // đỡ bằng chân đứng: chân trái đang bước → nghiêng về phải và ngược lại
      if hop == nil {
        p.sway = 2.0 * st.sway * (min(1, lifts[0] / tuning.liftMax) - min(1, lifts[1] / tuning.liftMax))
      }
      p.lean = lean
      // tay ngược chân cùng bên: chân lùi ra sau thì tay đưa tới
      let arm = 0.75 * st.arms
      p.armLeft = max(-14, min(14, arm * offsets[0].x))
      p.armRight = max(-14, min(14, arm * offsets[1].x))
      if let h = hop, h.t > Hop.crouch, h.t < Hop.crouch + Hop.air {
        // bay: hai tay dang nhẹ
        let q = (h.t - Hop.crouch) / Hop.air
        p.armLeft = 10 * sin(Double.pi * q)
        p.armRight = -10 * sin(Double.pi * q)
      }
      // chân trái đang bước → trọng tâm sang chân phải (dương), và ngược lại; đứng yên: đung đưa
      p.shift = idleShift
      if hop == nil {
        p.shift += 1.8 * st.sway * (min(1, lifts[0] / tuning.liftMax) - min(1, lifts[1] / tuning.liftMax))
      }
      p.headLag = headLag
      p.earLag = earLag
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
