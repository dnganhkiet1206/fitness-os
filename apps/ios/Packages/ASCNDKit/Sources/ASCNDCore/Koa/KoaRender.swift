import Foundation

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
    /// Khẩu hình khi đang nói (`KoaTalk.visemes`: `say1`/`say2`/`say3`/`content`) — chỉ thay MIỆNG,
    /// mắt và lông mày giữ theo `expression` (Kiệt 04/11: có bóng thoại là miệng phải cử động).
    public var mouth: KoaFlags.Expression?
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
    /// Mắt phải khép bao nhiêu khi khác mắt trái (Koa V2, 05/11): hai mắt không khép đúng cùng
    /// một khung. `nil` = như `blink`.
    public var blinkRight: Double?
    /// Nét mặt vừa rời (Koa V2, 05/11): mắt / mày / miệng của nét cũ mờ dần, nét mới hiện dần
    /// trong `faceMix` 0 → 1, thay cho đổi bụp. `nil` = không đang chuyển.
    public var faceFrom: Face?
    public var faceMix = 1.0
    /// Mắt đã sang nét mới chưa. Mắt không mờ dần (hai lớp mắt chồng nhau thành "mắt ma", đo
    /// 05/11): mắt đổi lúc mí đang khép trong một cú chớp, chỉ mày và miệng mờ dần.
    public var faceEyesNew = true
    /// Nhịp nghỉ có đà (Koa V2, 05/11): tai và tay theo sau đầu, thân dồn trọng tâm chậm.
    /// Tắt ở lưới / ô chọn (khung đứng yên) và ở bản RN.
    public var settle = true
    /// Quay mặt 2.5D (Koa V2, 05/11, `KoaTurn`): −1 quay hẳn sang trái màn … 1 sang phải, tối đa
    /// `KoaTurn.maxDeg`. `nil` = theo hướng đi, hoặc nhẹ theo ánh nhìn. Chỉ ở bản native.
    public var turn: Double?
    /// Bóng dưới chân của bản vẽ. Tắt khi bên ngoài tự vẽ bóng nằm yên trên sàn (Koa nhảy dời cả hình lên,
    /// bóng của hình mà đi theo thì như dính vào chân — cảnh phản ứng, 06/11).
    public var groundShadow = true
    /// Mặt có tham số (07/11, `KoaFaceRig`): mày và miệng dựng từ số, mí theo `lidL/lidR`. Bật thì mọi mày /
    /// miệng / mắt đặc biệt của `expression` tắt, mắt mở thường. Chỉ ở bản native.
    public var rig: KoaFaceRig?

    /// Một nét mặt: biểu cảm + dáng (dáng có mặt riêng).
    public struct Face: Sendable, Hashable {
      public var expression: KoaFlags.Expression
      public var gesture: KoaGesture?
      public init(expression: KoaFlags.Expression, gesture: KoaGesture?) {
        self.expression = expression
        self.gesture = gesture
      }
    }

    public enum ArmsLayer: Sendable, Hashable { case all, without, only }

    public init() {}
  }

  static let shapes: [String: String] = [
    "path": "Path", "ellipse": "Ellipse", "circle": "Circle", "rect": "Rect", "line": "Line", "polygon": "Polygon",
    "polyline": "Polyline", "text": "Text", "tspan": "TSpan", "linearGradient": "LinearGradient",
    "radialGradient": "RadialGradient", "stop": "Stop",
  ]

  /// Kiểu đưa xuống có `opacity:` + khoảng trắng + `0` (đúng như regex `opacity:\s*0` cũ —
  /// cả `opacity:0.5` cũng khớp, giữ nguyên nghĩa). Trước đây biên dịch regex mỗi lần gọi,
  /// mỗi nút mỗi khung (30/10, hiệu năng).
  static func hidesByOpacity(_ s: String) -> Bool {
    guard !s.isEmpty else { return false }
    var rest = Substring(s)
    while let r = rest.range(of: "opacity:") {
      var i = r.upperBound
      while i < rest.endIndex, rest[i].isWhitespace { i = rest.index(after: i) }
      if i < rest.endIndex, rest[i] == "0" { return true }
      rest = rest[r.upperBound...]
    }
    return false
  }

  /// `defs` chỉ phụ thuộc cờ nào đang bật (đồ đang mặc, nét mặt…), bản giấy và dáng — lưu
  /// theo những thứ ấy, không dựng lại mỗi khung.
  struct DefsKey: Hashable, Sendable {
    let on: [String]
    let paper: Bool
    let paw: Bool
    let rn: Bool
  }
  static let defsMemo = KoaMemo<DefsKey, Element>(capacity: 64)

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
    var flags: KoaFlags.Flags
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
    /// Dò chỗ chạm (`anchors`): thêm điểm mốc vô hình vào vài bộ phận.
    var probe = false
    var blinkRight: Double?
    /// Cờ của nét mặt vừa rời (`Options.faceFrom`) và độ hiện của nét mới.
    var from: KoaFlags.Flags?
    var mix = 1.0
    var eyesNew = true
    var inFace = false
    /// Nhịp nghỉ có đà (`Options.settle`), và độ dồn trọng tâm (độ) lúc này.
    var settle = false
    var weightShift = 0.0
    /// Quay mặt 2.5D (`Options.turn`), và vùng của nút đang vẽ (mặt, tai, tay, chân, thân).
    var turn = 0.0
    var turnRegion: KoaTurn.Region?
    var groundShadow = true
    /// Khi quay: tay phía xa vẽ sau thân, tay gần vẽ trước (0 cả hai, 1 chỉ tay xa, 2 chỉ tay gần).
    var armSide = 0
    var rig: KoaFaceRig?
  }

  /// Mày / miệng của mặt có tham số, thay vào chỗ lớp mày `browArc` và miệng `mouthSoft` của bản vẽ (cùng nhóm
  /// cha, nên theo đầu nghiêng / nhìn / quay như mày, miệng gốc).
  static func rigged(_ cond: String, _ rig: KoaFaceRig, _ c: Context) -> [Element]? {
    func stroke(_ d: String, _ w: Double) -> Element {
      Element("Path", ["d": .string(d), "stroke": .string(KoaFaceRig.ink), "strokeWidth": .number(w),
                       "strokeLinecap": .string("round"), "strokeLinejoin": .string("round"), "fill": .string("none")])
    }
    func turned(_ e: [Element], x: Double, y: Double) -> [Element] {
      guard c.turn != 0, let r = c.turnRegion else { return e }
      switch KoaTurn.move(r, x: x, y: y, u: c.turn) {
      case .hidden: return []
      case .mat(let m): return [Element("G", matrix: m, kids: e)]
      default: return e
      }
    }
    switch cond {
    case "browArc":
      let p = rig.browPaths()
      return turned([stroke(p[0], 5)], x: 81.5, y: 61) + turned([stroke(p[1], 5)], x: 158.5, y: 61)
    case "mouthSoft":
      let m = rig.mouth()
      var out: [Element] = []
      if let cav = m.cavity { out.append(Element("Path", ["d": .string(cav), "fill": .string(KoaFaceRig.ink)])) }
      if let t = m.teeth { out.append(Element("Path", ["d": .string(t), "fill": .string("#FFFFFF")])) }
      if let t = m.tongue {
        out.append(Element("Ellipse", ["cx": .number(t.cx), "cy": .number(t.cy), "rx": .number(t.rx), "ry": .number(t.ry),
                                       "fill": .string("#E8657B")]))
      }
      out.append(stroke(m.lip, 4.5 + 0.5 * min(1, rig.open * 3)))
      return turned(out, x: 120, y: 136)
    default: return nil
    }
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
  static func lash(_ m: KoaMath.Mat, only eye: Int? = nil) -> Element {
    Element(
      "G", matrix: m,
      kids: KoaMath.lashPaths.enumerated().filter { eye == nil || $0.offset == eye }.map(\.element).map {
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
    // Đang chuyển nét mặt (Koa V2): lớp chỉ có ở nét cũ thì vẽ theo cờ cũ và mờ dần; lớp chỉ có ở
    // nét mới thì hiện dần. Lớp có ở cả hai vẽ một lần, như thường.
    if c.inFace, let from = c.from, let cond = n.cond {
      let now = c.flags[cond]?.truthy ?? false, was = from[cond]?.truthy ?? false
      if now != was {
        var one = c
        one.from = nil
        if was { one.flags = from }
        let k = KoaMath.isEyeCond(cond) ? (was != c.eyesNew ? 1 : 0) : was ? 1 - c.mix : c.mix
        guard k > 0.001 else { return [] }
        let drawn = node(l, one, armPart: armPart, armHidden: armHidden)
        return k >= 0.999 ? drawn : [Element("G", ["opacity": .number(k)], kids: drawn)]
      }
    }
    if let cond = n.cond, !(c.flags[cond]?.truthy ?? false) { return [] }
    if armHidden { return [] }
    if let rig = c.rig, c.inFace, let cond = n.cond, let drawn = rigged(cond, rig, c) { return drawn }
    // lớp tay của dáng giơ tay: bỏ tay khỏi hình chính, hoặc chỉ vẽ tay
    var c = c
    if n.id == "FACE" { c.inFace = true }
    if c.turn != 0, let r = KoaTurn.region(n.id) { c.turnRegion = r }
    if !c.groundShadow, n.id == "shadow" { return [] }
    if n.id == "ARMS" {
      if c.arms == .without { return [] }
      c.inArms = true
    }
    if c.arms == .only, !c.inArms, shapes[n.t] != nil { return [] }

    let arms = c.dress && n.id == "ARMS"
    var kids: [Element] = []
    // đi: bàn chân gần người xem vẽ sau (đè lên chân kia)
    let order = n.id == "LEGS" && c.walk?.leftNear == true ? Array(l.kids.enumerated().reversed()) : Array(l.kids.enumerated())
    // quay mặt: tay phía xa vẽ trước `TORSO` (nằm sau thân), tay gần vẽ ở chỗ cũ
    let farArms = c.turn != 0 && n.id == "BODYRIG" ? l.kids.firstIndex { $0.node.cond == "armsIdle" } : nil
    for (i, k) in order {
      if let a = farArms, k.node.id == "TORSO" {
        var far = c
        far.armSide = 1
        kids += node(l.kids[a], far)
      }
      var kc = c
      if farArms == i { kc.armSide = 2 }
      kids += node(
        k, kc, armPart: arms ? KoaMath.dressArmAt[i] : nil, armHidden: arms && KoaMath.dressArmHide.contains(i))
    }
    // nụ cười đóng của cái liếc nằm TRONG `#FACE`, theo mọi thứ cái liếc làm
    if let g = c.gaze, c.swapMouth, n.id == "FACE", n.kids != nil { kids.append(smile(g.k)) }

    if n.t == "defs" { return [Element("Defs", kids: kids)] }
    if n.t == "clipPath" { return [Element("ClipPath", ["id": .string(n.id ?? "")], kids: kids)] }

    // kiểu đưa xuống mang một hoạt ảnh hoặc một `opacity:0`
    let bound = n.animBind.map { c.flags[$0]?.text ?? "" } ?? ""
    if hidesByOpacity(bound) { return [] }
    let boundAnim = bound.isEmpty ? nil : KoaMath.parseAnim(bound)

    let anim = n.anim ?? boundAnim?.anim
    // Mắt lờ đờ (mí khép nửa / nặng / buồn, Kiệt 04/11): không nháy. Lớp nháy là hai elip phủ
    // cả mắt, mọc lên dưới mí thành "một hình elip vẽ thêm" — chỉ mắt mở to mới nháy.
    if !KoaScene.rn, let anim, KoaMath.blinkAnims.contains(anim.k), KoaMath.lidded(c.flags) { return [] }
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

    var body: [Element]
    if let shape {
      // mỗi lượt đèn là chính hình ấy với một lớp sơn khác
      var passes = [Element(shape, own)]
      // dáng mới nghiêng đầu: vẽ thêm vai / gáy cùng sơn với thân, nằm sau đầu — đầu
      // nghiêng không lộ khe giữa đầu và thân (Kiệt 25/10)
      if let g = c.gesture, g.tiltsHead, n.id == "torso_front" {
        passes.insert(patch(KoaGesture.neckFill, raw, own, flat: c.flat || c.paper), at: 0)
        if g == .curious { passes.insert(patch(KoaGesture.curiousFill, raw, own, flat: c.flat || c.paper), at: 0) }
      } else if n.id == "torso_front", KoaRender.neckShows(c.walk) {
        // đầu nghiêng theo đà khi đi / nhảy (rig liên tục): cùng mảng vai / gáy, kẻo lộ khe giữa cằm và vai
        // (Kiệt 06/11, cảnh phản ứng)
        passes.insert(patch(KoaGesture.neckFill, raw, own, flat: c.flat || c.paper), at: 0)
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

    // dò: điểm mốc ở toạ độ riêng của bộ phận, đi qua đúng mọi biến hình của nó (dáng, đầu nghiêng,
    // quay người, đi, nhìn theo)
    if c.probe, let id = n.id, let p = probePoints[id] {
      body.append(Element("Probe", ["id": .string(id), "cx": .number(p.x), "cy": .number(p.y)]))
    }
    let ox = origin?[0] ?? 0, oy = origin?[1] ?? 0
    var el0: [Element]?
    let el: [Element]
    if let anim, c.live {
      // `AnimGroup`: trước hết độ trễ, hoạt ảnh không góp gì (`fill-mode: none`)
      let baseM = KoaMath.opsMat(base, 0, 0)
      var props = gProps
      let matrix: KoaMath.Mat
      if let b = c.blink, KoaMath.blinkAnims.contains(anim.k) {
        // chớp mắt do bên ngoài: thay hẳn nhịp gốc, kể cả trong độ trễ
        matrix = KoaMath.mul(baseM, KoaMath.opsMat([KoaScene.Op("s", [1, b])], ox, oy))
        if drivesOp { props["opacity"] = .number(KoaMath.sampleOp(track?.op ?? [], 0, anim.ease)) }
        // hai mắt lệch nhau (Koa V2): mi phải là một nhóm riêng với độ khép của nó
        if let r = c.blinkRight, r != b, body.count == 2 {
          let right = KoaMath.mul(baseM, KoaMath.opsMat([KoaScene.Op("s", [1, r])], ox, oy))
          el0 = [Element("G", props, matrix: matrix, kids: [body[0]]), Element("G", props, matrix: right, kids: [body[1]])]
        }
      } else if c.settle, let lag = KoaMath.settleLag[anim.k], c.t - lag >= anim.delay {
        // nhịp nghỉ có đà (Koa V2): đầu nhún trước, tay rồi tai theo sau — không cùng một nhịp
        let elapsed = c.t - lag - anim.delay
        let t = elapsed.truncatingRemainder(dividingBy: anim.dur) / anim.dur
        let m = drivesTf ? KoaMath.sampleMat(track?.tf ?? [], t, anim.ease, ox, oy) : KoaMath.identity
        matrix = base.isEmpty ? m : KoaMath.mul(baseM, m)
        if drivesOp { props["opacity"] = .number(KoaMath.sampleOp(track?.op ?? [], t, anim.ease)) }
      } else if c.t < anim.delay {
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
      el = el0 ?? [Element("G", props, matrix: matrix, kids: body)]
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
    // dồn trọng tâm khi đứng (Koa V2): thân nghiêng rất chậm sang chân này rồi chân kia, quanh
    // giữa hai bàn chân — bàn chân gần như không rời sàn
    if c.weightShift != 0, n.id == "POSERIG" { moved = [Element("G", matrix: KoaGesture.rot(c.weightShift, 120, 293), kids: moved)] }
    // Chớp mắt do bên ngoài (phòng, 29/10): nét mi theo ĐÚNG độ khép mi đưa vào — không theo
    // nhịp gốc của bản vẽ (lỗi Kiệt thấy: mắt khép mất nét mi, nét mi hiện lúc mắt mở). Hai
    // nhóm chớp (`koaBlink`, `koaBlink2`) cùng khép một lúc → chỉ vẽ nét mi một lần.
    // nét mi đi theo mắt khi quay mặt (mỗi mắt một chỗ)
    func lashes(_ m: KoaMath.Mat, _ eye: Int?) -> [Element] {
      guard c.turn != 0, c.turnRegion == .face else { return [lash(m, only: eye)] }
      return (eye.map { [$0] } ?? [0, 1]).compactMap { e -> Element? in
        switch KoaTurn.move(.face, x: e == 0 ? 82 : 158, y: 96, u: c.turn) {
        case .hidden: return nil
        case .keep: return lash(m, only: e)
        case .mat(let t): return Element("G", matrix: t, kids: [lash(m, only: e)])
        }
      }
    }
    if let b = c.blink, c.live, let anim, KoaMath.blinkAnims.contains(anim.k) {
      let m = KoaMath.opsMat([KoaScene.Op("s", [1, b])], ox, oy)
      if let r = c.blinkRight, r != b {
        let mr = KoaMath.opsMat([KoaScene.Op("s", [1, r])], ox, oy)
        if anim.k == "koaBlink", m[3] > KoaMath.lashMin { moved += lashes(m, 0) }
        if anim.k == "koaBlink", mr[3] > KoaMath.lashMin { moved += lashes(mr, 1) }
      } else if anim.k == "koaBlink", m[3] > KoaMath.lashMin {
        moved += lashes(m, nil)
      }
    } else if c.poke != nil, c.live, let anim, KoaMath.blinkAnims.contains(anim.k), c.t >= anim.delay,
      let track = track?.tf, !track.isEmpty
    {
      // Koa lớn: chớp mắt có nét mi = mép dưới của mi, co cùng mi
      let e = c.t - anim.delay
      let m = KoaMath.sampleMat(track, e.truncatingRemainder(dividingBy: anim.dur) / anim.dur, anim.ease, ox, oy)
      if m[3] > KoaMath.lashMin { moved += lashes(m, nil) }
    }

    // Mắt lờ đờ nhắm (Kiệt 04/11): không có lớp elip nháy — chính MÍ hạ xuống, từ mép trên mắt (y 72,5)
    // tới đáy mắt; nét mi ở mép mí đi theo thành đường mắt nhắm.
    if !KoaScene.rn, c.live, let b = c.blink, b > 0, let cond = n.cond, let k = KoaMath.lidDrop[cond] {
      let s = 1 + (k - 1) * min(1, b)
      moved = [Element("G", matrix: [1, 0, 0, s, 0, KoaMath.eyeTop * (1 - s)], kids: moved)]
    }

    // quay mặt 2.5D: mỗi mảng nhỏ trượt / co theo độ sâu của nó (dáng đầu, thân giữ nguyên)
    if c.turn != 0, let r = c.turnRegion, shape != nil, n.id != "torso_front",
      let p = r == .tuft ? KoaTurn.tuftBase : KoaTurn.anchor(n.t, n.a)
    {
      if r == .arms, c.armSide != 0 {
        let far = (p.x < 120) == (c.turn < 0)
        if far != (c.armSide == 1) { return [] }
      }
      switch KoaTurn.move(r, x: p.x, y: p.y, u: c.turn) {
      case .hidden: return []
      case .mat(let m): moved = [Element("G", matrix: m, kids: moved)]
      case .keep: break
      }
    }

    if c.turn != 0, let id = n.id, case .string(let d)? = n.a?["d"], KoaTurn.crescentShift[id] != nil {
      moved += KoaTurn.crescent(id: id, d: d, u: c.turn)
    }
    if c.turn != 0, n.id == "HEADRIG" { moved = [Element("G", matrix: KoaTurn.headMat(c.turn), kids: moved)] }

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
    if let m = o.mouth, !o.dress {
      for k in f.keys where k.hasPrefix("mouth") || k == "grinCycle" { f[k] = k == "grinCycle" ? .text("") : .bool(false) }
      switch m {
      case .say1: f["mouthSay1"] = .bool(true)
      case .say2: f["mouthSay2"] = .bool(true)
      case .say3: f["mouthSay3"] = .bool(true)
      default: f["mouthSoft"] = .bool(true)
      }
    }
    if walking(o), let w = o.walk {
      for (k, v) in walkFlags(w) { f[k] = v }
    }
    if let rig = o.rig, !o.dress, !KoaScene.rn {
      // mặt có tham số: chỉ còn mắt mở thường; mày / miệng do `rigged` vẽ ở chỗ `browArc` / `mouthSoft`
      for k in f.keys where k.hasPrefix("brow") || k.hasPrefix("mouth") || k.hasPrefix("eyes") || k.hasPrefix("lids")
        || k.hasPrefix("faceGym") || k.hasPrefix("show")
      {
        f[k] = .bool(false)
      }
      f["grinCycle"] = .text("")
      f["blinkGate"] = .text("")
      f["eyesOpen"] = .bool(true)
      f["browArc"] = .bool(true)
      f["mouthSoft"] = .bool(true)
      f["showSweat"] = .bool(rig.sweat > 0.5)
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
      "rotate(\(num(-(w.sway + w.lean))) 120 293) translate(\(num(f.x - w.shift)),\(num(f.y - f.lift + w.bob))) "
        + "rotate(\(num(f.tilt)) \(num(cx)) 292)"
    }
    let u = w.turn
    var f: KoaFlags.Flags = [:]
    f["footL"] = .text(foot(w.left, cx: 95))
    f["footR"] = .text(foot(w.right, cx: 145))
    // bản native quay mặt bằng `KoaTurn` (từng mảng theo độ sâu); RN dời cả mặt một khoảng
    if KoaScene.rn {
      f["faceShift"] = .text(u == 0 ? "" : "translate(\(num(14 * u)),0)")
      f["earShift"] = .text(u == 0 ? "" : "translate(\(num(5 * u)),0)")
      f["bellyTurn"] = .text(u == 0 ? "" : "translate(\(num(8 * u)),0)")
    }
    return f
  }

  /// Đầu và mắt nhìn theo hướng đi (khi không có ngón tay).
  static func walkLook(_ o: Options) -> KoaMath.Gaze? {
    guard walking(o), let w = o.walk, abs(w.turn) > 0.001 else { return nil }
    return KoaMath.Gaze(x: 0.9 * w.turn, y: 0.15 * abs(w.turn), k: 1)
  }

  /// Thân nhún lên + nghiêng (lắc sang chân đỡ, nghiêng tới theo hướng đi), quanh giữa hai bàn chân.
  static func bodyMat(_ w: KoaWalk.Pose) -> KoaMath.Mat {
    KoaMath.mul(KoaMath.opMat(KoaScene.Op("t", [w.shift, -w.bob])), KoaMath.opMat(KoaScene.Op("r", [w.sway + w.lean, 120, 293])))
  }

  static func walkMat(_ n: KoaScene.Node, _ w: KoaWalk.Pose) -> KoaMath.Mat? {
    if n.id == "POSERIG" { return bodyMat(w) }
    if n.id == "HEADRIG", w.headLag != 0 { return KoaGesture.rot(w.headLag, 120, 166) }
    if n.id == "ear_left", w.earLag != 0 || w.earLeft != 0 { return KoaGesture.rot(w.earLag - w.earLeft, 62, 92) }
    if n.id == "ear_right", w.earLag != 0 || w.earRight != 0 { return KoaGesture.rot(w.earLag + w.earRight, 178, 92) }
    if n.bind == "armRankL" {
      let r = KoaGesture.rot(w.armLeft, KoaGesture.shoulderL.0, KoaGesture.shoulderL.1)
      guard w.flipRaisedArms, armFlips(w.armLeft) else { return r }
      return KoaMath.mul(KoaMath.mul(shoulderTuck(w.armLeft), r), KoaGesture.flip(left: true))
    }
    // tay phải và đồ cầm trên tay phải đánh cùng nhau
    if n.bind == "armRankR" || n.animBind == "handAnim" {
      let r = KoaGesture.rot(w.armRight, KoaGesture.shoulderR.0, KoaGesture.shoulderR.1)
      guard w.flipRaisedArms, armFlips(-w.armRight) else { return r }
      return KoaMath.mul(KoaMath.mul(shoulderTuck(-w.armRight), r), KoaGesture.flip(left: false))
    }
    return nil
  }

  /// Đầu nghiêng theo đà quá 1° thì lấp khe cổ. Chỉ native; dáng đứng yên / đi thường (đầu thẳng) không đổi.
  /// Tay giơ: nhấc cả cánh tay lên (tối đa 6 đơn vị, đủ cao ở 45°) để gốc vai giấu dưới cằm — mép trên cánh tay
  /// nằm thấp hơn cằm để lộ một mũi tối giữa tay và cằm (Kiệt khoanh, 06/11).
  static func shoulderTuck(_ raise: Double) -> KoaMath.Mat {
    KoaMath.opMat(KoaScene.Op("t", [0, -6 * min(1, max(0, raise) / 45)]))
  }

  /// 06/11 (lần 2): cả khi tay rig đang giơ (đã lật) — mép trên cánh tay gặp cằm để lộ khe tối mảnh ở vai
  /// (Kiệt khoanh); cùng mảng vai / gáy đó lấp được.
  static func neckShows(_ w: KoaWalk.Pose?) -> Bool {
    guard !KoaScene.rn, let w else { return false }
    let raised = w.flipRaisedArms && (armFlips(w.armLeft) || armFlips(-w.armRight))
    return abs(w.headLag) > 1 || raised
  }

  /// Tay giơ lên quá ngưỡng này (độ) thì LẬT hình tay theo trục vai → bàn tay, như dáng `cheer` / `taDa`: tay của
  /// bản vẽ cong để buông xuống, xoay lên mà không lật thì bàn tay ngược chiều (Kiệt 24/10, lại thấy 06/11 ở cảnh
  /// phản ứng). Lật lúc tay đang vung nhanh nhất. Đi trong phòng tay chỉ đánh ~±20°, không chạm ngưỡng. Bản RN không lật.
  /// 25° (Kiệt 06/11, lần 3 "tay vẫn giơ ngược"): mọi tư thế giơ của cảnh phản ứng (đấm tay 38–52°, dang tay, nâng
  /// tạ) ở TRÊN ngưỡng nên luôn lật đúng chiều; tay vung từ buông lên qua 25° rất nhanh. Đi trong phòng tay đánh ~±20°.
  public static let armFlipDeg = 25.0
  static func armFlips(_ raise: Double) -> Bool { !KoaScene.rn && raise >= armFlipDeg
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
  /// Điểm mốc để dò chỗ chạm (toạ độ riêng của bộ phận, theo `KoaScene`): mũi, tâm và đỉnh đầu, hai
  /// tai, bụng, bàn chân.
  static let probePoints: [String: (x: Double, y: Double)] = [
    "nose": (120, 105), "head_front": (120, 108), "head_top_fur": (120, 48), "ear_right": (190, 58),
    "belly": (120, 228), "LEGS": (120, 284),
  ]

  /// Vị trí THẬT của các mốc trong khung 240 × 300 (như `viewBox`) ở đúng dáng / khung `o` — để biết
  /// người dùng chạm vào đâu ở mọi tư thế (Kiệt 04/11). Tai trái là `ear_left` (cùng id với lớp tai
  /// trong nên đặt mốc theo tai phải và đối xứng qua mũi).
  public static func anchors(_ o: Options) -> [String: (x: Double, y: Double)] {
    var probing = o
    probing.size = 240
    let f = flags(probing)
    var c = context(probing, f)
    c.probe = true
    let tree = KoaLight.nodes.flatMap { node($0, c) }
    var out: [String: (x: Double, y: Double)] = [:]
    func walk(_ e: Element, _ m: KoaMath.Mat) {
      let here = e.matrix.map { KoaMath.mul(m, $0) } ?? m
      if e.tag == "Probe", case .string(let id)? = e.props["id"], out[id] == nil,
        case .number(let x)? = e.props["cx"], case .number(let y)? = e.props["cy"]
      {
        out[id] = (here[0] * x + here[2] * y + here[4], here[1] * x + here[3] * y + here[5])
      }
      for k in e.kids { walk(k, here) }
    }
    for e in tree { walk(e, KoaMath.insetMat) }
    return out
  }

  static func context(_ o: Options, _ f: KoaFlags.Flags) -> Context {
    // chỉ cái liếc trong phòng đổi miệng; nhìn theo ngón tay thì không
    let swapMouth = o.gaze != nil && KoaMath.swapMouths.contains { f[$0]?.truthy ?? false }
    var c = Context(
      flags: f, t: o.t, live: o.live, gaze: o.live ? o.gaze ?? o.look ?? walkLook(o) : nil, swapMouth: swapMouth,
      rest: KoaMath.restsAt(f) && !o.dress, dress: o.dress, blend: o.blend ?? (o.dress ? 1 : 0), paper: o.paper,
      flat: o.flat, poke: o.live ? o.poke : nil, gesture: o.gesture, arms: o.arms, walk: walking(o) ? o.walk : nil,
      eyes: o.live ? o.eyes : nil, blink: o.live ? o.blink : nil, gestureAmount: o.gestureAmount)
    // bố cục, không phải hoạt ảnh: áp cả cho khung đứng yên
    c.groundShadow = o.groundShadow
    guard o.live, !KoaScene.rn else { return c }
    c.blinkRight = o.blink == nil ? nil : o.blinkRight
    if let rig = o.rig, !o.dress {
      // mí của mặt có tham số chồng lên cú chớp (chớp vẫn khép hết khi tới)
      c.rig = rig
      let b = o.blink ?? 0
      c.blink = max(b, rig.lidL)
      c.blinkRight = max(o.blinkRight ?? b, rig.lidR)
    }
    if let from = o.faceFrom, o.faceMix < 1, !o.dress {
      var old = o
      old.expression = from.expression
      old.gesture = from.gesture
      let was = flags(old)
      if was != f {
        c.from = was
        c.mix = max(0, o.faceMix)
        c.eyesNew = o.faceEyesNew
      }
    }
    c.settle = o.settle && !o.dress
    if !o.dress {
      if let t = o.turn {
        c.turn = max(-1, min(1, t))
      } else if walking(o), let w = o.walk {
        c.turn = w.turn
      } else if let g = o.gaze ?? o.look {
        c.turn = KoaTurn.gazeGain * max(-1, min(1, g.x)) * g.k
      }
    }
    if c.settle, o.pose == .idle, o.gesture == nil, !walking(o) { c.weightShift = KoaMath.weightShift(o.t) }
    return c
  }

  public static func figure(_ o: Options) -> Element {
    let f = flags(o)
    let c = context(o, f)
    let tree = KoaLight.nodes.flatMap { node($0, c) }
    return Element(
      "Svg",
      [
        "width": .number(o.size), "height": .number(o.size * KoaMath.aspect), "viewBox": .string("0 0 240 300"),
        "preserveAspectRatio": .string("xMidYMax meet"),
      ],
      kids: [cachedDefs(defsFlags(f, c), paper: o.paper, gesture: o.gesture), Element("G", matrix: KoaMath.insetMat, kids: tree)])
  }

  /// Cờ để dựng `defs`: đang đổi nét mặt thì gồm cả cờ của nét CŨ. Lớp của nét cũ (tròng trắng, sao, mí) còn vẽ tới
  /// lúc đổi xong; thiếu dải màu của chúng trong `defs` thì chúng tô thành ĐEN (Kiệt 07/11: "thi thoảng koa chỉ có mỗi
  /// tròng đen khi chuyển đổi nét mặt").
  static func defsFlags(_ f: KoaFlags.Flags, _ c: Context) -> KoaFlags.Flags {
    guard let from = c.from else { return f }
    var out = f
    for (k, v) in from where v.truthy && !(out[k]?.truthy ?? false) { out[k] = v }
    return out
  }

  static func cachedDefs(_ flags: KoaFlags.Flags, paper: Bool, gesture: KoaGesture?) -> Element {
    defsMemo.value(defsKey(flags, paper: paper, gesture: gesture)) { defs(flags, paper: paper, gesture: gesture) }
  }

  /// Khoá của `defs` cho một khung — tách ra để test đếm được mà không đọc bộ nhớ đệm dùng chung.
  static func defsKey(_ flags: KoaFlags.Flags, paper: Bool, gesture: KoaGesture?) -> DefsKey {
    DefsKey(
      on: flags.compactMap { $0.value.truthy ? $0.key : nil }.sorted(), paper: paper,
      paw: gesture?.pawOutline == true, rn: KoaScene.rn)
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
