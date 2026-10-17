import ASCNDDesignSystem
import SwiftUI

/// Nút ghi của nhóm Cơ thể: viên nang mực, chữ giấy, "+" ở đầu — cùng dáng nút
/// "Ghi cân nặng" của `WeightTrendCard`.
struct BodyLogButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: "plus")
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 50)
        .background(Capsule().fill(DS.Color.foreground.swiftUI))
    }
    .buttonStyle(TodayPressStyle())
  }
}

/// Nút "+" trên thanh điều hướng của màn Cơ thể — như "+" của
/// `ProgressPhotosView` (vùng chạm 44 pt).
struct BodyLogToolbarButton: ToolbarContent {
  let label: String
  let action: () -> Void

  var body: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button(action: action) {
        Image(systemName: "plus").frame(minWidth: 44, minHeight: 44)
      }
      .accessibilityLabel(Text(label))
    }
  }
}
