public import Foundation

/// Đạo diễn hành vi của Koa trong phòng (29/10, phần 2) — thay cho đi dạo ngẫu nhiên.
///
/// Mỗi hành vi (`Behavior`) nói rõ: VÌ SAO (`why`), đi ĐÂU (`target`), NHÌN gì (`gaze`),
/// CẢM XÚC nào của hệ có sẵn (`expression` / `gesture`), ĐI kiểu gì (`style`), LÀM gì khi
/// tới (`action`), BAO LÂU (`duration`), XONG khi nào, và việc TIẾP THEO (`next`).
///
/// Bộ lập lịch: chấm điểm từng việc có thể làm theo khí sắc (`KoaCompanion.Affect`), khoảng
/// cách, độ mới và giờ giấc, cộng cooldown riêng và phạt lặp lại. Đứng yên lâu là bình thường
/// (`rest`), nhất là khi ít năng lượng. Yêu
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
    /// Người xem vừa ghé lại / chạm lần nữa: chỉ nhìn, không đi, không làm trò.
    case notice
    /// Người dùng quay lại sau nhiều ngày không tập: mừng, không trách (`Moment.comeback`).
    case welcome
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
    /// Cảm xúc hiện tại là dáng ngồi (ngủ, thiền, cầm tạ): Koa phải về bục rồi mới ngồi, không
    /// ngồi ngay giữa sàn sau đồ đạc. `Frame.settled` báo đã về tới nơi.
    public var settle = false
    /// Giờ ngủ: chỗ về là cửa phòng ngủ thay vì bục.
    public var bedtime = false
    /// Khoảnh khắc thật chưa phản ứng (`KoaCompanion.Memory.moment`), một lần theo khoá.
    public var moment: KoaCompanion.Moment?
    /// Khí sắc hiện tại, tính từ ký ức.
    public var affect = KoaCompanion.Affect()
    /// Người xem đang không nhìn sân khấu (cuộn xuống đọc thẻ): Koa không đi lại, không kéo
    /// mắt khỏi nội dung — chỉ đứng, thở, chớp mắt.
    public var quiet = false
    /// Khuya (22–6 giờ): Koa trầm hơn, nghỉ lâu hơn, ít đi lại.
    public var night = false
    public init() {}
  }

  public enum Request: Sendable, Hashable {
    /// Mở phòng sau khi đi vắng / chạm Koa: chào đầy đủ. Vừa chào xong (`greetCooldown`) thì
    /// tự thành `.notice` — không chào đi chào lại.
    case greet
    /// Mở lại ngay sau khi rời phòng: chỉ nhìn.
    case notice
    case walkTo(KoaRoomMap.Spot)
    /// Có gì đổi ở đồ vật này (đổi số trên bảng, vừa dọn kệ): Koa ngoái nhìn.
    case look(String)
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
    /// Độ hiện của dáng của ngày (`gesture` truyền từ phòng, vd. hờn dỗi), 0…1: nhường dần
    /// khi đi hay khi hành vi có mặt / dáng riêng, rồi hiện lại dần — không bật tắt.
    public var dayAmount: Double
    /// Đang di chuyển thật (đi, nhảy, đang quay). `walk` có thể khác `nil` cả khi đứng yên
    /// mà người còn quay một bên.
    public var moving: Bool
    /// Lá cây rung (độ) — khi Koa lại gần / ngửi.
    public var plantSway: Double
    /// Koa đã tới chỗ cần tới (bục, hay cửa phòng ngủ) và đứng yên: dáng ngồi được hiện.
    public var settled: Bool
    /// Khung Koa bắt đầu phản ứng với khoảnh khắc này (app ghi vào ký ức).
    public var reacted: KoaCompanion.Moment?
    /// Đồng hồ của các nhịp nghỉ (thở, lắc tai gốc), ms: nhanh lên sau khi đi, không đều nhẹ.
    public var idleClock: Double
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

  /// Giữa hai lần chào đầy đủ (giây đồng hồ đạo diễn).
  static let greetCooldown = 45.0
  /// Sau khi người xem đặt Koa ở đâu: ở yên đó ít nhất chừng này giây.
  static let settleAfterUser = 25.0

  /// Vừa được chạm: chừng này giây Koa chú ý người xem, không tự đi.
  static let attentive = 12.0

  /// Cooldown riêng (giây).
  static let cooldowns: [Kind: Double] = [.explore: 8, .lookAround: 18, .home: 20, .greet: 40, .rest: 0]

  /// Một cú giật tai: bật ra rồi rung nhẹ về chỗ (độ theo giây).
  enum KoaFlick {
    static let length = 0.42
    static func angle(_ t: Double) -> Double {
      let u = t / length
      guard u < 1 else { return 0 }
      return 8 * sin(Double.pi * 2 * u * 1.5) * exp(-3.5 * u)
    }
  }

  public struct Director: Sendable {
    public var walker: KoaWalk.Walker
    public var gaze: KoaGaze.State
    public private(set) var plane: KoaRoomMap.Plane = .stage
    var running: Running?
    var pending: Request?
    var rng: KoaGaze.Random
    var clock = 0.0
    var lastUser = -1000.0
    var lastRun: [Kind: Double] = [:]
    /// Lịch sử gần (để phạt lặp lại): hành vi, và đồ vật đã ghé.
    public private(set) var history: [Kind] = []
    public private(set) var visited: [String] = []
    /// Lần cuối xem từng đồ vật (đồng hồ đạo diễn).
    var seenAt: [String: Double] = [:]
    var expression: KoaFlags.Expression?
    var gesture: KoaGesture?
    var gestureAmount = 0.0
    var gestureWant = 0.0
    var dayAmount = 1.0
    var plantKick: Double?
    /// Khoảnh khắc đã phản ứng trong lần chạy này (app ghi ký ức sau một khung).
    var reacted: Set<KoaCompanion.Moment> = []
    var fresh: KoaCompanion.Moment?
    var lastTouch = -1000.0
    /// Đã ngồi xuống (`Context.settle`): giữ tới khi hết dáng ngồi, không đứng lên ngồi xuống
    /// mỗi lần người nhích nhẹ.
    var seated = false
    var seatedForBed = false
    /// Sau khi đi / nhảy, 0…1: thở nhanh rồi lắng dần.
    public private(set) var exertion = 0.0
    var idleClock = 0.0
    var nextFlick = 5.0
    var flick: (left: Bool, t: Double)?

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
      if r == .greet || r == .notice, running?.b.kind == .greet { return }
      if r == .greet || r == .notice { lastTouch = clock }
      if r == .greet, let t = lastRun[.greet], clock - t < greetCooldown {
        pending = .notice
        return
      }
      pending = r
    }

    /// Người xem đang chạm / kê tay lên Koa: chú ý tới họ, không tự đi chỗ khác.
    public mutating func interacted() { lastTouch = clock }

    /// Nhớ lại đồ vật đã ghé trước khi rời phòng.
    public mutating func recall(visited v: [String]) {
      visited = v
      for name in v { seenAt[name] = clock - 60 }
    }

    /// Đứng ngay ở một chỗ (Giảm chuyển động, trở lại phòng).
    public mutating func place(_ s: KoaRoomMap.Spot) {
      let p = KoaRoomMap.clamp(s)
      plane = p.plane
      walker.place(at: p.x, p.d, elevation: p.plane == .stage ? KoaRoomMap.stageHeight : 0)
      running = nil
      pending = nil
    }

    // MARK: Lập lịch

    public func spot() -> KoaRoomMap.Spot { KoaRoomMap.Spot(plane, walker.x, walker.y) }

    /// Phạt lặp lại nhẹ: phạt nặng theo danh sách gần đây làm chuỗi việc thành một vòng cố định
    /// (30/10: 6 bước lặp mãi, xoay đúng thứ tự đồ vật).
    static func penalty(_ x: Kind, in list: [Kind]) -> Double {
      if list.last == x { return 0.35 }
      return list.suffix(3).contains(x) ? 0.75 : 1
    }

    /// Độ mới của một đồ vật theo thời gian thật: vừa xem thì nhạt, sau ~4 phút mới như lần đầu.
    func novelty(_ a: KoaRoomMap.Anchor) -> Double {
      if visited.last == a.name { return 0.1 }
      guard let t = seenAt[a.name] else { return 1 }
      return min(1, 0.15 + (clock - t) / 240)
    }

    func onCooldown(_ k: Kind) -> Bool {
      guard let t = lastRun[k] else { return false }
      return clock - t < (cooldowns[k] ?? 0)
    }

    /// Chỗ nghỉ hợp lúc này: mệt / ngày nghỉ thì cạnh cửa sổ; đang gần gũi thì gần người xem.
    func restSpot(_ ctx: Context) -> KoaRoomMap.Spot {
      if ctx.settle { return ctx.bedtime ? KoaRoomMap.door : KoaRoomMap.stageMark }
      if ctx.affect.warmth > 0.6 { return KoaRoomMap.user }
      if ctx.affect.energy < 0.5 || ctx.affect.calm, let w = KoaRoomMap.anchor("window") { return w.stand }
      return KoaRoomMap.stageMark
    }

    /// Đang đứng ở chỗ cần về lúc tới giờ ngồi.
    func atSpot(_ s: KoaRoomMap.Spot) -> Bool {
      plane == s.plane && hypot(walker.x - s.x, walker.y - s.d) <= 12
    }

    /// Đồ vật này hấp dẫn cỡ nào lúc này: khí sắc trung tính thì như nhau, mỗi món được ưu tiên
    /// theo một khí sắc riêng.
    func interest(_ a: KoaRoomMap.Anchor, _ ctx: Context) -> Double {
      let e = ctx.affect
      switch a.action {
      case .inspect: return (0.8 + 0.8 * e.pride + (e.energy > 0.7 ? 0.3 : 0)) * (e.calm ? 0.5 : 1)
      case .read: return 0.8 + 1.2 * e.pride
      case .gaze: return 0.8 + max(0, 0.6 - e.energy) + (e.calm ? 0.6 : 0) + (ctx.night ? 0.4 : 0)
      case .sniff: return 0.8 + (e.calm ? 0.3 : 0)
      }
    }

    /// Điểm của một đồ vật cho việc đi tới (`walking`) hay chỉ nhìn: độ mới, đi xa tốn sức.
    func score(_ a: KoaRoomMap.Anchor, walking: Bool, _ ctx: Context) -> Double {
      var v = interest(a, ctx) * novelty(a)
      guard walking else { return v }
      // đang đứng ngay đó thì không "đi khám phá" nó nữa
      let here = spot()
      if a.stand.plane == plane, hypot(a.stand.x - here.x, a.stand.d - here.d) < 20 { return 0 }
      let far = (a.stand.plane == plane ? hypot(a.stand.x - here.x, a.stand.d - here.d) : 120) / 200
      v *= 1 - min(0.7, far * (1.2 - ctx.affect.energy))
      // đang đứng gần thì tiện ghé luôn, khỏi về rồi lại đi
      return far < 0.3 ? v * 1.5 : v
    }

    mutating func make(_ k: Kind, ctx: Context, anchor: KoaRoomMap.Anchor? = nil) -> Behavior? {
      let here = spot()
      switch k {
      case .greet:
        return Behavior(
          kind: .greet, why: "người xem vừa mở phòng / chạm Koa", target: KoaRoomMap.user, anchor: nil, gaze: .user,
          expression: .grin, gesture: nil, style: .friendly, action: .friendly, duration: rng.range(6, 10),
          next: [.rest, .explore])
      case .notice:
        return Behavior(
          kind: .notice, why: "người xem ghé lại", target: nil, anchor: nil, gaze: .user, expression: nil,
          gesture: nil, style: .adjust, action: .none, duration: rng.range(2.5, 4), next: [.rest])
      case .proud:
        // kỷ lục: rạng rỡ hơn buổi tập thường. Lên hạng mới bật nhảy (`cheer` là dáng giữa không
        // trung, giữ lâu thành lơ lửng nên chỉ vài giây)
        let up = ctx.moment == .rankUp, big = up || ctx.moment == .record
        return Behavior(
          kind: .proud, why: big ? "kỷ lục / lên hạng thật" : "có buổi tập hoàn thành thật hôm nay",
          target: KoaRoomMap.stageMark, anchor: nil, gaze: .user, expression: big ? .delighted : .confident,
          gesture: up ? .cheer : .taDa, style: .purposeful, action: .proudPose,
          duration: up ? rng.range(0.8, 1.4) : rng.range(4, 6), next: [.rest])
      case .welcome:
        return Behavior(
          kind: .welcome, why: "người dùng quay lại sau mấy ngày", target: KoaRoomMap.user, anchor: nil, gaze: .user,
          expression: .happy, gesture: nil, style: .friendly, action: .friendly, duration: rng.range(5, 8),
          next: [.rest])
      case .explore:
        guard let a = anchor else { return nil }
        let e = ctx.affect
        return Behavior(
          kind: .explore, why: "tò mò về \(a.name)", target: a.stand, anchor: a, gaze: .point(x: a.look.x, y: a.look.y),
          expression: a.action == .inspect ? .surprised : nil, gesture: a.action == .inspect ? .curious : nil,
          style: e.energy < 0.5 || e.calm ? .relaxed : e.pride > 0.5 ? .purposeful : .curious,
          action: .object(a.action), duration: rng.range(2.5, 4.5), next: [.rest, .home, .lookAround, .explore])
      case .home:
        let t = restSpot(ctx)
        guard hypot(here.x - t.x, here.d - t.d) > 12 || plane != t.plane else { return nil }
        return Behavior(
          kind: .home, why: ctx.settle ? "tới giờ ngồi, về bục" : "về chỗ nghỉ", target: t, anchor: nil, gaze: .ahead,
          // đi về ngủ: lim dim, không nhắm mắt mà đi
          expression: ctx.settle ? .happytired : nil, gesture: nil, style: .relaxed, action: .none, duration: rng.range(1, 2), next: [.rest])
      case .rest:
        // đứng cạnh cửa sổ thì nhìn ra ngoài; vừa được chạm thì nhìn người xem
        let window = KoaRoomMap.anchor("window")
        let byWindow = window.map { plane == $0.stand.plane && hypot(here.x - $0.stand.x, here.d - $0.stand.d) < 30 } ?? false
        let social = clock - lastTouch < attentive || rng.next() < 0.45 + 0.45 * ctx.affect.warmth
        let g: KoaGaze.Target =
          byWindow && !social ? .point(x: window!.look.x, y: window!.look.y) : social ? .user : .ahead
        let calmer = 1 + (ctx.night ? 1 : 0) + max(0, 0.6 - ctx.affect.energy) * 2
        return Behavior(
          kind: .rest, why: "đứng nghỉ", target: nil, anchor: nil, gaze: g,
          expression: nil, gesture: nil, style: .casual, action: .none, duration: rng.range(8, 22) * calmer,
          next: [.rest, .explore, .lookAround, .home])
      case .lookAround:
        guard let a = anchor else { return nil }
        return Behavior(
          kind: .lookAround, why: "nhìn quanh: \(a.name)", target: nil, anchor: a, gaze: .point(x: a.look.x, y: a.look.y),
          expression: nil, gesture: nil, style: .adjust, action: .none, duration: rng.range(2, 3.5), next: [.rest])
      case .walkTo:
        return nil
      }
    }

    mutating func pick(ctx: Context, after: Behavior?) -> Behavior? {
      var kinds = (after?.next ?? [.rest, .explore]).filter { !onCooldown($0) }
      if !ctx.canWalk || ctx.quiet { kinds = kinds.filter { $0 == .rest || $0 == .lookAround } }
      // sân khấu khuất / vừa được đặt chỗ / vừa được chạm: ở yên, không tự đi
      if ctx.quiet || clock - lastUser < settleAfterUser || clock - lastTouch < attentive { kinds = [.rest] }
      if kinds.isEmpty { kinds = [.rest] }
      let e = ctx.affect
      let night = ctx.night ? 0.4 : 1.0
      var best: (Kind, KoaRoomMap.Anchor?, Double)?
      func consider(_ k: Kind, _ a: KoaRoomMap.Anchor?, _ v: Double, _ noise: Double) {
        let w = v * Self.penalty(k, in: history) * noise
        if w > (best?.2 ?? 0) { best = (k, a, w) }
      }
      for k in kinds {
        switch k {
        case .rest:
          // nghỉ nối nghỉ được, nhưng lâu quá thì cũng muốn nhúc nhích (trừ khi rất ít sức)
          let long = history.suffix(2) == [.rest, .rest] && e.energy > 0.4 ? 0.3 : 1
          consider(k, nil, (1.0 + 1.2 * (1 - e.energy) + (e.calm ? 0.4 : 0)) * long, rng.range(0.55, 1.45))
        case .explore:
          for a in KoaRoomMap.anchors {
            consider(k, a, score(a, walking: true, ctx) * (0.35 + e.energy) * night, rng.range(0.55, 1.45))
          }
        case .lookAround:
          for a in KoaRoomMap.anchors {
            consider(k, a, score(a, walking: false, ctx) * 0.5 * night, rng.range(0.55, 1.45))
          }
        case .home:
          let t = restSpot(ctx), here = spot()
          let away = hypot(here.x - t.x, here.d - t.d) > 12 || plane != t.plane
          if away { consider(k, nil, 0.7 + 0.8 * (1 - e.energy), rng.range(0.55, 1.45)) }
        default: break
        }
      }
      return best.flatMap { make($0.0, ctx: ctx, anchor: $0.1) } ?? make(.rest, ctx: ctx)
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
        seenAt[a.name] = clock
        if b.kind == .explore {
          visited.append(a.name)
          if visited.count > 6 { visited.removeFirst(visited.count - 6) }
        }
      }
      walker.tuning.apply(b.style)
      // mắt trước tiên
      gaze.look(b.gaze, from: (walker.x, walker.y - walker.elevation), turn: walker.pose.turn)
      gestureWant = 0
    }

    // MARK: Khung

    public mutating func step(_ dt: Double, ctx: Context) -> Frame {
      clock += dt
      fresh = nil
      if ctx.moment == nil { reacted = [] }
      // chuyện thật vừa xảy ra: ngắt việc đang làm ở điểm an toàn, một lần. Sân khấu khuất thì
      // đợi người xem quay lại, ăn mừng cho không ai xem là vô nghĩa
      if let m = ctx.moment, !reacted.contains(m), ctx.canWalk, !ctx.quiet, walker.atSafePoint {
        if let b = make(m == .comeback ? .welcome : .proud, ctx: ctx) {
          pending = nil
          reacted.insert(m)
          fresh = m
          start(b)
        }
      }
      // tới giờ ngồi: đi về bục trước, không ngồi tại chỗ (Kiệt 30/10). Khuất thì đợi
      let rest = restSpot(ctx)
      // đang ngồi trên bục mà tới giờ ngủ: chỗ nghỉ đã đổi, phải đứng dậy đi tới đó
      if ctx.bedtime != seatedForBed { seated = false }
      seatedForBed = ctx.bedtime
      seated = ctx.settle && (seated || (atSpot(rest) && !walker.isMoving))
      if ctx.settle, !atSpot(rest), !ctx.quiet, walker.atSafePoint, running?.b.kind != .home, let b = make(.home, ctx: ctx) {
        pending = nil
        start(b)
      }
      // yêu cầu: chỉ nhận ở điểm an toàn
      if let r = pending, walker.atSafePoint {
        pending = nil
        switch r {
        case .greet: if let b = make(.greet, ctx: ctx), ctx.canWalk { start(b) } else { gaze.look(.user, from: (walker.x, walker.y), turn: 0) }
        case .notice: if let b = make(.notice, ctx: ctx) { start(b) }
        case .look(let name):
          if let a = KoaRoomMap.anchor(name), let b = make(.lookAround, ctx: ctx, anchor: a) { start(b) }
        case .walkTo(let s):
          if ctx.canWalk {
            lastUser = clock
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

      // đứng yên: trọng tâm dịch rất chậm, hai nhịp lệch nhau để không đều như máy
      walker.idleShift = 0.9 * sin(clock * 0.53) * (0.6 + 0.4 * sin(clock * 0.19 + 1.3)) * (1 - min(1, walker.weight * 2))
      walker.step(dt)
      exertion = max(0, min(1, exertion + dt * (walker.isHopping ? 0.5 : walker.speed > 4 ? 0.14 : -0.05)))
      // nhịp nghỉ: thở nhanh sau khi đi rồi lắng, chậm khi ít năng lượng, và không đều nhẹ để
      // vòng lặp của bản vẽ không lộ
      let drift = 0.08 * sin(clock * 0.37) * sin(clock * 0.11 + 0.7)
      idleClock += dt * 1000 * (0.9 + 0.2 * ctx.affect.energy + 0.5 * exertion + drift)
      // gesture hiện dần / tắt dần
      // dáng của ngày tắt hẳn rồi dáng của hành vi mới hiện — hai dáng không chồng nhau
      let acting = expression != nil || gesture != nil
      let dayWant = acting ? 0 : 1 - walker.weight * 0.85
      dayAmount += (dayWant - dayAmount) * min(1, 8 * dt)
      let want = dayAmount < 0.05 ? gestureWant : min(gestureWant, gestureAmount)
      gestureAmount += (want - gestureAmount) * min(1, 5 * dt)
      if gestureAmount < 0.01, gestureWant == 0 { gesture = nil }

      let head = (walker.x, walker.y - walker.elevation)
      let g = gaze.step(dt, koa: head, turn: walker.pose.turn)
      // lá cây: rung khi Koa đi sát hay ngửi
      var sway = 0.0
      if let k = plantKick {
        let t = clock - k
        // bậc 0,25°: ít giá trị khác nhau thì bộ nhớ đệm kế hoạch vẽ của phòng dùng lại được
        sway = (18 * sin(2 * Double.pi * 2.1 * t) * exp(-t * 1.6)).rounded() / 4
        if t > 3 { plantKick = nil }
      }
      if plane == .floor, hypot(walker.x - 300, walker.y - 378) < 34, walker.speed > 4, plantKick == nil {
        plantKick = clock
      }
      var p = walker.pose
      // tai: dựng khi tự hào, hơi cụp khi ít năng lượng; thỉnh thoảng giật một bên, không đều
      let ears = 3 * max(0, 0.6 - ctx.affect.energy) - 2.5 * ctx.affect.pride
      p.earLeft = ears
      p.earRight = ears
      nextFlick -= dt
      if nextFlick <= 0, flick == nil, walker.speed < 1 {
        flick = (rng.next() < 0.5, 0)
        nextFlick = rng.range(4, 16)
      }
      if var f = flick {
        f.t += dt
        let a = KoaFlick.angle(f.t)
        if f.left { p.earLeft += a } else { p.earRight += a }
        flick = f.t < KoaFlick.length ? f : nil
      }
      var path: [KoaRoomMap.Spot] = []
      for leg in running?.legs ?? [] {
        switch leg {
        case .walk(let pts): path += pts
        case .hop(let a, let b): path += [a, b]
        }
      }
      return Frame(
        // còn quay một bên thì vẫn đưa dáng xuống: bỏ dáng ngay lúc dừng quay làm mặt / tai /
        // bụng bật về giữa một khung, rồi bật lại khi quay về (Kiệt 30/10: "bị giật")
        walk: p, x: walker.x, screenY: walker.y - walker.elevation, depth: walker.y,
        plane: plane, scale: walker.scale, gaze: g, expression: seated ? nil : expression, gesture: gesture,
        gestureAmount: gestureAmount, dayAmount: dayAmount, moving: walker.isMoving, plantSway: sway,
        settled: seated || (!ctx.settle && atSpot(KoaRoomMap.stageMark)),
        reacted: fresh, idleClock: idleClock, behavior: running?.b.kind.rawValue ?? "-",
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
        // đón người quay lại thì ấm áp, giữ nét vui, không mắt sao như ăn mừng
        if at(0.4), b.kind == .greet { expression = .delighted }
      case .proudPose:
        if at(0) {
          walker.faceTurn = 0
          gaze.look(.user, from: koa, turn: turn)
          gesture = b.gesture
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
