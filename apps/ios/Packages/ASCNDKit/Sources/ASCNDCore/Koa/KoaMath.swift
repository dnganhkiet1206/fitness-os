public import Foundation

/// Toán thuần của bộ dựng hình Koa (#527, K1) — chép nguyên văn từ
/// `koa-figure.tsx` (ma trận, đường cong CSS, lấy mẫu keyframe, `parseOps` /
/// `parseAnim`), `koa-frame.ts`, `koa-pose.ts`, `koa-dress.ts`,
/// `figure-clock.ts` và nửa thuần của `koa-gaze.ts` @ fac9ac2.
///
/// Ma trận là mảng 6 số `[a, b, c, d, e, f]` như `matrix(...)` của SVG.
public enum KoaMath {
  public typealias Mat = [Double]
  public typealias Op = KoaScene.Op

  public static let identity: Mat = [1, 0, 0, 1, 0, 0]

  // MARK: - koa-frame.ts

  public static let width = 240.0
  public static let height = 300.0
  public static let aspect = height / width
  /// Hình được vẽ ở 0,93 khung, neo ở chân.
  public static let inset = 0.93
  static let anchorX = width / 2
  static let anchorY = height
  /// `KOA_INSET_MAT`.
  public static let insetMat: Mat = [inset, 0, 0, inset, anchorX * (1 - inset), anchorY * (1 - inset)]

  // MARK: - Ma trận

  public static func mul(_ m: Mat, _ n: Mat) -> Mat {
    [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ]
  }

  /// Một bước transform → ma trận; `rotate` có thể mang tâm (dạng SVG).
  public static func opMat(_ op: Op) -> Mat {
    if op.kind == "r" {
      let r = op[1] * Double.pi / 180
      let c = cos(r), s = sin(r)
      let m: Mat = [c, s, -s, c, 0, 0]
      if op.count == 4 {
        let cx = op[2], cy = op[3]
        return mul(mul([1, 0, 0, 1, cx, cy], m), [1, 0, 0, 1, -cx, -cy])
      }
      return m
    }
    if op.kind == "t" { return [1, 0, 0, 1, op[1], op[2]] }
    return [op[1], 0, 0, op[2], 0, 0]
  }

  /// Ghép một danh sách transform quanh một gốc.
  public static func opsMat(_ ops: [Op]?, _ ox: Double, _ oy: Double) -> Mat {
    guard let ops, !ops.isEmpty else { return identity }
    var m = identity
    for op in ops { m = mul(m, opMat(op)) }
    if ox == 0 && oy == 0 { return m }
    return mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy])
  }

  // MARK: - Lấy mẫu keyframe

  /// Đường cong CSS thật (Newton trên x(s) = t, 5 bước).
  public static func bezier(
    _ t: Double, _ ax: Double, _ bx: Double, _ cx: Double, _ ay: Double, _ by: Double, _ cy: Double
  ) -> Double {
    var s = t
    for _ in 0..<5 {
      let d = (3 * ax * s + 2 * bx) * s + cx
      if d < 1e-6 && d > -1e-6 { break }
      s -= (((ax * s + bx) * s + cx) * s - t) / d
    }
    return ((ay * s + by) * s + cy) * s
  }

  public static func ease(_ t: Double, _ kind: String) -> Double {
    if kind == "lin" { return t }
    if kind == "out" { return bezier(t, -0.74, 1.74, 0, -2, 3, 0) }
    return bezier(t, 0.52, -0.78, 1.26, -2, 3, 0)
  }

  /// Một phép, nội suy giữa hai khung, thẳng ra ma trận.
  public static func lerpOpMat(_ pa: Op, _ pb: Op?, _ f: Double) -> Mat {
    func v(_ j: Int) -> Double {
      let a = pa[j]
      let b = pb.map { $0.count > j ? $0[j] : a } ?? a
      return a + (b - a) * f
    }
    if pa.kind == "r" {
      let r = v(1) * Double.pi / 180
      let c = cos(r), s = sin(r)
      if pa.count == 4 {
        let cx = v(2), cy = v(3)
        return [c, s, -s, c, cx - (c * cx - s * cy), cy - (s * cx + c * cy)]
      }
      return [c, s, -s, c, 0, 0]
    }
    if pa.kind == "t" { return [1, 0, 0, 1, v(1), v(2)] }
    return [v(1), 0, 0, v(2), 0, 0]
  }

  /// Cặp khung mà `t` nằm giữa, và phân số đã qua đường cong.
  public static func span(_ stops: [Double], _ t: Double, _ kind: String) -> (Int, Int, Double) {
    var i = 0, j = stops.count - 1
    for k in 0..<max(0, stops.count - 1) where t >= stops[k] && t <= stops[k + 1] {
      i = k
      j = k + 1
      break
    }
    let w = stops[j] - stops[i]
    return (i, j, w > 0 ? ease((t - stops[i]) / w, kind) : 0)
  }

  public static func sampleMat(_ frames: [KoaScene.TFrame], _ t: Double, _ kind: String, _ ox: Double, _ oy: Double)
    -> Mat
  {
    let s = span(frames.map(\.o), t, kind)
    let a = frames[s.0]
    let b = a.to ?? a.ops
    if a.ops.isEmpty { return identity }
    var m = identity
    for (i, op) in a.ops.enumerated() { m = mul(m, lerpOpMat(op, i < b.count ? b[i] : nil, s.2)) }
    if ox != 0 || oy != 0 { m = mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]) }
    return m
  }

  public static func sampleOp(_ frames: [KoaScene.OFrame], _ t: Double, _ kind: String) -> Double {
    let s = span(frames.map(\.o), t, kind)
    return frames[s.0].v + (frames[s.1].v - frames[s.0].v) * s.2
  }

  // MARK: - Chuỗi do lớp logic đưa xuống

  private static func regex(_ p: String) -> NSRegularExpression {
    // Mẫu cố định trong mã — hỏng là lỗi lập trình.
    try! NSRegularExpression(pattern: p)
  }

  private static let opsRe = regex(#"(rotate|translate|translateX|translateY|scale|scaleX|scaleY)\(([^)]*)\)"#)
  private static let numRe = regex(#"-?\d*\.?\d+"#)
  private static let animRe = regex(#"(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite"#)
  private static let originRe = regex(#"transform-origin:\s*([\d.]+)px\s+([\d.]+)px"#)
  private static let translateRe = regex(#"(?:^|;)\s*translate:\s*(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?"#)

  private static func group(_ m: NSTextCheckingResult, _ i: Int, in s: String) -> String? {
    let r = m.range(at: i)
    guard r.location != NSNotFound, let range = Range(r, in: s) else { return nil }
    return String(s[range])
  }

  /// `parseFloat` của JS trên phần đầu là số.
  static func parseFloatJS(_ s: String) -> Double {
    let ns = s as NSString
    let m = regex(#"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?"#).firstMatch(in: s, range: NSRange(location: 0, length: ns.length))
    return m.flatMap { Double(ns.substring(with: $0.range)) } ?? .nan
  }

  /// `Math.round`.
  static func roundJS(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

  /// `parseOps`.
  public static func parseOps(_ css: String) -> [Op] {
    let ns = css as NSString
    var ops: [Op] = []
    for m in opsRe.matches(in: css, range: NSRange(location: 0, length: ns.length)) {
      let name = group(m, 1, in: css) ?? ""
      let args = group(m, 2, in: css) ?? ""
      let an = args as NSString
      let n = numRe.matches(in: args, range: NSRange(location: 0, length: an.length)).map {
        Double(an.substring(with: $0.range)) ?? .nan
      }
      func at(_ i: Int) -> Double { i < n.count ? n[i] : .nan }
      switch name {
      case "rotate": ops.append(n.count == 3 ? Op("r", [n[0], n[1], n[2]]) : Op("r", [at(0)]))
      case "translate": ops.append(Op("t", [at(0), n.count > 1 ? n[1] : 0]))
      case "translateX": ops.append(Op("t", [at(0), 0]))
      case "translateY": ops.append(Op("t", [0, at(0)]))
      case "scale": ops.append(Op("s", [at(0), n.count > 1 ? n[1] : at(0)]))
      case "scaleX": ops.append(Op("s", [at(0), 1]))
      default: ops.append(Op("s", [1, at(0)]))
      }
    }
    return ops
  }

  public struct BoundAnim: Sendable, Hashable {
    public let anim: KoaScene.Anim
    public let origin: [Double]?
    public let tr: [Op]?
  }

  /// `parseAnim`: một hoạt ảnh đưa xuống theo tên (`handAnim`, `runBob`, …).
  public static func parseAnim(_ css: String) -> BoundAnim? {
    let range = NSRange(location: 0, length: (css as NSString).length)
    guard let m = animRe.firstMatch(in: css, range: range) else { return nil }
    let o = originRe.firstMatch(in: css, range: range)
    let tr = translateRe.firstMatch(in: css, range: range)
    let easeName = group(m, 3, in: css) ?? ""
    let anim = KoaScene.Anim(
      k: group(m, 1, in: css) ?? "",
      dur: roundJS(parseFloatJS(group(m, 2, in: css) ?? "") * 1000),
      delay: group(m, 4, in: css).map { roundJS(parseFloatJS($0) * 1000) } ?? 0,
      ease: easeName == "linear" ? "lin" : easeName == "ease-out" ? "out" : "io")
    let origin = o.map { [parseFloatJS(group($0, 1, in: css) ?? ""), parseFloatJS(group($0, 2, in: css) ?? "")] }
    let trOps = tr.map { t in
      [Op("t", [parseFloatJS(group(t, 1, in: css) ?? ""), group(t, 2, in: css).map(parseFloatJS) ?? 0])]
    }
    return BoundAnim(anim: anim, origin: origin, tr: trOps)
  }

  // MARK: - koa-pose.ts

  /// `REST`: tư thế nghỉ — nghiêng nhẹ từng khớp khi đứng.
  public static let rest: [String: (deg: Double, at: (Double, Double))] = [
    "BODYRIG": (-1, (120, 279)),
    "HEADRIG": (2.5, (120, 115)),
    "arm_left_upper": (2.2, (80, 178)),
    "arm_right_upper": (0.8, (160, 178)),
    "leg_left_lower": (1.5, (104, 254)),
    "leg_right_lower": (0.5, (136, 254)),
  ]

  /// `REST_MAT` (dạng số thay vì chuỗi `matrix(...)`).
  public static func restMat(_ id: String) -> Mat? {
    guard let r = rest[id] else { return nil }
    let rad = r.deg * Double.pi / 180
    let c = cos(rad), s = sin(rad)
    let (cx, cy) = r.at
    return [c, s, -s, c, cx - (c * cx - s * cy), cy - (s * cx + c * cy)]
  }

  /// `restsAt`: tư thế đứng mới có dáng nghỉ.
  public static func restsAt(_ flags: KoaFlags.Flags) -> Bool {
    !(flags["poseRun"]?.truthy ?? false) && !(flags["poseStretch"]?.truthy ?? false)
      && !(flags["poseLift"]?.truthy ?? false)
  }

  // MARK: - koa-dress.ts

  public static let dressPeriod = 2200.0
  public static let dressBlend = 400.0

  public enum DressPart: String, Sendable, Hashable, CaseIterable {
    case hop, body, head, armL, armR, footL, footR, eyes
  }

  /// `DRESS_BY_ID`.
  public static let dressById: [String: DressPart] = [
    "POSERIG": .hop, "BODYRIG": .body, "HEADRIG": .head, "leg_left_lower": .footL, "leg_right_lower": .footR,
  ]
  /// `DRESS_ARM_AT` / `DRESS_ARM_HIDE`.
  public static let dressArmAt: [Int: DressPart] = [0: .armL, 1: .armR]
  public static let dressArmHide: Set<Int> = [4, 5]

  static func dressRot(_ deg: Double, _ px: Double, _ py: Double, _ tx: Double, _ ty: Double) -> Mat {
    let r = deg * Double.pi / 180
    let c = cos(r), s = sin(r)
    return [c, s, -s, c, px - px * c + py * s + tx, py - px * s - py * c + ty]
  }

  /// `dressMat`.
  public static func dressMat(_ part: DressPart, _ t: Double, _ k: Double = 1) -> Mat {
    let a = (t.truncatingRemainder(dividingBy: dressPeriod) / dressPeriod) * Double.pi * 2
    let sway = sin(a)
    let bounce = max(0, sin(a * 2))
    switch part {
    case .hop: return [1, 0, 0, 1, 0, -k * 5 * bounce]
    case .body: return dressRot(k * 1.6 * sway, 120, 279, 0, 0)
    case .head: return dressRot(k * 2.4 * sin(a - 0.34), 120, 115, 0, k * 3.5)
    case .eyes: return [1, 0, 0, 1, 0, k * 3.4]
    case .armL: return dressRot(k * (34 + 10 * bounce), 80, 178, 0, 0)
    case .armR: return dressRot(-k * (34 + 10 * bounce), 160, 178, 0, 0)
    case .footL, .footR: return [1, 0, 0, 1, 0, -k * 2.2 * bounce]
    }
  }

  // MARK: - koa-gaze.ts (nửa thuần — ánh nhìn đã giải)

  public struct Gaze: Sendable, Hashable {
    public var x: Double
    public var y: Double
    public var k: Double
    public init(x: Double, y: Double, k: Double) {
      self.x = x
      self.y = y
      self.k = k
    }
  }

  public static let smilePath = "M106.5 129 Q120 141.5 133.5 129"
  public static let smileWidth = 4.6
  public static let smileColour = "#20242A"
  public static let swapMouths: Set<String> = ["mouthSmile", "mouthGrin"]

  static func place(_ deg: Double, _ cx: Double, _ cy: Double, _ tx: Double, _ ty: Double) -> Mat {
    let r = deg * Double.pi / 180
    let c = cos(r), s = sin(r)
    return [c, s, -s, c, cx - (c * cx - s * cy) + tx, cy - (s * cx + c * cy) + ty]
  }

  /// `headMatOf`.
  public static func headMat(_ g: Gaze) -> Mat {
    if g.k <= 0 { return identity }
    return place(3.6 * g.x * g.k, 120, 105, 0.9 * g.x * g.k, 3 * g.y * g.k)
  }

  /// `eyeMatOf`.
  public static func eyeMat(_ g: Gaze) -> Mat {
    if g.k <= 0 { return identity }
    return [1, 0, 0, 1, 4.4 * g.x * g.k, 4.4 * 0.7 * g.y * g.k]
  }

  // MARK: - figure-clock.ts

  public static let clockReset = -1.0

  /// `stepClock`: đồng hồ cộng dồn, chỉ tiến ở những khung `frameMs` cho phép.
  public static func stepClock(clock: inout Double, last: inout Double, t: Double, frameMs: Double) {
    if last < 0 || t < last {
      last = t
      return
    }
    let dt = t - last
    if dt < frameMs - 1 { return }
    last = t
    clock += dt
  }
}
