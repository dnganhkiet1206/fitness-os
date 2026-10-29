public import Foundation

/// Studio của Koa (#527, S1) — nền của phòng linh vật.
///
/// Kiệt đồng ý cho native VẼ LẠI dựa trên bản RN. Đồ đạc (tường, kệ, cây, cửa
/// sổ, biển neon, đèn, bục…) lấy nguyên từ các component `components/ascnd/
/// studio/*` @ fac9ac2 dựng ra SVG; native thêm chiều sâu (sàn + chân tường,
/// bóng tiếp xúc, vũng sáng của đèn, quầng đèn, bậu + vệt kính cửa sổ, viền
/// sáng mép bục) — xem `tools/studio/gen.cjs` / `improve.cjs`.
///
/// Phần động là TOKEN trong template (`StudioSceneData.swift`): màu skin, độ
/// sáng theo năng lượng, số + chấm của chuỗi, đường trăng theo pha, tên trên bục.
public enum StudioScene {
  public static let width = 390.0
  /// Cạnh dưới của cảnh (`SCENE_BOTTOM`) — phần trên đó là căn phòng.
  public static let sceneBottom = 476.0
  /// Chỗ đứng của nhân vật (`STAGE_MARK`).
  public static let stageMark = (x: 195.0, y: 412.0)

  public struct Skin: Sendable, Hashable {
    public let wall: (String, String)
    public let glow: String

    public static func == (a: Skin, b: Skin) -> Bool { a.wall == b.wall && a.glow == b.glow }
    public func hash(into h: inout Hasher) {
      h.combine(wall.0)
      h.combine(wall.1)
      h.combine(glow)
    }
  }

  /// `STUDIO_SKINS`.
  public static let skins: [String: Skin] = [
    "default": Skin(wall: ("#0F142E", "#261F4E"), glow: "#FFC24D"),
    "night": Skin(wall: ("#0B0E1E", "#141833"), glow: "#8F83FF"),
    "sunset": Skin(wall: ("#1D1430", "#2A1B3D"), glow: "#FFC24D"),
    "champion": Skin(wall: ("#151228", "#241C3E"), glow: "#FFD97A"),
  ]

  /// Tường của căn phòng BAN NGÀY (15/10, chủ dự án: "phòng koa hiện cũng chỉ đc vẽ
  /// cho màn tối, chưa có màn sáng") — cùng bốn skin, tông giấy ấm của app.
  public static let lightSkins: [String: Skin] = [
    "default": Skin(wall: ("#F7EEE2", "#EADCC8"), glow: "#FFB020"),
    "night": Skin(wall: ("#ECEAF6", "#DCD8EE"), glow: "#7B61FF"),
    "sunset": Skin(wall: ("#FCEBDD", "#F4D3BC"), glow: "#FF9A3D"),
    "champion": Skin(wall: ("#FAF0D8", "#EFDDB2"), glow: "#E8B13A"),
  ]

  /// Bản ngày đổi màu theo VAI TRÒ của màu trong cảnh đêm (khung gỗ, đồ tập, sàn,
  /// bóng…); neon, đèn, cây giữ màu. Hình khối không đổi.
  static let dayColors: [String: String] = [
    "#151A33": "#9C8268",  // kệ, khung, bảng — gỗ ấm
    "#212B4E": "#6F5E4E",  // tạ, đồ tập
    "#0B0F22": "#D8C6AD",  // sàn
    "#0F142E": "#E6D7C2",  // chân tường, viền tối
    "#2C2439": "#A88F76",
    "#000000": "#6B5440",  // bóng — nâu ấm thay đen
    // đồ vật tím của cảnh đêm (tạ, ấm tạ, chậu, bóng, viền bảng, chữ STREAK) → đất nung
    // ấm hợp phòng ban ngày (15/10, chủ dự án: "đồ vật màu tím nên đổi màu ở bản sáng")
    "#7B61FF": "#D9774F",
    "#8F83FF": "#E39A6B",
  ]

  /// Trời ngoài cửa sổ ban ngày (thay `studioSky` đêm).
  static let daySky: [(Double, String, Double)] = [
    (0, "#8EC5F0", 1), (0.55, "#BFDDF5", 1), (0.82, "#FFE2A8", 0.7), (1, "#FFD27A", 0.8),
  ]

  /// `STAGE_THEME` (`mascot-scene.tsx`): món sân khấu đang dùng → skin.
  static let stageThemes = ["stage_champion": "champion", "stage_sunset": "sunset", "stage_night": "night"]

  /// Skin của căn phòng theo đồ đang mặc — sân khấu đang dùng, không có thì mặc định.
  public static func skinKey(equipped: Set<String>) -> String {
    skinKey(stage: MascotShop.activeStageKey(equipped))
  }

  /// Skin của một món sân khấu (`stage_night` → `night`); không có / lạ → mặc định.
  public static func skinKey(stage: String?) -> String {
    stage.flatMap { stageThemes[$0] } ?? "default"
  }

  public struct Options: Sendable, Hashable {
    public var skin = "default"
    /// 0…1 — căn phòng sáng lại bao nhiêu hôm nay.
    public var energy = 0.5
    /// Ngày của thẻ chuỗi.
    public var streak = 0
    /// Bảng số trên tường thay cho chuỗi (29/10, Kiệt: bỏ chuỗi khỏi phòng — V1 lấy Gains
    /// làm thang duy nhất; người dùng chọn số). `nil` = bảng chuỗi của RN (golden).
    public var board: Board?
    /// Đồ phòng đang dùng: chỗ → biến thể (`MascotShop.decorChoice`). Trống = phòng gốc.
    public var decor: [String: String] = [:]
    /// Mức bụi 0…3 (`KoaDust`) — lớp phủ trên đồ đạc, không đổi màu phòng (phần 5).
    public var dust = 0
    /// 0…1 trong chu kỳ trăng (`moonPhase`).
    public var moon = 0.18
    /// Tên in trên mặt trước bục.
    public var label = ""
    /// Căn phòng ban ngày (giao diện sáng).
    public var light = false
    /// Đèn treo (dây, chao, bóng, vệt sáng, quầng, bụi trong vệt, vũng sáng). Chủ dự án
    /// 15/10: "bản tối thì bỏ đèn trong phòng của koa đi".
    public var lamp = true
    /// Ngôn ngữ của chữ vẽ trên tranh (bảng hiệu, thẻ chuỗi) — `vi` / `es` / `en`.
    public var lang = "en"
    /// Lớp chiều sâu: tường tối về góc, chân tường, ván sàn hội tụ (15/10, chủ dự án:
    /// "phòng cũng chưa có chiều sâu"). Mặc định tắt — cảnh RN giữ nguyên golden.
    public var depth = false

    public init() {}
  }

  /// Bảng số trên tường: chữ đầu bảng, số lớn, biểu tượng, hàng chấm.
  public struct Board: Sendable, Hashable {
    public enum Icon: String, Sendable, Hashable { case dumbbell, check, trophy }
    /// Chữ đầu bảng, đã theo ngôn ngữ.
    public var word: String
    public var value: String
    public var icon: Icon
    /// Số chấm hiện (0…7) và số chấm sáng.
    public var dots: Int
    public var lit: Int

    public init(word: String, value: String, icon: Icon, dots: Int, lit: Int) {
      self.word = word
      self.value = value
      self.icon = icon
      self.dots = dots
      self.lit = lit
    }
  }

  // MARK: - Trăng

  static let synodic = 29.530588853
  /// Một lần trăng non đã biết: 2000-01-06 18:14 UTC (ngày kể từ 1970).
  static let newMoon = 10962.759722222222

  /// `moonPhase`: 0 non, 0,25 thượng huyền, 0,5 tròn.
  public static func moonPhase(_ at: Date) -> Double {
    let days = at.timeIntervalSince1970 * 1000 / 86_400_000 - newMoon
    let m = days.truncatingRemainder(dividingBy: synodic)
    return (m + synodic).truncatingRemainder(dividingBy: synodic) / synodic
  }

  /// `moonPath`: nửa vòng là rìa sáng, nửa elip là đường phân sáng tối.
  public static func moonPath(cx: Double, cy: Double, r: Double, phase: Double) -> String {
    let k = cos(2 * Double.pi * phase)
    let rx = max(0.01, r * abs(k))
    let limb = phase < 0.5 ? 1 : 0
    let term = k >= 0 ? 1 - limb : limb
    let js = VectorMascot.js
    return "M \(js(cx)) \(js(cy - r)) A \(js(r)) \(js(r)) 0 0 \(limb) \(js(cx)) \(js(cy + r)) "
      + "A \(js(rx)) \(js(r)) 0 0 \(term) \(js(cx)) \(js(cy - r)) Z"
  }

  // MARK: - Đồ phòng

  struct DecorPayload: Decodable {
    let spots: [String: [Int]]
    let variants: [String: [JSONValue]]
    /// Lớp bụi theo mức ("1"…"3", cộng dồn) và phần tử mà bụi nằm ngay sau.
    let dust: [String: [JSONValue]]
    let dustAfter: Int
  }

  /// `StudioDecorData.swift` (`tools/koa-room/build.py`).
  static let decorData: DecorPayload = {
    do {
      return try JSONDecoder().decode(DecorPayload.self, from: Data(decorJSON.utf8))
    } catch {
      preconditionFailure("studio-decor: \(error)")
    }
  }()

  /// 6 chỗ đổi được, theo thứ tự trên màn.
  public static let decorSpots = ["shelf", "board", "window", "plants", "lamp", "podium"]

  // MARK: - Template

  struct Payload: Decodable {
    let back: [JSONValue]
    let front: [JSONValue]
  }

  static let template: [JSONValue] = {
    do {
      let p = try JSONDecoder().decode(Payload.self, from: Data(json.utf8))
      return p.back + p.front
    } catch {
      preconditionFailure("studio-scene: \(error)")
    }
  }()

  /// Cả căn phòng, theo toạ độ 390 × `sceneBottom` (đi tiếp xuống dưới cũng được).
  public static func tree(_ o: Options) -> [KoaRender.Element] { build(template, o, decor: true) }

  /// Một template (studio, phòng thử đồ) → cây phần tử, token đã giải.
  static func build(_ template: [JSONValue], _ o: Options, decor: Bool = false) -> [KoaRender.Element] {
    let table = o.light ? lightSkins : skins
    let skin = table[o.skin] ?? table["default"]!
    var out: [KoaRender.Element] = []
    // Đồ phòng: bỏ phần tử gốc của chỗ có món, chèn biến thể ở chỗ phần tử đầu tiên.
    var skip = Set<Int>()
    var swap: [Int: [JSONValue]] = [:]
    if decor {
      for (spot, id) in o.decor {
        guard let idx = decorData.spots[spot], let first = idx.min(), let v = decorData.variants["\(spot).\(id)"]
        else { continue }
        skip.formUnion(idx)
        // ban ngày không có đèn treo (như đèn gốc)
        swap[first] = spot == "lamp" && !o.lamp ? [] : v
      }
    }
    for (i, v) in template.enumerated() {
      if let extra = swap[i] { out += extra.compactMap { element($0, o, skin) } }
      if skip.contains(i) { continue }
      if !o.lamp, isLamp(v) { continue }
      // ban ngày không có sao ngoài cửa sổ
      if o.light, v["t"]?.stringValue == "Circle", v["p"]?["fill"]?.stringValue == "#FFFFFF",
        v["p"]?["opacity"]?.doubleValue == 0.85
      { continue }
      if let e = element(v, o, skin) { out.append(e) }
      // lớp chiều sâu ngay sau mép sàn, trước đồ đạc
      if o.depth, isFloorEdge(v) { out += depthLayer.compactMap { element($0, o, skin) } }
      // bụi trên đồ đạc, dưới vignette / đèn / bục
      if decor, o.dust > 0, i == decorData.dustAfter {
        for k in 1...min(3, o.dust) { out += (decorData.dust["\(k)"] ?? []).compactMap { element($0, o, skin) } }
      }
    }
    return out
  }

  static func element(_ v: JSONValue, _ o: Options, _ skin: Skin) -> KoaRender.Element? {
    guard let tag = v["t"]?.stringValue else { return nil }
    var props: [String: KoaScene.Value] = [:]
    if case .object(let p)? = v["p"] {
      for (k, x) in p {
        switch x {
        case .number(let d): props[k] = .number(d)
        case .string(let s):
          props[k] = s.hasPrefix("$") ? resolve(s, o, skin) : .string(o.light ? dayColors[s] ?? s : s)
        default: break
        }
      }
    }
    if let board = o.board, tag == "Text", props["text"] == .string("STREAK") {
      props["text"] = .string(board.word)
    } else if let board = o.board, tag == "Path", case .string(let d)? = props["d"], d.hasPrefix("M 330 289") {
      // ngọn lửa của chuỗi → biểu tượng của số đang hiện
      props["d"] = .string(boardIcons[board.icon] ?? dumbbell)
    } else if tag == "Text", case .string(let t)? = props["text"], let swap = signText[o.lang]?[t] {
      props["text"] = .string(swap.text)
      if let x = swap.x { props["x"] = .number(x) }
      if let size = swap.size { props["fontSize"] = .number(size) }
    }
    if o.light, tag == "LinearGradient", v["p"]?["id"]?.stringValue == "studioSky" {
      let stops = daySky.map { off, color, op in
        KoaRender.Element(
          "Stop", ["offset": .number(off), "stopColor": .string(color), "stopOpacity": .number(op)], matrix: nil,
          kids: [])
      }
      return KoaRender.Element(tag, props, matrix: nil, kids: stops)
    }
    var matrix: KoaMath.Mat?
    if case .array(let m)? = v["m"] { matrix = m.compactMap { $0.doubleValue } }
    var kids: [KoaRender.Element] = []
    if case .array(let k)? = v["k"] { kids = k.compactMap { element($0, o, skin) } }
    return KoaRender.Element(tag, props, matrix: matrix, kids: kids)
  }

  /// Chữ vẽ trên tranh theo ngôn ngữ (15/10, audit: "WIN TODAY STRONGER TOMORROW",
  /// "STREAK" tiếng Anh ở bản tiếng Việt). Chữ gốc → (chữ mới, x mới nếu dời). Hàng đầu
  /// của bảng tách màu (cam căn phải | trắng căn trái) nên điểm tách dời theo độ dài.
  /// `size`: cỡ chữ mới khi câu dài hơn khung (bảng rộng 84, tâm x 66).
  static let signText: [String: [String: (text: String, x: Double?, size: Double?)]] = [
    "vi": [
      "WIN": ("THẮNG", 59, 8.6), "TODAY": ("HÔM NAY", 61.5, 8.6), "STRONGER": ("NGÀY MAI", nil, nil),
      "TOMORROW": ("MẠNH HƠN", nil, nil), "STREAK": ("CHUỖI", nil, nil),
    ],
    "es": [
      "WIN": ("GANA", 62, nil), "TODAY": ("HOY", 65, nil), "STRONGER": ("MAÑANA", nil, nil),
      "TOMORROW": ("MÁS FUERTE", nil, 9), "STREAK": ("RACHA", nil, nil),
    ],
  ]

  /// Quả tạ thay ngọn lửa, cùng chỗ (khung ~322…344 × 270…290).
  /// Hai đĩa mỗi bên (đĩa lớn trong, đĩa nhỏ ngoài) + tay cầm mảnh, bo góc nhẹ.
  static let dumbbell = "M 320 277 L 323 277 L 323 272 Q 323 271 324 271 L 327 271 Q 328 271 328 272 L 328 279 "
    + "L 336 279 L 336 272 Q 336 271 337 271 L 340 271 Q 341 271 341 272 L 341 277 L 344 277 L 344 285 "
    + "L 341 285 L 341 290 Q 341 291 340 291 L 337 291 Q 336 291 336 290 L 336 283 L 328 283 L 328 290 "
    + "Q 328 291 327 291 L 324 291 Q 323 291 323 290 L 323 285 L 320 285 Z"
  static let boardIcons: [Board.Icon: String] = [
    .dumbbell: dumbbell,
    // dấu tích dày
    .check: "M 321 281 L 325 277 L 330 282 L 340 270 L 344 274 L 330 290 Z",
    // cúp có hai quai
    .trophy: "M 324 271 L 342 271 L 342 274 Q 347 274 347 278.5 Q 347 283 341 283.5 Q 339 287 335 288 L 335 290 "
      + "L 339 290 L 339 292 L 327 292 L 327 290 L 331 290 L 331 288 Q 327 287 325 283.5 Q 319 283 319 278.5 "
      + "Q 319 274 324 274 Z",
  ]

  /// Phần tử của đèn treo trong template studio.
  static func isLamp(_ v: JSONValue) -> Bool {
    let p = v["p"]
    let fill = p?["fill"]?.stringValue ?? ""
    if ["url(#nsHalo)", "url(#studioCone)", "url(#nsPool)"].contains(fill) { return true }
    let t = v["t"]?.stringValue
    if t == "Rect", p?["x"]?.doubleValue == 194, p?["y"]?.doubleValue == 0 { return true }
    if t == "Path", (p?["d"]?.stringValue ?? "").hasPrefix("M 195 52") { return true }
    if t == "Ellipse", p?["cx"]?.doubleValue == 195, p?["cy"]?.doubleValue == 78 { return true }
    if t == "Circle", fill == "#FFC24D", (p?["r"]?.doubleValue ?? 9) < 2 { return true }
    return false
  }

  /// Vạch sáng mảnh ở mép sàn (y 358) — lớp chiều sâu chèn ngay sau nó.
  static func isFloorEdge(_ v: JSONValue) -> Bool {
    v["t"]?.stringValue == "Rect" && v["p"]?["y"]?.doubleValue == 358 && v["p"]?["height"]?.doubleValue == 1
  }

  static let depthLayer: [JSONValue] = {
    (try? JSONDecoder().decode([JSONValue].self, from: Data(depthJSON.utf8))) ?? []
  }()

  static let depthJSON = ##"[{"t":"Defs","p":{},"k":[{"t":"LinearGradient","p":{"id":"studioWallSide","x1":0,"y1":0,"x2":1,"y2":0},"k":[{"t":"Stop","p":{"offset":0,"stopColor":"#000000","stopOpacity":0.34}},{"t":"Stop","p":{"offset":0.22,"stopColor":"#000000","stopOpacity":0}},{"t":"Stop","p":{"offset":0.78,"stopColor":"#000000","stopOpacity":0}},{"t":"Stop","p":{"offset":1,"stopColor":"#000000","stopOpacity":0.34}}]},{"t":"LinearGradient","p":{"id":"studioWallFoot","x1":0,"y1":0,"x2":0,"y2":1},"k":[{"t":"Stop","p":{"offset":0,"stopColor":"#000000","stopOpacity":0}},{"t":"Stop","p":{"offset":1,"stopColor":"#000000","stopOpacity":0.26}}]},{"t":"LinearGradient","p":{"id":"studioFloorDepth","x1":0,"y1":0,"x2":0,"y2":1},"k":[{"t":"Stop","p":{"offset":0,"stopColor":"#000000","stopOpacity":0.26}},{"t":"Stop","p":{"offset":0.4,"stopColor":"#000000","stopOpacity":0}}]}]},{"t":"Rect","p":{"x":0,"y":0,"width":390,"height":360,"fill":"url(#studioWallSide)"}},{"t":"Path","p":{"d":"M 0 0 L 26 0 L 26 360 L 0 388 Z","fill":"#000000","opacity":0.14}},{"t":"Path","p":{"d":"M 390 0 L 364 0 L 364 360 L 390 388 Z","fill":"#000000","opacity":0.14}},{"t":"Rect","p":{"x":0,"y":296,"width":390,"height":64,"fill":"url(#studioWallFoot)"}},{"t":"Path","p":{"d":"M -26.46 360 L -260 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 46.55 360 L -110 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 119.56 360 L 40 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 195.0 360 L 195 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 270.44 360 L 350 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 343.45 360 L 500 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 416.46 360 L 650 476","fill":"none","stroke":"#000000","strokeWidth":1.4,"opacity":0.3}},{"t":"Path","p":{"d":"M 0 374 L 390 374","fill":"none","stroke":"#000000","strokeWidth":1,"opacity":0.16}},{"t":"Path","p":{"d":"M 0 396 L 390 396","fill":"none","stroke":"#000000","strokeWidth":1,"opacity":0.16}},{"t":"Path","p":{"d":"M 0 428 L 390 428","fill":"none","stroke":"#000000","strokeWidth":1,"opacity":0.16}},{"t":"Path","p":{"d":"M 0 470 L 390 470","fill":"none","stroke":"#000000","strokeWidth":1,"opacity":0.16}},{"t":"Rect","p":{"x":0,"y":360,"width":390,"height":116,"fill":"url(#studioFloorDepth)"}},{"t":"Rect","p":{"x":26,"y":346,"width":338,"height":14,"fill":"#151A33"}},{"t":"Rect","p":{"x":26,"y":346,"width":338,"height":1.5,"fill":"#FFFFFF","opacity":0.14}},{"t":"Rect","p":{"x":0,"y":359,"width":390,"height":3,"fill":"#000000","opacity":0.28}},{"t":"Path","p":{"d":"M 26 0 L 26 360 L 0 388","fill":"none","stroke":"#000000","strokeWidth":1.5,"opacity":0.3}},{"t":"Path","p":{"d":"M 364 0 L 364 360 L 390 388","fill":"none","stroke":"#000000","strokeWidth":1.5,"opacity":0.3}},{"t":"Path","p":{"d":"M 27.5 0 L 27.5 346","fill":"none","stroke":"#FFFFFF","strokeWidth":1,"opacity":0.1}}]"##

  /// Một token → giá trị (cùng luật với `resolve` của `gen.cjs`).
  static func resolve(_ s: String, _ o: Options, _ skin: Skin) -> KoaScene.Value {
    let count = max(0, o.streak)
    switch s {
    case "$wall0": return .string(skin.wall.0)
    case "$wall1": return .string(skin.wall.1)
    case "$glow": return .string(skin.glow)
    case "$streak": return .string(o.board?.value ?? String(count))
    case "$countSize":
      if let board = o.board {
        let n = board.value.count
        return .number(n <= 2 ? 22 : (n == 3 ? 19 : (n == 4 ? 16 : 13)))
      }
      let size: Double = count >= 100 ? 15 : (count >= 10 ? 19 : 22)
      return .number(size)
    case "$label": return .string(o.label.uppercased())
    default: break
    }
    let parts = s.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
    if parts[0] == "$e", parts.count == 3, let a = Double(parts[1]), let b = Double(parts[2]) {
      let e = max(0, min(1, o.energy))
      return .number(a + (b - a) * e)
    }
    if parts[0] == "$moon", parts.count == 4, let cx = Double(parts[1]), let cy = Double(parts[2]),
      let r = Double(parts[3])
    {
      // Ban ngày không có trăng trên trời.
      if o.light { return .string("M 0 0") }
      return .string(moonPath(cx: cx, cy: cy, r: r, phase: o.moon))
    }
    if parts[0].hasPrefix("$dot"), parts.count == 3, let i = Int(parts[0].dropFirst(4)) {
      if let board = o.board {
        if i >= min(7, board.dots) { return .string("none") }
        return .string(i < board.lit ? parts[2] : parts[1])
      }
      return .string(i < min(7, count) ? parts[2] : parts[1])
    }
    return .string(s)
  }
}
