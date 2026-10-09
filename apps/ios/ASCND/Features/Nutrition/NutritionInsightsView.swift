import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Màn Dinh dưỡng 7 ngày (#527 Phase 3 · 3.6) — `app/nutrition-insights.tsx`
/// trên `NutritionInsightsBook`.
///
/// Như RN: số to = đạm trung bình / ngày ("mục tiêu Xg"); cột đạm từng ngày so
/// với đường mục tiêu (đạt mục tiêu tô xanh); thẻ "Nhận xét"; rỗng → "Chưa có
/// dữ liệu"; đọc hỏng → lỗi có thử lại. Mục tiêu từ hồ sơ (`macroTargetsFor`).
///
/// Khác RN: đúng bảy ngày (RN đọc tám — xem `NutritionInsights`); biểu đồ là
/// Swift Charts, VoiceOver đọc từng cột (ngày, gam, đạt / chưa đạt).
struct NutritionInsightsView: View {
  let book: NutritionInsightsBook
  @Environment(ProfileBook.self) private var profile: ProfileBook?

  private var targets: MacroTargets.Grams {
    let p = profile?.profile
    return MacroTargets.grams(
      tdeeKcal: p?.tdeeTargetKcal, protein: p?.macroProteinG, carbs: p?.macroCarbsG, fat: p?.macroFatG,
      fiber: p?.macroFiberG)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.lg) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "insights.title"))
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await book.load() }
    .task { await book.load() }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let days) where days.isEmpty:
      DSEmptyState(
        systemImage: "fork.knife", title: String(localized: "insights.empty"),
        message: String(localized: "insights.empty.hint"))
    case .ready(let days):
      let t = targets
      let stats = NutritionInsights.stats(days, proteinTarget: t.protein)
      if let stats {
        VStack(alignment: .leading, spacing: 4) {
          Text(verbatim: "\(DiaryView.whole(stats.avgProtein))g")
            .font(DS.TextStyle.hero.monospacedDigit())
          Text(String(localized: "insights.proteinCaption \(DiaryView.whole(t.protein))"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .accessibilityElement(children: .combine)
      }
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(String(localized: "insights.proteinTitle"))
            .font(DS.TextStyle.headline)
            .accessibilityAddTraits(.isHeader)
          chart(days, target: t.protein)
        }
      }
      let notes = NutritionInsights.insights(stats, targets: t)
      if !notes.isEmpty {
        DSCard {
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            Label(String(localized: "insights.head"), systemImage: "lightbulb")
              .font(DS.TextStyle.headline)
              .accessibilityAddTraits(.isHeader)
            ForEach(notes, id: \.self) { n in
              Text(verbatim: "•  " + Self.text(n))
                .font(DS.TextStyle.body)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
      }
    }
  }

  private func chart(_ days: [NutritionInsights.Day], target: Double) -> some View {
    let top = NutritionInsights.maxProtein(days, target: target)
    return Chart {
      ForEach(days) { d in
        BarMark(
          x: .value("day", Self.weekday(d.date)),
          y: .value("protein", d.protein)
        )
        .foregroundStyle(d.protein >= target ? DS.Color.readinessGreen.swiftUI : DS.Color.primary.swiftUI)
        .cornerRadius(4)
        .accessibilityLabel(Text(verbatim: Self.weekday(d.date)))
        .accessibilityValue(
          Text(
            d.protein >= target
              ? String(localized: "insights.a11y.hit \(DiaryView.whole(d.protein))")
              : String(localized: "insights.a11y.miss \(DiaryView.whole(d.protein))")))
      }
      RuleMark(y: .value("target", target))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.6))
        .lineStyle(StrokeStyle(lineWidth: 2))
        .accessibilityHidden(true)
    }
    .chartYScale(domain: 0...top)
    .chartYAxis(.hidden)
    .frame(height: 160)
  }

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }

  static func text(_ n: NutritionInsights.Insight) -> String {
    switch n {
    case .proteinGap(let avg, let gap, let target):
      String(localized: "insights.proteinGap \(avg) \(gap) \(target)")
    case .proteinHit(let days, let of):
      String(localized: "insights.proteinHit \(days) \(of)")
    case .fiberLow(let avg, let target):
      String(localized: "insights.fiberLow \(avg) \(target)")
    }
  }
}

/// Lối "Xem xu hướng 7 ngày" + sổ thuộc MÀN.
struct InsightsRoute: Hashable {
  let userId: String
}

struct InsightsRow: View {
  let userId: String

  var body: some View {
    NavigationLink(value: InsightsRoute(userId: userId)) {
      HStack {
        Label(String(localized: "insights.link"), systemImage: "chart.bar")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer()
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .frame(minHeight: 44)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

struct InsightsScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: NutritionInsightsBook?

  var body: some View {
    Group {
      if let book {
        NutritionInsightsView(book: book)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeNutritionInsights(userId: userId) }
    }
    .onDisappear { book?.close() }
  }
}
