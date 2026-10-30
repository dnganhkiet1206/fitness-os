public import Foundation

/// Đạo diễn hành vi của Koa trong phòng (29/10, phần 2) — thay cho đi dạo ngẫu nhiên.
///
/// Mỗi hành vi (`Behavior`) nói rõ: VÌ SAO (`why`), đi ĐÂU (`target`), NHÌN gì (`gaze`),
/// CẢM XÚC nào của hệ có sẵn (`expression` / `gesture`), ĐI kiểu gì (`style`), LÀM gì khi
/// tới (`action`), BAO LÂU (`duration`), XONG khi nào, và việc TIẾP THEO (`next`).
///
/// Bộ lập lịch: ưu tiên, điều kiện ngữ cảnh, cooldown riêng từng hành vi, khoảng nghỉ tối
/// thiểu giữa hai việc tự phát, phạt lặp lại. Đứng yên lâu là bình thường (`rest`). Yêu
/// cầu từ người dùng / sự kiện thật chỉ ngắt việc đang làm ở ĐIỂM AN TOÀN (hai chân chạm
/// sàn, không giữa cú nhảy) — không có hai việc giành điều khiển.
///
/// Mỗi khi bắt đầu một việc, cơ thể chuyển theo thứ tự: mắt → mặt → đầu → thân → chân.
public enum KoaDirector {
  public enum Kind: String, Sendable, Hashable, CaseIterable {
    /// (a) Mở phòng / chạm Koa: nhìn người xem trước, đi tới chỗ gần người xem, vui, ở lại.
    case greet
    /// (b) Tò mò một đồ vật có sẵn trong tranh.
    case explore
    /// (c) Tự hào — CHỈ khi có buổi tập hoàn thành thật hôm nay.
    case proud
    /// Người dùng chạm sàn: đi tới đó.
    case walkTo
    /// Về chỗ đứng gốc trên bục.
    case home
    /// Đứng yên (lâu cũng được), chỉ mắt / đầu sống.
    case rest
    /// Đứng tại chỗ, quay người nhìn một đồ vật rồi ngoái lại người xem.
    case lookAround
  }

  public enum Action: Sendable, Hashable {
    case none
    case object(KoaRoomMap.Anchor.Action)
    /// Đứng trước người xem, vui.
    case friendly
    /// Tạo dáng tự hào (ta-da), rồi liếc bảng hạng.
    case proudPose
  }

  public struct Behavior: Sendable {
    public var kind: Kind
    public var why: String
    public var target: KoaRoomMap.Spot?
    public var anchor: KoaRoomMap.Anchor?
    public var gaze: KoaGaze.Target
    public var expression: KoaFlags.Expression?
    public var gesture: KoaGesture?
    public var style: KoaWalk.Style
    public var action: Action
    /// Ở lại bao lâu sau khi tới / làm xong (giây).
    public var duration: Double
    public var next: [Kind]
  }

  /// Ngữ cảnh mà app đưa vào mỗi khung.
  public struct Context: Sendable, Hashable {
    /// Koa đang đứng (ngồi thiền / cầm tạ thì không đi).
    public var canWalk = true
    /// Đã có buổi tập hoàn thành thật hôm nay và CHƯA ăn mừng (app giữ một lần mỗi ngày).
    public var workoutToday = false
    public init() {}
  }

  public enum Request: Sendable, Hashable {
    case greet
    case walkTo(KoaRoomMap.Spot)
    case proud
  }

  /// Một khung cho app vẽ.
  public struct Frame: Sendable {
    public var walk: KoaWalk.Pose?
    public var x: Double
    /// Chân trên màn (toạ độ phòng).
    public var screenY: Double
    public var depth: Double
    public var plane: KoaRoomMap.Plane
    public var scale: Double
    public var gaze: KoaGaze.Output
    public var expression: KoaFlags.Expression?
    public var gesture: KoaGesture?
    public var gestureAmount: Double
    /// Lá cây rung (độ) — khi Koa lại gần / ngửi.
    public var plantSway: Double
    // debug
    public var behavior: String
    public var why: String
    public var style: String
    public var target: KoaRoomMap.Spot?
    public var path: [KoaRoomMap.Spot]
  }

  enum Phase: Sendable, Hashable {
    /// Mắt → mặt → đầu → thân trước khi chân đi.
    case lead(Double)
    case travel
    /// Làm việc ở nơi đến; số giây đã làm.
    case act(Double)
    case dwell(Double)
  }

  struct Running: Sendable {
    var b: Behavior
    var phase: Phase
    var legs: [KoaRoomMap.Leg]
    var expressionOn = false
  }

  /// Hệ số chọn hành vi tự phát (càng lớn càng hay) và cooldown riêng (giây).
  static let weights: [Kind: Double] = [.explore: 1.0, .rest: 1.3, .lookAround: 0.6, .home: 0.5]
  static let cooldowns: [Kind: Double] = [.explore: 14, .lookAround: 18, .home: 20, .greet: 40, .rest: 0]

  public struct Director: Sendable {
    public var walker: KoaWalk.Walker
    public var gaze: KoaGaze.State
    public private(set) var plane: KoaRoomMap.Plane = .stage
    var running: Running?
    var pending: Request?
    var rng: KoaGaze.Random
    var clock = 0.0
    var lastRun: [Kind: Double] = [:]
    /// Lịch sử gần (để phạt lặp lại): hành vi, và đồ vật đã ghé.
    public private(set) var history: [Kind] = []
    public private(set) var visited: [String] = []
    var expression: KoaFlags.Expression?
    var gesture: KoaGesture?
    var gestureAmount = 0.0
    var gestureWant = 0.0
    var plantKick: Double?
    var proudDone = false

    public init(seed: UInt64 = 7) {
      walker = KoaWalk.Walker(
        x: KoaRoomMap.stageMark.x, y: KoaRoomMap.stageMark.d, elevation: KoaRoomMap.stageHeight)
      gaze = KoaGaze.State(seed: seed)
      rng = KoaGaze.Random(seed: seed &* 31)
    }

    public var current: Kind? { running?.b.kind }

    /// Yêu cầu từ người dùng / sự kiện thật. Việc đang làm chỉ nhường ở điểm an toàn.
    public mutating func request(_ r: Request) {
      // chạm liên tục khi đang chào: không chồng thêm
      if r == .greet, running?.b.kind == .greet { return }
      pending = r
    }

    /// Đứng ngay ở một chỗ (Giảm chuyển động).
    public mutating func place(_ s: KoaRoomMap.Spot) {
      let p = KoaRoomMap.clamp(s)
      plane = p.plane
      walker.place(at: p.x, p.d, elevation: p.plane == .stage ? KoaRoomMap.stageHeight : 0)
      running = nil
      pending = nil
    }

    // MARK: Lập lịch

    func spot() -> KoaRoomMap.Spot { KoaRoomMap.Spot(plane, walker.x, walker.y) }

    /// Phạt lặp lại: vừa làm → rất ít; trong vài lần gần → ít.
    static func penalty<T: Equatable>(_ x: T, in list: [T], recent: Int) -> Double {
      if list.last == x { return 0.12 }
      if list.suffix(recent).contains(x) { return 0.4 }
      return 1
    }

    func onCooldown(_ k: Kind) -> Bool {
      guard let t = lastRun[k] else { return false }
      return clock - t < (cooldowns[k] ?? 0)
    }

    mutating func make(_ k: Kind, ctx: Context) -> Behavior? {
      let here = spot()
      switch k {
      case .greet:
        return Behavior(
          kind: .greet, why: "người xem vừa mở phòng / chạm Koa", target: KoaRoomMap.user, anchor: nil, gaze: .user,
          expression: .grin, gesture: nil, style: .friendly, action: .friendly, duration: rng.range(6, 10),
          next: [.rest, .explore])
      case .proud:
        return Behavior(
          kind: .proud, why: "có buổi tập hoàn thành thật hôm nay", target: KoaRoomMap.stageMark, anchor: nil,
          gaze: .user, expression: .confident, gesture: .taDa, style: .purposeful, action: .proudPose,
          duration: rng.range(4, 6), next: [.rest])
      case .explore:
        // đồ vật: bỏ cái vừa xem, ưu tiên cái lâu chưa ghé
        var best: (KoaRoomMap.Anchor, Double)?
        for a in KoaRoomMap.anchors {
          // đang đứng ngay đó thì không "đi khám phá" nó nữa
          if a.stand.plane == plane, hypot(a.stand.x - here.x, a.stand.d - here.d) < 20 { continue }
          let w = Self.penalty(a.name, in: visited, recent: 3) * rng.range(0.6, 1.4)
          if best == nil || w > best!.1 { best = (a, w) }
        }
        guard let a = best?.0 else { return nil }
        return Behavior(
          kind: .explore, why: "tò mò về \(a.name)", target: a.stand, anchor: a, gaze: .point(x: a.look.x, y: a.look.y),
          expression: .surprised, gesture: a.action == .inspect ? .curious : nil, style: .curious,
          action: .object(a.action), duration: rng.range(2.5, 4.5), next: [.rest, .home, .lookAround])
      case .home:
        guard hypot(here.x - KoaRoomMap.stageMark.x, here.d - KoaRoomMap.stageMark.d) > 12 || plane != .stage else {
          return nil
        }
        return Behavior(
          kind: .home, why: "về chỗ đứng trên bục", target: KoaRoomMap.stageMark, anchor: nil, gaze: .ahead,
          expression: nil, gesture: nil, style: .relaxed, action: .none, duration: rng.range(1, 2), next: [.rest])
      case .rest:
        return Behavior(
          kind: .rest, why: "đứng nghỉ", target: nil, anchor: nil, gaze: rng.next() < 0.6 ? .user : .ahead,
          expression: nil, gesture: nil, style: .casual, action: .none, duration: rng.range(8, 22),
          next: [.explore, .lookAround, .home])
      case .lookAround:
        let a = KoaRoomMap.anchors[Int(rng.range(0, Double(KoaRoomMap.anchors.count) - 0.001))]
        return Behavior(
          kind: .lookAround, why: "nhìn quanh: \(a.name)", target: nil, anchor: a, gaze: .point(x: a.look.x, y: a.look.y),
          expression: nil, gesture: nil, style: .adjust, action: .none, duration: rng.range(2, 3.5), next: [.rest])
      case .walkTo:
        return nil
      }
    }

    mutating func pick(ctx: Context, after: Behavior?) -> Behavior? {
      if ctx.workoutToday, !proudDone, ctx.canWalk { return make(.proud, ctx: ctx) }
      var options = (after?.next ?? [.rest, .explore]).filter { !onCooldown($0) }
      if !ctx.canWalk { options = options.filter { $0 == .rest || $0 == .lookAround } }
      if options.isEmpty { options = [.rest] }
      var best: (Kind, Double)?
      for k in options {
        let w = (weights[k] ?? 0.5) * Self.penalty(k, in: history, recent: 3) * rng.range(0.5, 1.5)
        if best == nil || w > best!.1 { best = (k, w) }
      }
      return best.flatMap { make($0.0, ctx: ctx) } ?? make(.rest, ctx: ctx)
    }

    mutating func start(_ b: Behavior) {
      var legs: [KoaRoomMap.Leg] = []
      if let t = b.target {
        let here = spot()
        let goal = KoaRoomMap.clamp(t)
        if goal.plane != plane || hypot(goal.x - here.x, goal.d - here.d) > 2 { legs = KoaRoomMap.route(from: here, to: goal) }
      }
      // gần thì bước chỉnh chỗ, không cần "đi"
      var b = b
      if let t = b.target, plane == t.plane, hypot(t.x - walker.x, t.d - walker.y) < 24, b.kind != .greet {
        b.style = .adjust
      }
      running = Running(b: b, phase: .lead(0), legs: legs)
      lastRun[b.kind] = clock
      history.append(b.kind)
      if history.count > 8 { history.removeFirst(history.count - 8) }
      if let a = b.anchor {
        visited.append(a.name)
        if visited.count > 6 { visited.removeFirst(visited.count - 6) }
      }
      if b.kind == .proud { proudDone = true }
      walker.tuning.apply(b.style)
      // mắt trước tiên
      gaze.look(b.gaze, from: (walker.x, walker.y - walker.elevation), turn: walker.pose.turn)
      gestureWant = 0
    }

    // MARK: Khung

    public mutating func step(_ dt: Double, ctx: Context) -> Frame {
      clock += dt
      // buổi tập thật vừa xong: xin ngắt (vẫn chỉ ở điểm an toàn), một lần
      if ctx.workoutToday, !proudDone, ctx.canWalk, pending == nil, running?.b.kind != .proud { pending = .proud }
      // yêu cầu: chỉ nhận ở điểm an toàn
      if let r = pending, walker.atSafePoint {
        pending = nil
        switch r {
        case .greet: if let b = make(.greet, ctx: ctx), ctx.canWalk { start(b) } else { gaze.look(.user, from: (walker.x, walker.y), turn: 0) }
        case .proud: if let b = make(.proud, ctx: ctx) { start(b) }
        case .walkTo(let s):
          if ctx.canWalk {
            let far = hypot(s.x - walker.x, s.d - walker.y) > 60 || s.plane != plane
            start(
              Behavior(
                kind: .walkTo, why: "người xem chạm sàn", target: s, anchor: nil, gaze: .point(x: s.x, y: KoaRoomMap.screenY(s)),
                expression: nil, gesture: nil, style: far ? .purposeful : .casual, action: .none,
                duration: rng.range(1.5, 3), next: [.rest, .lookAround]))
          }
        }
      }
      if running == nil, let b = pick(ctx: ctx, after: nil) { start(b) }
      if var r = running { advance(&r, dt, ctx: ctx) }

      walker.step(dt)
      // gesture hiện dần / tắt dần
      gestureAmount += (gestureWant - gestureAmount) * min(1, 5 * dt)
      if gestureAmount < 0.01, gestureWant == 0 { gesture = nil }

      let head = (walker.x, walker.y - walker.elevation)
      let g = gaze.step(dt, koa: head, turn: walker.pose.turn)
      // lá cây: rung khi Koa đi sát hay ngửi
      var sway = 0.0
      if let k = plantKick {
        let t = clock - k
        sway = 4.5 * sin(2 * Double.pi * 2.1 * t) * exp(-t * 1.6)
        if t > 3 { plantKick = nil }
      }
      if plane == .floor, hypot(walker.x - 300, walker.y - 378) < 34, walker.speed > 4, plantKick == nil {
        plantKick = clock
      }
      let p = walker.pose
      var path: [KoaRoomMap.Spot] = []
      for leg in running?.legs ?? [] {
        switch leg {
        case .walk(let pts): path += pts
        case .hop(let a, let b): path += [a, b]
        }
      }
      return Frame(
        walk: walker.isMoving ? p : nil, x: walker.x, screenY: walker.y - walker.elevation, depth: walker.y,
        plane: plane, scale: walker.scale, gaze: g, expression: expression, gesture: gesture,
        gestureAmount: gestureAmount, plantSway: sway, behavior: running?.b.kind.rawValue ?? "-",
        why: running?.b.why ?? "", style: walker.tuning.style.name, target: running?.b.target, path: path)
    }

    mutating func advance(_ r: inout Running, _ dt: Double, ctx: Context) {
      let b = r.b
      switch r.phase {
      case .lead(let t0):
        let t = t0 + dt
        // mặt (0,15 s) → đầu (lò xo của gaze đang theo) → thân (0,35 s) → chân (0,55 s)
        if t >= 0.15, !r.expressionOn {
          r.expressionOn = true
          expression = b.expression
        }
        if t >= 0.35, t0 < 0.35 {
          let dir = turnToward(b)
          if let dir { walker.turnInPlace(to: dir) }
        }
        if t >= 0.55 {
          r.phase = r.legs.isEmpty ? .act(0) : .travel
          if !r.legs.isEmpty { startLeg(&r) }
        } else {
          r.phase = .lead(t)
        }
      case .travel:
        let busy = walker.target != nil || walker.isHopping || walker.speed > 0.5
        if !busy {
          if !r.legs.isEmpty { r.legs.removeFirst() }
          if r.legs.isEmpty {
            r.phase = .act(0)
            // tới nơi: quay về phía đích nhìn
            walker.faceTurn = turnToward(b)
            if let a = b.anchor, a.name == "plant" { plantKick = clock }
          } else {
            startLeg(&r)
          }
        }
      case .act(let t0):
        let t = t0 + dt
        act(b, t0, t)
        r.phase = t >= actLength(b) ? .dwell(0) : .act(t)
      case .dwell(let t0):
        let t = t0 + dt
        // ở lại: dáng biểu cảm (nếu có) hiện dần; chỉ mắt / đầu sống
        if b.gesture != nil {
          gesture = b.gesture
          gestureWant = 1
        }
        if t >= b.duration {
          // xong: dáng tắt dần, mặt về cảm xúc của ngày, mặt quay về người xem
          gestureWant = 0
          expression = nil
          walker.faceTurn = nil
          lastRun[b.kind] = clock
          running = nil
          if let next = pick(ctx: ctx, after: b) { start(next) }
          return
        }
        r.phase = .dwell(t)
      }
      running = r
    }

    func actLength(_ b: Behavior) -> Double {
      switch b.action {
      case .none: return 0.3
      case .friendly: return 1.2
      case .proudPose: return 1.6
      case .object(let a):
        switch a {
        case .inspect: return 3.2
        case .sniff: return 2.2
        case .gaze: return 2.6
        case .read: return 2.0
        }
      }
    }

    /// Hành động ở nơi đến: nhìn, nghiêng đầu, ngoái lại — mỗi đoạn một đích nhìn.
    mutating func act(_ b: Behavior, _ t0: Double, _ t: Double) {
      func at(_ s: Double) -> Bool { t0 < s && t >= s }
      let koa = (walker.x, walker.y - walker.elevation)
      let turn = walker.pose.turn
      switch b.action {
      case .none:
        if b.kind == .lookAround, at(0.1) { gaze.glance(at: b.gaze, koa: koa, turn: turn, for: 1.2) }
      case .friendly:
        if at(0) {
          walker.faceTurn = 0
          gaze.look(.user, from: koa, turn: turn)
        }
        if at(0.4) { expression = .delighted }
      case .proudPose:
        if at(0) {
          walker.faceTurn = 0
          gaze.look(.user, from: koa, turn: turn)
          gesture = .taDa
          gestureWant = 1
        }
        // liếc bảng hạng rồi về người xem
        if at(1.0) { gaze.glance(at: .point(x: 321, y: 276), koa: koa, turn: turn, for: 0.6) }
      case .object(let a):
        guard let anchor = b.anchor else { return }
        let lx = anchor.look.x, ly = anchor.look.y
        switch a {
        case .inspect:
          // ngắm từng tầng kệ, nghiêng đầu, rồi ngoái nhìn người xem
          if at(0.1) {
            gesture = .curious
            gestureWant = 0.7
            gaze.look(.point(x: lx, y: ly - 30), from: koa, turn: turn)
          }
          if at(1.0) { gaze.look(.point(x: lx + 20, y: ly + 28), from: koa, turn: turn) }
          if at(1.9) { gaze.look(.point(x: lx - 10, y: ly), from: koa, turn: turn) }
          if at(2.6) { gaze.glance(at: .user, koa: koa, turn: turn, for: 0.7) }
        case .sniff:
          if at(0.2) { plantKick = clock }
          if at(1.3) { expression = .happy }
          if at(1.6) { gaze.glance(at: .user, koa: koa, turn: turn, for: 0.6) }
        case .gaze:
          if at(1.4) { expression = .happy }
          if at(2.0) { gaze.glance(at: .user, koa: koa, turn: turn, for: 0.6) }
        case .read:
          if at(1.2) { expression = .confident }
        }
      }
    }

    /// Hướng quay về phía đích (đích nhìn hay chỗ đến), `nil` = nhìn thẳng.
    func turnToward(_ b: Behavior) -> Double? {
      let tx: Double
      switch b.gaze {
      case .user: return 0
      case .ahead:
        guard let t = b.target else { return nil }
        tx = t.x
      case .point(let x, _): tx = x
      }
      let dx = tx - walker.x
      if abs(dx) < 10 { return 0 }
      return max(-0.8, min(0.8, dx / 60))
    }

    mutating func startLeg(_ r: inout Running) {
      guard let leg = r.legs.first else { return }
      switch leg {
      case .walk(let pts):
        guard let last = pts.last else { return }
        walker.walk(via: pts.dropLast().map { ($0.x, $0.d) }, to: last.x, last.d)
        plane = last.plane
      case .hop(_, let to):
        walker.hop(to: to.x, to.d, elevation: to.plane == .stage ? KoaRoomMap.stageHeight : 0)
        plane = to.plane
      }
    }
  }
}
