public import Foundation

/// Cờ của Koa (#527, K1) — `koa-flags.ts` @ fac9ac2, tức `renderVals()` của
/// bản export: biểu cảm + tư thế + đồ đang mặc → cờ bật / tắt từng lớp và các
/// chuỗi transform / hoạt ảnh do lớp logic đưa xuống.
public enum KoaFlags {
  public enum Expression: String, Sendable, Hashable, CaseIterable {
    case happy, surprised, grin, confident, sad, tired, angry, delighted, happytired, strain, plead
  }

  public enum Pose: String, Sendable, Hashable, CaseIterable {
    case idle, turn34, running, lifting, stretching, relaxing
  }

  public enum Slot: String, Sendable, Hashable, CaseIterable {
    case head, face, top, bottom, shoes, back, hand
  }

  /// `KOA_ITEMS`, đúng thứ tự.
  public static let items: [Slot: [String]] = [
    .head: ["band", "cap", "beanie", "santa", "antler", "pumpkin", "witch", "khanxep", "phones", "lion"],
    .face: ["shades", "goggles", "mask", "eyepatch", "beard", "tuong", "vr", "nosestrip", "heart", "dragon"],
    .top: ["tank", "tee", "hoodie", "xmas", "aodai", "ghost", "windbreak", "jersey", "lion", "armor"],
    .bottom: ["short", "legging", "jogger", "xmaspants", "tetpants", "tutu", "camo", "swim", "ghostpants", "flame"],
    .shoes: ["sneaker", "runner", "boot", "xmasboot", "hai", "sandal", "socks", "glow", "ghostshoe", "wing"],
    .back: ["backpack", "hydro", "angel", "bat", "giftbag", "lixi", "cape", "oxygen", "dragonwing", "jetpack"],
    .hand: ["bottle", "dumbbell", "towel", "rope", "candy", "lantern", "broom", "redenv", "trophy", "sparkler"],
  ]

  /// Nhãn của bảng thiết kế (`KOA_EXPRESSIONS` / `KOA_POSES`) — chữ của spec
  /// sheet cho dev, cố ý tiếng Việt như RN.
  public static let expressionLabel: [Expression: String] = [
    .happy: "VUI VẺ", .surprised: "NGẠC NHIÊN", .grin: "CƯỜI TÍT MẮT", .confident: "TỰ TIN", .sad: "BUỒN",
    .tired: "MỆT MỎI", .angry: "TỨC GIẬN", .delighted: "THÍCH THÚ", .happytired: "VUI MÀ MỆT", .strain: "GỒNG SỨC",
    .plead: "VAN NÀI",
  ]
  public static let poseLabel: [Pose: String] = [
    .idle: "ĐỨNG YÊN", .turn34: "TURNAROUND 3/4", .running: "CHẠY BỘ", .lifting: "TẬP TẠ", .stretching: "GIÃN CƠ",
    .relaxing: "THƯ GIÃN",
  ]

  public typealias Worn = [Slot: String]

  /// Giá trị một cờ: đúng / sai, hoặc một chuỗi (transform, hoạt ảnh).
  public enum Value: Sendable, Hashable {
    case bool(Bool)
    case text(String)

    /// Truthiness của JS (`!flags[x]`).
    public var truthy: Bool {
      switch self {
      case .bool(let b): b
      case .text(let s): !s.isEmpty
      }
    }

    /// `String(flags[x] ?? '')`.
    public var text: String {
      switch self {
      case .bool(let b): b ? "true" : "false"
      case .text(let s): s
      }
    }
  }

  public typealias Flags = [String: Value]

  static let openEyes: Set<Expression> = [.happy, .confident, .sad, .tired, .angry, .happytired, .strain, .plead]

  static let handAnchor: [Pose: String] = [
    .idle: "translate(178,236)", .turn34: "translate(178,236)", .running: "translate(184,232)",
    .lifting: "translate(180,222)", .stretching: "translate(188,214)", .relaxing: "translate(158,254)",
  ]

  static let handAnim: [Pose: String] = [
    .idle: "animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box",
    .turn34: "animation:koaArmR 3.6s ease-in-out infinite;transform-origin:160px 178px;transform-box:view-box",
    .running: "animation:koaRunArm18 18s linear infinite;transform-origin:160px 178px;transform-box:view-box",
    .lifting:
      "animation:koaCurlB14 14s ease-in-out infinite;transform-origin:156px 184px;transform-box:view-box;translate:18px -12px",
    .stretching: "",
    .relaxing: "animation:koaSitBreath 3.6s ease-in-out infinite;transform-box:view-box",
  ]

  /// `koaFlags`.
  public static func flags(_ e: Expression, _ p: Pose, worn: Worn = [:]) -> Flags {
    var f: Flags = [:]
    for slot in Slot.allCases {
      for id in items[slot] ?? [] { f["it_\(slot.rawValue)_\(id)"] = .bool(worn[slot] == id) }
    }
    func b(_ v: Bool) -> Value { .bool(v) }
    func s(_ v: String) -> Value { .text(v) }
    let run = p == .running, turn = p == .turn34
    f["handTf"] = s(handAnchor[p] ?? handAnchor[.idle]!)
    f["handAnim"] = s(handAnim[p] ?? "")
    f["packTf"] = s(run ? "" : "translate(-10,30)")
    f["strapVis"] = s(run ? "" : "opacity:0")
    f["shoeAnimL"] = s(
      run ? "animation:koaRunLegA18 18s linear infinite;transform-origin:104px 252px;transform-box:view-box" : "")
    f["shoeAnimR"] = s(
      run ? "animation:koaRunLegB18 18s linear infinite;transform-origin:136px 252px;transform-box:view-box" : "")
    f["eyesOpen"] = b(openEyes.contains(e))
    f["eyesWide"] = b(e == .surprised || e == .plead)
    f["eyesArc"] = b(e == .grin)
    f["eyesStar"] = b(e == .delighted)
    f["lidsHalf"] = b(e == .confident || e == .strain)
    f["lidsWink"] = b(e == .happytired)
    f["blinkGate"] = s(e == .happytired ? "animation:koaWinkOff 9s ease-in-out infinite" : "")
    f["lidsHeavy"] = b(e == .tired)
    f["lidsSad"] = b(e == .sad)
    f["browArc"] = b(e == .happy || e == .grin || e == .delighted || e == .happytired)
    f["browRaised"] = b(e == .surprised)
    f["browSad"] = b(e == .sad || e == .plead)
    f["browAngry"] = b(e == .angry)
    f["browStrain"] = b(e == .strain)
    f["mouthGrit"] = b(e == .strain)
    f["showStrain"] = b(e == .strain)
    f["mouthSmile"] = b(e == .happy || e == .delighted)
    f["mouthGrin"] = b(e == .grin || e == .happytired)
    f["mouthBreath"] = b(e == .happytired)
    f["grinCycle"] = s(e == .happytired ? "animation:koaBreathGrin 18s linear infinite" : "")
    f["mouthO"] = b(e == .surprised)
    f["mouthSmirk"] = b(e == .confident)
    f["mouthFrown"] = b(e == .sad || e == .plead)
    f["mouthFlat"] = b(e == .tired)
    f["mouthShout"] = b(e == .angry)
    f["showSteam"] = b(e == .angry)
    f["showHearts"] = b(e == .delighted)
    f["armsIdle"] = b(p == .idle || turn)
    f["poseRun"] = b(run)
    f["turnedView"] = b(run || turn)
    f["torsoStand"] = b(!run && !turn)
    f["torsoRun"] = b(run || turn)
    f["runBob"] = s(
      run ? "animation:koaRunBody18 18s linear infinite;transform-origin:120px 290px;transform-box:view-box" : "")
    f["poseLift"] = b(p == .lifting)
    f["poseStretch"] = b(p == .stretching)
    f["poseRelax"] = b(p == .relaxing)
    f["poseTilt"] = s(
      run
        ? "rotate(4 120 288) translate(120,0) scale(0.91,1) translate(-120,0)"
        : turn
          ? "translate(120,0) scale(0.93,1) translate(-120,0)"
          : p == .stretching ? "translate(-8,0) rotate(6 120 288)" : "")
    f["bellyTurn"] = s(
      run
        ? "translate(120,228) scale(0.9,1) translate(-120,-228) translate(13,0)"
        : turn ? "translate(120,228) scale(0.92,1) translate(-120,-228) translate(11,0)" : "")
    f["headTilt"] = s(
      run
        ? "rotate(-5 120 170) translate(120,0) scale(0.99,1) translate(-120,0)"
        : turn ? "translate(120,0) scale(0.96,1) translate(-120,0)" : "")
    f["hipTuft"] = b(turn)
    f["gazeShift"] = s(turn ? "translate(-6,4)" : "")
    f["gazeRight"] = s(turn ? "translate(7,0)" : "")
    f["faceShift"] = s(run ? "translate(18,0)" : turn ? "translate(16,0)" : "")
    f["earShift"] = s(run ? "translate(14,0)" : turn ? "translate(12,0)" : "")
    f["earLeftShift"] = s(run ? "translate(-19,0)" : turn ? "translate(-17,0)" : "")
    f["armLeftTurn"] = s(run ? "translate(15,0) rotate(6 80 178)" : turn ? "translate(13,0) rotate(5 80 178)" : "")
    f["shadowTf"] = s(
      run
        ? "translate(120,294) scale(0.92,1) translate(-120,-294)"
        : turn ? "translate(120,294) scale(0.93,1) translate(-120,-294) translate(4,0)" : "")
    f["legsStand"] = b(p == .idle || p == .lifting || p == .stretching || turn)
    f["legsRun"] = b(run)
    f["legsSit"] = b(p == .relaxing)
    return f
  }
}
