// Motion helper — C (#386).
//
// Helper nhất quán cho Reduce Motion:
// - DSMotion.animation(_:) trả về nil khi Reduce Motion bật
// - Dùng cho mọi animation/transition trong app.
#if canImport(SwiftUI)
public import SwiftUI

/// Policy animation của ASCND.
public enum DSMotion {
  /// Animation có tôn trọng Reduce Motion.
  /// - Parameter animation: animation muốn dùng
  /// - Parameter reduceMotion: từ @Environment(\.accessibilityReduceMotion)
  /// - Returns: nil nếu reduceMotion=true, ngược lại animation
  public static func animation(
    _ animation: Animation,
    reduceMotion: Bool
  ) -> Animation? {
    reduceMotion ? nil : animation
  }

  /// Duration chuẩn cho transitions.
  public static let transitionDuration: Double = 0.25

  /// Duration chuẩn cho press states.
  public static let pressDuration: Double = 0.1
}

// MARK: - View extension

extension View {
  /// Animation có tôn trọng Reduce Motion.
  public func dsAnimation(
    _ animation: Animation,
    value: some Equatable,
    reduceMotion: Bool
  ) -> some View {
    self.animation(
      DSMotion.animation(animation, reduceMotion: reduceMotion),
      value: value
    )
  }
}
#endif
