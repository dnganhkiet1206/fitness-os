import SwiftUI
import UIKit

extension View {
  /// Qua nửa đêm (hay đổi múi giờ / giờ mùa hè) lúc app ĐANG MỞ trên màn.
  ///
  /// `scenePhase` không đổi khi người dùng cứ để app mở qua 0 giờ, nên các
  /// chỗ chỉ đổi ngày lúc "ra tiền cảnh" giữ nguyên số của hôm qua (24/10,
  /// chủ dự án). iOS báo `significantTimeChangeNotification` đúng lúc sang
  /// ngày; app đang ở nền thì nó tới khi quay lại.
  func onNewDay(perform action: @escaping () -> Void) -> some View {
    onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
      action()
    }
  }
}
