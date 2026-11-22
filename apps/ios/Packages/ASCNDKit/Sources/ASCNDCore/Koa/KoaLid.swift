import Foundation

/// Mí mắt vẽ lại (Kiệt 21/11), sinh hình theo ĐỘ KHÉP lúc chớp.
///
/// `tools/koa-wardrobe/build.py` (`lid_kids`) vẽ sẵn mí đứng yên vào cảnh tủ đồ. Trước đây lúc chớp, KoaRender
/// kéo giãn dọc cả nhóm mí từ mép trên mắt (`KoaMath.lidDrop`). Cách ấy để lại ba lỗi (Kiệt 21/11 "rà lại kỹ"):
/// - mí giãn dọc thì hẹp hơn mắt ở đoạn giữa → hai bên mắt lộ vệt trắng;
/// - đường mi giãn theo → nhắm hẳn thành vệt đen dày gấp đôi, gấp ba;
/// - mí buồn mép cao → hệ số giãn không đủ, nhắm hẳn vẫn hở nửa dưới mắt; bọng mắt tụt theo xuống má.
///
/// Giờ mép mí TRƯỢT xuống đường mắt nhắm (cong như mắt nhắm thường); phần lông của mí luôn là phần của mắt nằm
/// trên mép, đường mi giữ nguyên độ dày, bọng mắt đứng yên. Ở độ khép 0, hình trùng đúng từng ký tự với cảnh
/// tủ đồ (test `KoaLidCloseTests`), nên chỉ cần thay chuỗi `d` của hai hình mỗi mắt.
enum KoaLid {
  struct Kind: Sendable {
    let inner: Double, mid: Double, outer: Double, w: Double
  }

  /// Giữ khớp `LID_TYPES` của build.py.
  static let kinds: [String: Kind] = [
    "lidsHalf": Kind(inner: -2, mid: 0, outer: 1.5, w: 4.4),
    "lidsHeavy": Kind(inner: 4, mid: 7, outer: 9, w: 4.6),
    "lidsSad": Kind(inner: -13, mid: -6, outer: -1, w: 3.8),
  ]
  static let cy = 96.0, rx = 18.0, ry = 23.5
  /// tâm x, phía đuôi mắt
  static let eyes: [(cx: Double, side: Double)] = [(82, -1), (158, 1)]
  /// Mép mí lúc nhắm hẳn (so với tâm mắt): hai đầu 8, giữa 24 — đường cong 120 − 16·(dx/20)² nằm dưới đáy lòng
  /// trắng trên cả bề ngang mắt (dư ≥ 0,4), như nét mi của mắt nhắm thường.
  static let closedEnds = 8.0, closedMid = 24.0

  /// Cùng cách in số của build.py: `f"{v:.2f}".rstrip("0").rstrip(".")`.
  static func num(_ v: Double) -> String {
    var s = String(format: "%.2f", v)
    while s.hasSuffix("0") { s.removeLast() }
    if s.hasSuffix(".") { s.removeLast() }
    return s
  }

  /// (lông mí, đường mi) của mắt `eye` (0 trái, 1 phải) ở độ khép `close` (0 mở như vẽ … 1 nhắm hẳn).
  static func paths(_ k: Kind, eye: Int, close: Double) -> (fur: String, lash: String) {
    let b = max(0, min(1, close))
    let (cx, side) = eyes[eye]
    let inner = k.inner + (closedEnds - k.inner) * b
    let mid = k.mid + (closedMid - k.mid) * b
    let outer = k.outer + (closedEnds - k.outer) * b
    let xi = cx - side * (rx + 2), xo = cx + side * (rx + 2)
    let yi = cy + inner, ym = cy + mid, yo = cy + outer
    let cyc = 2 * ym - (yi + yo) / 2
    func edgeY(_ x: Double) -> Double {
      let t = (x - xi) / (xo - xi)
      let u = 1 - t
      return u * u * yi + 2 * u * t * cyc + t * t * yo
    }
    // lông mí: phần của mắt (nới 1,5 phủ kín viền) nằm trên mép mí
    let ex = rx + 1.5, ey = ry + 1.5
    var top: [(Double, Double)] = [], bot: [(Double, Double)] = []
    let n = 48
    for i in 0...n {
      let x = cx - ex + 2 * ex * Double(i) / Double(n)
      let dx = (x - cx) / ex
      let h = ey * (max(0.0, 1 - dx * dx)).squareRoot()
      let yt = cy - h, yb = cy + h
      let yl = min(edgeY(x), yb)
      if yl <= yt + 0.05 { continue }
      top.append((x, yt))
      bot.append((x, yl))
    }
    let pts = top + bot.reversed()
    let fur = "M" + pts.map { "\(num($0.0)) \(num($0.1))" }.joined(separator: " L") + " Z"
    // đường mi: dải theo mép mí, dày nhất lệch về đuôi, thuôn hai đầu — độ dày không đổi khi khép
    let m = 18
    var up: [(Double, Double)] = [], dn: [(Double, Double)] = []
    for i in 0...m {
      let t = Double(i) / Double(m)
      let u = 1 - t
      let x = u * u * xi + 2 * u * t * cx + t * t * xo
      let y = u * u * yi + 2 * u * t * cyc + t * t * yo
      let dxt = 2 * u * (cx - xi) + 2 * t * (xo - cx)
      let dyt = 2 * u * (cyc - yi) + 2 * t * (yo - cyc)
      var l = hypot(dxt, dyt)
      if l == 0 { l = 1 }
      let nx = -dyt / l, ny = dxt / l
      let kk = sin(Double.pi * min(1, t * 0.85 + 0.08)) * (0.55 + 0.45 * t)
      let hw = k.w / 2 * max(0.25, kk)
      up.append((x - nx * hw, y - ny * hw))
      dn.append((x + nx * hw, y + ny * hw))
    }
    let ring = up + dn.reversed()
    var lash = "M" + ring.map { "\(num($0.0)) \(num($0.1))" }.joined(separator: " L") + " Z"
    let fx = xo, fy = yo
    lash +=
      " M\(num(fx - side * 3)) \(num(fy - 1.4)) Q\(num(fx + side * 2.5)) \(num(fy - 2.2)) \(num(fx + side * 4.6)) \(num(fy - 4.6))"
      + " Q\(num(fx + side * 5.6)) \(num(fy - 2.6)) \(num(fx + side * 3.2)) \(num(fy + 0.4)) Q\(num(fx)) \(num(fy + 2.2)) \(num(fx - side * 2)) \(num(fy + 1.8)) Z"
    return (fur, lash)
  }

  /// Bảng thay chuỗi `d` (hình đứng yên → hình ở độ khép) cho một nhóm mí.
  static func swaps(_ cond: String, close: Double) -> [String: String] {
    guard let k = kinds[cond] else { return [:] }
    var out: [String: String] = [:]
    for e in eyes.indices {
      let a = paths(k, eye: e, close: 0), b = paths(k, eye: e, close: close)
      out[a.fur] = b.fur
      out[a.lash] = b.lash
    }
    return out
  }

  /// Thay `d` trong mọi lượt tô của phần tử (lượt nền, quầng sáng…), đệ quy.
  static func swap(_ e: KoaRender.Element, _ table: [String: String]) -> KoaRender.Element {
    var e = e
    if case .string(let d)? = e.props["d"], let to = table[d] { e.props["d"] = .string(to) }
    e.kids = e.kids.map { swap($0, table) }
    return e
  }
}
