import Foundation

/// Koa phản ứng khi chạm (#527, 23/10 — không có ở RN; theo trang hỗ trợ Kiệt thích):
/// nhảy lên rồi đáp, hai tai giật, lông mày nhướn. Mỗi cử động là một ma trận
/// CỘNG vào hoạt ảnh gốc theo id / cờ của lớp, như `restMat` và cái liếc — bản
/// vẽ không đổi.
extension KoaMath {
  /// Một lần chạm: `ms` đã qua kể từ lúc chạm; `lift` là lông mày đang nhướn
  /// (0 → 1) khi ngón tay còn đặt trên Koa.
  ///
  /// Có `Poke` (kể cả rỗng) là Koa lớn đang "sống": tai trong theo tai ngoài, tai
  /// thỉnh thoảng giật, chớp mắt có nét mi.
  public struct Poke: Sendable, Hashable {
    public var ms: Double?
    public var lift: Double
    /// Hướng nhìn ngang (−1…1, đã nhân độ mạnh): hai tai nghiêng theo.
    public var lean: Double
    public init(ms: Double? = nil, lift: Double = 0, lean: Double = 0) {
      self.ms = ms
      self.lift = lift
      self.lean = lean
    }
  }

  /// Độ dài cú nhảy; tai giật sau `earDelay`, trong `earDur`.
  public static let hopDur = 900.0
  public static let earDelay = 100.0
  public static let earDur = 700.0
  /// Chân Koa (bóng đổ): gốc của cú nhảy.
  static let floor = (120.0, 294.0)
  /// Gốc tai: gần chân tai, phía trong đầu.
  static let earPivotL = (78.0, 96.0)
  static let earPivotR = (162.0, 96.0)
  /// Tai giật một mình: mỗi `twitchPeriod`, lệch `twitchAt`, trong `twitchDur`; trái / phải xen kẽ.
  public static let twitchPeriod = 6400.0
  public static let twitchAt = 3000.0
  public static let twitchDur = 420.0
  static let twitchFrames: [(Double, Double)] = [(0, 0), (0.3, 9), (0.6, -3), (1, 0)]
  /// Tai nghiêng theo hướng nhìn, độ.
  public static let earLean = 5.0
  /// Mọi kiểu lông mày (`browArc`, `browRaised`, …) — nhướn cùng nhau.
  public static let browConds: Set<String> = ["browArc", "browRaised", "browSad", "browAngry", "browStrain"]
  public static let browRise = 3.0

  /// Khung của cú nhảy: (vị trí, dịch lên, co ngang, co dọc). Nén → bật → đáp → nảy.
  static let hopFrames: [(Double, Double, Double, Double)] = [
    (0, 0, 1, 1), (0.18, 0, 1.05, 0.93), (0.45, -18, 0.97, 1.05), (0.72, 0, 1.06, 0.92), (0.86, 0, 0.99, 1.01),
    (1, 0, 1, 1),
  ]
  static let earFrames: [(Double, Double)] = [(0, 0), (0.35, 14), (0.65, -6), (1, 0)]

  /// `ms` → ma trận quanh chân; ngoài cú nhảy là `nil`.
  public static func hopMat(_ ms: Double) -> Mat? {
    guard ms >= 0, ms < hopDur else { return nil }
    let (i, j, f) = span(hopFrames.map(\.0), ms / hopDur, "io")
    let a = hopFrames[i], b = hopFrames[j]
    let ty = a.1 + (b.1 - a.1) * f, sx = a.2 + (b.2 - a.2) * f, sy = a.3 + (b.3 - a.3) * f
    let (ox, oy) = floor
    return [sx, 0, 0, sy, ox - sx * ox, oy - sy * oy + ty]
  }

  /// Độ cao của cú nhảy, 0 → 1 (bóng đổ thu lại khi Koa lên cao).
  public static func hopRise(_ ms: Double) -> Double {
    guard let m = hopMat(ms) else { return 0 }
    return min(1, max(0, -(m[5] - (floor.1 - m[3] * floor.1)) / 18))
  }

  /// Tai giật: tai trái quay ra ngoài (âm), tai phải đối xứng.
  public static func earMat(left: Bool, _ ms: Double) -> Mat? {
    let e = ms - earDelay
    guard e >= 0, e < earDur else { return nil }
    let (i, j, f) = span(earFrames.map(\.0), e / earDur, "io")
    let deg = (earFrames[i].1 + (earFrames[j].1 - earFrames[i].1) * f) * (left ? -1 : 1)
    let (cx, cy) = left ? earPivotL : earPivotR
    return place(deg, cx, cy, 0, 0)
  }

  /// Tai giật lúc rảnh: góc (độ, dương = ra ngoài) của tai này ở `t`, 0 ngoài lúc giật.
  public static func twitch(left: Bool, _ t: Double) -> Double {
    let e = t - twitchAt
    guard e >= 0 else { return 0 }
    let n = (e / twitchPeriod).rounded(.down)
    guard (Int(n) % 2 == 0) == left else { return 0 }
    let r = e - n * twitchPeriod
    guard r < twitchDur else { return 0 }
    let (i, j, f) = span(twitchFrames.map(\.0), r / twitchDur, "io")
    return twitchFrames[i].1 + (twitchFrames[j].1 - twitchFrames[i].1) * f
  }

  /// Một tai ở `t`: giật khi chạm · nghiêng theo hướng nhìn · giật lúc rảnh, quanh chân tai.
  /// Tai trong (`inner`) còn theo hoạt ảnh gốc của tai ngoài (`koaEarL/R`) — bản gốc
  /// chỉ lắc tai ngoài, tai trong đứng yên lệch khỏi nó.
  public static func earMat(left: Bool, inner: Bool, _ p: Poke, t: Double) -> Mat? {
    let side = left ? -1.0 : 1.0
    let deg = side * twitch(left: left, t) + earLean * p.lean
    var m: Mat? = deg == 0 ? nil : place(deg, left ? earPivotL.0 : earPivotR.0, left ? earPivotL.1 : earPivotR.1, 0, 0)
    if let f = p.ms.flatMap({ earMat(left: left, $0) }) { m = m.map { mul(f, $0) } ?? f }
    if inner, let track = KoaScene.keyframes[left ? "koaEarL" : "koaEarR"]?.tf, !track.isEmpty {
      let o: (Double, Double) = left ? (62, 92) : (178, 92)
      let idle = sampleMat(track, t.truncatingRemainder(dividingBy: 3600) / 3600, "io", o.0, o.1)
      if idle != identity { m = m.map { mul($0, idle) } ?? idle }
    }
    return m
  }

  /// Nét mi khi chớp (Koa lớn): mi (`koaBlink`, `koaBlink2`) là mảng lông trượt xuống
  /// che mắt — lúc khép hết mắt biến mất trơn. Hiện một nét mi cong khi mi gần khép.
  public static let blinkAnims: Set<String> = ["koaBlink", "koaBlink2"]
  public static let lashPaths = ["M67 104 Q82 113 97 104", "M143 104 Q158 113 173 104"]
  public static let lashWidth = 3.4

  /// Độ hiện của nét mi theo độ khép của mi (`scaleY`, 0 → 1).
  public static func lashOpacity(_ lid: Double) -> Double { min(1, max(0, (lid - 0.55) / 0.35)) }

  /// Lông mày nhướn khi chạm: lên nhanh, xuống chậm, hết trong cú nhảy.
  public static func browLift(_ ms: Double) -> Double {
    guard ms >= 0, ms < hopDur else { return 0 }
    let t = ms / hopDur
    return t < 0.2 ? ease(t / 0.2, "out") : 1 - ease((t - 0.2) / 0.8, "io")
  }

  /// Ma trận phản ứng của một lớp (theo id, hoặc theo cờ với lông mày), `nil` = không cử động.
  public static func pokeMat(id: String?, cond: String?, _ p: Poke, t: Double = 0) -> Mat? {
    switch id {
    case "POSERIG": return p.ms.flatMap(hopMat)
    case "ear_left", "ear_left_inner": return earMat(left: true, inner: id == "ear_left_inner", p, t: t)
    case "ear_right", "ear_right_inner": return earMat(left: false, inner: id == "ear_right_inner", p, t: t)
    case "shadow":
      guard let ms = p.ms else { return nil }
      let k = 1 - 0.22 * hopRise(ms)
      if k >= 1 { return nil }
      return [k, 0, 0, k, floor.0 * (1 - k), floor.1 * (1 - k)]
    default: break
    }
    guard let cond, browConds.contains(cond) else { return nil }
    let k = max(p.lift, p.ms.map(browLift) ?? 0)
    return k > 0 ? [1, 0, 0, 1, 0, -browRise * k] : nil
  }
}
