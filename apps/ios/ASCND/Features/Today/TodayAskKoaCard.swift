import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ ảnh "Hỏi Koa" ở Hôm nay (Kiệt 21/10, thiết kế của Kiệt): lối vào Koa Coach riêng,
/// tách khỏi thẻ Insight. Chạm thẻ (hay nút ›) mở cuộc trò chuyện. Thanh ghi bằng AI
/// "Kể cho Koa hôm nay…" ở lại thẻ "Hôm nay của bạn" (Kiệt 21/10: tách ra).
struct TodayAskKoaCard: View {
  /// KOA-T08: vì sao Koa chưa hỏi được — thẻ hiện giữ chỗ có lý do + chạm để dò lại.
  enum Unavailable { case offline, unhealthy }

  var unavailable: Unavailable? = nil
  var checking = false
  let onAsk: () -> Void

  init(onAsk: @escaping () -> Void) { self.onAsk = onAsk }

  init(unavailable: Unavailable, checking: Bool, onRetry: @escaping () -> Void) {
    self.unavailable = unavailable
    self.checking = checking
    self.onAsk = onRetry
  }

  /// Màu bàn tối ở đáy hình — ảnh tan vào màu này, chữ nằm trên đó.
  private static let ink = Color(red: 0.09, green: 0.10, blue: 0.16)

  var body: some View {
    Button(action: onAsk) {
      // Ảnh phủ hết bề ngang (hơi phóng), tan dần vào nền tối; chữ đặt lên ảnh trên lớp
      // gradient (Kiệt 21/10: khác Apple Health một chút). Nền luôn tối nên chữ luôn trắng.
      // Thẻ gọn theo chiều dọc (Kiệt 17/11): cao 272 thay vì 340, ảnh 200 thay vì
      // 250 — chữ giữ nguyên, chỉ bớt phần ảnh phía trên. Điểm tan của gradient
      // dời lên theo để phần chữ vẫn nằm trên nền tối như trước.
      Self.ink
        .frame(maxWidth: .infinity)
        .frame(height: 272)
        .overlay(alignment: .top) {
          Image("AskKoaScene")
            .resizable()
            .scaledToFill()
            .frame(height: 200)
            .frame(maxWidth: .infinity)
            .clipped()
            .saturation(unavailable == nil ? 1 : 0.2)
            .opacity(unavailable == nil ? 1 : 0.5)
            .accessibilityHidden(true)
        }
        .overlay {
          LinearGradient(
            stops: [
              .init(color: Self.ink.opacity(0), location: 0.28),
              .init(color: Self.ink.opacity(0.8), location: 0.52),
              .init(color: Self.ink, location: 0.66),
            ],
            startPoint: .top, endPoint: .bottom)
        }
        // Lớp tối thêm sau phần chữ (Kiệt 21/10) cho chữ trắng nổi rõ.
        .overlay {
          LinearGradient(
            stops: [
              .init(color: .black.opacity(0), location: 0.30),
              .init(color: .black.opacity(0.55), location: 0.64),
              .init(color: .black.opacity(0.7), location: 1),
            ],
            startPoint: .top, endPoint: .bottom)
        }
        .overlay(alignment: .bottomLeading) {
          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center) {
              Text("askkoa.kicker")
                .font(DS.TextStyle.footnote.weight(.semibold))
                .textCase(.uppercase)
                .tracking(2)
                .foregroundStyle(.white.opacity(0.7))
              Spacer(minLength: 0)
            }
            Text("askkoa.title")
              .font(.title.bold())
              .tracking(-0.4)
              .foregroundStyle(.white)
              .fixedSize(horizontal: false, vertical: true)
            if let unavailable {
              Label(
                unavailable == .offline ? "askkoa.unavailable.offline" : "askkoa.unavailable.unhealthy",
                systemImage: unavailable == .offline ? "wifi.exclamationmark" : "exclamationmark.triangle")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            } else {
              Text("askkoa.subtitle")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(DS.Spacing.md + 4)
        }
        // Nút › nổi trên ảnh, nền tối mờ phía sau để luôn đọc được (Kiệt 21/10).
        .overlay(alignment: .topTrailing) {
          if unavailable != nil {
            // Giữ chỗ: nút "Thử lại" (đang dò thì "Đang kiểm tra…") thay cho ›.
            HStack(spacing: 6) {
              if checking {
                ProgressView().tint(.white).controlSize(.small)
                Text("askkoa.checking")
              } else {
                Image(systemName: "arrow.clockwise")
                Text("common.retry")
              }
            }
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(.black.opacity(0.45), in: Capsule())
            .padding(DS.Spacing.md)
          } else {
            Image(systemName: "chevron.right")
              .font(.system(.callout, weight: .semibold))
              .foregroundStyle(.white)
              .frame(width: 44, height: 44)
              // Vòng tối trong, không kính (Kiệt 22/10).
              .background(.black.opacity(0.45), in: Circle())
              // Bóng mờ quanh nút để tách khỏi bóng chat phía sau (Kiệt 21/10).
              .shadow(color: .black.opacity(0.45), radius: 12, y: 3)
              .padding(DS.Spacing.md)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous)
            .strokeBorder(.white.opacity(0.08), lineWidth: 0.75)
        }
        .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("askkoa.title"))
    .accessibilityValue(Text(unavailable == .offline ? "askkoa.unavailable.offline" : unavailable == .unhealthy ? "askkoa.unavailable.unhealthy" : ""))
    .accessibilityHint(Text(unavailable == nil ? "assistant.coach.open.a11y" : "askkoa.retry.a11y"))
    .accessibilityAddTraits(.isButton)
    .accessibilityIdentifier(unavailable == nil ? "today.askKoa" : "today.askKoa.unavailable")
    .disabled(checking)
  }
}
