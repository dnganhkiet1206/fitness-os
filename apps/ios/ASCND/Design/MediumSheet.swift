import SwiftUI

/// Sheet nửa màn chịu được chữ cỡ trợ năng (#795 đợt 2b, kiểm accessibility 03/11).
///
/// `.presentationDetents([.medium])` cắt nội dung khi chữ ở cỡ trợ năng: sheet Tạm nghỉ ở
/// `accessibility3` cao ~700 điểm (ảnh chuẩn `pauseSheet.largeType`), detent medium ~440 — nút
/// "Bắt đầu nghỉ" nằm dưới mép màn, không chạm được. Cỡ trợ năng thì mở `.large`; nội dung vẫn
/// cao hơn màn thì cuộn được. Cỡ chữ thường: như cũ (`.medium`, bố cục không đổi).
struct MediumSheet: ViewModifier {
  @Environment(\.dynamicTypeSize) private var typeSize

  func body(content: Content) -> some View {
    ViewThatFits(in: .vertical) {
      content
      ScrollView { content }
    }
    .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium])
  }
}

extension View {
  /// Sheet nửa màn; chữ cỡ trợ năng thì cả màn và cuộn được (xem `MediumSheet`).
  func mediumSheet() -> some View { modifier(MediumSheet()) }
}
