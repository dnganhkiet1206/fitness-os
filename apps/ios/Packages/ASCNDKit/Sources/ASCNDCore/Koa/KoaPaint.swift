public import Foundation

/// Kế hoạch vẽ của Koa (#527, K3): cây phần tử của `KoaRender` → danh sách
/// lệnh vẽ đã giải hết những gì react-native-svg làm ngầm — kế thừa thuộc tính
/// trình bày, `url(#…)` tới dải màu, `clip-path`, độ mờ nhóm, ma trận cộng dồn,
/// path SVG (cả cung `A`) thành đoạn thẳng / bezier, khung bao hình học cho dải
/// theo `objectBoundingBox`.
///
/// Thuần dữ liệu để test được trên Linux; `KoaFigureView` chỉ việc đổ từng lệnh
/// vào `GraphicsContext`.
public enum KoaPaint {
  public typealias Mat = KoaMath.Mat

  public struct Point: Sendable, Hashable {
    public var x: Double
    public var y: Double
    public init(_ x: Double, _ y: Double) {
      self.x = x
      self.y = y
    }
  }

  public enum Segment: Sendable, Hashable {
    case move(Point)
    case line(Point)
    case quad(Point, Point)
    case cubic(Point, Point, Point)
    case close
  }

  public struct Rect: Sendable, Hashable {
    public var x: Double, y: Double, width: Double, height: Double
  }

  public struct RGBA: Sendable, Hashable {
    public var r: Double, g: Double, b: Double, a: Double
  }

  public struct Stop: Sendable, Hashable {
    public var offset: Double
    public var colour: RGBA
  }

  public enum Gradient: Sendable, Hashable {
    /// `bbox` → toạ độ theo khung bao của hình (`objectBoundingBox`).
    case linear(x1: Double, y1: Double, x2: Double, y2: Double, bbox: Bool, stops: [Stop])
    case radial(cx: Double, cy: Double, r: Double, bbox: Bool, stops: [Stop])
  }

  public enum Paint: Sendable, Hashable {
    case none
    case colour(RGBA)
    case gradient(Gradient)
  }

  public struct Style: Sendable, Hashable {
    public var fill: Paint = .colour(RGBA(r: 0, g: 0, b: 0, a: 1))
    public var stroke: Paint = .none
    public var strokeWidth = 1.0
    public var lineCap = "butt"
    public var lineJoin = "miter"
    public var fillOpacity = 1.0
    public var strokeOpacity = 1.0
    public var evenOdd = false
  }

  public struct Shape: Sendable, Hashable {
    public var segments: [Segment]
    /// Khung bao hình học (không tính nét), theo toạ độ của chính hình.
    public var bounds: Rect
    public var style: Style
    /// `opacity` của chính hình.
    public var opacity: Double
    /// Ma trận từ toạ độ của hình về toạ độ `viewBox`.
    public var matrix: Mat
  }

  public struct Clip: Sendable, Hashable {
    public var segments: [Segment]
    public var matrix: Mat
    public var evenOdd: Bool
  }

  public indirect enum Op: Sendable, Hashable {
    case shape(Shape)
    /// Một lớp riêng: vẽ `ops` rồi phủ với độ mờ `opacity`, trong vùng `clip`.
    case group(opacity: Double, clip: [Clip]?, ops: [Op])
  }

  // MARK: - Màu

  static let named: [String: RGBA] = [
    "black": RGBA(r: 0, g: 0, b: 0, a: 1), "white": RGBA(r: 1, g: 1, b: 1, a: 1),
    "transparent": RGBA(r: 0, g: 0, b: 0, a: 0),
  ]

  /// `#rgb` / `#rrggbb` / vài tên màu.
  public static func colour(_ s: String) -> RGBA? {
    let t = s.trimmingCharacters(in: .whitespaces)
    if let n = named[t.lowercased()] { return n }
    guard t.first == "#" else { return nil }
    let h = Array(t.dropFirst())
    guard h.count == 3 || h.count == 6, h.allSatisfy({ $0.isHexDigit && $0.isASCII }) else { return nil }
    let w = h.count == 3
    let c = (0..<3).map { i in Double(Int(w ? String([h[i], h[i]]) : String(h[i * 2..<i * 2 + 2]), radix: 16) ?? 0) }
    return RGBA(r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, a: 1)
  }

  static func number(_ v: KoaScene.Value?) -> Double? {
    switch v {
    case .number(let d)?: d
    case .string(let s)?:
      s.hasSuffix("%") ? Double(s.dropLast()).map { $0 / 100 } : Double(s.trimmingCharacters(in: .whitespaces))
    case nil: nil
    }
  }

  // MARK: - Path SVG

  /// Đọc thuộc tính `d`: mọi lệnh tuyệt đối lẫn tương đối của SVG 1.1; cung
  /// thành bezier bậc ba.
  public static func parsePath(_ d: String) -> [Segment] {
    var tokens: [Character] = Array(d)
    tokens.append(" ")
    var i = 0
    func skip() {
      while i < tokens.count, tokens[i] == " " || tokens[i] == "," || tokens[i] == "\n" || tokens[i] == "\t"
        || tokens[i] == "\r"
      {
        i += 1
      }
    }
    func num() -> Double? {
      skip()
      var s = ""
      var seenDot = false, seenExp = false
      while i < tokens.count {
        let ch = tokens[i]
        if ch.isNumber && ch.isASCII {
          s.append(ch)
        } else if (ch == "-" || ch == "+") && (s.isEmpty || s.last == "e" || s.last == "E") {
          s.append(ch)
        } else if ch == "." && !seenDot && !seenExp {
          seenDot = true
          s.append(ch)
        } else if (ch == "e" || ch == "E") && !seenExp && !s.isEmpty {
          seenExp = true
          s.append(ch)
        } else {
          break
        }
        i += 1
      }
      return s.isEmpty ? nil : Double(s)
    }
    func flag() -> Bool? {
      skip()
      guard i < tokens.count, tokens[i] == "0" || tokens[i] == "1" else { return nil }
      defer { i += 1 }
      return tokens[i] == "1"
    }

    var out: [Segment] = []
    var cur = Point(0, 0), start = Point(0, 0)
    var lastCubic: Point?, lastQuad: Point?
    var cmd: Character = " "
    while true {
      skip()
      if i >= tokens.count { break }
      if tokens[i].isLetter {
        cmd = tokens[i]
        i += 1
      } else if cmd == " " {
        break
      }
      let rel = cmd.isLowercase
      func pt(_ x: Double, _ y: Double) -> Point { rel ? Point(cur.x + x, cur.y + y) : Point(x, y) }
      var nextCubic: Point?, nextQuad: Point?
      switch cmd.uppercased() {
      case "M":
        guard let x = num(), let y = num() else { return out }
        cur = pt(x, y)
        start = cur
        out.append(.move(cur))
        cmd = rel ? "l" : "L"  // coordinates after a moveto are linetos
      case "L":
        guard let x = num(), let y = num() else { return out }
        cur = pt(x, y)
        out.append(.line(cur))
      case "H":
        guard let x = num() else { return out }
        cur = Point(rel ? cur.x + x : x, cur.y)
        out.append(.line(cur))
      case "V":
        guard let y = num() else { return out }
        cur = Point(cur.x, rel ? cur.y + y : y)
        out.append(.line(cur))
      case "C":
        guard let a = num(), let b = num(), let c = num(), let d = num(), let e = num(), let f = num() else {
          return out
        }
        let c1 = pt(a, b), c2 = pt(c, d), p = pt(e, f)
        out.append(.cubic(c1, c2, p))
        cur = p
        nextCubic = c2
      case "S":
        guard let c = num(), let d = num(), let e = num(), let f = num() else { return out }
        let c1 = lastCubic.map { Point(2 * cur.x - $0.x, 2 * cur.y - $0.y) } ?? cur
        let c2 = pt(c, d), p = pt(e, f)
        out.append(.cubic(c1, c2, p))
        cur = p
        nextCubic = c2
      case "Q":
        guard let a = num(), let b = num(), let e = num(), let f = num() else { return out }
        let c = pt(a, b), p = pt(e, f)
        out.append(.quad(c, p))
        cur = p
        nextQuad = c
      case "T":
        guard let e = num(), let f = num() else { return out }
        let c = lastQuad.map { Point(2 * cur.x - $0.x, 2 * cur.y - $0.y) } ?? cur
        let p = pt(e, f)
        out.append(.quad(c, p))
        cur = p
        nextQuad = c
      case "A":
        guard let rx = num(), let ry = num(), let rot = num(), let large = flag(), let sweep = flag(),
          let x = num(), let y = num()
        else { return out }
        let p = pt(x, y)
        out += arc(from: cur, to: p, rx: rx, ry: ry, rotation: rot, large: large, sweep: sweep)
        cur = p
      case "Z":
        out.append(.close)
        cur = start
        cmd = " "
      default:
        return out
      }
      lastCubic = nextCubic
      lastQuad = nextQuad
    }
    return out
  }

  /// Cung elip (SVG 1.1 F.6.5–F.6.6) → bezier bậc ba, mỗi khúc ≤ 90°.
  public static func arc(
    from p0: Point, to p1: Point, rx rx0: Double, ry ry0: Double, rotation: Double, large: Bool, sweep: Bool
  ) -> [Segment] {
    if p0 == p1 { return [] }
    var rx = abs(rx0), ry = abs(ry0)
    if rx == 0 || ry == 0 { return [.line(p1)] }
    let phi = rotation * Double.pi / 180
    let cphi = cos(phi), sphi = sin(phi)
    let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
    let x1p = cphi * dx + sphi * dy, y1p = -sphi * dx + cphi * dy
    let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lambda > 1 {
      rx *= lambda.squareRoot()
      ry *= lambda.squareRoot()
    }
    let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    var coef = den == 0 ? 0 : max(0, num / den).squareRoot()
    if large == sweep { coef = -coef }
    let cxp = coef * rx * y1p / ry, cyp = -coef * ry * x1p / rx
    let cx = cphi * cxp - sphi * cyp + (p0.x + p1.x) / 2
    let cy = sphi * cxp + cphi * cyp + (p0.y + p1.y) / 2
    func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
      atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    }
    let ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry
    let vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry
    let theta1 = angle(1, 0, ux, uy)
    var delta = angle(ux, uy, vx, vy)
    if !sweep && delta > 0 { delta -= 2 * Double.pi }
    if sweep && delta < 0 { delta += 2 * Double.pi }
    let n = max(1, Int((abs(delta) / (Double.pi / 2) - 1e-9).rounded(.up)))
    let step = delta / Double(n)
    let k = 4.0 / 3.0 * tan(step / 4)
    func onEllipse(_ t: Double) -> Point {
      let x = rx * cos(t), y = ry * sin(t)
      return Point(cphi * x - sphi * y + cx, sphi * x + cphi * y + cy)
    }
    func derivative(_ t: Double) -> Point {
      let x = -rx * sin(t), y = ry * cos(t)
      return Point(cphi * x - sphi * y, sphi * x + cphi * y)
    }
    var out: [Segment] = []
    var t = theta1
    for j in 0..<n {
      let t2 = t + step
      let a = onEllipse(t), b = j == n - 1 ? p1 : onEllipse(t2)
      let da = derivative(t), db = derivative(t2)
      out.append(.cubic(Point(a.x + k * da.x, a.y + k * da.y), Point(b.x - k * db.x, b.y - k * db.y), b))
      t = t2
    }
    return out
  }

  /// Elip bằng bốn bezier bậc ba.
  public static func ellipse(cx: Double, cy: Double, rx: Double, ry: Double) -> [Segment] {
    let k = 0.5522847498307936
    let ox = rx * k, oy = ry * k
    return [
      .move(Point(cx + rx, cy)),
      .cubic(Point(cx + rx, cy + oy), Point(cx + ox, cy + ry), Point(cx, cy + ry)),
      .cubic(Point(cx - ox, cy + ry), Point(cx - rx, cy + oy), Point(cx - rx, cy)),
      .cubic(Point(cx - rx, cy - oy), Point(cx - ox, cy - ry), Point(cx, cy - ry)),
      .cubic(Point(cx + ox, cy - ry), Point(cx + rx, cy - oy), Point(cx + rx, cy)),
      .close,
    ]
  }

  /// Chữ nhật, bo góc theo luật SVG (thiếu một bán kính → bằng cái kia, kẹp
  /// về nửa cạnh).
  public static func rect(x: Double, y: Double, width w: Double, height h: Double, rx: Double?, ry: Double?)
    -> [Segment]
  {
    var a = rx ?? ry ?? 0, b = ry ?? rx ?? 0
    a = min(max(0, a), w / 2)
    b = min(max(0, b), h / 2)
    if a == 0 || b == 0 {
      return [.move(Point(x, y)), .line(Point(x + w, y)), .line(Point(x + w, y + h)), .line(Point(x, y + h)), .close]
    }
    let k = 0.5522847498307936
    return [
      .move(Point(x + a, y)), .line(Point(x + w - a, y)),
      .cubic(Point(x + w - a + a * k, y), Point(x + w, y + b - b * k), Point(x + w, y + b)),
      .line(Point(x + w, y + h - b)),
      .cubic(Point(x + w, y + h - b + b * k), Point(x + w - a + a * k, y + h), Point(x + w - a, y + h)),
      .line(Point(x + a, y + h)),
      .cubic(Point(x + a - a * k, y + h), Point(x, y + h - b + b * k), Point(x, y + h - b)),
      .line(Point(x, y + b)),
      .cubic(Point(x, y + b - b * k), Point(x + a - a * k, y), Point(x + a, y)),
      .close,
    ]
  }

  /// Khung bao hình học chặt (cực trị thật của bezier, không phải điểm điều khiển).
  public static func bounds(_ segs: [Segment]) -> Rect {
    var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
    func addX(_ v: Double) {
      minX = min(minX, v)
      maxX = max(maxX, v)
    }
    func addY(_ v: Double) {
      minY = min(minY, v)
      maxY = max(maxY, v)
    }
    func add(_ p: Point) {
      addX(p.x)
      addY(p.y)
    }
    func roots(_ a: Double, _ b: Double, _ c: Double) -> [Double] {
      if abs(a) < 1e-12 { return abs(b) < 1e-12 ? [] : [-c / b] }
      let d = b * b - 4 * a * c
      if d < 0 { return [] }
      let s = d.squareRoot()
      return [(-b + s) / (2 * a), (-b - s) / (2 * a)]
    }
    var cur = Point(0, 0), start = Point(0, 0)
    for s in segs {
      switch s {
      case .move(let p):
        cur = p
        start = p
        add(p)
      case .line(let p):
        add(p)
        cur = p
      case .quad(let c, let p):
        add(p)
        for (a0, a1, a2, isX) in [(cur.x, c.x, p.x, true), (cur.y, c.y, p.y, false)] {
          let den = a0 - 2 * a1 + a2
          guard den != 0 else { continue }
          let t = (a0 - a1) / den
          guard t > 0 && t < 1 else { continue }
          let v = (1 - t) * (1 - t) * a0 + 2 * (1 - t) * t * a1 + t * t * a2
          isX ? addX(v) : addY(v)
        }
        cur = p
      case .cubic(let c1, let c2, let p):
        add(p)
        for (p0, p1, p2, p3, isX) in [(cur.x, c1.x, c2.x, p.x, true), (cur.y, c1.y, c2.y, p.y, false)] {
          // B'(t) / 3 = a t² + b t + c
          let a = -p0 + 3 * p1 - 3 * p2 + p3
          let b = 2 * (p0 - 2 * p1 + p2)
          let c = p1 - p0
          for t in roots(a, b, c) where t > 0 && t < 1 {
            let u = 1 - t
            let v = u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
            isX ? addX(v) : addY(v)
          }
        }
        cur = p
      case .close:
        cur = start
      }
    }
    if !minX.isFinite { return Rect(x: 0, y: 0, width: 0, height: 0) }
    return Rect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
  }

  /// Mọi path của cảnh, đọc một lần.
  static let pathCache: [String: [Segment]] = {
    var m: [String: [Segment]] = [:]
    func walk(_ ns: [KoaScene.Node]) {
      for n in ns {
        if case .string(let d)? = n.a?["d"], m[d] == nil { m[d] = parsePath(d) }
        walk(n.kids ?? [])
      }
    }
    walk(KoaScene.nodes)
    m[KoaMath.smilePath] = parsePath(KoaMath.smilePath)
    return m
  }()

  static func segments(_ e: KoaRender.Element) -> [Segment]? {
    let p = e.props
    switch e.tag {
    case "Path":
      guard case .string(let d)? = p["d"] else { return nil }
      return pathCache[d] ?? parsePath(d)
    case "Ellipse":
      return ellipse(
        cx: number(p["cx"]) ?? 0, cy: number(p["cy"]) ?? 0, rx: number(p["rx"]) ?? 0, ry: number(p["ry"]) ?? 0)
    case "Circle":
      let r = number(p["r"]) ?? 0
      return ellipse(cx: number(p["cx"]) ?? 0, cy: number(p["cy"]) ?? 0, rx: r, ry: r)
    case "Rect":
      return rect(
        x: number(p["x"]) ?? 0, y: number(p["y"]) ?? 0, width: number(p["width"]) ?? 0,
        height: number(p["height"]) ?? 0, rx: number(p["rx"]), ry: number(p["ry"]))
    case "Line":
      return [
        .move(Point(number(p["x1"]) ?? 0, number(p["y1"]) ?? 0)),
        .line(Point(number(p["x2"]) ?? 0, number(p["y2"]) ?? 0)),
      ]
    default:
      return nil
    }
  }

  // MARK: - Kế hoạch

  struct Defs {
    var gradients: [String: Gradient] = [:]
    var clips: [String: [KoaRender.Element]] = [:]
  }

  static func collect(_ e: KoaRender.Element, into d: inout Defs) {
    switch e.tag {
    case "LinearGradient", "RadialGradient":
      guard case .string(let id)? = e.props["id"] else { return }
      let p = e.props
      let bbox = p["gradientUnits"] != .string("userSpaceOnUse")
      let stops = e.kids.filter { $0.tag == "Stop" }.map { s -> Stop in
        var c = s.props["stopColor"].flatMap { v -> RGBA? in
          if case .string(let t) = v { return colour(t) }
          return nil
        } ?? RGBA(r: 0, g: 0, b: 0, a: 1)
        c.a *= number(s.props["stopOpacity"]) ?? 1
        return Stop(offset: min(1, max(0, number(s.props["offset"]) ?? 0)), colour: c)
      }
      d.gradients[id] =
        e.tag == "LinearGradient"
        ? .linear(
          x1: number(p["x1"]) ?? 0, y1: number(p["y1"]) ?? 0, x2: number(p["x2"]) ?? (bbox ? 1 : 0),
          y2: number(p["y2"]) ?? 0, bbox: bbox, stops: stops)
        : .radial(
          cx: number(p["cx"]) ?? 0.5, cy: number(p["cy"]) ?? 0.5, r: number(p["r"]) ?? 0.5, bbox: bbox, stops: stops)
    case "ClipPath":
      if case .string(let id)? = e.props["id"] { d.clips[id] = e.kids }
    default:
      for k in e.kids { collect(k, into: &d) }
    }
  }

  static func ref(_ v: KoaScene.Value?) -> String? {
    guard case .string(let s)? = v, s.hasPrefix("url(#"), s.hasSuffix(")") else { return nil }
    return String(s.dropFirst(5).dropLast())
  }

  static func paint(_ v: KoaScene.Value?, _ defs: Defs, inherited: Paint) -> Paint {
    guard let v else { return inherited }
    if let id = ref(v) { return defs.gradients[id].map { .gradient($0) } ?? .none }
    guard case .string(let s) = v else { return inherited }
    if s == "none" { return .none }
    return colour(s).map { .colour($0) } ?? inherited
  }

  static func style(_ p: [String: KoaScene.Value], _ parent: Style, _ defs: Defs) -> Style {
    var s = parent
    s.fill = paint(p["fill"], defs, inherited: parent.fill)
    s.stroke = paint(p["stroke"], defs, inherited: parent.stroke)
    if let w = number(p["strokeWidth"]) { s.strokeWidth = w }
    if case .string(let c)? = p["strokeLinecap"] { s.lineCap = c }
    if case .string(let j)? = p["strokeLinejoin"] { s.lineJoin = j }
    if let o = number(p["fillOpacity"]) { s.fillOpacity = o }
    if let o = number(p["strokeOpacity"]) { s.strokeOpacity = o }
    if case .string(let r)? = p["fillRule"] { s.evenOdd = r == "evenodd" }
    return s
  }

  static func clipShapes(_ kids: [KoaRender.Element], _ m: Mat) -> [Clip] {
    var out: [Clip] = []
    for k in kids {
      let km = k.matrix.map { KoaMath.mul(m, $0) } ?? m
      if let segs = segments(k) {
        out.append(Clip(segments: segs, matrix: km, evenOdd: k.props["clipRule"] == .string("evenodd")))
      } else {
        out += clipShapes(k.kids, km)
      }
    }
    return out
  }

  static func ops(_ e: KoaRender.Element, _ m: Mat, _ parent: Style, _ defs: Defs) -> [Op] {
    switch e.tag {
    case "Defs", "ClipPath", "LinearGradient", "RadialGradient", "Stop": return []
    default: break
    }
    let mm = e.matrix.map { KoaMath.mul(m, $0) } ?? m
    let st = style(e.props, parent, defs)
    let opacity = number(e.props["opacity"]) ?? 1
    // `clip-path` theo toạ độ của chính phần tử (sau transform của nó)
    let clip = ref(e.props["clipPath"]).flatMap { defs.clips[$0] }.map { clipShapes($0, mm) }
    if let segs = segments(e) {
      let shape = Op.shape(Shape(segments: segs, bounds: bounds(segs), style: st, opacity: opacity, matrix: mm))
      return clip.map { [.group(opacity: 1, clip: $0, ops: [shape])] } ?? [shape]
    }
    let inner = e.kids.flatMap { ops($0, mm, st, defs) }
    if opacity >= 1 && clip == nil { return inner }
    if inner.isEmpty { return [] }
    return [.group(opacity: opacity, clip: clip, ops: inner)]
  }

  /// Cả hình, theo toạ độ `viewBox` (240 × 300).
  public static func plan(_ root: KoaRender.Element) -> [Op] {
    var defs = Defs()
    collect(root, into: &defs)
    return root.kids.flatMap { ops($0, KoaMath.identity, Style(), defs) }
  }

  /// `preserveAspectRatio="xMidYMax meet"`: tỉ lệ và độ dời để `viewBox` vừa
  /// khung `width × height`, canh giữa ngang, chạm đáy.
  public static func viewport(width: Double, height: Double) -> Mat {
    let s = min(width / KoaMath.width, height / KoaMath.height)
    return [s, 0, 0, s, (width - KoaMath.width * s) / 2, height - KoaMath.height * s]
  }
}
