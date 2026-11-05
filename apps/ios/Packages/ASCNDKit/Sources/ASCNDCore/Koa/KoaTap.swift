import Foundation

/// Chạm vào Koa theo CHỖ chạm (Kiệt 04/11: "thay vì nhảy lên, Koa phải thể hiện cảm xúc theo từng
/// vị trí chạm"): chọc một cái (giật mình nhẹ, không nhảy), rồi nét mặt của chỗ ấy, rồi nói một câu
/// kèm tiếng "nói" của koala kiểu mèo Tom (`koa-v-*`, `tools/koa-sound/koala.py`).
///
/// Toạ độ là của hình Koa (240 × 300, như `KoaScene`): đầu tâm ~(120, 110), tai ~(62, 100) và
/// (178, 100), mũi ~(120, 134), bụng ~(120, 220), chân dưới y 270.
public enum KoaTap {
  public enum Zone: String, Sendable, Hashable, CaseIterable {
    case head, ear, nose, face, belly, feet, body

    /// Câu của chỗ này (`KoaTalk.face` cho nét mặt).
    public var topic: KoaTalk.Topic {
      switch self {
      case .head: .pokeHead
      case .ear: .pokeEar
      case .nose: .pokeNose
      case .face: .pokeFace
      case .belly: .pokeBelly
      case .feet: .pokeFeet
      case .body: .poke
      }
    }

    /// Tiếng "nói" của koala cho chỗ này (`koa-v-<voice>.wav`).
    public var voice: String {
      switch self {
      case .head: "mmm"
      case .ear: "oi"
      case .nose: "nonono"
      case .face: "hehe"
      case .belly: "giggle"
      case .feet: "ui"
      case .body: "hm"
      }
    }
  }

  /// Chỗ chạm, toạ độ của hình (240 × 300).
  /// Đo trên máy 04/11: mặt (`FACE`) dời xuống 11 điểm, mũi ở y ≈ 134 của hình.
  public static func zone(x: Double, y: Double) -> Zone {
    if y > 270 { return .feet }
    if y < 140, x < 74 || x > 166 { return .ear }
    if abs(x - 120) < 20, y > 112, y < 150 { return .nose }
    if y < 72 { return .head }
    if y < 172 { return .face }
    if abs(x - 120) < 50 { return .belly }
    return .body
  }

  /// Chỗ chạm theo điểm trong khung hình rộng `width` (cao `width × 1,25`, như `KoaMath.aspect`).
  public static func zone(at point: (x: Double, y: Double), width: Double) -> Zone {
    guard width > 0 else { return .body }
    return zone(x: point.x / width * 240, y: point.y / (width * KoaMath.aspect) * 300)
  }
}
