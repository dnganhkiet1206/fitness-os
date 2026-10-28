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
/// - Có mạng: không có gì, trừ 2 giây "Đã gửi hết" sau khi hàng chờ lúc mất mạng
///   gửi xong (Kiệt duyệt phương án A 28/10).
struct ConnectionBanner: View {
  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// Có lần ghi nằm trong hàng chờ lúc mất mạng / đang kết nối lại → khi hàng chờ
  /// về 0 thì báo "Đã gửi hết". Ghi lúc có mạng (hàng chờ 1 → 0 trong tích tắc)
  /// không báo gì.
  @State private var waitedOffline = false
  @State private var showsSent = false

  var body: some View {
    let pending = services.sync.pendingCount
    Group {
      switch services.net.status {
      case .online:
        if showsSent {
          bar(tone: DS.Color.statusGood, symbol: "checkmark", title: String(localized: "net.sent"), sub: nil, offline: false)
        }
      case .offline:
        if pending > 0 {
          bar(tone: DS.Color.readinessYellow, symbol: "icloud.slash", title: String(localized: "net.offline.title"),
              sub: String(localized: "net.offline.pending \(pending)"), offline: true)
        } else {
          bar(tone: DS.Color.readinessYellow, symbol: "icloud.slash", title: String(localized: "net.offline"), sub: nil,
              offline: true)
        }
      case .reconnecting:
        bar(tone: DS.Color.metricBlue, symbol: nil,
            title: pending > 0 ? String(localized: "net.sending \(pending)") : String(localized: "net.reconnecting"),
            sub: nil, offline: false)
      }
    }
    .animation(DSMotion.animation(.easeInOut(duration: DSMotion.transitionDuration), reduceMotion: reduceMotion),
      value: services.net.status)
    .animation(DSMotion.animation(.easeInOut(duration: DSMotion.transitionDuration), reduceMotion: reduceMotion),
      value: showsSent)
    .onChange(of: pending, initial: true) { _, count in
      if count > 0, services.net.status != .online { waitedOffline = true }
      if count == 0, waitedOffline { sent() }
    }
    .onChange(of: services.net.status) { _, status in
      if status != .online, pending > 0 { waitedOffline = true }
    }
  }

  /// "Đã gửi hết" (Kiệt duyệt phương án A 28/10): hiện 2 giây rồi tắt.
  private func sent() {
    waitedOffline = false
    showsSent = true
    AccessibilityNotification.Announcement(String(localized: "net.sent")).post()
    Task {
      try? await Task.sleep(for: .seconds(2))
      showsSent = false
    }
  }

  /// Phương án A (Kiệt duyệt mock 28/10): dải là một hàng RIÊNG dưới thanh trạng
  /// thái (xếp trên app trong `ASCNDApp`, không phủ lên trang) — trang bị đẩy xuống,
  /// không còn đè chữ ASCND ở đầu Hôm nay. Có lần ghi đang chờ thì dòng thứ hai
  /// nói số ấy, vì "Xong" ở các thẻ chưa có nghĩa là đã lên server.
  private func bar(tone: DSColor, symbol: String?, title: String, sub: String?, offline: Bool) -> some View {
    HStack(spacing: 8) {
      if let symbol {
        Image(systemName: symbol)
          .font(.caption.weight(.semibold))
          .accessibilityHidden(true)
      } else {
        SpinningIcon(reduceMotion: reduceMotion)
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(DS.TextStyle.caption.weight(.semibold))
          .lineLimit(1)
        if let sub {
          Text(sub)
            .font(DS.TextStyle.caption)
            .opacity(0.8)
            .lineLimit(1)
        }
      }
      .frame(maxWidth: sub == nil ? nil : .infinity, alignment: .leading)
      if offline {
        Button {
          services.retryNetwork()
        } label: {
          Text(String(localized: "net.retry"))
            .font(DS.TextStyle.caption.weight(.bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .overlay(Capsule().strokeBorder(tone.swiftUI.opacity(0.5), lineWidth: 0.5))
            .contentShape(Rectangle().inset(by: -10))
        }
        .buttonStyle(.plain)
      }
    }
    .foregroundStyle(tone.swiftUI)
    .padding(.horizontal, 14)
    .padding(.top, 4)
    .padding(.bottom, 6)
    .frame(maxWidth: .infinity)
    .background(alignment: .bottom) {
      tone.swiftUI.opacity(0.35).frame(height: 0.5)
    }
    .background(tone.swiftUI.opacity(0.14), ignoresSafeAreaEdges: .top)
    // Nền đặc dưới lớp màu: nền trang (gradient Hôm nay) không lộ qua chữ.
    .background(DS.Color.background.swiftUI, ignoresSafeAreaEdges: .top)
    // Có nút thì giữ nó là một điểm dừng riêng; không thì đọc một câu.
    .accessibilityElement(children: offline ? .contain : .combine)
    .transition(.opacity)
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
