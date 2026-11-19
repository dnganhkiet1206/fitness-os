import ASCNDCore
import UIKit

/// Phát rung của kịch bản Koa (KOA-T15). Bộ tạo rung dựng MỘT lần (không tạo mỗi khung —
/// `fire()` chạy theo dòng thời gian). Rung của Koa mềm (`.soft`, cường độ thấp); "thành công"
/// chỉ ở mốc hiếm đã duyệt (xong set, kỷ lục, lượt mình, xong buổi).
@MainActor
enum KoaHapticPlayer {
  private static let soft = UIImpactFeedbackGenerator(style: .soft)
  private static let heavy = UIImpactFeedbackGenerator(style: .rigid)
  private static let notify = UINotificationFeedbackGenerator()

  /// Lần cuối màn nghỉ rung nhịp "LƯỢT MÌNH!" — rung "hết giờ" toàn cục (`onRestFinished`)
  /// bỏ qua nếu vừa rung, để không rung đôi.
  private(set) static var lastRestGo: Date?

  static func play(_ h: KoaReaction.Haptic, restGo: Bool = false) {
    switch h {
    case .none: return
    case .soft: soft.impactOccurred(intensity: 0.6)
    case .heavy: heavy.impactOccurred(intensity: 0.8)
    case .success: notify.notificationOccurred(.success)
    }
    if restGo { lastRestGo = Date() }
  }

  /// Rung "hết giờ nghỉ" toàn cục: bỏ qua khi màn nghỉ vừa rung nhịp đi (trong 5 giây).
  static func restFinished() {
    if let last = lastRestGo, Date().timeIntervalSince(last) < 5 { return }
    notify.notificationOccurred(.success)
  }
}
