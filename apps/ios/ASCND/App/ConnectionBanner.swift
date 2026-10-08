import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Dải trạng thái kết nối ghim dưới thanh trạng thái (#527 · 1.11), port của
/// `components/ascnd/connection-banner.tsx`.
///
/// - Mất mạng: màu vàng readiness, biểu tượng mây gạch, nút "Thử lại" (ĐO lại
///   mạng, không tự tuyên bố đã có — `AppServices.retryNetwork`). Đây là trạng
///   thái duy nhất người dùng tự thoát ra được, nên nó nhận chạm.
/// - Đang kết nối lại: màu xanh metric, vòng quay (đứng yên khi Reduce
///   Motion), KHÔNG có nút — app đang làm đúng việc ấy rồi; dải không nuốt chạm
///   của trang bên dưới.
/// - Có mạng: không có gì.
struct ConnectionBanner: View {
  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Group {
      switch services.net.status {
      case .online:
        EmptyView()
      case .offline:
        bar(tone: DS.Color.readinessYellow, text: String(localized: "net.offline"), offline: true)
      case .reconnecting:
        bar(tone: DS.Color.metricBlue, text: String(localized: "net.reconnecting"), offline: false)
      }
    }
    .animation(DSMotion.animation(.easeInOut(duration: DSMotion.transitionDuration), reduceMotion: reduceMotion),
      value: services.net.status)
  }

  private func bar(tone: DSColor, text: String, offline: Bool) -> some View {
    HStack(spacing: 6) {
      if offline {
        Image(systemName: "icloud.slash")
          .font(.caption2.weight(.semibold))
          .accessibilityHidden(true)
      } else {
        SpinningIcon(reduceMotion: reduceMotion)
      }
      Text(text)
        .font(DS.TextStyle.caption.weight(.semibold))
        .lineLimit(1)
      if offline {
        Button {
          services.retryNetwork()
        } label: {
          Text(String(localized: "net.retry"))
            .font(DS.TextStyle.caption.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .overlay(Capsule().strokeBorder(tone.swiftUI.opacity(0.4), lineWidth: 0.5))
            // Vùng chạm lớn ra, ô chữ thì không: dải nằm ngay dưới thanh trạng
            // thái, mỗi điểm cao thêm là một điểm đẩy trang xuống.
            .contentShape(Rectangle().inset(by: -12))
        }
        .buttonStyle(.plain)
      }
    }
    .foregroundStyle(tone.swiftUI)
    .padding(.horizontal, 12)
    .padding(.top, 4)
    .padding(.bottom, 6)
    .frame(maxWidth: .infinity)
    .background(alignment: .bottom) {
      tone.swiftUI.opacity(0.35).frame(height: 0.5)
    }
    .background(tone.swiftUI.opacity(0.14), ignoresSafeAreaEdges: .top)
    // Có nút thì giữ nó là một điểm dừng riêng; không thì đọc một câu.
    .accessibilityElement(children: offline ? .contain : .combine)
    .transition(.opacity)
    .allowsHitTesting(offline)
  }
}

/// Vòng quay của "đang kết nối lại" — quay đều để nói "đang có việc chạy";
/// Reduce Motion thì đứng yên, dòng chữ bên cạnh đã nói đủ.
private struct SpinningIcon: View {
  let reduceMotion: Bool
  @State private var spinning = false

  var body: some View {
    Image(systemName: "arrow.clockwise")
      .font(.caption2.weight(.semibold))
      .rotationEffect(.degrees(spinning ? 360 : 0))
      .animation(reduceMotion ? nil : .linear(duration: 1.1).repeatForever(autoreverses: false), value: spinning)
      .onAppear { spinning = !reduceMotion }
      .onChange(of: reduceMotion) { _, reduce in spinning = !reduce }
      .accessibilityHidden(true)
  }
}
