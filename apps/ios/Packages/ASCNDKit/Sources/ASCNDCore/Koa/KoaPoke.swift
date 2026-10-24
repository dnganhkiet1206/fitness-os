import Foundation

/// Koa phản ứng khi chạm (#527, 23/10 — không có ở RN; theo trang hỗ trợ Kiệt thích):
/// nhảy lên rồi đáp, hai tai giật, lông mày nhướn. Mỗi cử động là một ma trận
/// CỘNG vào hoạt ảnh gốc theo id / cờ của lớp, như `restMat` và cái liếc — bản
/// vẽ không đổi.
extension KoaMath {
  /// Một lần chạm: `ms` đã qua kể từ lúc chạm; `lift` là lông mày đang nhướn
  /// (0 → 1) khi ngón tay còn đặt trên Koa.
  public struct Poke: Sendable, Hashable {
    public var ms: Double?
    public var lift: Double
    public init(ms: Double? = nil, lift: Double = 0) {
      self.ms = ms
      self.lift = lift
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

  /// Lông mày nhướn khi chạm: lên nhanh, xuống chậm, hết trong cú nhảy.
  public static func browLift(_ ms: Double) -> Double {
    guard ms >= 0, ms < hopDur else { return 0 }
    let t = ms / hopDur
    return t < 0.2 ? ease(t / 0.2, "out") : 1 - ease((t - 0.2) / 0.8, "io")
  }

  /// Ma trận phản ứng của một lớp (theo id, hoặc theo cờ với lông mày), `nil` = không cử động.
  public static func pokeMat(id: String?, cond: String?, _ p: Poke) -> Mat? {
    switch id {
    case "POSERIG": return p.ms.flatMap(hopMat)
    case "ear_left", "ear_left_inner": return p.ms.flatMap { earMat(left: true, $0) }
    case "ear_right", "ear_right_inner": return p.ms.flatMap { earMat(left: false, $0) }
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
