import ASCNDCore
import SwiftUI

extension EnvironmentValues {
  /// Đơn vị tạ của tài khoản đang đăng nhập (#527 1.9-A, `useUnits().weight`).
  /// `SignedInScope` đặt theo `profiles.units_weight`; ngoài phiên (preview,
  /// Lab không qua phiên) là kg — như RN khi hồ sơ chưa nạp.
  @Entry var weightUnit: WeightUnit = .kg
}
