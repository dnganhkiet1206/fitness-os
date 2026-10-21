// Nút viên dùng chung (15/10, audit toàn app): thay `.bordered` /
// `.borderedProminent` của hệ thống — hành động chính viên đen đặc, phụ viên viền
// mảnh (APP-CONSISTENCY.md: "Hành động chính: viên đen đặc; phụ: viên viền mảnh").
#if canImport(SwiftUI)
public import SwiftUI

public struct DSPillButtonStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  public enum Kind: Sendable { case primary, secondary }
  let kind: Kind
  @Environment(\.isEnabled) private var isEnabled

  public init(_ kind: Kind = .primary) { self.kind = kind }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(kind == .primary ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
      .padding(.horizontal, 16)
      .frame(minHeight: 40)
      .background {
        if kind == .primary {
          Capsule().fill(DS.Color.foreground.swiftUI)
        } else {
          Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1)
        }
      }
      .contentShape(Capsule())
      .frame(minHeight: 44)
      .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .animation(DSMotion.animation(.easeOut(duration: 0.12), reduceMotion: reduceMotion), value: configuration.isPressed)
  }
}

extension ButtonStyle where Self == DSPillButtonStyle {
  /// Viên đen đặc — hành động chính.
  public static var dsPill: DSPillButtonStyle { DSPillButtonStyle(.primary) }
  /// Viên viền mảnh — hành động phụ.
  public static var dsPillSecondary: DSPillButtonStyle { DSPillButtonStyle(.secondary) }
}
#endif
