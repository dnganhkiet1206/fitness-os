import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ "Hỏi Koa" ở Hôm nay (Kiệt 21/10, thiết kế của Kiệt): lối vào Koa Coach riêng,
/// tách khỏi thẻ Insight. Chạm thẻ (hay nút ›) mở cuộc trò chuyện; thanh "Kể cho Koa
/// hôm nay…" + micro (trước ở thẻ "Hôm nay của bạn") gộp vào đáy thẻ, mở "Ghi hôm nay".
struct TodayAskKoaCard: View {
  let onAsk: () -> Void
  let onTell: (_ voice: Bool) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text("askkoa.title"))
      .accessibilityHint(Text("assistant.coach.open.a11y"))
      .accessibilityAddTraits(.isButton)
      tellBar
    }
    .padding(DS.Spacing.md)
    .todayCard()
  }

  /// "Kể cho Koa hôm nay…" + micro: gõ hay nói là ghi (`DayLogSheet`).
  private var tellBar: some View {
    HStack(spacing: 6) {
      Button { onTell(false) } label: {
        HStack(spacing: 8) {
          IntelligenceMark(size: 15)
          Text("day.tell.placeholder")
            .font(.system(size: 15))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.leading, 14)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("logday.title"))
      Button { onTell(true) } label: {
        Image(systemName: "mic.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(width: 38, height: 38)
          .background(DS.Color.foreground.swiftUI, in: Circle())
      }
      .buttonStyle(TodayPressStyle())
      .accessibilityLabel(Text("tellkoa.mic.start"))
    }
    .padding(.trailing, 5)
    .glassComposer(radius: 24)
  }
}
