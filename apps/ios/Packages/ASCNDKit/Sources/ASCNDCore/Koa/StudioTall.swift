public import Foundation

/// Phòng tập khung dọc (01/11, Kiệt duyệt mock `https://claude.ai/artifact/FQ31MadePEtWGxpfDVKwqz`).
/// Vẽ mới phần lớn của căn phòng: tường, cửa sổ vòm, trời, thành phố, đèn thả, sàn, bảng hiệu lớn.
/// Cùng toạ độ với `StudioScene` (y âm là phần tường cao hơn tranh gốc), nên Koa, bản đồ phòng, kệ,
/// cây, bục, bảng số giữ nguyên chỗ. Đồ phòng đã mua ở cửa sổ / đèn thì giữ món ấy.
public enum StudioTall {
  typealias Element = KoaRender.Element

  /// Một lớp của phần vẽ mới.
  public struct Layer: Sendable, Identifiable {
    public let id: String
    public let plane: KoaParallax.Plane
  }

  public static let layers = [
    Layer(id: "sky", plane: .sky), Layer(id: "city", plane: .city), Layer(id: "wall", plane: .wall),
    Layer(id: "floor", plane: .wall), Layer(id: "sides", plane: .props), Layer(id: "lamp", plane: .lamp),
  ]

  /// Phần tử tranh gốc được thay. `Defs` luôn giữ vì phần còn lại vẫn trỏ tới.
  public static func omit(_ o: StudioScene.Options) -> Set<Int> {
    var out = Set(0...24).union(95...95).union(97...107)
    if o.decor["window"] == nil { out.formUnion(25...64) }
    if o.decor["lamp"] == nil { out.formUnion(108...131) }
    return out.filter { StudioScene.template[$0]["t"]?.stringValue != "Defs" }
  }

  struct Ink {
    var sky: [(Double, String)], moon, frame, sill, panel, rail, glow, cone, shade, floorTop, floorBottom, plank, rug: String
    var city, lit: String
    var stars: Bool
  }

  static func ink(_ o: StudioScene.Options) -> Ink {
    o.light
      ? Ink(
        sky: [(0, "#8EC5F0"), (0.6, "#BFDDF5"), (1, "#FFE2A8")], moon: "#FFF3CF", frame: "#CFA982", sill: "#B98D62",
        panel: "#E2CFB1", rail: "#C9A982", glow: "#FFE3A8", cone: "#FFF0C9", shade: "#B98D62", floorTop: "#D9B48C",
        floorBottom: "#B98D65", plank: "#5B3A20", rug: "#D98A6A", city: "#B9C7DC", lit: "#FFFFFF", stars: false)
      : Ink(
        sky: [(0, "#0D1140"), (0.65, "#2A2466"), (1, "#7A4E7E")], moon: "#D9D2FF", frame: "#3A3278", sill: "#4A3F8C",
        panel: "#2A2361", rail: "#4A3F8C", glow: "#FFB15C", cone: "#FFCF8A", shade: "#2E2670", floorTop: "#3A2A4F",
        floorBottom: "#191330", plank: "#FFFFFF", rug: "#6D3F8F", city: "#141447", lit: "#FFBF63", stars: true)
  }

  /// Cây phần tử của một lớp.
  public static func tree(_ o: StudioScene.Options, layer id: String) -> [KoaRender.Element] {
    let c = ink(o)
    switch id {
    case "sky": return sky(c)
    case "city": return city(c)
    case "wall": return wall(o, c)
    case "floor": return floor(c)
    case "sides": return sides(o)
    case "lamp": return lamp(o, c)
    default: return []
    }
  }

  static func sky(_ c: Ink) -> [Element] {
    var out: [Element] = [
      Element("Defs", kids: [KoaBedroom.linear("tallSky", c.sky)]),
      KoaBedroom.rect(170, -180, 240, 360, "url(#tallSky)"),
      KoaBedroom.ellipse(248, -28, 22, 22, c.moon),
    ]
    if c.stars {
      for (x, y, r) in [(236.0, -96.0, 1.6), (262, -44, 1.2), (352, -14, 1.5), (226, -8, 1.1), (290, -128, 1.3), (346, 26, 1.1)] {
        out.append(KoaBedroom.ellipse(x, y, r, r, "#FFFFFF", opacity: 0.85))
      }
    }
    return out
  }

  static func city(_ c: Ink) -> [Element] {
    var out: [Element] = []
    for (x, h, w) in [(196.0, 74.0, 30.0), (228, 120, 28), (258, 60, 24), (284, 150, 34), (320, 88, 26), (348, 118, 34)] {
      out.append(KoaBedroom.rect(x, 160 - h, w, h + 20, c.city))
      for i in 0..<Int(h / 22) where (Int(x) + i) % 3 != 0 {
        out.append(KoaBedroom.rect(x + 6 + Double(i % 2) * 11, 160 - h + 10 + Double(i) * 20, 5, 7, c.lit, opacity: 0.9))
      }
    }
    return out
  }

  static func wall(_ o: StudioScene.Options, _ c: Ink) -> [Element] {
    let table = o.light ? StudioScene.lightSkins : StudioScene.skins
    let skin = table[o.skin] ?? table["default"]!
    let hole = "M206 160V-70A81 81 0 0 1 368 -70V160Z"
    var solid = Element(
      "Path", ["d": .string("M-60 -340H450V372H-60Z" + hole), "fill": .string("url(#tallWall)"), "fillRule": .string("evenodd")])
    solid.kids = []
    var out: [Element] = [
      Element("Defs", kids: [KoaBedroom.linear("tallWall", [(0, skin.wall.0), (1, skin.wall.1)])]), solid,
      KoaBedroom.line(hole, c.frame, width: 9),
      KoaBedroom.line("M287 -151V160M206 -6H368", c.frame, width: 5),
      KoaBedroom.rect(194, 160, 186, 12, c.sill, r: 4),
      // chân tường ốp ván
      KoaBedroom.rect(-60, 300, 510, 62, c.panel, opacity: 0.6),
      KoaBedroom.rect(-60, 298, 510, 5, c.rail),
    ]
    for x in stride(from: -40.0, to: 440, by: 62) {
      out.append(KoaBedroom.rect(x, 310, 50, 42, c.rail, r: 3, opacity: 0.16))
    }
    out += sign(o, skin, c)
    return out
  }

  /// Bảng hiệu vẽ lại: tấm neon treo hai dây, viền sáng đôi, chữ của tranh gốc theo ngôn ngữ app.
  static func sign(_ o: StudioScene.Options, _ skin: StudioScene.Skin, _ c: Ink) -> [Element] {
    let plate = o.light ? "#3A2C3F" : "#141238"
    let edge = o.light ? "#E8A23D" : "#8F83FF"
    let s = 1.5
    return [
      KoaBedroom.line("M46 -360V\(sign.y)M134 -360V\(sign.y)", c.rail, width: 2.4),
      KoaBedroom.rect(sign.x - 2, sign.y + 5, sign.w + 4, sign.h, "#000000", r: 18, opacity: 0.28),
      KoaBedroom.rect(sign.x, sign.y, sign.w, sign.h, plate, r: 16),
      Element(
        "Rect",
        [
          "x": .number(sign.x + 5), "y": .number(sign.y + 5), "width": .number(sign.w - 10), "height": .number(sign.h - 10),
          "rx": .number(12), "fill": .string("none"), "stroke": .string(edge), "strokeWidth": .number(2.5),
        ]),
      Element("G", matrix: [s, 0, 0, s, sign.x + sign.w / 2 - 66 * s, sign.y + sign.h / 2 - 167 * s], kids: StudioScene.poster(o)),
    ]
  }

  /// Chỗ treo bảng: dưới nút quay lại, trên cây trên kệ.
  public static let sign = (x: 20.0, y: -60.0, w: 140.0, h: 112.0)

  static func floor(_ c: Ink) -> [Element] {
    var out: [Element] = [
      Element(
        "Defs",
        kids: [
          KoaBedroom.linear("tallFloor", [(0, c.floorTop), (1, c.floorBottom)]),
          KoaBedroom.glow("tallPool", c.cone, 0.5),
        ]),
      KoaBedroom.rect(-60, 360, 510, 420, "url(#tallFloor)"),
      KoaBedroom.rect(-60, 358, 510, 4, c.rail, opacity: 0.8),
    ]
    for x in stride(from: -420.0, to: 820, by: 70) {
      let spread = (x - 195) * 0.34
      out.append(KoaBedroom.line("M\(195 + spread) 362L\(x) 780", c.plank, width: 1.4, opacity: 0.09))
    }
    // tối dần ở chân tường: tường và sàn tách nhau; đồ có bóng đổ nên đứng hẳn trên sàn
    out += [
      Element("Defs", kids: [KoaBedroom.linear("tallFoot", [(0, "#00000066"), (1, "#00000000")])]),
      KoaBedroom.rect(-60, 362, 510, 30, "url(#tallFoot)"),
      KoaBedroom.ellipse(74, 398, 82, 11, "#000000", opacity: 0.32),
      KoaBedroom.ellipse(314, 402, 34, 8, "#000000", opacity: 0.32),
      KoaBedroom.ellipse(354, 405, 40, 9, "#000000", opacity: 0.32),
      KoaBedroom.ellipse(195, 444, 196, 62, c.rug, opacity: 0.5),
      KoaBedroom.ellipse(195, 440, 240, 104, "url(#tallPool)"),
    ]
    return out
  }

  /// Hai tường bên hội tụ về tường sau: phòng là một cái hộp thật, không phải một mặt phẳng.
  static func sides(_ o: StudioScene.Options) -> [Element] {
    let shade = o.light ? "#8A6A4C" : "#05061A"
    return [
      KoaBedroom.path("M-90 -420L8 -170V362L-90 640Z", shade, opacity: o.light ? 0.3 : 0.62),
      KoaBedroom.path("M480 -420L382 -170V362L480 640Z", shade, opacity: o.light ? 0.3 : 0.62),
      KoaBedroom.path("M-90 -420L8 -170H382L480 -420Z", shade, opacity: o.light ? 0.2 : 0.45),
    ]
  }

  static func lamp(_ o: StudioScene.Options, _ c: Ink) -> [Element] {
    var out: [Element] = [
      Element(
        "Defs",
        kids: [
          Element(
            "LinearGradient", ["id": .string("tallCone"), "x1": .number(0), "y1": .number(0), "x2": .number(0), "y2": .number(1)],
            kids: [
              Element("Stop", ["offset": .number(0), "stopColor": .string(c.cone), "stopOpacity": .number(0.55)]),
              Element("Stop", ["offset": .number(1), "stopColor": .string(c.cone), "stopOpacity": .number(0)]),
            ]),
          KoaBedroom.glow("tallHalo", c.glow, 0.6),
        ])
    ]
    guard o.decor["lamp"] == nil else {
      return out + [KoaBedroom.line("M195 -360V30", c.rail, width: 3.5)]
    }
    // ban ngày đèn tắt (quyết định 15/10): vẫn có chao đèn, không có chùm sáng
    if o.lamp {
      out += [
        KoaBedroom.ellipse(195, -36, 120, 90, "url(#tallHalo)"),
        KoaBedroom.path("M158 -54L58 430H332L232 -54Z", "url(#tallCone)"),
      ]
    }
    out += [
      KoaBedroom.line("M195 -360V-106", c.rail, width: 3.5),
      KoaBedroom.path("M146 -56Q195 -136 244 -56Z", c.shade),
      KoaBedroom.ellipse(195, -55, 49, 9, o.lamp ? c.cone : c.panel),
    ]
    return out
  }
}
