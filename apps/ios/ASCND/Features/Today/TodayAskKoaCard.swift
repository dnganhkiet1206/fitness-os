import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ ảnh "Hỏi Koa" ở Hôm nay (Kiệt 21/10, thiết kế của Kiệt): lối vào Koa Coach riêng,
/// tách khỏi thẻ Insight. Chạm thẻ (hay nút ›) mở cuộc trò chuyện. Thanh ghi bằng AI
/// "Kể cho Koa hôm nay…" ở lại thẻ "Hôm nay của bạn" (Kiệt 21/10: tách ra).
struct TodayAskKoaCard: View {
  let onAsk: () -> Void

  /// Màu bàn tối ở đáy hình — ảnh tan vào màu này, chữ nằm trên đó.
  private static let ink = Color(red: 0.09, green: 0.10, blue: 0.16)

  var body: some View {
    Button(action: onAsk) {
      // Ảnh phủ hết bề ngang (hơi phóng), tan dần vào nền tối; chữ đặt lên ảnh trên lớp
      // gradient (Kiệt 21/10: khác Apple Health một chút). Nền luôn tối nên chữ luôn trắng.
      Self.ink
        .frame(maxWidth: .infinity)
        .frame(height: 340)
        .overlay(alignment: .top) {
          Image("AskKoaScene")
            .resizable()
            .scaledToFill()
            .frame(height: 250)
            .frame(maxWidth: .infinity)
            .clipped()
            .accessibilityHidden(true)
        }
        .overlay {
          LinearGradient(
            stops: [
              .init(color: Self.ink.opacity(0), location: 0.42),
              .init(color: Self.ink.opacity(0.8), location: 0.62),
              .init(color: Self.ink, location: 0.74),
            ],
            startPoint: .top, endPoint: .bottom)
        }
        // Lớp tối thêm sau phần chữ (Kiệt 21/10) cho chữ trắng nổi rõ.
        .overlay {
          LinearGradient(
            stops: [
              .init(color: .black.opacity(0), location: 0.45),
              .init(color: .black.opacity(0.55), location: 0.75),
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
            Text("askkoa.subtitle")
              .font(.subheadline)
              .foregroundStyle(.white.opacity(0.75))
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(DS.Spacing.md + 4)
        }
        // Nút › nổi trên ảnh, nền tối mờ phía sau để luôn đọc được (Kiệt 21/10).
        .overlay(alignment: .topTrailing) {
          Image(systemName: "chevron.right")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            // Vòng tối trong, không kính (Kiệt 22/10).
            .background(.black.opacity(0.45), in: Circle())
            // Bóng mờ quanh nút để tách khỏi bóng chat phía sau (Kiệt 21/10).
            .shadow(color: .black.opacity(0.45), radius: 12, y: 3)
            .padding(DS.Spacing.md)
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
    .accessibilityHint(Text("assistant.coach.open.a11y"))
    .accessibilityAddTraits(.isButton)
    .accessibilityIdentifier("today.askKoa")
  }
}
