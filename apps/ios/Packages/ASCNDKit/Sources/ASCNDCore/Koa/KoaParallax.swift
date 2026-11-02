public import Foundation

/// Phòng Koa nhiều lớp (01/11, Kiệt duyệt mock): như máy quay nhiều tầng của phim hoạt hình,
/// lớp gần trôi nhiều, lớp xa gần như đứng yên. Mọi độ lệch tính theo toạ độ phòng 390.
///
/// Thứ tự lớp giữ đúng thứ tự vẽ của `StudioScene.template`: máy quay ở giữa thì hình như
/// phòng một lớp, chỉ phóng to `overscan` để có chỗ cho các lớp trượt.
public enum KoaParallax {
  /// Chạm trên vùng sàn của phòng → chỗ đứng. `x`, `y` tính bằng điểm từ góc trên trái vùng
  /// sàn, `top` là đỉnh vùng sàn trong toạ độ phòng, `scale` là điểm trên một đơn vị phòng.
  /// `zoom`: phòng đang phóng sẵn thì quy chỗ chạm về toạ độ gốc.
  public static func floorTap(x: Double, y: Double, scale: Double, top: Double, zoom: Double) -> KoaRoomMap.Spot {
    let cx = StudioScene.width / 2
    return KoaRoomMap.spot(
      screenX: cx + (x / scale - cx) / zoom,
      y: anchorY + (y / scale + top - anchorY) / zoom)
  }

  /// Một tầng của máy quay.
  public struct Plane: Sendable, Hashable {
    /// Lệch ngang tối đa (điểm) khi máy quay ở mép.
    public let amp: Double
    /// Phần trễ khi cuộn trang: 0 = cuộn cùng trang, 0,16 = chậm hơn trang 16 %.
    public let lag: Double

    public static let sky = Plane(amp: 1, lag: 0.2)
    public static let city = Plane(amp: 1.8, lag: 0.18)
    public static let wall = Plane(amp: 3, lag: 0.16)
    public static let lamp = Plane(amp: 4.6, lag: 0.08)
    /// Đồ đặt trên sàn: kệ, chậu cây, quả bóng. Một tầng, để lớp bụi và lớp che Koa đi cùng đồ.
    public static let props = Plane(amp: 4.8, lag: 0)
    /// Bục và vũng sáng: bằng sàn ở `y` 412, mặt bục.
    public static let stage = Plane(amp: floorAmp(412), lag: 0)
    /// Viền tối của ống kính: đứng yên với màn.
    public static let lens = Plane(amp: 0, lag: 0)
  }

  /// Phóng sẵn cả cảnh, chừa khoảng 8 điểm mỗi bên cho các lớp trượt.
  public static let overscan = 1.04
  /// Tâm phóng trong toạ độ phòng.
  public static let anchorY = 300.0

  /// Sàn nghiêng theo hàng: mép sát tường đi cùng tường, mép gần người xem lệch nhiều nhất.
  public static let floorBack = (y: 360.0, amp: 3.0)
  public static let floorFront = (y: 476.0, amp: 7.5)
  public static func floorAmp(_ y: Double) -> Double {
    floorBack.amp + (y - floorBack.y) * floorSlope
  }
  public static var floorSlope: Double { (floorFront.amp - floorBack.amp) / (floorFront.y - floorBack.y) }

  /// Tầng của Koa: đứng trên bục thì đi cùng bục, trên sàn thì theo đúng hàng sàn dưới chân.
  public static func amp(koa plane: KoaRoomMap.Plane, y: Double) -> Double {
    plane == .stage ? Plane.stage.amp : floorAmp(y)
  }

  /// Khung hiện tại của máy quay, đủ cho view vẽ.
  public struct Shot: Sendable, Hashable {
    /// −1…1: máy lia sang trái / phải.
    public var pan = 0.0
    /// 0…1: đẩy máy vào.
    public var push = 0.0
    /// 0…1: phần phóng sẵn đang dùng. Về 0 khi Koa sang phòng ngủ, để khớp Koa của cảnh ngủ.
    public var framing = 1.0

    public init(pan: Double = 0, push: Double = 0, framing: Double = 1) {
      self.pan = pan
      self.push = push
      self.framing = framing
    }

    /// Dịch ngang của một tầng: máy sang phải thì cảnh trôi sang trái.
    public func shift(_ amp: Double) -> Double { -pan * amp }
    public var zoom: Double { 1 + (overscan - 1) * framing }
    /// Đẩy máy: tầng gần to thêm nhiều hơn tầng xa.
    public func scale(_ amp: Double) -> Double { 1 + push * (0.012 + 0.05 * (amp - 1) / 5.6) }
  }

  /// Máy quay trễ một nhịp sau Koa, chừa chỗ phía Koa đang đi tới, dừng thì lắng dần.
  public struct Camera: Sendable {
    public static let reach = 130.0
    /// Tốc độ đi thường của Koa trong phòng (điểm / giây), để đo độ chừa chỗ.
    static let walkSpeed = 46.0
    static let lead = 0.14
    static let omega = 3.2
    static let pushIn = 1.6
    static let pushHold = 1.4

    public private(set) var x = 0.0
    public private(set) var velocity = 0.0
    private var framing = 1.0
    private var pushAge: Double?
    private var koaX: Double?

    public init() {}

    /// Khoảnh khắc thật (vừa vào phòng, phản ứng buổi tập): đẩy máy vào rồi lui ra.
    public mutating func push() { pushAge = 0 }

    /// Về khung gốc ngay: Koa đã sang cảnh ngủ.
    public mutating func rest() {
      x = 0
      velocity = 0
      framing = 0
      pushAge = nil
    }

    /// Một khung. `framed` = false: lui về khung gốc.
    public mutating func step(_ dt: Double, koaX now: Double, framed: Bool = true) {
      let speed = dt > 0 ? (now - (koaX ?? now)) / dt : 0
      if koaX == nil { x = Self.target(now, speed: 0) }
      koaX = now
      let target = framed ? Self.target(now, speed: speed) : 0
      // lò xo tắt dần tới hạn: không nảy qua đích
      let w = Self.omega
      velocity += (-2 * w * velocity - w * w * (x - target)) * dt
      x += velocity * dt
      framing += ((framed ? 1 : 0) - framing) * min(1, dt * 3)
      if let age = pushAge {
        let next = age + dt
        pushAge = next < 2 * Self.pushIn + Self.pushHold ? next : nil
      }
    }

    static func target(_ koaX: Double, speed: Double) -> Double {
      let lead = max(-Camera.lead, min(Camera.lead, speed / walkSpeed * Camera.lead))
      return max(-1, min(1, (koaX - StudioScene.stageMark.x) / reach + lead))
    }

    public var settling: Bool { abs(velocity) > 0.01 || pushAge != nil }

    /// Khung để vẽ, cộng độ nghiêng máy.
    public func shot(tilt: Double = 0) -> Shot {
      Shot(pan: max(-1, min(1, x * 0.75 + tilt * 0.5)), push: pushAmount, framing: framing)
    }

    var pushAmount: Double {
      guard let t = pushAge else { return 0 }
      let total = 2 * Self.pushIn + Self.pushHold
      if t < Self.pushIn { return Self.ease(t / Self.pushIn) }
      if t < Self.pushIn + Self.pushHold { return 1 }
      return 1 - Self.ease((t - Self.pushIn - Self.pushHold) / (total - Self.pushIn - Self.pushHold))
    }

    static func ease(_ t: Double) -> Double { t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2 }
  }

  /// Nghiêng điện thoại thành −1…1. Tự quên dần tư thế đang cầm: để yên ở góc nào thì góc đó
  /// thành giữa, nằm nghiêng đọc điện thoại không làm phòng lệch mãi.
  public struct Tilt: Sendable {
    static let range = 0.35
    static let forget = 3.0
    static let follow = 8.0

    private var baseline: Double?
    public private(set) var value = 0.0

    public init() {}

    public mutating func step(_ dt: Double, roll: Double) {
      var base = baseline ?? roll
      base += (roll - base) * min(1, dt / Self.forget)
      baseline = base
      let raw = max(-1, min(1, (roll - base) / Self.range))
      value += (raw - value) * min(1, dt * Self.follow)
    }

    public mutating func reset() {
      baseline = nil
      value = 0
    }
  }
}

extension StudioScene {
  /// Một lớp của phòng nhiều lớp: phần tử của `template` và phần của lớp chiều sâu.
  public struct Layer: Sendable, Identifiable {
    public enum Part: Sendable {
      case template(ClosedRange<Int>)
      /// Chỉ số trong `depthLayer`.
      case depth([Int])
    }
    public enum Kind: Sendable {
      case plain
      /// Nền sàn: nghiêng theo hàng thay vì dịch đều.
      case floor
      /// Phía ngoài cửa sổ: cắt theo khung cửa của lớp tường.
      case outside
      /// Đồ trên sàn, có chậu cây rung.
      case props
    }
    public let id: String
    public let plane: KoaParallax.Plane
    public var kind = Kind.plain
    public let parts: [Part]
  }

  /// Khung kính cửa sổ, nơi cắt các lớp ngoài trời.
  public static let window = (x: 278.0, y: 101.0, width: 83.0, height: 105.0)
  /// Lớp sương chèn ngay trước lớp này: sau cả phần tường, trước đồ trên sàn.
  public static let hazeBefore = "props"
  /// Sương phủ phần tường, tới chân tường.
  public static let hazeBottom = 360.0

  /// Thứ tự vẽ, đúng theo `tree`. Bảng neon vẽ sau viền tối như trong phòng gốc nên nằm sau
  /// sương: chữ phát sáng vẫn rõ.
  public static let layers: [Layer] = [
    Layer(id: "wall", plane: .wall, parts: [.template(0...15)]),
    Layer(
      id: "floor", plane: .wall, kind: .floor,
      parts: [.template(16...22), .depth(Array(5...16)), .template(23...23)]),
    Layer(id: "wallDepth", plane: .wall, parts: [.depth([1, 2, 3, 4] + Array(17...22))]),
    Layer(id: "frame", plane: .wall, parts: [.template(24...26)]),
    Layer(id: "sky", plane: .wall, kind: .outside, parts: [.template(27...27)]),
    Layer(id: "stars", plane: .sky, kind: .outside, parts: [.template(28...35)]),
    Layer(id: "city", plane: .city, kind: .outside, parts: [.template(36...57)]),
    Layer(id: "wallTop", plane: .wall, parts: [.template(58...76)]),
    Layer(id: "props", plane: .props, kind: .props, parts: [.template(77...94)]),
    Layer(id: "vignette", plane: .lens, parts: [.template(95...97)]),
    Layer(id: "pool", plane: .stage, parts: [.template(98...98)]),
    Layer(id: "neon", plane: .wall, parts: [.template(99...107)]),
    Layer(id: "lamp", plane: .lamp, parts: [.template(108...131)]),
    Layer(id: "stage", plane: .stage, parts: [.template(132...149)]),
  ]

  /// Cây phần tử của một lớp. Mỗi phần đều có đủ `Defs` để dùng chung màu chuyển.
  public static func tree(_ o: Options, layer: Layer) -> [KoaRender.Element] {
    var flat = o
    flat.depth = false
    let table = o.light ? lightSkins : skins
    let skin = table[o.skin] ?? table["default"]!
    var out: [KoaRender.Element] = []
    for part in layer.parts {
      switch part {
      case .template(let r):
        out += build(template, flat, decor: true, only: Set(r))
      case .depth(let indices):
        guard o.depth else { continue }
        out += ([0] + indices).compactMap { element(depthLayer[$0], o, skin) }
      }
    }
    return out
  }
}
