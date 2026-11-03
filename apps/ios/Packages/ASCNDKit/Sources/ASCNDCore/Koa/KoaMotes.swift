public import Foundation

/// Bụi trong phòng (Kiệt 02/11). Bụi thật không tự bay: nó bị luồng khí cuốn đi, nên mỗi hạt trôi
/// theo một trường dòng khí xoáy chậm (curl noise của Bridson), hạt gần nhau đi cùng nhau, hạt xa
/// đi hướng khác. Trường này không có điểm tụ nên bụi không vón lại. Thêm một vòng đối lưu: khí ấm
/// lên giữa phòng dưới đèn, xuống ở hai bên.
public struct KoaMotes: Sendable {
  public struct Mote: Sendable, Hashable {
    public var x: Double
    public var y: Double
    /// 0…1.
    public var size: Double
    var age: Double
    var life: Double
    var phase: Double

    /// Hiện dần rồi tan dần, không bật tắt.
    public var fade: Double { min(1, sin(min(1, age / life) * .pi) * 4) }
  }

  public private(set) var motes: [Mote] = []
  private let x: ClosedRange<Double>
  private let y: ClosedRange<Double>
  private var state: UInt64

  public init(count: Int, x: ClosedRange<Double>, y: ClosedRange<Double>, seed: UInt64 = 1) {
    self.x = x
    self.y = y
    state = seed &* 2_654_435_761 | 1
    resize(count)
  }

  public mutating func resize(_ count: Int) {
    if motes.count > count { motes.removeLast(motes.count - count) }
    while motes.count < count {
      var m = spawn()
      m.age = next() * m.life
      motes.append(m)
    }
  }

  private mutating func next() -> Double {
    state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
    return Double(state >> 40) / Double(1 << 24)
  }

  private mutating func spawn() -> Mote {
    Mote(
      x: x.lowerBound + next() * (x.upperBound - x.lowerBound), y: y.lowerBound + next() * (y.upperBound - y.lowerBound),
      size: next(), age: 0, life: 12 + next() * 18, phase: next() * 6.28)
  }

  /// Vận tốc của khí tại một điểm, điểm/giây. Là curl của một hàm thế nên không có chỗ hút.
  public static func flow(x: Double, y: Double, t: Double) -> (u: Double, v: Double) {
    let k1 = 0.037, k2 = 0.09, roll = Double.pi / 200
    let a1 = 243.0, a2 = 67.0, c = 95.0
    let p1 = k1 * x + 0.13 * t, q1 = k1 * y - 0.09 * t
    let p2 = k2 * x - 0.07 * t + 1.3, q2 = k2 * y + 0.11 * t
    let u = -a1 * k1 * sin(p1) * sin(q1) + a2 * k2 * sin(p2) * cos(q2)
    let v = -a1 * k1 * cos(p1) * cos(q1) - a2 * k2 * cos(p2) * sin(q2) - c * roll * cos((x - 195) * roll)
    return (u, v)
  }

  public mutating func step(_ dt: Double, t: Double) {
    for i in motes.indices {
      var m = motes[i]
      let f = Self.flow(x: m.x, y: m.y, t: t)
      // hạt nhỏ chao thêm một chút theo nhịp riêng, và lắng rất chậm
      m.x += (f.u + sin(t * 1.3 + m.phase) * 2.2) * dt
      m.y += (f.v + cos(t * 1.1 + m.phase) * 2.2 + 0.7) * dt
      m.age += dt
      motes[i] = m.age >= m.life || !x.contains(m.x) || !y.contains(m.y) ? spawn() : m
    }
  }
}

/// Phòng sáng tối theo giờ trên máy, không theo giao diện sáng tối của app (Kiệt 02/11).
public enum KoaDaylight {
  public static func isDay(hour: Int) -> Bool { (6..<18).contains(hour) }

  public static func isDay(at date: Date, calendar: Calendar = .current) -> Bool {
    isDay(hour: calendar.component(.hour, from: date))
  }
}
