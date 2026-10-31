/// Dáng biểu cảm mới của Koa (24/10, Kiệt duyệt hướng mock "dáng hài hước như
/// Duolingo"): mỗi dáng là phép xoay / dời THÊM cho từng mảng, chồng lên tư thế đứng,
/// dáng nghỉ và đèn của bản vẽ — tay giữ đúng hình tay gốc (chỉ xoay quanh vai),
/// đầu xoay quanh chỗ tiếp thân, bóng cằm đi theo đầu để không lộ "cổ".
public enum KoaGesture: String, Sendable, Hashable, CaseIterable {
  /// Dang tay "ta-da".
  case taDa
  /// Bật nhảy ăn mừng, giơ tay.
  case cheer
  /// Nghiêng đầu, mắt nhìn sang.
  case curious
  /// Mệt lả: đầu gục, tay buông.
  case flop
  /// Hờn dỗi: hai tay trước bụng, mặt quay đi.
  case pout

  public var expression: KoaFlags.Expression {
    switch self {
    case .taDa: .confident
    case .cheer: .delighted
    case .curious: .surprised
    case .flop: .tired
    case .pout: .sad
    }
  }

  /// Nét mặt riêng của dáng — đúng tổ hợp mắt / mí / lông mày / miệng của mock Kiệt duyệt
  /// (biểu cảm có sẵn gần nhất lệch: "mệt" ra cười khẩy, "giận" ra quát).
  public var face: Set<String> {
    switch self {
    case .taDa: ["eyesArc", "browRaised", "mouthSmirk"]
    case .cheer: ["eyesStar", "browArc", "mouthGrin"]
    case .curious: ["eyesWide", "browRaised", "mouthO"]
    // miệng "thở" của bản vẽ chỉ hiện theo nhịp hoạt ảnh — ảnh tĩnh mất miệng; dùng miệng thẳng của "mệt"
    case .flop: ["eyesOpen", "lidsHeavy", "browSad", "mouthFlat"]
    // hờn, không giận: quay đầu đi, mày chùng (Kiệt 31/10; bản mày giận đọc ra trách người dùng)
    case .pout: ["eyesOpen", "lidsHalf", "browSad", "mouthFrown"]
    }
  }

  /// Cờ nét mặt của bản vẽ — tắt hết rồi bật đúng `face`.
  static let facePrefixes = ["eyes", "lids", "brow", "mouth", "show"]

  /// Tay giơ lên đè lên má: vẽ tay SAU đầu trong cây sẽ bị che — vẽ một lớp tay riêng ở trên.
  public var armsFront: Bool { self == .taDa || self == .cheer }

  /// Nét mờ quanh nửa bàn tay khi tay đè lên mặt / bụng (Kiệt: tay liền thân, chỉ nét mờ).
  public var pawOutline: Bool { self == .taDa || self == .cheer }

  static func rot(_ deg: Double, _ cx: Double, _ cy: Double) -> KoaMath.Mat {
    KoaMath.opMat(KoaScene.Op("r", [deg, cx, cy]))
  }

  static func move(_ x: Double, _ y: Double) -> KoaMath.Mat { [1, 0, 0, 1, x, y] }

  /// Vai trái / phải của bản vẽ (`REST` của `koa-pose.ts`).
  static let shoulderL = (80.0, 178.0)
  static let shoulderR = (160.0, 178.0)
  /// Chỗ đầu tiếp thân.
  static let neck = (120.0, 166.0)

  var arms: (left: Double, right: Double)? {
    switch self {
    case .taDa: (90, -90)
    case .cheer: (108, -108)
    case .flop: (-10, 10)
    case .pout: (-12, 12)
    case .curious: (6, 0)
    }
  }

  var head: KoaMath.Mat? {
    switch self {
    case .taDa: Self.rot(-4, Self.neck.0, Self.neck.1)
    case .curious: Self.rot(-9, Self.neck.0, Self.neck.1)
    case .flop: KoaMath.mul(Self.rot(9, Self.neck.0, Self.neck.1), Self.move(2, 5))
    case .pout: Self.rot(5, Self.neck.0, Self.neck.1)
    case .cheer: nil
    }
  }

  /// Tay giơ lên: LẬT tay theo chính trục vai → bàn tay (Kiệt 24/10: tay giơ bị ngược
  /// chiều) để đường cong của bàn tay quay đúng hướng khi đã xoay lên.
  var flipsArms: Bool { self == .taDa || self == .cheer }

  /// Phép đối xứng qua trục vai → bàn tay của tay gốc.
  static func flip(left: Bool) -> KoaMath.Mat {
    let sx = left ? 80.0 : 160.0, sy = 182.0
    let deg = left ? 117.35 : 62.65
    return KoaMath.opsMat(
      [
        KoaScene.Op("t", [sx, sy]), KoaScene.Op("r", [deg]), KoaScene.Op("s", [1, -1]), KoaScene.Op("r", [-deg]),
        KoaScene.Op("t", [-sx, -sy]),
      ], 0, 0)
  }

  /// Mép ngoài nằm TRONG đường viền thân / tay gốc — không nhô ra khỏi nét vẽ (Kiệt 25/10).
  /// Tò mò nghiêng đầu sang trái: má phải nhấc lên, hở chỗ nối với vai phải — mảng lấp
  /// riêng phía phải, nằm sau đầu (Kiệt 25/10).
  public static let curiousFill =
    "M132 156 C 147 153 160 157 167 166 C 169 170 169 174 167 178 C 155 176 143 175 132 174 Z"

  /// Tư thế đứng gốc hở một khe tối nhỏ giữa đỉnh tay và cằm (Kiệt khoanh 25/10) —
  /// nhấc tay lên 4 đơn vị thay vì vẽ che.
  public static let idleArmLift: KoaMath.Mat = [1, 0, 0, 1, 0, -4]

  /// Dáng có nghiêng đầu → cần mảng vai / gáy lấp chỗ nối.
  public var tiltsHead: Bool { head != nil }

  /// Lấp kẽ hở dưới cằm (Kiệt 25/10): từ mép ngoài vai, CHÉO lên vào gáy — vai dốc,
  /// mảnh, nằm sau đầu (bản vai to trông như Koa bị làm sao).
  public static let neckFill =
    "M73 168 C 82 163 92 160 102 158 C 112 155 128 155 138 158 C 148 160 158 163 167 168 C 165 173 162 177 158 180 C 140 176 100 176 82 180 C 78 177 75 173 73 168 Z"

  /// Mệt lả: mí nặng gốc chỉ phủ tới y≈80 trong khi lòng trắng cao tới y≈72 — kéo mí
  /// cao lên cho che kín mắt (Kiệt 25/10).
  public func lid(_ d: String) -> String? {
    guard self == .flop else { return nil }
    if d.hasPrefix("M64 104 A18 23.5") { return "M62 104 A20 33 0 0 1 102 104 Z" }
    if d.hasPrefix("M140 104 A18 23.5") { return "M138 104 A20 33 0 0 1 178 104 Z" }
    return nil
  }

  /// Ma trận thêm cho một lớp — theo `id`, theo tên `bind` (tay của tủ đồ là nhóm
  /// `armRankL` / `armRankR`: xoay cả tay lẫn nếp vai), hay bóng cằm (lớp không tên).
  /// `ground` < 1 (Koa đang đi): phần rời sàn của dáng (bật nhảy, chân co) nhường dần
  /// cho dáng đi — chân phải chạm sàn.
  ///
  /// `amount` < 1: dáng hiện dần (Koa có ý định, 29/10) — mọi góc / độ dời nhân với `amount`,
  /// nên dáng chuyển mượt chứ không bật tắt. Tay lật (ta-da, ăn mừng) chỉ lật khi đã quá nửa.
  public func matrix(id: String?, bind: String?, d: String?, ground: Double = 1, amount: Double = 1) -> KoaMath.Mat? {
    let a = max(0, min(1, amount))
    if let arms {
      if bind == "armRankL" {
        // mệt lả / hờn dỗi / tò mò: tay trái nhích lên gần cổ (Kiệt 25/10)
        let lift =
          self == .flop || self == .pout ? Self.move(3 * a, -7 * a) : self == .curious ? Self.move(a, a) : KoaMath.identity
        let r = KoaMath.mul(lift, Self.rot(arms.left * a, Self.shoulderL.0, Self.shoulderL.1))
        return flipsArms && a >= 0.5 ? KoaMath.mul(r, Self.flip(left: true)) : r
      }
      if bind == "armRankR" {
        let r = Self.rot(arms.right * a, Self.shoulderR.0, Self.shoulderR.1)
        return flipsArms && a >= 0.5 ? KoaMath.mul(r, Self.flip(left: false)) : r
      }
    }
    switch id {
    case "HEADRIG": return headMat(a)
    case "FACE":
      switch self {
      case .curious: return Self.move(-5 * a, 0)
      case .pout: return Self.move(7 * a, 0)
      default: return nil
      }
    case "POSERIG": return self == .cheer ? Self.move(0, -26 * ground * a) : nil
    case "leg_left_lower": return self == .cheer ? Self.rot(14 * ground * a, 104, 256) : nil
    case "leg_right_lower": return self == .cheer ? Self.rot(-14 * ground * a, 136, 256) : nil
    default: break
    }
    // bóng cằm trên thân đi theo đầu — nghiêng đầu không lộ "cổ"
    if head != nil, d?.hasPrefix("M85 174") == true { return headMat(a) }
    return nil
  }

  /// Đầu ở độ hiện `a` (a = 1 đúng `head`).
  func headMat(_ a: Double) -> KoaMath.Mat? {
    guard head != nil else { return nil }
    if a >= 1 { return head }
    switch self {
    case .taDa: return Self.rot(-4 * a, Self.neck.0, Self.neck.1)
    case .curious: return Self.rot(-9 * a, Self.neck.0, Self.neck.1)
    case .flop: return KoaMath.mul(Self.rot(9 * a, Self.neck.0, Self.neck.1), Self.move(2 * a, 5 * a))
    case .pout: return Self.rot(5 * a, Self.neck.0, Self.neck.1)
    case .cheer: return nil
    }
  }

  /// Vùng nửa bàn tay (phía ngoài khuỷu) trong toạ độ của chính tay — nét mờ chỉ ở đây,
  /// vai vẫn liền thân.
  public static func pawClip(left: Bool) -> String {
    let sx = left ? 80.0 : 160.0, ex = left ? 62.0 : 178.0, px = left ? 50.0 : 190.0
    let sy = 182.0, ey = 212.0, py = 240.0
    var vx = px - sx, vy = py - sy
    let l = (vx * vx + vy * vy).squareRoot()
    vx /= l
    vy /= l
    let nx = -vy, ny = vx
    let a = (ex + nx * 200, ey + ny * 200), b = (ex - nx * 200, ey - ny * 200)
    let c = (b.0 + vx * 200, b.1 + vy * 200), d = (a.0 + vx * 200, a.1 + vy * 200)
    func p(_ q: (Double, Double)) -> String { "\(q.0) \(q.1)" }
    return "M\(p(a)) L\(p(b)) L\(p(c)) L\(p(d)) Z"
  }
}

extension KoaGesture {
  /// Dáng của Koa trong phòng theo tình huống thật (Kiệt duyệt 25/10): đủ tuần → ăn mừng,
  /// vừa tập hôm nay → ta-da, lỡ buổi theo lịch → hờn dỗi, mệt → mệt lả, hôm nay chưa ghi
  /// gì → tò mò; không gì đặc biệt → `nil` (dáng của cảm xúc như cũ).
  ///
  /// Cảm xúc của ngày thắng dáng (31/10): xong hết việc, lo chuỗi, mới ngủ dậy… có nét mặt riêng,
  /// dáng hờn không được đè lên. `missedPlanned` chỉ tính những ngày TRƯỚC hôm nay: buổi hôm nay
  /// chưa tập không phải là đã lỡ.
  public static func pick(
    trainedToday: Bool, weekComplete: Bool, missedPlanned: Bool, tired: Bool, loggedAnything: Bool,
    mood: KoaEmotion.Emotion = .idle
  ) -> KoaGesture? {
    if weekComplete && trainedToday { return .cheer }
    if trainedToday { return .taDa }
    guard [.idle, .tired, .happy].contains(mood) else { return nil }
    if missedPlanned, mood == .idle { return .pout }
    if tired { return .flop }
    if !loggedAnything { return .curious }
    return nil
  }
}
