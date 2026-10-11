public import Foundation

/// Bộ dựng cảnh của Koa (#527, K2) — `RenderNode` + phần cây của `KoaFigure`
/// trong `koa-figure.tsx` @ fac9ac2, thành một hàm thuần.
///
/// RN dựng cây react-native-svg một lần rồi để Reanimated tính ma trận từng
/// khung trên luồng UI. Ở đây cả hai gộp lại: cho biểu cảm, tư thế, đồ mặc và
/// thời điểm `t` của đồng hồ, trả về đúng cây phần tử (thẻ + thuộc tính + ma
/// trận) mà react-native-svg nhận ở khung ấy. `KoaFigureView` (K3) chỉ việc vẽ
/// cây này.
public enum KoaRender {
  /// Một phần tử SVG: `Svg`, `Defs`, `G`, `Path`, `LinearGradient`, `Stop`, …
  /// `matrix` là `transform` / `matrix` của RN (cùng một nghĩa).
  public struct Element: Sendable, Hashable {
    public var tag: String
    public var props: [String: KoaScene.Value]
    public var matrix: KoaMath.Mat?
    public var kids: [Element]

    public init(_ tag: String, _ props: [String: KoaScene.Value] = [:], matrix: KoaMath.Mat? = nil, kids: [Element] = []) {
      self.tag = tag
      self.props = props
      self.matrix = matrix
      self.kids = kids
    }
  }

  public struct Options: Sendable, Hashable {
    public var expression: KoaFlags.Expression = .happy
    public var pose: KoaFlags.Pose = .idle
    /// Thử đồ — tư thế riêng của app, chồng lên `pose`.
    public var dress = false
    public var worn: KoaFlags.Worn = [:]
    /// Kích thước vẽ (rộng); cao = rộng × 1,25.
    public var size = 160.0
    /// `false` → khung t=0 đứng yên, không có lớp hoạt ảnh (lưới, ô chọn).
    public var live = true
    /// Bản giấy (theme sáng) thay vì bản có đèn.
    public var paper = false
    /// Đồng hồ của nhân vật, ms.
    public var t = 0.0
    /// Độ hiện của tư thế thử đồ, 0 → 1; mặc định theo `dress`.
    public var blend: Double?
    /// Ánh nhìn đã giải (`gazeAt`), khi nhân vật đứng trong phòng.
    public var gaze: KoaMath.Gaze?

    public init() {}
  }

  static let shapes: [String: String] = [
    "path": "Path", "ellipse": "Ellipse", "circle": "Circle", "rect": "Rect", "line": "Line", "polygon": "Polygon",
    "polyline": "Polyline", "text": "Text", "tspan": "TSpan", "linearGradient": "LinearGradient",
    "radialGradient": "RadialGradient", "stop": "Stop",
  ]

  /// `ATTR` của `svg-shapes.ts`: kebab-case → camelCase của react-native-svg.
  static let attrNames: [String: String] = [
    "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray", "stroke-dashoffset": "strokeDashoffset",
    "stroke-opacity": "strokeOpacity", "fill-opacity": "fillOpacity", "fill-rule": "fillRule",
    "clip-path": "clipPath", "clip-rule": "clipRule", "stop-color": "stopColor", "stop-opacity": "stopOpacity",
    "font-family": "fontFamily", "font-size": "fontSize", "font-weight": "fontWeight", "font-style": "fontStyle",
    "text-anchor": "textAnchor", "letter-spacing": "letterSpacing", "gradient-units": "gradientUnits",
    "gradientUnits": "gradientUnits",
  ]

  /// `attrs`.
  static func attrs(_ a: [String: KoaScene.Value]?, dropOpacity: Bool) -> [String: KoaScene.Value] {
    var out: [String: KoaScene.Value] = [:]
    for (k, v) in a ?? [:] where !(dropOpacity && k == "opacity") { out[attrNames[k] ?? k] = v }
    return out
  }

  static let hiddenRe = try! NSRegularExpression(pattern: "opacity:\\s*0")

  struct Context {
    let flags: KoaFlags.Flags
    let t: Double
    let live: Bool
    let gaze: KoaMath.Gaze?
    let swapMouth: Bool
    let rest: Bool
    let dress: Bool
    let blend: Double
    let paper: Bool
  }

  static func isEyeGroup(_ n: KoaScene.Node) -> Bool { n.kids?.contains { $0.id == "pupil_left" } ?? false }

  static func smile(_ k: Double) -> Element {
    Element(
      "G", ["opacity": .number(k)],
      kids: [
        Element(
          "Path",
          [
            "d": .string(KoaMath.smilePath), "stroke": .string(KoaMath.smileColour),
            "strokeWidth": .number(KoaMath.smileWidth), "strokeLinecap": .string("round"), "fill": .string("none"),
          ])
      ])
  }

  /// `own_tf`: kiểu nội tuyến thắng thuộc tính trình bày mà `bind` đưa xuống.
  static func ownTf(_ n: KoaScene.Node, _ flags: KoaFlags.Flags) -> [KoaMath.Op] {
    if let tf = n.tf { return tf }
    guard let b = n.bind else { return [] }
    return KoaMath.parseOps(flags[b]?.text ?? "")
  }

  /// `RenderNode` — một lớp và mọi lớp con, thành 0, 1 hay nhiều phần tử
  /// (Fragment của RN trải phẳng vào cha).
  static func node(_ l: KoaLight.Lit, _ c: Context, armPart: KoaMath.DressPart? = nil, armHidden: Bool = false)
    -> [Element]
  {
    let n = l.node
    if let cond = n.cond, !(c.flags[cond]?.truthy ?? false) { return [] }
    if armHidden { return [] }

    let arms = c.dress && n.id == "ARMS"
    var kids: [Element] = []
    for (i, k) in l.kids.enumerated() {
      kids += node(
        k, c, armPart: arms ? KoaMath.dressArmAt[i] : nil, armHidden: arms && KoaMath.dressArmHide.contains(i))
    }
    // nụ cười đóng của cái liếc nằm TRONG `#FACE`, theo mọi thứ cái liếc làm
    if let g = c.gaze, c.swapMouth, n.id == "FACE", n.kids != nil { kids.append(smile(g.k)) }

    if n.t == "defs" { return [Element("Defs", kids: kids)] }
    if n.t == "clipPath" { return [Element("ClipPath", ["id": .string(n.id ?? "")], kids: kids)] }

    // kiểu đưa xuống mang một hoạt ảnh hoặc một `opacity:0`
    let bound = n.animBind.map { c.flags[$0]?.text ?? "" } ?? ""
    let range = NSRange(location: 0, length: (bound as NSString).length)
    if hiddenRe.firstMatch(in: bound, range: range) != nil { return [] }
    let boundAnim = bound.isEmpty ? nil : KoaMath.parseAnim(bound)

    let anim = n.anim ?? boundAnim?.anim
    let origin = n.o ?? boundAnim?.origin
    let track = anim.flatMap { KoaScene.keyframes[$0.k] }
    // hoạt ảnh CSS thắng thuộc tính trình bày: rãnh `transform` THAY transform
    // của lớp (không ghép), `opacity` cũng vậy; `translate` CSS vẫn còn
    let drivesTf = !(track?.tf?.isEmpty ?? true)
    let drivesOp = !(track?.op?.isEmpty ?? true)

    var base: [KoaMath.Op] = []
    if let tr = n.tr { base.append(KoaMath.Op("t", [tr[0], tr[1]])) }
    base += boundAnim?.tr ?? []
    if !drivesTf { base += ownTf(n, c.flags) }
    let over = drivesTf ? ownTf(n, c.flags) : []

    let own = KoaLight.litProps(l, attrs(n.a, dropOpacity: drivesOp))
    let ownOpacity = drivesOp && n.a?["opacity"] != nil ? (n.a?["opacity"]?.number ?? .nan) : 1
    let shape = shapes[n.t]
    let gProps = shape == nil ? own : [:]

    let body: [Element]
    if let shape {
      // mỗi lượt đèn là chính hình ấy với một lớp sơn khác
      var passes = [Element(shape, own)]
      if !c.paper, let glow = l.glow {
        var p = own
        p["fill"] = .string("url(#\(glow))")
        p["stroke"] = .string("none")
        passes.append(Element(shape, p))
      }
      for (on, id) in [(l.form, KoaLight.formGradient), (l.body, KoaLight.bodyGradient)] where on {
        var p = own
        p["fill"] = .string("url(#\(id))")
        p["stroke"] = .string("none")
        passes.append(Element(shape, p))
      }
      if !c.paper, n.id.map({ KoaLight.rimIds.contains($0) }) ?? false {
        var p = own
        p["fill"] = .string("none")
        p["stroke"] = .string("url(#\(KoaLight.rimGradient))")
        p["strokeWidth"] = .number(KoaLight.rimWidth)
        passes.append(Element(shape, p))
      }
      body = passes
    } else {
      body = kids
    }

    let ox = origin?[0] ?? 0, oy = origin?[1] ?? 0
    let el: [Element]
    if let anim, c.live {
      // `AnimGroup`: trước hết độ trễ, hoạt ảnh không góp gì (`fill-mode: none`)
      let baseM = KoaMath.opsMat(base, 0, 0)
      var props = gProps
      let matrix: KoaMath.Mat
      if c.t < anim.delay {
        matrix = KoaMath.mul(baseM, KoaMath.opsMat(over, ox, oy))
        if drivesOp { props["opacity"] = .number(ownOpacity) }
      } else {
        let elapsed = c.t - anim.delay
        let r = elapsed.truncatingRemainder(dividingBy: anim.dur)
        // đúng ranh giới một vòng là cuối vòng vừa xong, không phải đầu vòng sau
        let t = r == 0 && elapsed > 0 ? 1 : r / anim.dur
        let m = drivesTf ? KoaMath.sampleMat(track?.tf ?? [], t, anim.ease, ox, oy) : KoaMath.identity
        matrix = base.isEmpty ? m : KoaMath.mul(baseM, m)
        if drivesOp { props["opacity"] = .number(KoaMath.sampleOp(track?.op ?? [], t, anim.ease)) }
      }
      el = [Element("G", props, matrix: matrix, kids: body)]
    } else if let anim {
      // đứng yên ở t=0: trong độ trễ là transform của chính lớp, ngoài thì khung 0%
      let early = anim.delay > 0
      let inner =
        early
        ? KoaMath.opsMat(over, ox, oy)
        : drivesTf ? KoaMath.sampleMat(track?.tf ?? [], 0, anim.ease, ox, oy) : KoaMath.identity
      var props = gProps
      if drivesOp {
        props["opacity"] = .number(early ? ownOpacity : KoaMath.sampleOp(track?.op ?? [], 0, anim.ease))
      }
      el = [Element("G", props, matrix: KoaMath.mul(KoaMath.opsMat(base, 0, 0), inner), kids: body)]
    } else if !base.isEmpty {
      el = [Element("G", gProps, matrix: KoaMath.opsMat(base, ox, oy), kids: body)]
    } else if !gProps.isEmpty {
      el = [Element("G", gProps, kids: body)]
    } else {
      el = body
    }

    // dáng nghỉ nằm TRONG cái liếc, là một `<G>` tĩnh
    var leaned = el
    if c.rest, let id = n.id, let m = KoaMath.restMat(id) { leaned = [Element("G", matrix: m, kids: el)] }

    // tư thế thử đồ: ngoài dáng nghỉ, trong cái liếc
    let part: KoaMath.DressPart? =
      c.dress ? (armPart ?? n.id.flatMap { KoaMath.dressById[$0] } ?? (isEyeGroup(n) ? .eyes : nil)) : nil
    var moved = leaned
    if let part {
      let m = c.live ? KoaMath.dressMat(part, c.t, c.blend) : KoaMath.dressMat(part, 0)
      moved = [Element("G", matrix: m, kids: leaned)]
    }

    guard let g = c.gaze else { return moved }
    if n.id == "HEADRIG" { return [Element("G", matrix: KoaMath.headMat(g), kids: moved)] }
    if isEyeGroup(n) { return [Element("G", matrix: KoaMath.eyeMat(g), kids: moved)] }
    if c.swapMouth, let cond = n.cond, KoaMath.swapMouths.contains(cond) {
      return [Element("G", ["opacity": .number(1 - g.k)], kids: moved)]
    }
    return moved
  }

  /// Cờ của `KoaFigure`: thử đồ thì miệng "o" và hai trái tim của `delighted`.
  public static func flags(_ o: Options) -> KoaFlags.Flags {
    var f = KoaFlags.flags(o.expression, o.pose, worn: o.worn)
    if o.dress {
      f["mouthSmile"] = .bool(false)
      f["mouthGrin"] = .bool(false)
      f["mouthO"] = .bool(true)
      f["showHearts"] = .bool(true)
    }
    return f
  }

  /// Cả hình: `Svg` > `Defs` (đèn) + `G` (lùi vào khung) > cây.
  public static func figure(_ o: Options) -> Element {
    let f = flags(o)
    let swapMouth = KoaMath.swapMouths.contains { f[$0]?.truthy ?? false }
    let c = Context(
      flags: f, t: o.t, live: o.live, gaze: o.live ? o.gaze : nil, swapMouth: swapMouth,
      rest: KoaMath.restsAt(f) && !o.dress, dress: o.dress, blend: o.blend ?? (o.dress ? 1 : 0), paper: o.paper)
    let tree = KoaLight.nodes.flatMap { node($0, c) }
    return Element(
      "Svg",
      [
        "width": .number(o.size), "height": .number(o.size * KoaMath.aspect), "viewBox": .string("0 0 240 300"),
        "preserveAspectRatio": .string("xMidYMax meet"),
      ],
      kids: [defs(f, paper: o.paper), Element("G", matrix: KoaMath.insetMat, kids: tree)])
  }

  static func stop(_ offset: Double, _ colour: String, _ opacity: Double? = nil) -> Element {
    var p: [String: KoaScene.Value] = ["offset": .number(offset), "stopColor": .string(colour)]
    if let opacity { p["stopOpacity"] = .number(opacity) }
    return Element("Stop", p)
  }

  static let unitBox: [String: KoaScene.Value] = [
    "x1": .string("0"), "y1": .string("0"), "x2": .string("0"), "y2": .string("1"),
  ]

  /// Đèn: một dải dọc mỗi màu, điểm sáng, khối, bóng, viền — chỉ những gì tư
  /// thế này dùng.
  static func defs(_ flags: KoaFlags.Flags, paper: Bool) -> Element {
    var kids: [Element] = []
    for r in KoaLight.ramps(flags, paper: paper) {
      kids.append(
        Element(
          "LinearGradient",
          [
            "id": .string(r.id), "gradientUnits": .string("userSpaceOnUse"), "x1": .number(r.x1),
            "y1": .number(r.y1), "x2": .number(r.x2), "y2": .number(r.y2),
          ], kids: r.stops.map { stop($0.offset, $0.colour) }))
    }
    for g in KoaLight.glows(flags) {
      kids.append(
        Element(
          "RadialGradient",
          [
            "id": .string(g.id), "gradientUnits": .string("userSpaceOnUse"), "cx": .number(g.cx),
            "cy": .number(g.cy), "r": .number(g.r),
          ], kids: KoaLight.glowStops.map { stop($0.0, KoaLight.glowColour, $0.1) }))
    }
    var form = unitBox
    form["id"] = .string(KoaLight.formGradient)
    kids.append(Element("LinearGradient", form, kids: KoaLight.formStops.map { stop($0.0, $0.1, $0.2) }))
    var body = unitBox
    body["id"] = .string(KoaLight.bodyGradient)
    kids.append(Element("LinearGradient", body, kids: KoaLight.bodyStops.map { stop($0.0, $0.1, $0.2) }))
    kids.append(
      Element(
        "RadialGradient", ["id": .string(KoaLight.shadowGradient)],
        kids: KoaLight.shadowStops.map { stop($0.0, KoaLight.shadowColour, $0.1) }))
    var rim = unitBox
    rim["id"] = .string(KoaLight.rimGradient)
    kids.append(
      Element("LinearGradient", rim, kids: KoaLight.rimStops.map { stop($0.0, KoaLight.rimColour, $0.1) }))
    return Element("Defs", kids: kids)
  }
}
