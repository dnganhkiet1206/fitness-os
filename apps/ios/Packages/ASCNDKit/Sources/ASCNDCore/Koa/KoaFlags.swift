import Foundation

/// Cờ của Koa (#527, K1) — `koa-flags.ts` @ fac9ac2, tức `renderVals()` của
/// bản export: biểu cảm + tư thế + đồ đang mặc → cờ bật / tắt từng lớp và các
/// chuỗi transform / hoạt ảnh do lớp logic đưa xuống.
public enum KoaFlags {
  public enum Expression: String, Sendable, Hashable, CaseIterable {
    case happy, surprised, grin, confident, sad, tired, angry, delighted, happytired, strain, plead, meditate
    /// Vẽ thêm (01/11): `content` là mặt nghỉ, `warm` cười khép mắt nhẹ, `sheepish` ái ngại,
    /// `sleepy` buồn ngủ, `thinking` nghĩ, `say1…3` ba khẩu hình lúc nói.
    case content, warm, sheepish, sleepy, thinking, say1, say2, say3
    /// Nhướn mày nhếch mép thè lưỡi: lúc Koa kéo thẻ nhiệm vụ lên.
    case tease
    /// "No no no" khi bị bấm mũi nhiều lần (Kiệt 04/11): phụng phịu — mắt lim dim, mày cụp, mếu; ghép
    /// từ mảnh có sẵn. Dỗi yêu, không chau mày giận.
    case nope
    /// Mặt tập gym vẽ thêm (05/11; `gymFocus` / `gymPant` đổi tên 07/11 khi gộp: nhánh chính đã có `focus` / `pant` của
    /// cảnh sửa đồ, vẽ khác, Kiệt duyệt thư viện storyboard): nghiến răng gồng, phồng má thở ra, hét
    /// chiến thắng, tập trung, thở dốc lè lưỡi, tự hào nhếch mép. Vẽ trọn mặt trong một cờ `faceGym…`
    /// (`tools/koa-wardrobe/build.py` ← `docs/koa-v2/blender/koa_faces_gym.py`).
    case grit, puff, roar, gymFocus, gymPant, smug
    /// Vẽ thêm (06/11, Kiệt cho vẽ biểu cảm mới cho cảnh sửa đồ): `yikes` hốt hoảng (mắt tròn, miệng méo
    /// nhe răng, giọt mồ hôi), `focus` tập trung thè lưỡi một bên mép, `pant` thở hổn hển (mắt híp, lưỡi
    /// thè, mồ hôi), `oof` nhắm tịt "> <", `oops` chao đảo (mắt tròn, mày cụp, miệng lượn sóng, mồ hôi).
    case yikes, focus, pant, oof, oops
    /// Chóng mặt sau khi xoay tít (06/11): mắt xoắn ốc, miệng lượn sóng.
    case dizzy
  }

  /// Biểu cảm tập gym vẽ thêm → cờ trọn mặt của nó.
  public static let gymFace: [Expression: String] = [
    .grit: "faceGymGrit", .puff: "faceGymPuff", .roar: "faceGymRoar", .gymFocus: "faceGymFocus", .gymPant: "faceGymPant",
    .smug: "faceGymSmug",
  ]

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
    .plead: "VAN NÀI", .meditate: "THIỀN", .content: "THƯ THÁI", .warm: "MỈM CƯỜI", .sheepish: "ÁI NGẠI",
    .sleepy: "BUỒN NGỦ", .thinking: "SUY NGHĨ", .say1: "NÓI 1", .say2: "NÓI 2", .say3: "NÓI 3", .tease: "THÁCH ĐỂU",
    .nope: "PHỤNG PHỊU", .grit: "NGHIẾN RĂNG", .puff: "PHỒNG MÁ", .roar: "CHIẾN THẮNG", .gymFocus: "TẬP TRUNG (GYM)",
    .gymPant: "THỞ DỐC", .smug: "TỰ HÀO", .yikes: "HỐT HOẢNG", .focus: "TẬP TRUNG", .pant: "THỞ HỔN HỂN",
    .oof: "NHẮM TỊT", .oops: "CHAO ĐẢO", .dizzy: "CHÓNG MẶT",
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

  static let openEyes: Set<Expression> = [
    .happy, .confident, .sad, .tired, .angry, .happytired, .strain, .plead, .content, .sheepish, .sleepy, .thinking,
    .say1, .say2, .say3, .tease, .nope, .focus,
  ]

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

  /// Nét mặt nhắm mắt: không có gì để chớp, không được ép chớp.
  public static func eyesClosed(_ e: Expression?) -> Bool {
    e == .grin || e == .warm || e == .meditate || e == .puff || e == .roar || e == .pant || e == .oof || e == .dizzy
  }

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
    f["eyesWide"] = b(e == .surprised || e == .plead || e == .yikes || e == .oops)
    f["eyesArc"] = b(e == .grin || e == .warm || e == .pant)
    f["eyesStar"] = b(e == .delighted)
    f["lidsHalf"] = b(e == .confident || e == .strain || e == .thinking || e == .nope)
    f["lidsWink"] = b(e == .happytired)
    f["blinkGate"] = s(e == .happytired ? "animation:koaWinkOff 9s ease-in-out infinite" : "")
    f["lidsHeavy"] = b(e == .tired || e == .sleepy)
    f["lidsSad"] = b(e == .sad)
    let speaking = e == .say1 || e == .say2 || e == .say3
    f["browArc"] = b(
      e == .happy || e == .grin || e == .delighted || e == .happytired || e == .content || e == .warm || e == .sleepy
        || speaking)
    f["browRaised"] = b(e == .surprised || e == .thinking || e == .tease || e == .yikes)
    f["browSad"] = b(e == .sad || e == .plead || e == .sheepish || e == .nope || e == .oops)
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
    f["mouthFrown"] = b(e == .sad || e == .plead || e == .nope)
    f["mouthFlat"] = b(e == .tired || e == .meditate)
    f["mouthShout"] = b(e == .angry)
    f["showSteam"] = b(e == .angry)
    f["showHearts"] = b(e == .delighted)
    // Native (20/10, Kiệt chọn mock B `koa-meditate-eyes.html`): mắt khép có nếp mí
    // khi Koa ngồi thiền. Cờ chỉ có mặt khi bật, để bộ cờ của các biểu cảm RN
    // giữ nguyên golden.
    if e == .meditate { f["eyesMeditate"] = b(true) }
    // Vẽ thêm 01/11: cờ cũng chỉ có mặt khi bật.
    if e == .content || e == .warm || e == .sheepish || e == .sleepy || e == .thinking { f["mouthSoft"] = b(true) }
    if e == .tease { f["mouthTease"] = b(true) }
    if e == .say1 { f["mouthSay1"] = b(true) }
    if e == .say2 { f["mouthSay2"] = b(true) }
    if e == .say3 { f["mouthSay3"] = b(true) }
    // Mặt gym vẽ thêm (05/11): mắt / mày / miệng gốc đều tắt (không có trong `openEyes` và các cờ trên).
    if let face = gymFace[e] { f[face] = b(true) }
    // Vẽ thêm 06/11: cờ chỉ có mặt khi bật.
    if e == .yikes { f["mouthYikes"] = b(true) }
    if e == .focus { f["mouthTongue"] = b(true); f["browFocus"] = b(true) }
    if e == .pant { f["mouthPant"] = b(true); f["browArc"] = b(true) }
    if e == .oof { f["eyesSqueeze"] = b(true); f["mouthWince"] = b(true) }
    if e == .oops || e == .dizzy { f["mouthWavy"] = b(true) }
    if e == .dizzy { f["eyesSpiral"] = b(true) }
    if e == .yikes || e == .pant || e == .oops { f["showSweat"] = b(true) }
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
