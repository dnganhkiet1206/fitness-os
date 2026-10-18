import ASCNDCore
import CoreMotion
import Foundation

/// Bước chân từ cảm biến chuyển động của iPhone (18/10, chủ dự án: không bắt người
/// dùng dùng thêm Apple Health). Chỉ dùng khi KHÔNG kết nối Health; quyền "Chuyển
/// động & thể chất" chỉ hỏi khi người dùng bật ở Cài đặt.
final class PedometerSource: @unchecked Sendable {
  private let pedometer = CMPedometer()

  var isAvailable: Bool { CMPedometer.isStepCountingAvailable() }
  var authorized: Bool { CMPedometer.authorizationStatus() == .authorized }

  /// Bước từ nửa đêm hôm nay tới giờ; `nil` khi không đọc được (chưa có quyền…).
  /// Lần gọi đầu là lúc hệ thống hỏi quyền.
  func todaySteps() async -> Int? {
    guard isAvailable else { return nil }
    let start = Calendar.current.startOfDay(for: Date())
    return await withCheckedContinuation { cont in
      pedometer.queryPedometerData(from: start, to: Date()) { data, error in
        cont.resume(returning: error == nil ? data.map { $0.numberOfSteps.intValue } : nil)
      }
    }
  }
}
