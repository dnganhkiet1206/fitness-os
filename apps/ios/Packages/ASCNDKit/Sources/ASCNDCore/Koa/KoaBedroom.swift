public import Foundation

/// Phòng ngủ gác mái của Koa (Kiệt duyệt mock 30/10): cảnh riêng, khác hẳn sân khấu. Koa ở đây
/// trong giờ ngủ của người dùng (`KoaMood.SleepWindow`).
///
/// Cùng toạ độ với phòng chính (390 × `StudioScene.sceneBottom`). Tách lớp để app cho Koa thở:
/// `back` (phòng, giường, gối) · đầu Koa · `cover` (chăn, kệ, giày) · `moonlight` · `shade`.
/// Không thêm hình của Koa: đầu là hình thật (`KoaRender.figure`), thân nằm dưới chăn.
public enum KoaBedroom {
  typealias Element = KoaRender.Element

  /// Đầu Koa trên gối: tâm, cỡ, góc (độ); `(120, 110)` là tâm đầu trên hình 240 × 300.
  public static let head = (x: 100.0, y: 348.0, scale: 0.42, angle: -74.0, anchorX: 120.0, anchorY: 110.0)
  /// Cắt lấy phần đầu của hình, ở toạ độ hình: cổ nằm dưới chăn.
  public static let headTop = 158.0
  public static let headChin = 182.0
  /// Chân chăn: chăn phồng lên xẹp xuống quanh mép này khi Koa thở.
  public static let coverBottom = 424.0
  /// Sàn kéo dài dưới cảnh, nằm dưới thẻ nội dung phủ lên (bố cục tràn viền, Kiệt 31/10).
  public static let tail = 28.0
  public static var height: Double { StudioScene.sceneBottom + tail }

  struct Palette {
    var wallTop, wallBottom, panel, beam, roof, floorTop, floorBottom: String
    var skyTop, skyBottom, moon, hill, curtainEdge, curtainMid, stem, leafA, leafB, vase, bulb, picture: String
    var bookA, bookB, bookC, rug, rugStripe, wood, woodDark, mattress, pillow: String
    var duvetTop, duvetBottom, fold, dumbbell, shoe, moonlight: String
    var star, bulbGlow, sconceGlow, vignette, moonlightAlpha: Double
  }

  static let night = Palette(
    wallTop: "#3A2B3F", wallBottom: "#2C2230", panel: "#33252C", beam: "#5A3E2E", roof: "#4A3227", floorTop: "#4C3326",
    floorBottom: "#33221B", skyTop: "#17224E", skyBottom: "#3B3A73", moon: "#F2E3B3", hill: "#141A38",
    curtainEdge: "#7A5A58", curtainMid: "#94716C", stem: "#7E9C86", leafA: "#7FA890", leafB: "#5F8A74", vase: "#C9B8A0",
    bulb: "#FFE2AD", picture: "#2B2533", bookA: "#7E5E8E", bookB: "#C08A52", bookC: "#5F8A74", rug: "#6A4A3C",
    rugStripe: "#A9805F", wood: "#6B4A35", woodDark: "#55392A", mattress: "#D9CDBB", pillow: "#EFE6D6",
    duvetTop: "#5C8A76", duvetBottom: "#3D6556", fold: "#E6DAC4", dumbbell: "#3A3F52", shoe: "#7E5E8E",
    moonlight: "#CFD6FF", star: 0.85, bulbGlow: 0.55, sconceGlow: 0.42, vignette: 0.5, moonlightAlpha: 0.2)

  static let day = Palette(
    wallTop: "#F3E6D2", wallBottom: "#EAD9C0", panel: "#E2CFB1", beam: "#B58D66", roof: "#D8B88F", floorTop: "#CFA679",
    floorBottom: "#B98D62", skyTop: "#8FB7DC", skyBottom: "#F7D9B0", moon: "#FFF3CF", hill: "#A7B89A",
    curtainEdge: "#E9DFD0", curtainMid: "#F8F1E5", stem: "#6F8C78", leafA: "#7FA890", leafB: "#5F8A74", vase: "#FFFFFF",
    bulb: "#FFD58A", picture: "#F9F3E8", bookA: "#9C7BB0", bookB: "#D29A5C", bookC: "#6F9C85", rug: "#E6D2B5",
    rugStripe: "#C7A27C", wood: "#A9794F", woodDark: "#8F6440", mattress: "#FBF5EA", pillow: "#FFFFFF",
    duvetTop: "#7FAE98", duvetBottom: "#5E8E79", fold: "#F5ECDD", dumbbell: "#4A5166", shoe: "#7B61FF",
    moonlight: "#FFF6DC", star: 0, bulbGlow: 0.4, sconceGlow: 0.3, vignette: 0.16, moonlightAlpha: 0.45)

  // MARK: - Mảnh vẽ

  static func path(_ d: String, _ fill: String? = nil, opacity: Double? = nil) -> Element {
    var p: [String: KoaScene.Value] = ["d": .string(d), "fill": .string(fill ?? "none")]
    if let opacity { p["opacity"] = .number(opacity) }
    return Element("Path", p)
  }

  static func line(_ d: String, _ colour: String, width: Double, opacity: Double? = nil) -> Element {
    var p: [String: KoaScene.Value] = [
      "d": .string(d), "fill": .string("none"), "stroke": .string(colour), "strokeWidth": .number(width),
      "strokeLinecap": .string("round"),
    ]
    if let opacity { p["opacity"] = .number(opacity) }
    return Element("Path", p)
  }

  static func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ fill: String, r: Double = 0, opacity: Double? = nil) -> Element {
    var p: [String: KoaScene.Value] = [
      "x": .number(x), "y": .number(y), "width": .number(w), "height": .number(h), "rx": .number(r), "fill": .string(fill),
    ]
    if let opacity { p["opacity"] = .number(opacity) }
    return Element("Rect", p)
  }

  static func ellipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ fill: String, opacity: Double? = nil) -> Element {
    var p: [String: KoaScene.Value] = ["cx": .number(cx), "cy": .number(cy), "rx": .number(rx), "ry": .number(ry), "fill": .string(fill)]
    if let opacity { p["opacity"] = .number(opacity) }
    return Element("Ellipse", p)
  }

  static func linear(_ id: String, _ stops: [(Double, String)], horizontal: Bool = false) -> Element {
    Element(
      "LinearGradient", ["id": .string(id), "x1": .number(0), "y1": .number(0), "x2": .number(horizontal ? 1 : 0), "y2": .number(horizontal ? 0 : 1)],
      kids: stops.map { Element("Stop", ["offset": .number($0.0), "stopColor": .string($0.1)]) })
  }

  static func glow(_ id: String, _ colour: String, _ alpha: Double, from: Double = 0) -> Element {
    Element(
      "RadialGradient", ["id": .string(id), "cx": .number(0.5), "cy": .number(0.5), "r": .number(0.5)],
      kids: [
        Element("Stop", ["offset": .number(from), "stopColor": .string(colour), "stopOpacity": .number(alpha)]),
        Element("Stop", ["offset": .number(1), "stopColor": .string(colour), "stopOpacity": .number(0)]),
      ])
  }

  /// Quay + dời (`rotate` rồi `translate` của SVG).
  static func place(_ x: Double, _ y: Double, degrees a: Double, _ kids: [Element]) -> Element {
    let r = a * .pi / 180
    return Element("G", matrix: [cos(r), sin(r), -sin(r), cos(r), x, y], kids: kids)
  }

  static func leaf(_ x: Double, _ y: Double, _ angle: Double, _ l: Double, _ colour: String) -> Element {
    place(
      x, y, degrees: angle,
      [path("M0 0C\(l * 0.35) \(-l * 0.2) \(l * 0.8) \(-l * 0.14) \(l) 0C\(l * 0.8) \(l * 0.14) \(l * 0.35) \(l * 0.2) 0 0Z", colour)])
  }

  // MARK: - Lớp

  /// Phòng, giường, gối, đèn: nằm dưới đầu Koa.
  public static func back(light: Bool) -> [KoaRender.Element] {
    let c = light ? day : night
    let defs = Element(
      "Defs",
      kids: [
        linear("bedWall", [(0, c.wallTop), (1, c.wallBottom)]), linear("bedFloor", [(0, c.floorTop), (1, c.floorBottom)]),
        linear("bedSky", [(0, c.skyTop), (1, c.skyBottom)]),
        linear("bedCurtain", [(0, c.curtainEdge), (0.5, c.curtainMid), (1, c.curtainEdge)], horizontal: true),
        glow("bedBulb", "#FFC978", c.bulbGlow), glow("bedSconce", "#FFB95E", c.sconceGlow),
        Element("ClipPath", ["id": .string("bedArch")], kids: [path("M212 214V118A54 54 0 0 1 320 118V214Z", "#000000")]),
      ])
    var out: [Element] = [defs, rect(0, 0, 390, height, "url(#bedWall)"), rect(0, 300, 390, 66, c.panel)]
    for x in stride(from: 10.0, to: 390, by: 64) { out.append(rect(x, 310, 52, 44, "#000000", r: 3, opacity: 0.1)) }
    out.append(rect(0, 298, 390, 4, c.beam))
    // trần dốc
    out += [path("M0 0H136L0 150Z", c.roof), path("M390 0H254L390 150Z", c.roof)]
    for (a, b, h) in [(46.0, 0.0, 62.0), (92, 0, 126), (344, 390, 62), (298, 390, 126)] {
      out.append(line("M\(a) 0L\(b) \(h)", "#000000", width: 1.2, opacity: 0.18))
    }
    out += [
      line("M0 150L136 0", c.beam, width: 10), line("M390 150L254 0", c.beam, width: 10), rect(0, 0, 390, 7, c.beam),
    ]
    // sàn gỗ hội tụ
    out += [rect(0, 364, 390, height - 364, "url(#bedFloor)"), rect(0, 362, 390, 5, c.beam)]
    for x in stride(from: -160.0, to: 560, by: 62) {
      out.append(line("M\(195 + (x - 195) * 0.62) 366L\(195 + (x - 195) * 1.26) \(height)", "#000000", width: 1, opacity: 0.16))
    }
    out += window(c) + vase(c) + lights(c) + pictures(c) + rug(c) + bed(c)
    return out
  }

  static func window(_ c: Palette) -> [Element] {
    var sky: [Element] = [rect(200, 50, 130, 170, "url(#bedSky)")]
    for (x, y, r) in [(232.0, 92.0, 1.0), (300, 84, 1.3), (246, 140, 0.9), (296, 132, 0.8), (222, 120, 0.8), (310, 160, 0.9), (268, 84, 0.7)]
    where c.star > 0 {
      sky.append(ellipse(x, y, r, r, "#FFFFFF", opacity: c.star))
    }
    sky += [
      path("M292 96A18 18 0 1 0 299 124A14.5 14.5 0 1 1 292 96Z", c.moon),
      path("M200 214Q226 186 252 200Q280 178 330 206V222H200Z", c.hill),
    ]
    return [
      path("M204 222V118A62 62 0 0 1 328 118V222Z", c.beam),
      Element("G", ["clipPath": .string("url(#bedArch)")], kids: sky),
      line("M266 58V214M212 142H320", c.beam, width: 4), rect(196, 218, 140, 8, c.beam, r: 3),
      line("M188 56H344", c.beam, width: 3),
      path("M192 56H226C228 110 226 160 204 186C210 220 204 262 196 286H182C176 200 182 110 192 56Z", "url(#bedCurtain)"),
      path("M340 56H306C304 110 306 160 328 186C322 220 328 262 336 286H350C356 200 350 110 340 56Z", "url(#bedCurtain)"),
      place(202, 184, degrees: 14, [rect(-8, -2, 16, 4, c.beam, r: 2)]),
      place(330, 184, degrees: -14, [rect(-8, -2, 16, 4, c.beam, r: 2)]),
    ]
  }

  /// Cành bạch đàn trên bệ cửa sổ.
  static func vase(_ c: Palette) -> [Element] {
    var out = [line("M262 218L260 170M262 200L246 176M262 196L280 172", c.stem, width: 1.3)]
    for (i, v) in [(-120.0, 20.0), (-70, 22), (-150, 18), (-40, 20), (-100, 24), (-20, 16), (-165, 15)].enumerated() {
      out.append(leaf(258 + Double(i) * 1.5, 196 - Double(i) * 6, v.0, v.1, i % 2 == 1 ? c.leafA : c.leafB))
    }
    out.append(path("M252 196H270L267 218H255Z", c.vase))
    return out
  }

  static func lights(_ c: Palette) -> [Element] {
    var out = [line("M30 124Q130 176 228 118", c.beam, width: 1.2)]
    for i in 0...6 {
      let t = Double(i) / 6
      let x = 34 + t * 190, y = 128 + sin(t * .pi) * 26 - t * 18
      out += [ellipse(x, y, 11, 11, "url(#bedBulb)"), ellipse(x, y + 2, 2.6, 2.6, c.bulb)]
    }
    return out
  }

  static func pictures(_ c: Palette) -> [Element] {
    [
      rect(42, 196, 46, 58, c.beam, r: 2), rect(47, 201, 36, 48, c.picture), path("M50 242L62 216L70 230L74 224L80 242Z", c.bookA),
      ellipse(74, 210, 3, 3, c.moon), rect(100, 210, 38, 44, c.beam, r: 2), rect(104, 214, 30, 36, c.picture),
      path("M119 222L128 243H124L119 231L114 243H110Z", c.bookB),
    ]
  }

  static func rug(_ c: Palette) -> [Element] {
    var out = [path("M64 416H352L330 470H22Z", c.rug)]
    let skew = tan(8 * Double.pi / 180)
    for i in 0..<8 {
      let x = 46 + Double(i) * 42
      let top = x - skew * 422, bottom = x - skew * 468
      out.append(path("M\(top) 422H\(top + 18)L\(bottom + 18) 468H\(bottom)Z", c.rugStripe, opacity: 0.55))
    }
    out.append(line("M64 416H352L330 470H22Z", c.beam, width: 1.5, opacity: 0.35))
    return out
  }

  static func bed(_ c: Palette) -> [Element] {
    [
      ellipse(176, 436, 150, 7, "#000000", opacity: 0.34), rect(30, 396, 8, 38, c.wood, r: 2), rect(298, 396, 8, 38, c.wood, r: 2),
      path("M22 318C22 300 30 292 42 292C54 292 60 300 60 318V404H22Z", c.wood),
      path("M290 356C290 344 296 338 304 338C312 338 318 344 318 356V406H290Z", c.wood), rect(44, 388, 262, 16, c.woodDark, r: 3),
      rect(46, 360, 256, 30, c.mattress, r: 10),
      path("M50 352C50 338 62 332 82 332H112C130 332 140 340 140 354C140 366 130 370 112 370H78C60 370 50 366 50 352Z", c.pillow),
      // đèn tường
      ellipse(52, 262, 58, 58, "url(#bedSconce)"), path("M40 272L46 254H60L66 272Z", "#FFCB7A"), rect(51, 272, 4, 12, c.beam),
    ]
  }

  /// Chăn, kệ sách, tạ, giày: nằm trên đầu Koa.
  public static func cover(light: Bool) -> [KoaRender.Element] {
    let c = light ? day : night
    let duvet = "M112 372C130 346 196 342 238 348C270 352 298 358 304 372C308 384 306 404 304 412C304 420 298 424 288 424H134C114 424 108 418 108 408V386C108 380 109 376 112 372Z"
    var out: [Element] = [Element("Defs", kids: [linear("bedDuvet", [(0, c.duvetTop), (1, c.duvetBottom)])]), path(duvet, "url(#bedDuvet)")]
    for x in stride(from: 128.0, to: 304, by: 18) {
      out.append(line("M\(x) 372Q\(x + 4) 400 \(x - 2) 428", "#FFFFFF", width: 5, opacity: 0.07))
    }
    out += [
      line("M112 372C130 346 196 342 238 348C270 352 298 358 304 372", "#FFFFFF", width: 2, opacity: 0.2),
      path("M108 378C112 372 120 370 126 374L128 424H116C110 424 108 420 108 416Z", c.fold),
      // kệ thấp
      ellipse(352, 424, 34, 4, "#000000", opacity: 0.34), rect(322, 318, 60, 104, c.wood, r: 3),
      rect(327, 324, 50, 46, "#000000", opacity: 0.24), rect(327, 374, 50, 42, "#000000", opacity: 0.24),
    ]
    for (x, y, w, f) in [(329.0, 330.0, 8.0, c.bookA), (338, 324, 7, c.bookB), (346, 332, 9, c.bookC), (356, 326, 7, c.bookA), (364, 334, 8, c.bookB)] {
      out.append(rect(x, y, w, 374 - y, f, r: 1))
    }
    // tạ trên kệ, giày cạnh giường
    out += [
      rect(339, 310, 26, 4, "#9AA3B2", r: 1), rect(334, 305, 6, 14, c.dumbbell, r: 2), rect(364, 305, 6, 14, c.dumbbell, r: 2),
      ellipse(344, 455, 20, 3, "#000000", opacity: 0.3),
      path("M325 454C324 446 328 441 332 439L340 442C346 444 356 446 360 449C363 451 363 454 362 455H326Z", c.shoe),
      line("M324 455H363", "#FFFFFF", width: 2.4, opacity: 0.85), line("M338 443L342 440M342 445L346 442", "#FFFFFF", width: 1.1, opacity: 0.7),
    ]
    return out
  }

  /// Ánh trăng in ô kính trên chăn: app làm nhoè cả lớp cho mềm.
  public static func moonlight(light: Bool) -> [KoaRender.Element] {
    let c = light ? day : night
    return [
      path("M214 368H258L232 420H186Z", c.moonlight, opacity: c.moonlightAlpha),
      path("M264 368H308L282 420H238Z", c.moonlight, opacity: c.moonlightAlpha),
    ]
  }

  /// Viền tối của cả cảnh, nằm trên cùng.
  public static func shade(light: Bool) -> [KoaRender.Element] {
    let c = light ? day : night
    let vig = Element(
      "RadialGradient", ["id": .string("bedVig"), "cx": .number(0.5), "cy": .number(0.46), "r": .number(0.74)],
      kids: [
        Element("Stop", ["offset": .number(0.55), "stopColor": .string("#000000"), "stopOpacity": .number(0)]),
        Element("Stop", ["offset": .number(1), "stopColor": .string("#000000"), "stopOpacity": .number(c.vignette)]),
      ])
    return [Element("Defs", kids: [vig]), rect(0, 0, 390, height, "url(#bedVig)")]
  }

  /// Cửa sang phòng ngủ trên tường phòng chính, cạnh kệ (nằm dưới Koa). Mở thì hắt ánh vàng.
  public static func door(open: Bool, light: Bool) -> [KoaRender.Element] {
    let frame = light ? "#B58D66" : "#212B4E", leaf = light ? "#C9A67E" : "#3A2B3F", panel = light ? "#B58D66" : "#2C2230"
    var out: [Element] = [path("M145 368V312A25 25 0 0 1 195 312V368Z", frame)]
    if open {
      out = [Element("Defs", kids: [glow("bedDoor", "#FFC978", 0.55)])] + out
      out += [
        path("M150 366V312A20 20 0 0 1 190 312V366Z", "#FFD48F"), path("M150 366V312A20 20 0 0 0 138 300V378Z", leaf),
        ellipse(170, 340, 70, 60, "url(#bedDoor)"),
      ]
    } else {
      out += [
        path("M150 366V312A20 20 0 0 1 190 312V366Z", leaf), path("M156 366V314A14 14 0 0 1 184 314V366Z", panel),
        ellipse(182, 340, 1.6, 1.6, "#FFC24D"),
      ]
    }
    return out
  }
}
