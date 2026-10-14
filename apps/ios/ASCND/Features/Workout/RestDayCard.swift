import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ "Ngày nghỉ" (#527, 14/10 — chủ dự án: "ngày nghỉ chưa được thiết kế
/// đầy đủ"). Dùng chung cho thẻ hôm nay ở trang gốc Tập luyện và thẻ ngày của
/// Kế hoạch tuần.
///
/// Như RN (`today-training.tsx`, nhánh nghỉ): hình minh hoạ, "HÔM NAY · THỨ",
/// "Ngày nghỉ" + câu dẫn, ba gợi ý vận động nhẹ (đi bộ 20–30′, giãn cơ 10–15′,
/// vận động nhẹ tuỳ chọn), đường vẫn chọn buổi tập.
///
/// Khác RN (tốt hơn): gợi ý là thông tin có mẹo ngắn — không phải ô bấm chỉ
/// rung; thêm "Phục hồi tốt hơn" (ngủ / nước / đạm, màu của các ống ở Hôm
/// nay); minh hoạ "thở" chậm (đứng yên khi Giảm chuyển động).
struct RestDayCard<Actions: View>: View {
  /// "Hôm nay · Thứ Năm" hoặc "Thứ Năm, 15 tháng 10".
  let eyebrow: String
  /// Hôm nay thì có mục phục hồi; ngày khác trong kế hoạch thì gọn hơn.
  var isToday = true
  @ViewBuilder let actions: () -> Actions

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private static var tint: Color { DS.Color.metricPurple.swiftUI }

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      illustration
      VStack(spacing: 4) {
        Text(verbatim: eyebrow)
          .font(DS.TextStyle.caption.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.6)
          .foregroundStyle(Self.tint)
        Text(String(localized: "today.status.rest"))
          .font(DS.TextStyle.title.weight(.bold))
          .accessibilityAddTraits(.isHeader)
        Text(String(localized: "rest.lead"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }

      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        sectionTitle(String(localized: "rest.suggest.title"))
        HStack(alignment: .top, spacing: DS.Spacing.sm) {
          suggestion("figure.walk", DS.Color.metricOrangeGraphic.swiftUI, "wh.suggest.walk", "wh.suggest.walk.time", "rest.tip.walk")
          suggestion("figure.flexibility", DS.Color.readinessGreen.swiftUI, "wh.suggest.stretch", "wh.suggest.stretch.time", "rest.tip.stretch")
          suggestion("sun.max.fill", DS.Color.readinessYellow.swiftUI, "wh.suggest.light", "wh.suggest.optional", "rest.tip.light")
        }
      }

      if isToday {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          sectionTitle(String(localized: "rest.recover.title"))
          VStack(spacing: 0) {
            recoverRow(MascotRoomView.signalColor(.sleep), "moon.fill", "rest.recover.sleep")
            Divider().padding(.leading, 44).opacity(0.5)
            recoverRow(MascotRoomView.signalColor(.water), "drop.fill", "rest.recover.water")
            Divider().padding(.leading, 44).opacity(0.5)
            recoverRow(MascotRoomView.signalColor(.meal), "fork.knife", "rest.recover.protein")
          }
          .padding(.horizontal, DS.Spacing.sm)
          .background(DS.Color.foreground.swiftUI.opacity(0.035), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
        }
      }

      VStack(spacing: DS.Spacing.sm) { actions() }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity)
    .todayCard()
  }

  // MARK: - Minh hoạ

  private var illustration: some View {
    ZStack {
      Circle()
        .fill(RadialGradient(
          colors: [Self.tint.opacity(0.28), Self.tint.opacity(0.06), .clear],
          center: .center, startRadius: 4, endRadius: 70))
        .frame(width: 140, height: 140)
      Circle()
        .fill(Self.tint.opacity(0.12))
        .frame(width: 84, height: 84)
      Image(systemName: "moon.stars.fill")
        .font(.system(size: 38, weight: .regular))
        .foregroundStyle(Self.tint.gradient)
        .symbolEffect(.breathe, options: .repeat(.continuous), isActive: !reduceMotion)
      // Ba ngôi sao nhỏ quanh trăng.
      ForEach(Array([(-48.0, -30.0, 7.0), (50.0, -18.0, 5.0), (36.0, 40.0, 6.0)].enumerated()), id: \.offset) { _, s in
        Image(systemName: "sparkle")
          .font(.system(size: s.2))
          .foregroundStyle(Self.tint.opacity(0.6))
          .offset(x: s.0, y: s.1)
          .symbolEffect(.pulse, options: .repeat(.continuous), isActive: !reduceMotion)
      }
    }
    .frame(height: 120)
    .accessibilityHidden(true)
  }

  // MARK: - Phần

  private func sectionTitle(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityAddTraits(.isHeader)
  }

  private func suggestion(
    _ symbol: String, _ tint: Color, _ title: String.LocalizationValue, _ time: String.LocalizationValue,
    _ tip: String.LocalizationValue
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Image(systemName: symbol)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 34, height: 34)
        .background(tint.opacity(0.14), in: Circle())
        .accessibilityHidden(true)
      Text(String(localized: title))
        .font(DS.TextStyle.footnote.weight(.semibold))
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
      Text(String(localized: time))
        .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
        .foregroundStyle(tint)
      Text(String(localized: tip))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .padding(10)
    .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
    .background(DS.Color.foreground.swiftUI.opacity(0.035), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
    .accessibilityElement(children: .combine)
  }

  private func recoverRow(_ tint: Color, _ symbol: String, _ key: String.LocalizationValue) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(tint)
        .frame(width: 28, height: 28)
        .background(tint.opacity(0.14), in: Circle())
        .accessibilityHidden(true)
      Text(String(localized: key))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .padding(.vertical, 8)
  }
}
