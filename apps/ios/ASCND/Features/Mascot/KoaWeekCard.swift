import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ "Tuần của Koa" (#527 GĐ2, mock `gd2-progress-koa-week.html`) — thay thẻ thử
/// thách tuần chung: số buổi theo lịch thật của chính bạn, bảy ngày, thưởng đủ tuần.
struct KoaWeekCard: View {
  let state: KoaWeek.State
  let claim: KoaWeekBook.Claim

  var body: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text("dp.week")
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.2)
          .textCase(.uppercase)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "dp.week.count \(min(state.done, state.target)) \(state.target)"))
          .font(DS.TextStyle.headline.weight(.heavy))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        // Thẻ này để làm gì (Kiệt 21/10: viết rõ lợi ích, không chỉ luật).
        Text("kw.why")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.85))
          .fixedSize(horizontal: false, vertical: true)
        TodayWeekStrip(
          days: state.days.map { .init(date: $0.date, trained: $0.trained, planned: $0.planned, rest: $0.rest) },
          today: TodayPlanHero.today(), target: nil, showsHeader: false)
        KoaWeekLegend()
        Text(String(localized: "kw.reward \(KoaGains.fullWeek) \(KoaWeek.rewardCoins)"))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text("kw.rules")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        switch claim {
        case .claimed:
          Label(String(localized: "kw.claimed"), systemImage: "checkmark.circle.fill")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        case .justClaimed(let coins):
          Label(String(localized: "kw.just \(coins)"), systemImage: "sparkles")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        case .failed:
          Text("kw.retry")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        case .notYet:
          EmptyView()
        }
      }
    }
    .accessibilityElement(children: .contain)
  }

}

/// Chú thích ký hiệu của dải (Kiệt 21/10: dải ở Today không tự giải thích).
struct KoaWeekLegend: View {
  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: DS.Spacing.md) { items }
      VStack(alignment: .leading, spacing: 4) { items }
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .accessibilityHidden(true)
  }

  @ViewBuilder private var items: some View {
    item("kw.legend.done") { TodayWeekStrip.marker(trained: true, planned: true) }
    item("kw.legend.planned") { TodayWeekStrip.marker(trained: false, planned: true) }
    item("kw.legend.off") { TodayWeekStrip.marker(trained: false, planned: false) }
    item("kw.legend.today") {
      RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(DS.Color.primary.swiftUI, lineWidth: 1.5)
        .frame(width: 10, height: 10)
    }
  }

  private func item(_ key: LocalizedStringKey, @ViewBuilder mark: () -> some View) -> some View {
    HStack(spacing: 5) {
      mark()
      Text(key).fixedSize()
    }
  }
}

/// Một khối "Tuần của Koa" trên Hôm nay: dải ngày + một dòng thưởng. Đoạn giải
/// thích nằm trong cùng khối, mở khi chạm — không thêm một thẻ thứ hai cùng tên.
struct TodayKoaWeekModule: View {
  let days: [TodayWeekStrip.Day]
  let today: LocalDate
  let target: Int?
  let state: KoaWeek.State?
  let claim: KoaWeekBook.Claim
  @State private var explains = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      TodayWeekStrip(days: days, today: today, target: target)
      if state != nil {
        Text(String(localized: "kw.reward \(KoaGains.fullWeek) \(KoaWeek.rewardCoins)"))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        claimLine
        Button {
          if reduceMotion { explains.toggle() } else {
            withAnimation(.easeInOut(duration: DSMotion.transitionDuration)) { explains.toggle() }
          }
        } label: {
          HStack(spacing: DS.Spacing.sm) {
            Text("kw.more")
              .font(DS.TextStyle.footnote.weight(.semibold))
            Spacer(minLength: 0)
            Image(systemName: explains ? "chevron.up" : "chevron.down")
              .font(.caption.weight(.semibold))
              .accessibilityHidden(true)
          }
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("today.koaWeek.about")
        .accessibilityHint(Text("kw.open.hint"))
        if explains {
          Text("kw.why")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.85))
            .fixedSize(horizontal: false, vertical: true)
          KoaWeekLegend()
          Text("kw.rules")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("today.koaWeek.details")
        }
      }
    }
    .padding(DS.Spacing.md)
    .todayCard()
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("today.koaWeek")
  }

  @ViewBuilder private var claimLine: some View {
    switch claim {
    case .claimed:
      Label(String(localized: "kw.claimed"), systemImage: "checkmark.circle.fill")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
    case .justClaimed(let coins):
      Label(String(localized: "kw.just \(coins)"), systemImage: "sparkles")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
    case .failed:
      Text("kw.retry")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.destructive.swiftUI)
    case .notYet:
      EmptyView()
    }
  }
}
