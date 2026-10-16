import ASCNDDesignSystem
import SwiftUI

/// Nền của mọi ô chat trong app — Koa Coach, nhắn tin, bình luận (16/10, chủ dự
/// án: "ô chat hãy dùng liquid glass có fallback cho thiết bị iOS cũ"). Một viên
/// nổi chứa ô chữ và nút gửi: kính iOS 26 (tương tác — sáng lên khi chạm), vật
/// liệu mờ + viền mảnh ở iOS 18–25.
private struct GlassComposer: ViewModifier {
  let radius: CGFloat

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    if #available(iOS 26, *) {
      content.glassEffect(.regular.interactive(), in: shape)
    } else {
      content
        .background(.regularMaterial, in: shape)
        .overlay { shape.strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75) }
    }
  }
}

extension View {
  /// Viên kính của ô chat. `radius` ≈ nửa chiều cao một dòng để giữ dáng viên
  /// khi ô chữ giãn nhiều dòng.
  func glassComposer(radius: CGFloat = 24) -> some View { modifier(GlassComposer(radius: radius)) }
}
