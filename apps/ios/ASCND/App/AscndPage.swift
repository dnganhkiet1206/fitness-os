import ASCNDDesignSystem
import SwiftUI

extension View {
  /// Nền giấy ấm của ASCND (`DS.Color.background`, #f7f4ef / #070708) cho một
  /// màn: phủ cả vùng an toàn, và ẩn nền mặc định của List / Form / ScrollView
  /// để không còn màn nào nền trắng hệ thống (chủ dự án, 2026-10-12). Thẻ và
  /// hàng giữ nền riêng của chúng nên vẫn tách khỏi trang.
  ///
  /// Màn đẩy vào một `NavigationStack` không thừa hưởng nền của màn gốc
  /// (`containerBackground` cũng không), nên mỗi màn tự gọi.
  func ascndPage() -> some View {
    scrollContentBackground(.hidden)
      .background { WarmPaper() }
  }
}

/// Giấy ấm — MỘT nền cho mọi màn (13/10, chủ dự án: "màu giấy ấm bị mất"):
/// giấy `DS.Color.background` + một quầng cam rất nhạt cố định ở đầu trang.
/// Cố định, không đổi theo việc kế tiếp hay theo tab — để không còn "chỗ có
/// chỗ không". Reduce Transparency: giấy phẳng.
struct WarmPaper: View {
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    ZStack(alignment: .top) {
      DS.Color.background.swiftUI
      if !reduceTransparency {
        GeometryReader { geo in
          Ellipse()
            .fill(DS.Color.metricOrangeGraphic.swiftUI.opacity(scheme == .dark ? 0.14 : 0.13))
            .frame(width: geo.size.width * 1.4, height: geo.size.height * 0.6)
            .position(x: geo.size.width * 0.5, y: geo.size.height * 0.05)
            .blur(radius: 100)
        }
      }
    }
    .ignoresSafeArea()
    .accessibilityHidden(true)
  }
}
