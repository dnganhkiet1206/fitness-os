public import Foundation

/// Đèn của studio trên Koa (#527, K2) — `koa-light.ts` @ fac9ac2.
///
/// Mỗi màu phẳng của bản export thành một dải dọc trong không gian người dùng
/// (sáng hơn ở đỉnh, tối dần xuống chân, hắt vàng từ sàn); thêm điểm sáng trên
/// đầu, khối của tai / thân và viền sáng. Bản giấy (theme sáng) dùng dải ba
/// điểm đã hạ độ sáng trong OKLab.
///
/// Như RN, mọi dải được tính MỘT lần cho cả cây (mọi tư thế); mỗi lần vẽ chỉ
/// lọc ra những dải mà các lớp đang hiện dùng tới.
public enum KoaLight {
  public typealias Mat = KoaMath.Mat

  // MARK: - Dải màu

  static let yTop = 20.0
  static let yBot = 275.0
  static let topGain = 1.1
  static let foot = 0.84
  static let bias = 0.6
  static let stops: [Double] = [0, 0.05, 0.15, 0.35, 0.65, 1]
  static let bounceColour = "#FFC24D"
  static let bounceTop = 170.0
  static let bounceMax = 0.05
  static let shadowGrey = "#AEB6BF"
  public static let shadowColour = "#120C18"

  static func clamp01(_ v: Double) -> Double { v < 0 ? 0 : v > 1 ? 1 : v }

  /// `shadeAt`.
  public static func shadeAt(_ y: Double) -> Double {
    let t = clamp01((y - yTop) / (yBot - yTop))
    return topGain - (topGain - foot) * pow(t, bias)
  }

  static func bounceAt(_ y: Double) -> Double { bounceMax * clamp01((y - bounceTop) / (yBot - bounceTop)) }

  // MARK: - Viền, điểm sáng, khối

  public static let rimGradient = "koaRim"
  public static let rimWidth = 1.6
  public static let rimColour = "#FFE9B8"
  public static let rimStops: [(Double, Double)] = [(0, 1), (0.07, 0.45), (0.16, 0), (1, 0)]
  static let rimIds: Set<String> = [
    "head_front", "ear_left", "ear_right", "torso_front", "torso_front_run", "arm_left_upper", "arm_right_upper",
  ]

  public static let glowGradient = "koaGlow"
  public static let glowColour = "#FFFFFF"
  static let glowC: (Double, Double, Double) = (120, 76, 62)
  public static let glowStops: [(Double, Double)] = [(0, 0.17), (0.55, 0.075), (1, 0)]
  static let glowIds: Set<String> = ["head_front", "head_top_fur"]

  public static let formGradient = "koaForm"
  public static let formStops: [(Double, String, Double)] = [
    (0, "#FFFFFF", 0.25), (0.4, "#FFFFFF", 0), (0.58, "#1A1420", 0), (1, "#1A1420", 0.22),
  ]
  static let formIds: Set<String> = ["ear_left", "ear_right"]

  public static let bodyGradient = "koaBody"
  public static let bodyStops: [(Double, String, Double)] = [
    (0, "#FFFFFF", 0.28), (0.12, "#FFFFFF", 0.12), (0.28, "#FFFFFF", 0.03), (0.45, "#FFFFFF", 0), (1, "#FFFFFF", 0),
  ]
  static let bodyIds: Set<String> = ["torso_front", "torso_front_run", "arm_left_upper", "arm_right_upper"]

  public static let shadowGradient = "koaShadowSoft"
  public static let shadowSpread: (Double, Double) = (1.15, 0.66)
  public static let shadowStops: [(Double, Double)] = [(0, 1), (0.4, 0.78), (0.72, 0.3), (1, 0)]

  /// `isShadow`.
  static func isShadow(_ n: KoaScene.Node) -> Bool {
    guard case .string(let f)? = n.a?["fill"] else { return false }
    return f.uppercased() == shadowGrey
  }

  // MARK: - Hệ toạ độ

  static func localMat(_ n: KoaScene.Node) -> Mat {
    var m = KoaMath.identity
    if let tr = n.tr { m = KoaMath.mul(m, [1, 0, 0, 1, tr[0], tr[1]]) }
    if let tf = n.tf {
      var t = KoaMath.identity
      for op in tf { t = KoaMath.mul(t, KoaMath.opMat(op)) }
      if let o = n.o { t = KoaMath.mul(KoaMath.mul([1, 0, 0, 1, o[0], o[1]], t), [1, 0, 0, 1, -o[0], -o[1]]) }
      m = KoaMath.mul(m, t)
    }
    return m
  }

  static func invert(_ m: Mat, _ x: Double, _ y: Double) -> (Double, Double) {
    let det = m[0] * m[3] - m[1] * m[2]
    if det == 0 { return (x, y) }
    let px = x - m[4], py = y - m[5]
    return ((px * m[3] - py * m[2]) / det, (py * m[0] - px * m[1]) / det)
  }

  // MARK: - Màu

  static func isHex(_ s: String) -> Bool {
    guard s.first == "#" else { return false }
    let h = s.dropFirst()
    return (h.count == 3 || h.count == 6) && h.allSatisfy { $0.isHexDigit && $0.isASCII }
  }

  static func channels(_ hex: String) -> [Int] {
    let h = Array(hex.dropFirst())
    let w = h.count == 3
    return (0..<3).map { i in Int(w ? String([h[i], h[i]]) : String(h[i * 2..<i * 2 + 2]), radix: 16) ?? 0 }
  }

  /// `Math.round` của JS: nửa thì làm tròn lên.
  static func roundJS(_ x: Double) -> Double {
    let f = x.rounded(.down)
    return x - f >= 0.5 ? f + 1 : f
  }

  static func hex2(_ v: Double) -> String {
    let s = String(Int(v), radix: 16)
    return s.count < 2 ? "0" + s : s
  }

  static func paint(_ hex: String, _ y: Double) -> String {
    let k = shadeAt(y), b = bounceAt(y)
    let c = channels(hex), g = channels(bounceColour)
    return "#" + (0..<3).map { i in
      let lit = Double(c[i]) * k * (1 - b) + Double(g[i]) * b
      return hex2(max(0, min(255, roundJS(lit))))
    }.joined()
  }

  /// `v.toFixed(3)` của JS: chữ số thập phân THẬT của số, nửa thì lấy số lớn
  /// hơn, số âm (kể cả làm tròn về 0) có dấu "-", `-0` thì không.
  static func toFixed3(_ v: Double) -> String {
    if v.isNaN { return "NaN" }
    let neg = v < 0
    // 20 chữ số sau dấu phẩy là đủ phân biệt mọi số hoà (m/16) với số kề nó
    let parts = String(format: "%.20f", abs(v)).split(separator: ".")
    var digits = Array(parts[0]) + Array(parts[1].prefix(3))
    if parts[1].dropFirst(3).first.map({ $0 >= "5" }) ?? false {
      var i = digits.count - 1
      while i >= 0 {
        if digits[i] == "9" {
          digits[i] = "0"
          i -= 1
        } else {
          digits[i] = Character(String(digits[i].wholeNumberValue! + 1))
          break
        }
      }
      if i < 0 { digits.insert("1", at: 0) }
    }
    let s = String(digits.dropLast(3)) + "." + String(digits.suffix(3))
    return neg ? "-" + s : s
  }

  // MARK: - Dải và điểm sáng, dựng một lần

  public struct Ramp: Sendable, Hashable {
    public let id: String
    public let x1: Double, y1: Double, x2: Double, y2: Double
    public let stops: [Stop]
    public struct Stop: Sendable, Hashable {
      public let offset: Double
      public let colour: String
    }
  }

  public struct Glow: Sendable, Hashable {
    public let id: String
    public let cx: Double, cy: Double, r: Double
  }

  /// Một lớp của cảnh kèm phần đèn của nó (`SPACE` / `GLOW` / `FORM` / `BODY` /
  /// `USES` của RN, vốn là Map theo đối tượng).
  public struct Lit: Sendable {
    public let node: KoaScene.Node
    public let space: String
    public let glow: String?
    public let form: Bool
    public let body: Bool
    public let uses: [String]
    public let kids: [Lit]
  }

  struct Built: Sendable {
    var all: [Ramp] = []
    var ramp: [String: String] = [:]
    var glows: [Glow] = []
    var glowBySpace: [String: String] = [:]
    var spaceMat: [String: Mat] = [:]
    var nodes: [Lit] = []

    mutating func rampFor(_ colour: String, _ space: String) -> String {
      let key = "\(colour)@\(space)"
      if let found = ramp[key] { return found }
      let m = spaceMat[space] ?? KoaMath.identity
      let (x1, y1) = KoaLight.invert(m, 0, KoaLight.yTop)
      let (x2, y2) = KoaLight.invert(m, 0, KoaLight.yBot)
      let id = "koaL\(all.count)"
      all.append(
        Ramp(
          id: id, x1: x1, y1: y1, x2: x2, y2: y2,
          stops: KoaLight.stops.map { Ramp.Stop(offset: $0, colour: KoaLight.paint(colour, KoaLight.yTop + $0 * (KoaLight.yBot - KoaLight.yTop))) }))
      ramp[key] = id
      return id
    }

    mutating func glowFor(_ space: String) -> String {
      if let found = glowBySpace[space] { return found }
      let m = spaceMat[space] ?? KoaMath.identity
      let (cx, cy) = KoaLight.invert(m, KoaLight.glowC.0, KoaLight.glowC.1)
      let d = sqrt(abs(m[0] * m[3] - m[1] * m[2]))
      let s = d == 0 || d.isNaN ? 1 : d
      let id = "\(KoaLight.glowGradient)\(glows.count)"
      glows.append(Glow(id: id, cx: cx, cy: cy, r: KoaLight.glowC.2 / s))
      glowBySpace[space] = id
      return id
    }

    mutating func walk(_ nodes: [KoaScene.Node], _ parent: Mat, _ glowing: Bool) -> [Lit] {
      var out: [Lit] = []
      for n in nodes {
        let m = KoaMath.mul(parent, KoaLight.localMat(n))
        let key = m.map(KoaLight.toFixed3).joined(separator: ",")
        if spaceMat[key] == nil { spaceMat[key] = m }
        let lit = glowing || (n.id.map { KoaLight.glowIds.contains($0) } ?? false)
        var glow: String?
        if lit, n.t != "g", case .string(let f)? = n.a?["fill"], KoaLight.isHex(f) { glow = glowFor(key) }
        var ids: [String] = []
        for p in [n.a?["fill"], n.a?["stroke"]] {
          if case .string(let c)? = p, KoaLight.isHex(c), c.uppercased() != KoaLight.shadowGrey { ids.append(rampFor(c, key)) }
        }
        var kids: [Lit] = []
        if let k = n.kids { kids = walk(k, m, lit) }
        out.append(
          Lit(
            node: n, space: key, glow: glow, form: n.id.map { KoaLight.formIds.contains($0) } ?? false,
            body: n.id.map { KoaLight.bodyIds.contains($0) } ?? false, uses: ids, kids: kids))
      }
      return out
    }
  }

  static let built: Built = {
    var b = Built()
    b.nodes = b.walk(KoaScene.nodes, KoaMath.identity, false)
    return b
  }()

  /// `NODES` kèm phần đèn, đúng thứ tự.
  public static var nodes: [Lit] { built.nodes }

  static func visit(_ nodes: [Lit], _ flags: KoaFlags.Flags, _ f: (Lit) -> Void) {
    for n in nodes {
      if let c = n.node.cond, !(flags[c]?.truthy ?? false) { continue }
      f(n)
      visit(n.kids, flags, f)
    }
  }

  /// `glowsFor`.
  public static func glows(_ flags: KoaFlags.Flags) -> [Glow] {
    var want: Set<String> = []
    visit(built.nodes, flags) { if let g = $0.glow { want.insert(g) } }
    return built.glows.filter { want.contains($0.id) }
  }

  /// `rampsFor`.
  public static func ramps(_ flags: KoaFlags.Flags, paper: Bool) -> [Ramp] {
    var want: Set<String> = []
    visit(built.nodes, flags) { want.formUnion($0.uses) }
    return (paper ? paperRamps : built.all).filter { want.contains($0.id) }
  }

  static let paperRamps: [Ramp] = built.all.map { r in
    let base = r.stops[3].colour
    return Ramp(
      id: r.id, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
      stops: [
        .init(offset: 0, colour: onPaper(shadeHex(base, 1.03))),
        .init(offset: 0.5, colour: onPaper(base)),
        .init(offset: 1, colour: onPaper(shadeHex(base, 0.97))),
      ])
  }

  // MARK: - Bản giấy

  static let paperL = 0.85
  static func srgbEnc(_ v: Double) -> Double { v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055 }
  static func srgbDec(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }

  static func hex6(_ hex: String) -> [Double]? {
    let t = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    guard t.count == 7, t.first == "#", t.dropFirst().allSatisfy({ $0.isHexDigit && $0.isASCII }) else { return nil }
    let h = Array(t.dropFirst())
    return (0..<3).map { Double(Int(String(h[$0 * 2..<$0 * 2 + 2]), radix: 16) ?? 0) }
  }

  /// `onPaper`: hạ độ sáng trong OKLab, rồi hạ chroma theo đúng hướng của nó
  /// tới khi vừa gamut (không kẹp từng kênh).
  static func onPaper(_ hex: String) -> String {
    guard let c = hex6(hex) else { return hex }
    let r = srgbDec(c[0] / 255), g = srgbDec(c[1] / 255), b = srgbDec(c[2] / 255)
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let mm = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    let L = (0.2104542553 * l + 0.7936177850 * mm - 0.0040720468 * s) * paperL
    let A = 1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s
    let B = 0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s
    func toRgb(_ k: Double) -> [Double] {
      let l3 = pow(L + 0.3963377774 * A * k + 0.2158037573 * B * k, 3)
      let m3 = pow(L - 0.1055613458 * A * k - 0.0638541728 * B * k, 3)
      let s3 = pow(L - 0.0894841775 * A * k - 1.2914855480 * B * k, 3)
      return [
        srgbEnc(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
        srgbEnc(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
        srgbEnc(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3),
      ]
    }
    func outside(_ v: [Double]) -> Bool { v.contains { $0 < -1e-4 || $0 > 1 + 1e-4 } }
    var lo = 0.0, hi = 1.0
    if outside(toRgb(1)) {
      for _ in 0..<24 {
        let mid = (lo + hi) / 2
        if outside(toRgb(mid)) { hi = mid } else { lo = mid }
      }
    } else {
      lo = 1
    }
    return "#" + toRgb(lo).map { hex2(roundJS(min(1, max(0, $0)) * 255)) }.joined()
  }

  static func shadeHex(_ hex: String, _ k: Double) -> String {
    guard let c = hex6(hex) else { return hex }
    return "#" + c.map { hex2(max(0, min(255, roundJS($0 * k)))) }.joined()
  }

  // MARK: - Áp vào một lớp

  /// `litProps`: màu phẳng → dải của lớp ấy; bóng trên bục → dải bóng, nở ra.
  public static func litProps(_ n: Lit, _ props: [String: KoaScene.Value]) -> [String: KoaScene.Value] {
    var out = props
    for key in ["fill", "stroke"] {
      guard case .string(let v)? = props[key], isHex(v) else { continue }
      if v.uppercased() == shadowGrey {
        out[key] = .string("url(#\(shadowGradient))")
      } else if let id = built.ramp["\(v)@\(n.space)"] {
        out[key] = .string("url(#\(id))")
      }
    }
    if isShadow(n.node) {
      if case .number(let rx)? = out["rx"] { out["rx"] = .number(rx * shadowSpread.0) }
      if case .number(let ry)? = out["ry"] { out["ry"] = .number(ry * shadowSpread.1) }
      if case .number(let r)? = out["r"] { out["r"] = .number(r * shadowSpread.0) }
    }
    return out
  }
}
