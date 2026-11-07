import Foundation

/// Mặt Koa có tham số (07/11, storyboard màn nghỉ lần 3, Kiệt duyệt: "biểu cảm gương mặt biến đổi tự nhiên").
///
/// Như Duolingo dựng mặt trong Rive: mặt là các LỚP riêng — mí, mày, miệng — mỗi lớp là vài con số; một nét
/// mặt là một bộ số, và đổi nét mặt là nội suy các số ấy (mắt đi trước, mày rồi miệng theo sau), không thay cả
/// mặt. Nét vẽ giữ nguyên của bản gốc: mày dựng từ đúng đường cong `eyebrow_left/right` (mực `#20242A`, dày 5),
/// miệng từ đúng góc / độ cong / độ dày của các miệng gốc; mí dùng chính mí của bản vẽ (`Options.blink`).
public struct KoaFaceRig: Sendable, Hashable {
  /// Mí trên khép 0 (mở hẳn) … 1 (nhắm), từng mắt.
  public var lidL = 0.0
  public var lidR = 0.0
  /// Mày nâng −1 (hạ) … 1 (nhướn), từng bên.
  public var browLiftL = 0.0
  public var browLiftR = 0.0
  /// Mày nghiêng: −1 đầu trong hạ (nhíu, quyết tâm, gồng) … 1 đầu trong nâng (lo, mệt, xin).
  public var browTiltL = 0.0
  public var browTiltR = 0.0
  /// Miệng: cười 1 … mếu −1.
  public var smile = 0.3
  /// Há 0 … 1.
  public var open = 0.0
  /// Rộng 0,75 (chúm, mím) … 1,3 (nhe).
  public var width = 1.0
  /// Lưỡi thè ra 0 … 1 (thở dốc).
  public var tongue = 0.0
  /// Răng 0 … 1 (nghiến).
  public var teeth = 0.0
  /// Giọt mồ hôi ở thái dương.
  public var sweat = 0.0

  public init(
    lid: Double = 0, browLift: Double = 0, browTilt: Double = 0, smile: Double = 0.3, open: Double = 0,
    width: Double = 1, tongue: Double = 0, teeth: Double = 0, sweat: Double = 0
  ) {
    lidL = lid; lidR = lid; browLiftL = browLift; browLiftR = browLift; browTiltL = browTilt; browTiltR = browTilt
    self.smile = smile; self.open = open; self.width = width; self.tongue = tongue; self.teeth = teeth
    self.sweat = sweat
  }

  // MARK: các nét mặt của màn nghỉ (bộ số; tiết chế như Duolingo: mở mắt to quá thì đọc thành "vui quá")

  /// Gồng rep cuối: mày nhíu hạ, mắt hơi híp, nghiến răng.
  public static let strain = KoaFaceRig(lid: 0.3, browLift: -0.35, browTilt: -0.85, smile: -0.15, open: 0.6, width: 1.3,
                                        teeth: 1, sweat: 1)
  /// Kiệt sức: mày lo, mí sụp nửa, há miệng thở, lưỡi thè, mồ hôi.
  public static let spent = KoaFaceRig(lid: 0.55, browLift: -0.15, browTilt: 0.65, smile: 0.05, open: 0.78, width: 1.05,
                                       tongue: 0.7, sweat: 1)
  /// Đã hồi sức: mày thả lỏng, mắt dịu, miệng cười khép.
  public static let rested = KoaFaceRig(lid: 0.22, browLift: 0, browTilt: 0.15, smile: 0.45)
  /// "Lại là mày à" (liếc cái tạ): một mày hạ, một mày nhích, mí khép nửa, môi mím lệch.
  public static var unimpressed: KoaFaceRig {
    var f = KoaFaceRig(lid: 0.45, smile: -0.35, width: 0.8)
    f.browLiftL = -0.45; f.browTiltL = -0.45
    f.browLiftR = 0.2; f.browTiltR = 0.1
    f.lidR = 0.38
    return f
  }
  /// Thở dài: mắt khép gần hết, mày lo, môi chu thổi hơi.
  public static let sigh = KoaFaceRig(lid: 0.7, browLift: 0.05, browTilt: 0.5, smile: -0.1, open: 0.22, width: 0.72)
  /// Ấm lên khi nhìn bạn: mày nhích lên, mí đẩy nhẹ, cười hé miệng.
  public static let warm = KoaFaceRig(lid: 0.28, browLift: 0.3, browTilt: 0.2, smile: 0.95, open: 0.22, width: 1.05)
  /// Cười dịu còn lại sau khi nhìn bạn.
  public static let content = KoaFaceRig(lid: 0.2, browLift: 0.1, browTilt: 0.1, smile: 0.6)
  /// Cân nhắc (nhìn tạ lần hai): mắt mở, mày bằng, miệng thẳng.
  public static let consider = KoaFaceRig(lid: 0.12, browLift: 0.05, browTilt: -0.1, smile: 0.05, width: 0.9)
  /// Quyết tâm: mày hạ thẳng, mắt mở hết, môi mím.
  public static let determined = KoaFaceRig(lid: 0.05, browLift: -0.3, browTilt: -0.6, smile: -0.05, width: 0.88)
  /// Chờ (tạm dừng): nhìn bạn, dịu.
  public static let waiting = KoaFaceRig(lid: 0.15, browLift: 0.1, browTilt: 0.05, smile: 0.35)
  /// Ngủ gật.
  public static let doze = KoaFaceRig(lid: 0.92, browLift: -0.05, browTilt: 0.3, smile: 0.15, open: 0.12, width: 0.8)

  // MARK: nội suy

  public enum Channel: CaseIterable, Sendable { case lids, brows, mouth }

  /// Nội suy từng kênh riêng: `k(channel)` 0 → 1.
  public static func mix(_ a: KoaFaceRig, _ b: KoaFaceRig, _ k: (Channel) -> Double) -> KoaFaceRig {
    func l(_ x: Double, _ y: Double, _ t: Double) -> Double { x + (y - x) * t }
    let e = k(.lids), w = k(.brows), m = k(.mouth)
    var f = a
    f.lidL = l(a.lidL, b.lidL, e); f.lidR = l(a.lidR, b.lidR, e)
    f.browLiftL = l(a.browLiftL, b.browLiftL, w); f.browLiftR = l(a.browLiftR, b.browLiftR, w)
    f.browTiltL = l(a.browTiltL, b.browTiltL, w); f.browTiltR = l(a.browTiltR, b.browTiltR, w)
    f.smile = l(a.smile, b.smile, m); f.open = l(a.open, b.open, m); f.width = l(a.width, b.width, m)
    f.tongue = l(a.tongue, b.tongue, m); f.teeth = l(a.teeth, b.teeth, m)
    f.sweat = l(a.sweat, b.sweat, e)
    return f
  }

  public static func mix(_ a: KoaFaceRig, _ b: KoaFaceRig, _ k: Double) -> KoaFaceRig { mix(a, b) { _ in k } }

  /// Một nét mặt đổi sang nét khác bắt đầu lúc `at` (ms), dài `ms`: mắt / mí đi trước, mày sau `stagger`, miệng
  /// sau `2 × stagger` (Richard Williams: mắt dẫn, mặt theo; nhân vật "nghĩ" trước khi đổi mặt).
  public struct Key: Sendable {
    public let at: Double
    public let face: KoaFaceRig
    public let ms: Double
    public init(_ at: Double, _ face: KoaFaceRig, ms: Double = 700) { self.at = at; self.face = face; self.ms = ms }
  }
  public static let stagger = 90.0

  /// Mặt lúc `t` theo dãy `keys` (tăng dần theo `at`). Trước key đầu: mặt của key đầu.
  public static func at(_ t: Double, _ keys: [Key]) -> KoaFaceRig {
    guard var face = keys.first?.face else { return KoaFaceRig() }
    for key in keys.dropFirst() {
      let from = face
      let order: [Channel: Double] = [.lids: 0, .brows: 1, .mouth: 2]
      let k: (Channel) -> Double = { c in
        KoaReaction.ease(min(1, max(0, (t - key.at - stagger * (order[c] ?? 0)) / key.ms)))
      }
      if t <= key.at { break }
      face = mix(from, key.face, k)
    }
    return face
  }

  // MARK: hình

  static let ink = "#20242A"

  /// Hai mày: mỗi mày là đường cong bậc hai của bản gốc (trái `M74 65 Q80.5 57.5 89 61`, phải đối xứng), đầu
  /// trong / đầu ngoài dời theo độ nâng và độ nghiêng.
  public func browPaths() -> [String] {
    func brow(_ lift: Double, _ tilt: Double, mirror: Bool) -> String {
      let up = -8 * lift
      var outer = (74.0, 65 + up + 3.5 * tilt), inner = (89.0, 61 + up - 9 * tilt)
      var ctrl = (80.5, 57.5 + up + 1.5 * tilt)
      if mirror { outer.0 = 240 - outer.0; inner.0 = 240 - inner.0; ctrl.0 = 240 - ctrl.0 }
      return "M\(f(outer.0)) \(f(outer.1)) Q\(f(ctrl.0)) \(f(ctrl.1)) \(f(inner.0)) \(f(inner.1))"
    }
    return [brow(browLiftL, browTiltL, mirror: false), brow(browLiftR, browTiltR, mirror: true)]
  }

  /// Miệng: đường môi trên đi qua hai khoé (theo độ cười), hé thì có lòng miệng tối, lưỡi, răng.
  public struct Mouth: Sendable, Hashable {
    /// Đường môi trên (nét mực).
    public let lip: String
    /// Lòng miệng (tô mực) khi há; `nil` khi khép.
    public let cavity: String?
    /// Lưỡi: tâm và bán kính elip.
    public let tongue: (cx: Double, cy: Double, rx: Double, ry: Double)?
    /// Dải răng trên.
    public let teeth: String?
    public static func == (a: Mouth, b: Mouth) -> Bool { a.lip == b.lip && a.cavity == b.cavity && a.teeth == b.teeth }
    public func hash(into h: inout Hasher) { h.combine(lip); h.combine(cavity); h.combine(teeth) }
  }

  public func mouth() -> Mouth {
    let cx = 120.0, half = 13 * width
    let corner = 133 - 4 * smile
    let up = 133 + 12 * smile
    let l = cx - half, r = cx + half
    let lip = "M\(f(l)) \(f(corner)) Q\(f(cx)) \(f(up)) \(f(r)) \(f(corner))"
    guard open > 0.02 else { return Mouth(lip: lip, cavity: nil, tongue: nil, teeth: nil) }
    let down = up + 42 * open
    let cavity = "M\(f(l)) \(f(corner)) Q\(f(cx)) \(f(up)) \(f(r)) \(f(corner)) Q\(f(cx)) \(f(down)) \(f(l)) \(f(corner)) Z"
    let yUp = 0.5 * corner + 0.5 * up, yDown = 0.5 * corner + 0.5 * down
    let h = max(0, yDown - yUp)
    var tongueShape: (Double, Double, Double, Double)?
    if open > 0.12 {
      let ry = min(6, h * 0.42) + 3.5 * tongue
      tongueShape = (cx, yDown - 0.75 * min(6, h * 0.42) + 7 * tongue, min(half * 0.62, 10), ry)
    }
    var teethPath: String?
    if teeth > 0.02 {
      let th = min(h * 0.55, 7) * teeth
      let li = l + 2.5, ri = r - 2.5
      let cy = corner + (up - corner) * 0.12
      teethPath = "M\(f(li)) \(f(cy)) Q\(f(cx)) \(f(up)) \(f(ri)) \(f(cy)) L\(f(ri)) \(f(cy + th)) Q\(f(cx)) \(f(up + 2 * th)) \(f(li)) \(f(cy + th)) Z"
    }
    return Mouth(lip: lip, cavity: cavity, tongue: tongueShape, teeth: teethPath)
  }

  private func f(_ v: Double) -> String {
    let r = (v * 100).rounded() / 100
    return r == r.rounded() ? String(Int(r)) : String(r)
  }
}
