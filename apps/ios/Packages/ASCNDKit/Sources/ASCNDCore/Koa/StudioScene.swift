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
    /// 0…1 trong chu kỳ trăng (`moonPhase`).
    public var moon = 0.18
    /// Tên in trên mặt trước bục.
    public var label = ""

    public init() {}
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
  public static func tree(_ o: Options) -> [KoaRender.Element] { build(template, o) }

  /// Một template (studio, phòng thử đồ) → cây phần tử, token đã giải.
  static func build(_ template: [JSONValue], _ o: Options) -> [KoaRender.Element] {
    let skin = skins[o.skin] ?? skins["default"]!
    return template.compactMap { element($0, o, skin) }
  }

  static func element(_ v: JSONValue, _ o: Options, _ skin: Skin) -> KoaRender.Element? {
    guard let tag = v["t"]?.stringValue else { return nil }
    var props: [String: KoaScene.Value] = [:]
    if case .object(let p)? = v["p"] {
      for (k, x) in p {
        switch x {
        case .number(let d): props[k] = .number(d)
        case .string(let s): props[k] = s.hasPrefix("$") ? resolve(s, o, skin) : .string(s)
        default: break
        }
      }
    }
    var matrix: KoaMath.Mat?
    if case .array(let m)? = v["m"] { matrix = m.compactMap { $0.doubleValue } }
    var kids: [KoaRender.Element] = []
    if case .array(let k)? = v["k"] { kids = k.compactMap { element($0, o, skin) } }
    return KoaRender.Element(tag, props, matrix: matrix, kids: kids)
  }

  /// Một token → giá trị (cùng luật với `resolve` của `gen.cjs`).
  static func resolve(_ s: String, _ o: Options, _ skin: Skin) -> KoaScene.Value {
    let count = max(0, o.streak)
    switch s {
    case "$wall0": return .string(skin.wall.0)
    case "$wall1": return .string(skin.wall.1)
    case "$glow": return .string(skin.glow)
    case "$streak": return .string(String(count))
    case "$countSize":
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
      return .string(moonPath(cx: cx, cy: cy, r: r, phase: o.moon))
    }
    if parts[0].hasPrefix("$dot"), parts.count == 3, let i = Int(parts[0].dropFirst(4)) {
      return .string(i < min(7, count) ? parts[2] : parts[1])
    }
    return .string(s)
  }
}
