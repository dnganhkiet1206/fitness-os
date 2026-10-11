public import Foundation

/// Linh vật vector (#527, V1) — `VectorMascot` (`components/ascnd/vector-mascot.tsx`)
/// @ fac9ac2: Blaze / Swift / Titan / Drago / Nova (và bản Koa cũ), vẽ bằng mã —
/// mỗi phần là màu nền + bản tối cắt trong chính nó, lệch xuống phải + chút sáng.
///
/// Trả về CÂY PHẦN TỬ (cùng kiểu `KoaRender.Element`) đúng như react-native-svg
/// nhận ở khung đứng yên, kể cả hai mí mắt (RN là View phủ ngoài Svg, ở đây là
/// `Rect` cùng toạ độ rig). Chuỗi `d` dựng như template JS nên số in kiểu JS.
/// Thở / lắc / chớp mắt (hẹn giờ ngẫu nhiên) CHƯA port — avatar và lưới chọn
/// của RN đều đứng yên.
public enum VectorMascot {
  public typealias Element = KoaRender.Element

  public enum Mood: String, Sendable, Hashable, CaseIterable { case happy, neutral, tired }

  public static let rigWidth = 240.0
  public static let rigHeight = 350.0
  static let footY = 330.0
  static let accent = "#31c9d6"

  enum Variant: Sendable { case koala, lion, fox, gorilla, dragon, unicorn }

  struct Art: Sendable {
    let body: String, dark: String, light: String
    let variant: Variant
    let tank: String, short: String
    let sh: Double, st: Double, leg: Double, lean: Double, tilt: Double
    var ear: String? = nil
    var mane: String? = nil
    var muz: String? = nil
    var face: String? = nil
    var spike: String? = nil
  }

  static let art: [String: Art] = [
    "koa": Art(
      body: "#9fb0b2", dark: "#7f9295", light: "#b7c4c6", variant: .koala, tank: "#e5e8ec", short: "#3d4450", sh: 96,
      st: 26, leg: 104, lean: 6, tilt: 4, ear: "#b39a9c"),
    "blaze": Art(
      body: "#cfa566", dark: "#b08a48", light: "#e0c088", variant: .lion, tank: "#586170", short: "#3a4048", sh: 118,
      st: 34, leg: 104, lean: -5, tilt: -3, mane: "#b3823f"),
    "swift": Art(
      body: "#cf8355", dark: "#b06537", light: "#e2a074", variant: .fox, tank: "#e5e8ec", short: "#3d4450", sh: 92,
      st: 24, leg: 120, lean: 9, tilt: 6, muz: "#e7ddcf"),
    "titan": Art(
      body: "#727b87", dark: "#565e69", light: "#8b93a0", variant: .gorilla, tank: "#586170", short: "#3a4048",
      sh: 132, st: 46, leg: 92, lean: 0, tilt: 0, face: "#949cab"),
    "drago": Art(
      body: "#71ab7d", dark: "#548a61", light: "#93c39d", variant: .dragon, tank: "#e5e8ec", short: "#3d4450", sh: 104,
      st: 30, leg: 112, lean: -6, tilt: -4, spike: "#d7cfa0"),
    "nova": Art(
      body: "#d9d2e4", dark: "#bcb0d1", light: "#ece7f3", variant: .unicorn, tank: "#e5e8ec", short: "#3d4450", sh: 90,
      st: 24, leg: 118, lean: 8, tilt: 5, mane: "#a98fce"),
  ]

  // MARK: - Chuỗi kiểu JS

  /// `${v}` của JS cho số thường gặp: nguyên → không có ".0"; còn lại là dạng
  /// ngắn nhất đọc lại đúng (Swift và V8 cùng thuật toán).
  static func js(_ v: Double) -> String {
    if v == v.rounded() && abs(v) < 1e15 { return String(Int(v)) }
    return "\(v)"
  }

  /// `shade`: cộng / trừ đều ba kênh, kẹp 0…255.
  static func shade(_ hex: String, _ amt: Int) -> String {
    let n = Int(hex.dropFirst(), radix: 16) ?? 0
    func clamp(_ v: Int) -> Int { max(0, min(255, v)) }
    let r = clamp(((n >> 16) & 255) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt)
    let s = String((r << 16) | (g << 8) | b, radix: 16)
    return "#" + String(repeating: "0", count: max(0, 6 - s.count)) + s
  }

  static func capsule(_ x1: Double, _ y1: Double, _ w1: Double, _ x2: Double, _ y2: Double, _ w2: Double) -> String {
    let a = w1 / 2, b = w2 / 2
    return
      "M\(js(x1 - a)) \(js(y1)) L\(js(x2 - b)) \(js(y2)) Q\(js(x2)) \(js(y2 + b)) \(js(x2 + b)) \(js(y2)) L\(js(x1 + a)) \(js(y1)) Q\(js(x1)) \(js(y1 - a)) \(js(x1 - a)) \(js(y1)) Z"
  }

  // MARK: - Dựng phần tử

  static func n(_ v: Double) -> KoaScene.Value { .number(v) }
  static func s(_ v: String) -> KoaScene.Value { .string(v) }

  static func ellipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ fill: String, opacity: Double? = nil)
    -> Element
  {
    var p: [String: KoaScene.Value] = ["cx": n(cx), "cy": n(cy), "rx": n(rx), "ry": n(ry), "fill": s(fill)]
    if let opacity { p["opacity"] = n(opacity) }
    return Element("Ellipse", p)
  }

  static func path(_ d: String, _ props: [String: KoaScene.Value] = [:]) -> Element {
    var p = props
    p["d"] = s(d)
    return Element("Path", p)
  }

  static func stroke(
    _ d: String, _ colour: String, _ width: Double, fill: String? = nil, cap: String? = nil, join: String? = nil,
    opacity: Double? = nil
  ) -> Element {
    var p: [String: KoaScene.Value] = ["stroke": s(colour), "strokeWidth": n(width)]
    if let fill { p["fill"] = s(fill) }
    if let cap { p["strokeLinecap"] = s(cap) }
    if let join { p["strokeLinejoin"] = s(join) }
    if let opacity { p["opacity"] = n(opacity) }
    return path(d, p)
  }

  static func rect(
    _ x: Double, _ y: Double, _ w: Double, _ h: Double, rx: Double, _ fill: String, opacity: Double? = nil
  ) -> Element {
    var p: [String: KoaScene.Value] = ["x": n(x), "y": n(y), "width": n(w), "height": n(h), "rx": n(rx), "fill": s(fill)]
    if let opacity { p["opacity"] = n(opacity) }
    return Element("Rect", p)
  }

  static func translate(_ x: Double, _ y: Double) -> KoaMath.Mat { [1, 0, 0, 1, x, y] }

  /// `Part`: nền + bản tối cắt trong chính nó (lệch 10, 9) + bản sáng mờ (−9, −10).
  static func part(_ pid: String, _ d: String, _ base: String, _ dark: String, _ light: String?) -> [Element] {
    var clipped = [Element("G", matrix: translate(10, 9), kids: [path(d, ["fill": s(dark)])])]
    if let light {
      clipped.append(Element("G", ["opacity": n(0.5)], matrix: translate(-9, -10), kids: [path(d, ["fill": s(light)])]))
    }
    return [
      Element("Defs", kids: [Element("ClipPath", ["id": s(pid)], kids: [path(d)])]),
      path(d, ["fill": s(base)]),
      Element("G", ["clipPath": s("url(#\(pid))")], kids: clipped),
    ]
  }

  // MARK: - Cả hình

  /// Khung đứng yên của `VectorMascot` — `equipped` là các khoá đồ CŨ của rig
  /// này (`sunglasses`, `medal`, `belt`, `headband`, `cap`).
  public static func figure(
    id: String, size: Double = 160, mood: Mood = .neutral, level: Int = 1, equipped: Set<String> = []
  ) -> Element {
    let a = art[id] ?? art["koa"]!
    let tired = mood == .tired
    var idc = 0
    func pid() -> String {
      defer { idc += 1 }
      return "vm_\(idc)"
    }

    let hipY = footY - a.leg
    let shoulderY = hipY - 72
    let shCx = 120 - a.lean * 0.5
    let hipCx = 120 + a.lean
    let half = a.sh / 2
    let wHalf = a.sh * 0.32
    let shL = shCx - half
    let shR = shCx + half
    let wLx = hipCx - wHalf
    let wRx = hipCx + wHalf
    let footL = 120 - a.st / 2
    let footR = 120 + a.st / 2
    let headCy = shoulderY - 52
    let headTy = headCy - 86
    let grown: Double = Double(max(0, level - 1)) * 0.4
    let armW: Double = min(30 + grown, 36)
    let outH = size * (rigHeight / rigWidth)
    let showEyes = !equipped.contains("sunglasses")

    let legL = capsule(hipCx - 14, hipY + 8, 30, footL, footY - 6, 20)
    let legR = capsule(hipCx + 14, hipY + 8, 30, footR, footY - 6, 20)
    // bàn tay lệch theo dáng: `(a.lean > 0 ? 4 : 0)` của RN
    let handL: Double = a.lean > 0 ? 4 : 0
    let handR: Double = a.lean < 0 ? 4 : 0
    let armLd = capsule(shL + 7, shoulderY + 8, armW, shL - 2 - handL, hipY + 2, 23)
    let armRd = capsule(shR - 7, shoulderY + 8, armW, shR + 2 + handR, hipY + 2, 23)
    var tank = "M\(js(shL)) \(js(shoulderY + 2)) "
    tank += "C\(js(shL - 5)) \(js(shoulderY + 28)) \(js(wLx - 6)) \(js(hipY - 18)) \(js(wLx)) \(js(hipY + 4)) "
    tank += "Q\(js(hipCx)) \(js(hipY + 14)) \(js(wRx)) \(js(hipY + 4)) "
    tank += "C\(js(shR + 6)) \(js(hipY - 18)) \(js(shR + 5)) \(js(shoulderY + 28)) \(js(shR)) \(js(shoulderY + 2)) "
    tank += "Q\(js(shCx + 18)) \(js(shoulderY - 10)) \(js(shCx + 10)) \(js(shoulderY - 2)) "
    tank += "Q\(js(shCx)) \(js(shoulderY + 6)) \(js(shCx - 10)) \(js(shoulderY - 2)) "
    tank += "Q\(js(shCx - 18)) \(js(shoulderY - 10)) \(js(shL)) \(js(shoulderY + 2)) Z"
    let kneeY = hipY + 64
    var shorts = "M\(js(wLx - 7)) \(js(hipY - 6)) Q\(js(hipCx)) \(js(hipY + 6)) \(js(wRx + 7)) \(js(hipY - 6)) "
    shorts += "L\(js(wRx + 9)) \(js(kneeY)) Q\(js(hipCx + 18)) \(js(kneeY + 8)) \(js(hipCx + 7)) \(js(kneeY)) "
    shorts += "L\(js(hipCx + 3)) \(js(hipY + 30)) L\(js(hipCx - 3)) \(js(hipY + 30)) "
    shorts += "L\(js(hipCx - 7)) \(js(kneeY)) Q\(js(hipCx - 18)) \(js(kneeY + 8)) \(js(wLx - 9)) \(js(kneeY)) Z"

    var k: [Element] = []
    k.append(ellipse(120, footY + 4, a.sh * 0.6, 10, "#000", opacity: 0.28))
    k.append(ellipse(footL, footY + 9, 20, 5, "#000", opacity: 0.34))
    k.append(ellipse(footR, footY + 9, 20, 5, "#000", opacity: 0.34))
    if a.variant == .fox {
      k += part(pid(), capsule(shR + 2, shoulderY + 70, 16, shR + 34, hipY + 44, 9), a.body, a.dark, a.light)
    }
    if a.variant == .dragon {
      k += part(pid(), capsule(shR - 4, shoulderY + 80, 14, shR + 26, hipY + 50, 8), a.body, a.dark, a.light)
    }
    k += part(pid(), legL, a.body, a.dark, a.light)
    k += part(pid(), legR, a.body, a.dark, a.light)
    k += part(
      pid(), "M\(js(footL - 14)) \(js(footY - 6)) q-4 14 2 18 q16 6 30 2 q3-5 1-13 q-16 3-33-7 Z", "#2c313a",
      "#20242b", "#3a404a")
    k += part(
      pid(), "M\(js(footR - 16)) \(js(footY - 6)) q-3 14 3 18 q16 6 30 0 q2-6 0-14 q-17 5-33-4 Z", "#2c313a",
      "#20242b", "#3a404a")
    k.append(stroke("M\(js(footL - 14)) \(js(footY + 11)) q17 8 34 3", "#eceef1", 4, fill: "none", cap: "round"))
    k.append(stroke("M\(js(footR - 13)) \(js(footY + 9)) q15 8 32 0", "#eceef1", 4, fill: "none", cap: "round"))

    k += part(pid(), shorts, a.short, shade(a.short, -14), shade(a.short, 18))
    k.append(stroke("M\(js(hipCx)) \(js(hipY + 2)) v22", shade(a.short, -14), 2, opacity: 0.6))

    k += part(pid(), armLd, a.body, a.dark, a.light)
    k += part(pid(), armRd, a.body, a.dark, a.light)
    k.append(rect(shL - 2 - handL - 8, hipY - 6, 16, 8, rx: 4, accent, opacity: 0.9))
    k.append(rect(shR + 2 + handR - 8, hipY - 6, 16, 8, rx: 4, accent, opacity: 0.9))

    k += part(
      pid(), "M\(js(shCx - 14)) \(js(shoulderY - 16)) q14 8 28 0 l-2 18 q-12 6 -24 0 Z", a.body, a.dark, a.light)

    k += part(pid(), tank, a.tank, shade(a.tank, -16), shade(a.tank, 18))
    k.append(
      stroke(
        "M\(js(shL + 2)) \(js(shoulderY + 24)) C\(js(shL - 2)) \(js(shoulderY + 40)) \(js(wLx)) \(js(hipY - 24)) \(js(wLx + 3)) \(js(hipY))",
        shade(a.tank, -20), 1.5, fill: "none", opacity: 0.7))
    k.append(
      stroke(
        "M\(js(shR - 2)) \(js(shoulderY + 24)) C\(js(shR + 2)) \(js(shoulderY + 40)) \(js(wRx)) \(js(hipY - 24)) \(js(wRx - 3)) \(js(hipY))",
        shade(a.tank, -20), 1.5, fill: "none", opacity: 0.7))
    k.append(stroke("M\(js(shCx - 10)) \(js(shoulderY - 3)) q10 7 20 0", shade(a.tank, -22), 2, fill: "none"))
    k.append(
      stroke(
        "M\(js(shCx - 12)) \(js(shoulderY - 5)) q12 9 24 0", shade(a.tank, 26), 3, fill: "none", cap: "round",
        opacity: 0.8))
    k.append(
      stroke("M\(js(shCx - 9)) \(js(shoulderY + 1)) q9 6 18 0", "#000", 2.4, fill: "none", cap: "round", opacity: 0.12))
    k.append(
      stroke(
        "M\(js(shL + 1)) \(js(shoulderY + 4)) q9 4 12 16", shade(a.tank, -24), 2.4, fill: "none", cap: "round",
        opacity: 0.75))
    k.append(
      stroke(
        "M\(js(shR - 1)) \(js(shoulderY + 4)) q-9 4 -12 16", shade(a.tank, -24), 2.4, fill: "none", cap: "round",
        opacity: 0.75))
    k.append(
      stroke(
        "M\(js(shCx - 4)) \(js(shoulderY + 34)) l4-5 l4 5", accent, 2.2, fill: "none", cap: "round", join: "round"))

    if equipped.contains("medal") {
      k.append(
        Element(
          "G",
          kids: [
            stroke(
              "M\(js(shCx - 12)) \(js(shoulderY + 6)) L\(js(shCx)) \(js(shoulderY + 30)) L\(js(shCx + 12)) \(js(shoulderY + 6))",
              "#c85466", 5, fill: "none"),
            ellipse(shCx, shoulderY + 36, 9, 9, "#e0b23a"),
          ]))
    }
    if equipped.contains("belt") {
      k.append(
        Element(
          "G",
          kids: [
            rect(wLx - 6, hipY - 4, wRx - wLx + 12, 15, rx: 5, "#4a3826"),
            rect(wLx - 6, hipY - 4, wRx - wLx + 12, 4, rx: 2, "#5f492f"),
            rect(hipCx - 8, hipY - 2, 16, 11, rx: 2.5, "#c9a24a"),
            rect(hipCx - 4, hipY, 8, 7, rx: 1.5, "#4a3826"),
          ]))
    }

    k.append(ellipse(120, shoulderY - 2, 26, 7, "#000", opacity: 0.12))
    k.append(ellipse(shL + 4, shoulderY + 34, 9, 16, "#000", opacity: 0.08))
    k.append(ellipse(shR - 4, shoulderY + 34, 9, 16, "#000", opacity: 0.08))
    k.append(ellipse(hipCx, hipY + 34, 5, 18, "#000", opacity: 0.16))

    // đầu: dời theo chiều cao, nghiêng quanh (120, 86)
    var head: [Element] = headBehind(a)
    head += part(pid(), "M120 86 m-52 0 a52 50 0 1 0 104 0 a52 50 0 1 0 -104 0", a.body, a.dark, a.light)
    head += faceExtra(a)
    if showEyes {
      head.append(ellipse(100, 88, 7, tired ? 1.5 : 8.5, "#33343a"))
      head.append(ellipse(140, 88, 7, tired ? 1.5 : 8.5, "#33343a"))
      if !tired {
        head.append(ellipse(97.5, 85, 2, 2, "#fff", opacity: 0.9))
        head.append(ellipse(137.5, 85, 2, 2, "#fff", opacity: 0.9))
      }
    }
    if tired {
      head.append(stroke("M93 74 l18 2", a.dark, 3.5, cap: "round"))
      head.append(stroke("M147 74 l-18 2", a.dark, 3.5, cap: "round"))
      head.append(path("M156 74 q6 9 0 13 q-6-4 0-13", ["fill": s(accent), "opacity": n(0.7)]))
    } else {
      head.append(stroke("M91 74 q9-4 18 0", a.dark, 3, fill: "none", cap: "round", opacity: 0.45))
      head.append(stroke("M131 74 q9-4 18 0", a.dark, 3, fill: "none", cap: "round", opacity: 0.45))
    }
    head += nose(a)
    let mouth: String
    if mood == .happy {
      mouth = "M105 107 q15 13 30 0"
    } else if tired {
      mouth = "M107 110 q13 5 26 0"
    } else {
      mouth = "M107 105 q13 8 26 0"
    }
    head.append(
      stroke(mouth, "#4b4b52", mood == .happy ? 4 : 3.5, fill: "none", cap: "round"))
    head += headFront(a)
    if equipped.contains("headband") { head.append(rect(70, 54, 100, 12, rx: 6, "#c85466")) }
    if equipped.contains("cap") { head.append(path("M70 60 A50 40 0 0 1 170 60 L170 66 L70 66 Z", ["fill": s("#3a6db0")])) }
    if equipped.contains("sunglasses") {
      head.append(
        Element(
          "G",
          kids: [
            rect(84, 80, 30, 16, rx: 7, "#101318"), rect(126, 80, 30, 16, rx: 7, "#101318"),
            stroke("M114 87 h12", "#101318", 3),
          ]))
    }
    let r = a.tilt * Double.pi / 180
    let c = cos(r), sn = sin(r)
    let tilt = KoaMath.mul(KoaMath.mul([1, 0, 0, 1, 120, 86], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -120, -86])
    k.append(Element("G", matrix: translate(0, headTy), kids: [Element("G", matrix: tilt, kids: head)]))

    // hai mí — View phủ ngoài Svg ở RN; khung đứng yên: mở hẳn (scaleY 0) hay
    // khép 0,4 khi mệt, co quanh tâm của chính nó
    if showEyes {
      let lid: Double = tired ? 0.4 : 0
      for ex in [100.0, 140.0] {
        let y = 88 + headTy - 11
        let cy = y + 10
        var p: [String: KoaScene.Value] = [
          "x": n(ex - 9), "y": n(y), "width": n(18), "height": n(20), "rx": n(8), "fill": s(a.body),
        ]
        k.append(Element("Rect", p, matrix: [1, 0, 0, lid, 0, cy * (1 - lid)]))
      }
    }

    return Element(
      "Svg", ["width": n(size), "height": n(outH), "viewBox": s("0 0 240 350")], kids: k)
  }

  static func headBehind(_ a: Art) -> [Element] {
    switch a.variant {
    case .koala:
      let ear = a.ear ?? a.body
      return [
        ellipse(76, 58, 24, 24, a.body), ellipse(164, 58, 24, 24, a.body), ellipse(76, 58, 13, 13, ear),
        ellipse(164, 58, 13, 13, ear),
      ]
    case .lion:
      let mane = a.mane ?? a.body
      var petals = [ellipse(120, 86, 60, 60, mane)]
      for i in 0..<13 {
        let t = (Double(i) / 13) * Double.pi * 2
        petals.append(ellipse(120 + cos(t) * 60, 86 + sin(t) * 56, 15, 15, mane))
      }
      petals.append(ellipse(120, 86, 49, 49, shade(mane, 26)))
      return petals
    case .fox:
      return [
        path("M76 50 L88 4 L118 44 Z", ["fill": s(a.body)]), path("M164 50 L152 4 L122 44 Z", ["fill": s(a.body)]),
        path("M86 44 L92 18 L108 42 Z", ["fill": s(a.dark)]), path("M154 44 L148 18 L132 42 Z", ["fill": s(a.dark)]),
      ]
    case .gorilla:
      return [ellipse(70, 86, 14, 14, a.body), ellipse(170, 86, 14, 14, a.body)]
    case .dragon:
      let spike = a.spike ?? a.body
      return [path("M96 44 L102 16 L112 40 Z", ["fill": s(spike)]), path("M120 38 L126 12 L134 38 Z", ["fill": s(spike)])]
    case .unicorn:
      return [
        path("M112 42 L120 4 L128 42 Z", ["fill": s("#e9d18a")]), path("M74 52 L82 22 L100 46 Z", ["fill": s(a.body)]),
        path("M166 52 L158 22 L140 46 Z", ["fill": s(a.body)]),
      ]
    }
  }

  static func faceExtra(_ a: Art) -> [Element] {
    switch a.variant {
    case .gorilla: [ellipse(120, 96, 33, 29, a.face ?? a.body, opacity: 0.6)]
    case .fox: [ellipse(120, 104, 25, 19, a.muz ?? a.body)]
    case .lion: [ellipse(120, 104, 23, 17, a.light, opacity: 0.7)]
    default: []
    }
  }

  static func headFront(_ a: Art) -> [Element] {
    a.variant == .unicorn ? [path("M142 58 q22 16 16 48 q12-32 -6-52 Z", ["fill": s(a.mane ?? a.body)])] : []
  }

  static func nose(_ a: Art) -> [Element] {
    switch a.variant {
    case .koala: [ellipse(120, 98, 10, 12, "#43434b"), ellipse(116, 93, 2.6, 3.4, "#fff", opacity: 0.2)]
    case .gorilla: [ellipse(113, 99, 3.6, 5, "#33383f"), ellipse(127, 99, 3.6, 5, "#33383f")]
    case .dragon: [ellipse(113, 96, 2.6, 3.6, "#2c4a34"), ellipse(127, 96, 2.6, 3.6, "#2c4a34")]
    default: [path("M114 96 q6 5 12 0 q-6 7 -12 0", ["fill": s("#43434b")])]
    }
  }
}
