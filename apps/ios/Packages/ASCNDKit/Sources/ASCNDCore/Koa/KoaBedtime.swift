public import Foundation

/// Cảnh đi ngủ kiểu phim hoạt hình (Kiệt 31/10): Koa đi từ trái sang phải, phòng trôi ngược lại,
/// mảng tường lướt qua phía trước che chỗ đổi phòng; sang gác mái Koa khuỵu, nhảy lên giường,
/// chăn kéo lên. Thuần theo thời gian: app đưa giây đã trôi, nhận về `Shot`.
public struct KoaBedtime: Sendable {
  /// Một khung của Koa, toạ độ phòng 390: tâm đầu, cỡ hình, góc nghiêng (độ).
  public struct Shot: Sendable, Hashable {
    public var x: Double
    public var y: Double
    public var scale: Double
    public var angle: Double
    public var walk: KoaWalk.Pose?
    /// Mắt đã nhắm (đang trên không tới lúc ngủ).
    public var eyesClosed: Bool
  }

  /// Khung hình lia xong (giây).
  public static let pan = 3.6
  /// Koa tới cạnh giường.
  public static let arrive = 4.4
  /// Khuỵu lấy đà, rồi bay.
  public static let crouch = 0.24
  public static let air = 0.6
  /// Chạm giường: từ đây phòng ngủ tự vẽ Koa, dưới lớp chăn.
  public static var land: Double { arrive + crouch + air }
  public static let blanket = 0.5
  public static var end: Double { land + blanket }
  /// Bề ngang mảng tường lướt qua phía trước.
  public static let wall = 120.0

  /// Cỡ hình ở vạch đứng, đơn vị phòng, và khoảng từ tâm đầu tới chân trên hình 240 × 300.
  static let heroWidth = 138.0
  static let headToFeet = 175.0
  static let from = KoaRoomMap.door
  static let toX = 236.0
  /// Chân Koa trên sàn gác mái, trước giường, và cỡ tương ứng.
  static let bedroomY = 446.0
  static let bedroomScale = 0.87

  /// Đi nhanh hơn thường: phòng trôi cả chiều ngang trong vài giây.
  static let hurry = KoaWalk.Style(
    name: "bedtime", maxSpeed: 80, accel: 160, brake: 120, cadence: 1, lift: 10, bob: 1, sway: 0.8, arms: 1,
    lean: 0.8, anticipation: 0, settle: 0.6)

  var walker: KoaWalk.Walker
  var last = 0.0

  public init() {
    var t = KoaWalk.Tuning()
    t.heroWidth = Self.heroWidth
    t.apply(Self.hurry)
    walker = KoaWalk.Walker(
      x: 0, y: KoaRoomMap.stageMark.d, floor: KoaWalk.Floor(minX: -1e5, maxX: 1e5, minY: -1e5, maxY: 1e5), tuning: t)
    // `place` đặt người quay sẵn sang phải: bước đầu không ngoảnh từ giữa
    walker.faceTurn = 1
    walker.place(at: 0, KoaRoomMap.stageMark.d)
    // đi tại chỗ: `walker` chỉ cho dáng chân, chỗ đứng trên màn tính theo thời gian
    walker.walk(to: Self.hurry.maxSpeed * (Self.arrive - 0.55), KoaRoomMap.stageMark.d)
  }

  static func smooth(_ u: Double) -> Double {
    let v = min(1, max(0, u))
    return v * v * (3 - 2 * v)
  }

  /// Chăn: 0 gập ở chân giường … 1 đắp xong.
  public static func cover(at t: Double) -> Double { smooth((t - land) / blanket) }

  public mutating func shot(at t: Double) -> Shot {
    if t > last {
      walker.step(t - last)
      last = t
    }
    // đổi độ sâu trong lúc mảng tường che
    let m = Self.smooth((t / Self.pan - 0.42) / 0.16)
    let feet = KoaRoomMap.screenY(Self.from) + (Self.bedroomY - KoaRoomMap.screenY(Self.from)) * m
    let depth = KoaRoomMap.scale(Self.from.d) + (Self.bedroomScale - KoaRoomMap.scale(Self.from.d)) * m
    let s = Self.heroWidth * depth / 240
    let x = Self.from.x + (Self.toX - Self.from.x) * Self.smooth(t / Self.arrive)
    let head = (x: x, y: feet - Self.headToFeet * s)
    if t < Self.arrive {
      return Shot(x: head.x, y: head.y, scale: s, angle: 0, walk: walker.pose, eyesClosed: false)
    }
    let c = t - Self.arrive
    if c < Self.crouch {
      // khuỵu: thấp xuống, quay về phía giường
      let u = Self.smooth(c / Self.crouch)
      walker.faceTurn = -1
      return Shot(x: head.x, y: head.y + 9 * u, scale: s, angle: 0, walk: walker.pose, eyesClosed: false)
    }
    let u = min(1, (c - Self.crouch) / Self.air)
    let bed = KoaBedroom.sleeper
    let e = Self.smooth(u)
    return Shot(
      x: head.x + (bed.x - head.x) * e,
      y: head.y + 9 * (1 - e) + (bed.y - head.y) * e - 92 * 4 * u * (1 - u),
      scale: s + (bed.scale - s) * e, angle: bed.angle * Self.smooth((u - 0.25) / 0.75), walk: walker.pose, eyesClosed: u > 0.35)
  }
}

/// Cảnh Koa dậy, ngược chiều `KoaBedtime`: chăn gập về chân giường, Koa nhảy xuống, đi từ phải sang
/// trái, phòng trôi ngược lại, mảng tường lướt qua, về đúng chỗ đứng trên sân khấu.
public struct KoaWakeUp: Sendable {
  /// Chăn gập xong: từ đây Koa do cảnh vẽ, phòng ngủ không vẽ nữa.
  public static let blanket = 0.42
  static let air = 0.6
  /// Koa chạm sàn, đứng một nhịp rồi khung hình mới lia.
  public static var lead: Double { blanket + air + 0.14 }
  public static var end: Double { lead + KoaBedtime.pan }

  var walker: KoaWalk.Walker
  var last = 0.0
  var walking = false

  public init() {
    var t = KoaWalk.Tuning()
    t.heroWidth = KoaBedtime.heroWidth
    t.apply(KoaBedtime.hurry)
    walker = KoaWalk.Walker(
      x: 0, y: KoaRoomMap.stageMark.d, floor: KoaWalk.Floor(minX: -1e5, maxX: 1e5, minY: -1e5, maxY: 1e5), tuning: t)
    walker.faceTurn = -1
    walker.place(at: 0, KoaRoomMap.stageMark.d)
  }

  /// Chăn: 1 đắp … 0 gập ở chân giường.
  public static func cover(at t: Double) -> Double { 1 - KoaBedtime.smooth(t / blanket) }

  /// `nil` khi Koa còn nằm dưới chăn (phòng ngủ tự vẽ).
  public mutating func shot(at t: Double) -> KoaBedtime.Shot? {
    guard t >= Self.blanket else { return nil }
    if t >= Self.blanket + Self.air, !walking {
      walking = true
      // đi tại chỗ, chỗ đứng trên màn tính theo thời gian (như `KoaBedtime`)
      walker.walk(to: -KoaBedtime.hurry.maxSpeed * (KoaBedtime.pan - 0.45), KoaRoomMap.stageMark.d)
    }
    if t > last {
      walker.step(t - last)
      last = t
    }
    if t > Self.end - 0.3 { walker.faceTurn = 0 }
    let b = KoaBedtime.self
    let p = (t - Self.lead) / b.pan
    let m = 1 - b.smooth((p - 0.42) / 0.16)
    let door = KoaRoomMap.screenY(b.from)
    let feet = door + (b.bedroomY - door) * m
    let depth = KoaRoomMap.scale(b.from.d) + (b.bedroomScale - KoaRoomMap.scale(b.from.d)) * m
    let s = b.heroWidth * depth / 240
    let x = b.toX + (b.from.x - b.toX) * b.smooth(p)
    let head = (x: x, y: feet - b.headToFeet * s)
    let u = min(1, (t - Self.blanket) / Self.air)
    guard u < 1 else { return .init(x: head.x, y: head.y, scale: s, angle: 0, walk: walker.pose, eyesClosed: false) }
    let bed = KoaBedroom.sleeper
    let e = b.smooth(u)
    return .init(
      x: bed.x + (head.x - bed.x) * e, y: bed.y + (head.y - bed.y) * e - 70 * 4 * u * (1 - u),
      scale: bed.scale + (s - bed.scale) * e, angle: bed.angle * (1 - b.smooth(u / 0.75)), walk: walker.pose, eyesClosed: u < 0.3)
  }
}
