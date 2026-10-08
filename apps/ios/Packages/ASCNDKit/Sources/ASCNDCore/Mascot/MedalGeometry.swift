import Foundation

/// Dáng đĩa huy chương theo miền (`medalPath` của `components/ascnd/medal.tsx`
/// @ fac9ac2) — đường SVG trong hộp 72×72, tâm (36, 36). Cùng chuỗi lệnh RN
/// vẽ, từng ký tự (`MedalGeometryGoldenTests`), để view dựng `Path` từ đó.
///
/// Chuỗi ngày: tia mặt trời 12 cánh · buổi tập: khiên · PR: sao 5 cánh · bước
/// chân: lục giác · dinh dưỡng: bát giác · nước: hình thoi · giấc ngủ: vuông bo
/// · cân nặng: tròn (`nil`).
public enum MedalGeometry {
  /// Bán kính vành / mặt đĩa (`medalPath(type, 33)`, `medalPath(type, 28)`).
  public static let rimRadius = 33.0
  public static let faceRadius = 28.0

  public static func path(type: String, r: Double) -> String? {
    switch type {
    case "streak": return star(r, points: 12, inner: 0.8)
    case "first_workout", "volume_milestone": return shield(r)
    case "pr": return star(r, points: 5, inner: 0.45)
    case "steps_goal": return poly(r, sides: 6)
    case "nutrition": return poly(r, sides: 8, rotate: -Double.pi / 8)
    case "water": return poly(r, sides: 4, rotate: -Double.pi / 2)
    case "sleep": return squircle(r)
    default: return nil
    }
  }

  /// `toFixed(2)`: số đúng nửa đường (giá trị nhị phân CHÍNH XÁC là x.xx5) lấy
  /// số LỚN hơn — `printf` lấy số chẵn (41.625 → "41.62", JS "41.63").
  static func fixed2(_ v: Double) -> String {
    let exact = String(format: "%.40f", v)
    if let dot = exact.firstIndex(of: ".") {
      let frac = exact[exact.index(after: dot)...]
      if frac.count > 3 {
        let third = frac.index(frac.startIndex, offsetBy: 2)
        if frac[third] == "5" && frac[frac.index(after: third)...].allSatisfy({ $0 == "0" }) {
          return String(format: "%.2f", v > 0 ? v.nextUp : v.nextDown)
        }
      }
    }
    return String(format: "%.2f", v)
  }

  /// `${n}` của JS cho các toạ độ không qua `toFixed`.
  static func js(_ v: Double) -> String {
    v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : "\(v)"
  }

  static func poly(_ r: Double, sides: Int, rotate: Double = -Double.pi / 2) -> String {
    var pts: [String] = []
    for i in 0..<sides {
      let a = rotate + Double(i) * 2 * Double.pi / Double(sides)
      pts.append("\(fixed2(36 + r * cos(a))),\(fixed2(36 + r * sin(a)))")
    }
    return "M \(pts.joined(separator: " L ")) Z"
  }

  static func star(_ r: Double, points: Int, inner: Double) -> String {
    var pts: [String] = []
    for i in 0..<(points * 2) {
      let rad = i % 2 == 0 ? r : r * inner
      let a = -Double.pi / 2 + Double(i) * Double.pi / Double(points)
      pts.append("\(fixed2(36 + rad * cos(a))),\(fixed2(36 + rad * sin(a)))")
    }
    return "M \(pts.joined(separator: " L ")) Z"
  }

  static func squircle(_ r: Double) -> String {
    let k = r * 0.55
    let a = r * 0.92
    return [
      "M \(js(36 - a + k)) \(js(36 - a))", "L \(js(36 + a - k)) \(js(36 - a))",
      "Q \(js(36 + a)) \(js(36 - a)) \(js(36 + a)) \(js(36 - a + k))", "L \(js(36 + a)) \(js(36 + a - k))",
      "Q \(js(36 + a)) \(js(36 + a)) \(js(36 + a - k)) \(js(36 + a))", "L \(js(36 - a + k)) \(js(36 + a))",
      "Q \(js(36 - a)) \(js(36 + a)) \(js(36 - a)) \(js(36 + a - k))", "L \(js(36 - a)) \(js(36 - a + k))",
      "Q \(js(36 - a)) \(js(36 - a)) \(js(36 - a + k)) \(js(36 - a))", "Z",
    ].joined(separator: " ")
  }

  static func shield(_ r: Double) -> String {
    let w = r * 0.9
    return [
      "M \(js(36 - w)) \(js(36 - r + r * 0.16))",
      "Q \(js(36 - w)) \(js(36 - r)) \(js(36 - w * 0.8)) \(js(36 - r))",
      "L \(js(36 + w * 0.8)) \(js(36 - r))",
      "Q \(js(36 + w)) \(js(36 - r)) \(js(36 + w)) \(js(36 - r + r * 0.16))",
      "L \(js(36 + w)) \(js(36 - r * 0.3))",
      "Q \(js(36 + w)) \(js(36 + r * 0.3)) \(js(36)) \(js(36 + r))",
      "Q \(js(36 - w)) \(js(36 + r * 0.3)) \(js(36 - w)) \(js(36 - r * 0.3))",
      "Z",
    ].joined(separator: " ")
  }

  // MARK: - Vệt sáng của mặt tròn

  /// `M 13 30 A 24 24 0 0 1 44 13 A 28 28 0 0 0 13 44 Z` — lát sáng góc trên
  /// trái, chỉ vẽ trên mặt TRÒN (dáng khác đã có chuyển màu xuyên tâm). Trả
  /// về đa giác dày điểm của hai cung (đổi tham số đầu-cuối của SVG sang tâm),
  /// để view không phụ thuộc chiều `clockwise` của `Path.addArc`.
  public static let sheen: [Point] = {
    let a = arc(from: Point(x: 13, y: 30), to: Point(x: 44, y: 13), r: 24, large: false, sweep: true)
    let b = arc(from: Point(x: 44, y: 13), to: Point(x: 13, y: 44), r: 28, large: false, sweep: false)
    return a + b.dropFirst()
  }()

  public struct Point: Sendable, Hashable {
    public let x: Double
    public let y: Double
    public init(x: Double, y: Double) {
      self.x = x
      self.y = y
    }
  }

  /// Cung tròn SVG (`rx == ry`, không xoay) → các điểm từ `p1` tới `p2`.
  /// `sweep` = chiều góc tăng (theo kim đồng hồ khi trục y hướng xuống).
  static func arc(from p1: Point, to p2: Point, r: Double, large: Bool, sweep: Bool, steps: Int = 16) -> [Point] {
    let x1 = (p1.x - p2.x) / 2
    let y1 = (p1.y - p2.y) / 2
    let d2 = x1 * x1 + y1 * y1
    // Bán kính quá nhỏ: SVG phóng nó lên vừa đủ — tâm là trung điểm.
    let k = (large != sweep ? 1.0 : -1.0) * (Swift.max(0, r * r - d2) / d2).squareRoot()
    let rr = Swift.max(r, d2.squareRoot())
    let cx = k * y1 + (p1.x + p2.x) / 2
    let cy = -k * x1 + (p1.y + p2.y) / 2
    let t1 = atan2(p1.y - cy, p1.x - cx)
    var dt = atan2(p2.y - cy, p2.x - cx) - t1
    if sweep, dt < 0 { dt += 2 * Double.pi }
    if !sweep, dt > 0 { dt -= 2 * Double.pi }
    return (0...steps).map { i in
      if i == 0 { return p1 }
      if i == steps { return p2 }
      let t = t1 + dt * Double(i) / Double(steps)
      return Point(x: cx + rr * cos(t), y: cy + rr * sin(t))
    }
  }

  // MARK: - Đọc lại cho view

  /// Một lệnh của đường: M / L / Q / Z, toạ độ trong hộp 72×72.
  public enum Command: Sendable, Hashable {
    case move(Double, Double)
    case line(Double, Double)
    case quad(cx: Double, cy: Double, x: Double, y: Double)
    case close
  }

  /// Tách chuỗi `M x,y L x,y …` / `M x y Q cx cy x y …` thành lệnh.
  public static func commands(_ d: String) -> [Command] {
    let tokens = d.replacingOccurrences(of: ",", with: " ").split(separator: " ").map(String.init)
    var out: [Command] = []
    var i = 0
    func num() -> Double? {
      guard i < tokens.count, let v = Double(tokens[i]) else { return nil }
      i += 1
      return v
    }
    while i < tokens.count {
      let op = tokens[i]
      i += 1
      switch op {
      case "M":
        if let x = num(), let y = num() { out.append(.move(x, y)) }
      case "L":
        if let x = num(), let y = num() { out.append(.line(x, y)) }
      case "Q":
        if let cx = num(), let cy = num(), let x = num(), let y = num() { out.append(.quad(cx: cx, cy: cy, x: x, y: y)) }
      case "Z":
        out.append(.close)
      default:
        continue
      }
    }
    return out
  }
}
