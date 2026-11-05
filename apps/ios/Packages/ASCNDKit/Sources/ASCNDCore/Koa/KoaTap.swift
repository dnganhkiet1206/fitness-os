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

  /// Câu và tiếng theo số lần chạm liền nhau (`streak`: 0 = lần đầu sau một lúc): mấy lần đầu Koa chỉ
  /// vui nhẹ, bấm mũi lần thứ ba trở đi mới phụng phịu "no no no" (Kiệt 04/11: gần gũi, không khó tính).
  public static func reaction(_ zone: Zone, streak: Int) -> (topic: KoaTalk.Topic, voice: String) {
    if zone == .nose { return streak >= 2 ? (.pokeNose, "nonono") : (.pokeFace, "hehe") }
    return (zone.topic, zone.voice)
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

  /// Chỗ chạm theo vị trí THẬT của các bộ phận ở dáng đang vẽ (`KoaRender.anchors`) — đúng cả khi Koa
  /// ngồi, nghiêng đầu, quay người, đang đi (Kiệt 04/11: chạm ở tư thế khác bị nhận sai). Vùng co giãn
  /// theo cỡ đầu; tai trái lấy đối xứng tai phải qua trục đỉnh đầu — mũi.
  public static func zone(x: Double, y: Double, anchors a: [String: (x: Double, y: Double)]) -> Zone {
    guard let nose = a["nose"], let head = a["head_front"], let ear = a["ear_right"], let top = a["head_top_fur"] else {
      return zone(x: x, y: y)
    }
    func d(_ p: (x: Double, y: Double)) -> Double { hypot(x - p.x, y - p.y) }
    let s = max(0.3, hypot(ear.x - head.x, ear.y - head.y) / 86)
    // phản chiếu tai phải qua đường đỉnh đầu → mũi
    let ax = nose.x - top.x, ay = nose.y - top.y, len = max(hypot(ax, ay), 1e-6)
    let ux = ax / len, uy = ay / len
    let vx = ear.x - top.x, vy = ear.y - top.y, along = vx * ux + vy * uy
    let left = (x: top.x + 2 * along * ux - vx, y: top.y + 2 * along * uy - vy)
    if d(nose) < 20 * s { return .nose }
    if min(d(ear), d(left)) < 34 * s { return .ear }
    if d(top) < 30 * s { return .head }
    if d(head) < 64 * s { return .face }
    if let belly = a["belly"], d(belly) < 44 * s { return .belly }
    if let feet = a["LEGS"], y > feet.y - 18 * s { return .feet }
    return .body
  }

  /// Chỗ chạm theo điểm trong khung hình rộng `width` (cao `width × 1,25`, như `KoaMath.aspect`).
  public static func zone(at point: (x: Double, y: Double), width: Double) -> Zone {
    guard width > 0 else { return .body }
    return zone(x: point.x / width * 240, y: point.y / (width * KoaMath.aspect) * 300)
  }
}
