import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Mục "Hỏi Koa" ở Hôm nay (Kiệt 21/10, thiết kế của Kiệt): lối vào Koa Coach riêng,
/// tách khỏi thẻ Insight. Chạm thẻ (hay nút ›) mở cuộc trò chuyện. Thanh ghi bằng AI
/// "Kể cho Koa hôm nay…" ở lại thẻ "Hôm nay của bạn" (Kiệt 21/10: tách ra).
struct TodayAskKoaCard: View {
  let onAsk: () -> Void

  var body: some View {
    Button(action: onAsk) {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack(alignment: .top, spacing: DS.Spacing.sm) {
          VStack(alignment: .leading, spacing: 6) {
            Text("askkoa.kicker")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .textCase(.uppercase)
              .tracking(2)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text("askkoa.title")
              .font(.title.bold())
              .tracking(-0.4)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
            Text("askkoa.subtitle")
              .font(.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 0)
          Image(systemName: "chevron.right")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(width: 44, height: 44)
            .background(DS.Color.foreground.swiftUI.opacity(0.08), in: Circle())
            .padding(.top, 18)
        }
        // Hình của Kiệt (Koa ở bàn, bóng chat) — trang trí, VoiceOver bỏ qua.
        Image("AskKoaScene")
          .resizable()
          .aspectRatio(902 / 568, contentMode: .fit)
          .frame(maxWidth: .infinity)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
          .accessibilityHidden(true)
      }
      // Nằm thẳng trên nền như điểm nhấn của Apple Health — không khung thẻ (Kiệt 21/10).
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 2)
      .padding(.top, DS.Spacing.sm)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("askkoa.title"))
    .accessibilityHint(Text("assistant.coach.open.a11y"))
    .accessibilityAddTraits(.isButton)
  }
}
