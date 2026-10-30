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
    /// Màu GỐC của bản vẽ, không đèn (15/10, chủ dự án: "koa đang bị phủ một lớp tối
    /// của bản tối"): không dải sáng-tối, không lượt tô theo mảnh (quầng / khối / viền —
    /// lộ chỗ các mảnh chồng nhau). Lớp nắng cả hình do view vẽ. Thắng `paper`.
    public var flat = false
    /// Đồng hồ của nhân vật, ms.
    public var t = 0.0
    /// Độ hiện của tư thế thử đồ, 0 → 1; mặc định theo `dress`.
    public var blend: Double?
    /// Ánh nhìn đã giải (`gazeAt`), khi nhân vật đứng trong phòng.
    public var gaze: KoaMath.Gaze?
    /// Nhìn theo ngón tay (app, 23/10): đầu và mắt như `gaze`, nhưng không đổi miệng.
    /// `gaze` thắng khi có cả hai.
    public var look: KoaMath.Gaze?
    /// Phản ứng khi chạm (`KoaPoke`): nhảy, tai giật, lông mày nhướn.
    public var poke: KoaMath.Poke?
    /// Hạng vóc dáng 0…5 (`KoaGains.rank`) → `rankFlags`.
    public var build = 0
    /// Dáng biểu cảm mới (24/10) — xoay thêm từng mảng trên tư thế đứng.
    public var gesture: KoaGesture?
    /// Lớp tay: cả hình, bỏ tay, hay chỉ tay (dáng giơ tay đè má vẽ tay ở lớp trên).
    public var arms: ArmsLayer = .all
    /// Đang đi trong phòng (29/10, `KoaWalk`): bàn chân, nhún, đánh tay, quay mặt.
    /// Chỉ cho tư thế đứng (`idle`).
    public var walk: KoaWalk.Pose?
    /// Mắt nhìn riêng (Koa có ý định, 29/10): mắt tới đích trước đầu. `nil` = theo `look`.
    public var eyes: KoaMath.Gaze?
    /// Độ khép mi 0…1 do bên ngoài điều khiển (chớp mắt không theo chu kỳ). `nil` = chớp
    /// theo hoạt ảnh gốc của bản vẽ.
    public var blink: Double?
    /// Độ hiện của dáng biểu cảm 0…1 (dáng chuyển dần, không bật tắt).
    public var gestureAmount = 1.0

    public enum ArmsLayer: Sendable, Hashable { case all, without, only }

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
    var flat = false
    var poke: KoaMath.Poke?
    var gesture: KoaGesture?
    var arms: Options.ArmsLayer = .all
    var inArms = false
    var walk: KoaWalk.Pose?
    var eyes: KoaMath.Gaze?
    var blink: Double?
    var gestureAmount = 1.0
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

  /// Nét mi trong đúng phép co của mi (`m`).
  static func lash(_ m: KoaMath.Mat) -> Element {
    Element(
      "G", matrix: m,
      kids: KoaMath.lashPaths.map {
        Element(
          "Path",
          [
            "d": .string($0), "stroke": .string(KoaMath.smileColour), "strokeWidth": .number(KoaMath.lashWidth),
            "strokeLinecap": .string("round"), "fill": .string("none"),
          ])
      })
  }

  /// Mảng lấp khe dưới thân: màu đặc đúng sắc thân ở độ cao vai (dải màu `url(#…)` của
  /// thân không áp được cho hình chèn thêm — mảng thành trong suốt).
  static func patch(_ d: String, _ raw: [String: KoaScene.Value], _ own: [String: KoaScene.Value], flat: Bool) -> Element {
    var p = own
    p["d"] = .string(d)
    if case .string(let hex)? = raw["fill"], KoaLight.isHex(hex) {
      p["fill"] = .string(flat ? hex : KoaLight.paint(hex, 165))
    }
    p["stroke"] = .string("none")
    return Element("Path", p)
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
    // lớp tay của dáng giơ tay: bỏ tay khỏi hình chính, hoặc chỉ vẽ tay
    var c = c
    if n.id == "ARMS" {
      if c.arms == .without { return [] }
      c.inArms = true
    }
    if c.arms == .only, !c.inArms, shapes[n.t] != nil { return [] }

    let arms = c.dress && n.id == "ARMS"
    var kids: [Element] = []
    // đi: bàn chân gần người xem vẽ sau (đè lên chân kia)
    let order = n.id == "LEGS" && c.walk?.leftNear == true ? Array(l.kids.enumerated().reversed()) : Array(l.kids.enumerated())
    for (i, k) in order {
      kids += node(
        k, c, armPart: arms ? KoaMath.dressArmAt[i] : nil, armHidden: arms && KoaMath.dressArmHide.contains(i))
    }
    // nụ cười đóng của cái liếc nằm TRONG `#FACE`, theo mọi thứ cái liếc làm
    if let g = c.gaze, c.swapMouth, n.id == "FACE", n.kids != nil { kids.append(smile(g.k)) }

    if n.t == "defs" { return [Element("Defs", kids: kids)] }
    if n.t == "clipPath" { return [Element("ClipPath", ["id": .string(n.id ?? "")], kids: kids)] }

    // kiểu đưa xuống mang một hoạt ảnh hoặc một `opacity:0`
    let bound = n.animBind.map { c.flags[$0]?.text ?? "" } ?? ""
    if bound.range(of: #"opacity:\s*0"#, options: .regularExpression) != nil { return [] }
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

    var raw = attrs(n.a, dropOpacity: drivesOp)
    if let g = c.gesture, case .string(let d)? = raw["d"], let lid = g.lid(d) { raw["d"] = .string(lid) }
    let own = c.flat ? raw : KoaLight.litProps(l, raw)
    let ownOpacity = drivesOp && n.a?["opacity"] != nil ? (n.a?["opacity"]?.number ?? .nan) : 1
    let shape = shapes[n.t]
    let gProps = shape == nil ? own : [:]

    let body: [Element]
    if let shape {
      // mỗi lượt đèn là chính hình ấy với một lớp sơn khác
      var passes = [Element(shape, own)]
      // dáng mới nghiêng đầu: vẽ thêm vai / gáy cùng sơn với thân, nằm sau đầu — đầu
      // nghiêng không lộ khe giữa đầu và thân (Kiệt 25/10)
      if let g = c.gesture, g.tiltsHead, n.id == "torso_front" {
        passes.insert(patch(KoaGesture.neckFill, raw, own, flat: c.flat || c.paper), at: 0)
        if g == .curious { passes.insert(patch(KoaGesture.curiousFill, raw, own, flat: c.flat || c.paper), at: 0) }
      }
      // `flat` (ban ngày): không lượt nào tô theo từng mảnh — tô từng mảnh làm lộ
      // chỗ các mảnh chồng nhau (15/10, chủ dự án). Khối do một dải nắng phủ cả hình.
      if !c.paper, !c.flat, let glow = l.glow {
        var p = own
        p["fill"] = .string("url(#\(glow))")
        p["stroke"] = .string("none")
        passes.append(Element(shape, p))
      }
      for (on, id) in [(l.form, KoaLight.formGradient), (l.body, KoaLight.bodyGradient)] where on && !c.flat {
        var p = own
        p["fill"] = .string("url(#\(id))")
        p["stroke"] = .string("none")
        passes.append(Element(shape, p))
      }
      // dáng mới: nét mờ quanh NỬA bàn tay (vai vẫn liền thân)
      if let g = c.gesture, g.pawOutline, n.id == "arm_left_upper" || n.id == "arm_right_upper" {
        var p = own
        p["fill"] = .string("none")
        p["stroke"] = .string("#A9B2BC")
        p["strokeWidth"] = .number(1.8)
        p["strokeOpacity"] = .number(0.55)
        let clip = n.id == "arm_left_upper" ? "koaPawL" : "koaPawR"
        passes.append(Element("G", ["clipPath": .string("url(#\(clip))")], kids: [Element(shape, p)]))
      }
      if !c.paper, !c.flat, n.id.map({ KoaLight.rimIds.contains($0) }) ?? false {
        var p = own
        p["fill"] = .string("none")
        p["stroke"] = .string("url(#\(KoaLight.rimGradient))")
        p["strokeWidth"] = .number(KoaLight.rimWidth)
        passes.append(Element(shape, p))
      }
      // lớp tay trên của dáng giơ tay: CHỈ nửa bàn tay (vai vẫn nằm sau đầu như tư thế gốc)
      if c.arms == .only, n.id == "arm_left_upper" || n.id == "arm_right_upper" {
        let clip = n.id == "arm_left_upper" ? "koaPawL" : "koaPawR"
        body = [Element("G", ["clipPath": .string("url(#\(clip))")], kids: passes)]
      } else {
        body = passes
      }
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
        var m = drivesTf ? KoaMath.sampleMat(track?.tf ?? [], t, anim.ease, ox, oy) : KoaMath.identity
        // chớp mắt do bên ngoài: mi khép đúng độ được đưa vào
        if let b = c.blink, KoaMath.blinkAnims.contains(anim.k) {
          m = KoaMath.opsMat([KoaScene.Op("s", [1, b])], ox, oy)
        }
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

    if let p = c.poke, let m = KoaMath.pokeMat(id: n.id, cond: n.cond, p, t: c.t) {
      moved = [Element("G", matrix: m, kids: moved)]
    }
    var d: String?
    if case .string(let s)? = n.a?["d"] { d = s }
    if let g = c.gesture,
      let m = g.matrix(id: n.id, bind: n.bind, d: d, ground: 1 - (c.walk?.weight ?? 0), amount: c.gestureAmount)
    {
      moved = [Element("G", matrix: m, kids: moved)]
    }
    // Tư thế đứng: nhấc hai tay lên một chút để đỉnh tay chạm cằm — hết khe tối nhỏ giữa
    // tay và đầu (Kiệt 25/10: "nâng tay lên thay vì vẽ che"). Bản RN giữ nguyên.
    if c.gesture == nil, !KoaScene.rn, c.flags["armsIdle"]?.truthy ?? false,
      n.bind == "armRankL" || n.bind == "armRankR"
    {
      moved = [Element("G", matrix: KoaGesture.idleArmLift, kids: moved)]
    }
    if let w = c.walk, let m = walkMat(n, w) { moved = [Element("G", matrix: m, kids: moved)] }
    // Koa lớn: chớp mắt có nét mi = mép dưới của mi, co cùng mi
    if c.poke != nil, c.live, let anim, KoaMath.blinkAnims.contains(anim.k), c.t >= anim.delay,
      let track = track?.tf, !track.isEmpty
    {
      let e = c.t - anim.delay
      let m = KoaMath.sampleMat(track, e.truncatingRemainder(dividingBy: anim.dur) / anim.dur, anim.ease, ox, oy)
      if m[3] > KoaMath.lashMin { moved.append(lash(m)) }
    }

    if c.gaze == nil, let e = c.eyes, isEyeGroup(n) { return [Element("G", matrix: KoaMath.eyeMat(e), kids: moved)] }
    guard let g = c.gaze else { return moved }
    if n.id == "HEADRIG" { return [Element("G", matrix: KoaMath.headMat(g), kids: moved)] }
    if isEyeGroup(n) { return [Element("G", matrix: KoaMath.eyeMat(c.eyes ?? g), kids: moved)] }
    if c.swapMouth, let cond = n.cond, KoaMath.swapMouths.contains(cond) {
      return [Element("G", ["opacity": .number(1 - g.k)], kids: moved)]
    }
    return moved
  }

  /// Cờ của `KoaFigure`: thử đồ thì miệng "o" và hai trái tim của `delighted`.
  public static func flags(_ o: Options) -> KoaFlags.Flags {
    var f = KoaFlags.flags(o.expression, o.pose, worn: o.worn)
    // Tủ đồ vẽ lại: tập tạ thì hai tay đang cầm tạ — đồ cầm tay ẩn (không có ở RN).
    f["handFree"] = .bool(o.pose != .lifting)
    for (k, v) in rankFlags(rank: o.build, pose: o.dress ? .idle : o.pose) { f[k] = v }
    if let g = o.gesture, !o.dress {
      for k in f.keys where KoaGesture.facePrefixes.contains(where: { k.hasPrefix($0) }) { f[k] = .bool(false) }
      for k in g.face { f[k] = .bool(true) }
    }
    if walking(o), let w = o.walk {
      for (k, v) in walkFlags(w) { f[k] = v }
    }
    if o.dress {
      f["mouthSmile"] = .bool(false)
      f["mouthGrin"] = .bool(false)
      f["mouthO"] = .bool(true)
      f["showHearts"] = .bool(true)
    }
    return f
  }

  // MARK: - Đi trong phòng (29/10)

  static func walking(_ o: Options) -> Bool { o.walk != nil && o.pose == .idle && !o.dress }

  /// Bàn chân (cảnh tủ đồ: nhóm `FOOT_L` / `FOOT_R`, `bind` `footL` / `footR`) và quay mặt.
  /// Quay mặt = dời mặt / tai / bụng theo hướng (như `turn34`, nhưng liên tục từ −1 tới 1
  /// nên không đổi hình đột ngột; thân không co, không méo).
  static func walkFlags(_ w: KoaWalk.Pose) -> KoaFlags.Flags {
    func num(_ v: Double) -> String { String(format: "%.3f", v) }
    func foot(_ f: KoaWalk.Foot, cx: Double) -> String {
      // bù đúng phần thân nhún / nghiêng (`bodyMat`, ở POSERIG) để chân đang chạm sàn
      // đứng yên trên sàn: nghịch đảo của t(0,−bob)·r(θ) là r(−θ)·t(0,bob)
      "rotate(\(num(-(w.sway + w.lean))) 120 293) translate(\(num(f.x)),\(num(f.y - f.lift + w.bob))) "
        + "rotate(\(num(f.tilt)) \(num(cx)) 292)"
    }
    let u = w.turn
    var f: KoaFlags.Flags = [:]
    f["footL"] = .text(foot(w.left, cx: 95))
    f["footR"] = .text(foot(w.right, cx: 145))
    f["faceShift"] = .text(u == 0 ? "" : "translate(\(num(14 * u)),0)")
    f["earShift"] = .text(u == 0 ? "" : "translate(\(num(5 * u)),0)")
    f["bellyTurn"] = .text(u == 0 ? "" : "translate(\(num(8 * u)),0)")
    return f
  }

  /// Đầu và mắt nhìn theo hướng đi (khi không có ngón tay).
  static func walkLook(_ o: Options) -> KoaMath.Gaze? {
    guard walking(o), let w = o.walk, abs(w.turn) > 0.001 else { return nil }
    return KoaMath.Gaze(x: 0.9 * w.turn, y: 0.15 * abs(w.turn), k: 1)
  }

  /// Thân nhún lên + nghiêng (lắc sang chân đỡ, nghiêng tới theo hướng đi), quanh giữa hai bàn chân.
  static func bodyMat(_ w: KoaWalk.Pose) -> KoaMath.Mat {
    KoaMath.mul(KoaMath.opMat(KoaScene.Op("t", [0, -w.bob])), KoaMath.opMat(KoaScene.Op("r", [w.sway + w.lean, 120, 293])))
  }

  static func walkMat(_ n: KoaScene.Node, _ w: KoaWalk.Pose) -> KoaMath.Mat? {
    if n.id == "POSERIG" { return bodyMat(w) }
    if n.bind == "armRankL" { return KoaGesture.rot(w.armLeft, KoaGesture.shoulderL.0, KoaGesture.shoulderL.1) }
    // tay phải và đồ cầm trên tay phải đánh cùng nhau
    if n.bind == "armRankR" || n.animBind == "handAnim" {
      return KoaGesture.rot(w.armRight, KoaGesture.shoulderR.0, KoaGesture.shoulderR.1)
    }
    return nil
  }

  /// Mức vóc dáng của từng hạng, 0 → 1 (20/10, Kiệt duyệt `koa-rank-evolution.html`).
  static let rankBuild: [Double] = [0, 0.18, 0.4, 0.6, 0.82, 1]

  /// Cờ vóc dáng theo hạng — cảnh tủ đồ (`tools/koa-wardrobe/build.py`) đọc chúng:
  /// `rk1…rk5` hạng ≥ n, `rkE0…rkE5` đúng hạng n; tay đứng (và tay áo, đồ cầm tay)
  /// dang theo vai và dày lên quanh khớp vai; thân áo nở theo vai.
  public static func rankFlags(rank: Int, pose: KoaFlags.Pose) -> KoaFlags.Flags {
    let r = max(0, min(rank, rankBuild.count - 1))
    let t = rankBuild[min(r, rankBuild.count - 1)]
    var f: KoaFlags.Flags = [:]
    for n in 1...5 { f["rk\(n)"] = .bool(r >= n) }
    for n in 0...5 { f["rkE\(n)"] = .bool(r == n) }
    func num(_ v: Double) -> String { String(format: "%g", v) }
    let dx = 11 * t, sx = 1 + 0.22 * t, sy = 1 + 0.05 * t
    let armL = "translate(\(num(-dx)),0) translate(70,176) scale(\(num(sx)),\(num(sy))) translate(-70,-176)"
    let armR = "translate(\(num(dx)),0) translate(170,176) scale(\(num(sx)),\(num(sy))) translate(-170,-176)"
    let standing = pose == .idle || pose == .turn34
    f["armRankL"] = .text(r == 0 ? "" : armL)
    f["armRankR"] = .text(r == 0 ? "" : armR)
    f["handRank"] = .text(r == 0 || !standing ? "" : armR)
    // Neo tay của RN (178,236) lọt vào giữa cánh tay → đồ cầm tay trông như dán giữa tay
    // (29/10): khi đứng dời món ra đúng đầu bàn tay (~190,240), mọi hạng.
    f["handFit"] = .text(standing ? "translate(12,4)" : "")
    f["topRank"] = .text(r == 0 ? "" : "translate(120,0) scale(\(num(1 + 0.16 * t)),1) translate(-120,0)")
    return f
  }

  /// Cả hình: `Svg` > `Defs` (đèn) + `G` (lùi vào khung) > cây.
  public static func figure(_ o: Options) -> Element {
    let f = flags(o)
    // chỉ cái liếc trong phòng đổi miệng; nhìn theo ngón tay thì không
    let swapMouth = o.gaze != nil && KoaMath.swapMouths.contains { f[$0]?.truthy ?? false }
    let c = Context(
      flags: f, t: o.t, live: o.live, gaze: o.live ? o.gaze ?? o.look ?? walkLook(o) : nil, swapMouth: swapMouth,
      rest: KoaMath.restsAt(f) && !o.dress, dress: o.dress, blend: o.blend ?? (o.dress ? 1 : 0), paper: o.paper,
      flat: o.flat, poke: o.live ? o.poke : nil, gesture: o.gesture, arms: o.arms, walk: walking(o) ? o.walk : nil,
      eyes: o.live ? o.eyes : nil, blink: o.live ? o.blink : nil, gestureAmount: o.gestureAmount)
    let tree = KoaLight.nodes.flatMap { node($0, c) }
    return Element(
      "Svg",
      [
        "width": .number(o.size), "height": .number(o.size * KoaMath.aspect), "viewBox": .string("0 0 240 300"),
        "preserveAspectRatio": .string("xMidYMax meet"),
      ],
      kids: [defs(f, paper: o.paper, gesture: o.gesture), Element("G", matrix: KoaMath.insetMat, kids: tree)])
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
  static func defs(_ flags: KoaFlags.Flags, paper: Bool, gesture: KoaGesture? = nil) -> Element {
    var kids: [Element] = []
    if gesture?.pawOutline == true {
      for (id, left) in [("koaPawL", true), ("koaPawR", false)] {
        kids.append(
          Element("ClipPath", ["id": .string(id)], kids: [Element("Path", ["d": .string(KoaGesture.pawClip(left: left))])]))
      }
    }
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
