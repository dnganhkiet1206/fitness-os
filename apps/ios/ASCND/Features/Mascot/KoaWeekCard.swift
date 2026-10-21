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
        TodayWeekStrip(
          days: state.days.map { .init(date: $0.date, trained: $0.trained, planned: $0.planned, rest: $0.rest) },
          today: TodayPlanHero.today(), target: nil, showsHeader: false)
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
