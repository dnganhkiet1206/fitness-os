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
      .background(DS.Color.background.swiftUI.ignoresSafeArea())
  }
}
