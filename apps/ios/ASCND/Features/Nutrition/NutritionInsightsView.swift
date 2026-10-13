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
/// Thiết kế lại 13/10 (chủ dự án duyệt mock): hai ô số Menlo (đạm TB / mục
/// tiêu, kcal TB), biểu đồ ĐỦ bảy cột (RN chỉ vẽ ngày có dữ liệu), cam bữa
/// ăn, đường mục tiêu nét đứt, chú giải; nhận xét không còn gạch đầu dòng.
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
    .ascndPage()
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
      let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
      if let stats {
        HStack(spacing: DS.Spacing.sm) {
          tile(String(localized: "insights.avgProtein"), DiaryView.whole(stats.avgProtein),
               unit: " / " + DiaryView.whole(t.protein) + " g")
          tile(String(localized: "insights.avgKcal"),
               NutritionInsights.avgKcal(days).map(DiaryView.whole) ?? "—", unit: "")
        }
      }
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text(String(localized: "insights.proteinTitle"))
          .font(DS.TextStyle.headline)
          .accessibilityAddTraits(.isHeader)
        chart(NutritionInsights.week(days, today: today), target: t.protein, top: NutritionInsights.maxProtein(days, target: t.protein))
        HStack(spacing: DS.Spacing.md) {
          legend(MascotRoomView.signalColor(.meal), String(localized: "insights.legend.hit"))
          legend(MascotRoomView.signalColor(.meal).opacity(0.35), String(localized: "insights.legend.miss"))
        }
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .todayCard(radius: DS.Radius.xl)
      let notes = NutritionInsights.insights(stats, targets: t)
      if !notes.isEmpty {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          Label {
            Text(String(localized: "insights.head"))
          } icon: {
            Image(systemName: "lightbulb").foregroundStyle(MascotRoomView.signalColor(.meal))
          }
          .font(DS.TextStyle.headline)
          .accessibilityAddTraits(.isHeader)
          ForEach(notes, id: \.self) { n in
            Text(verbatim: Self.text(n))
              .font(DS.TextStyle.body)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DS.Spacing.md)
        .todayCard(radius: DS.Radius.xl)
      }
    }
  }

  /// Ô số (thiết kế lại 13/10): nhãn nhỏ, số Menlo.
  private func tile(_ label: String, _ value: String, unit: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      (Text(verbatim: value).font(.custom("Menlo", size: 24, relativeTo: .title2).weight(.semibold))
        + Text(verbatim: unit).font(.custom("Menlo", size: 13, relativeTo: .footnote))
        .foregroundColor(DS.Color.mutedForeground.swiftUI))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard(radius: DS.Radius.xl)
    .accessibilityElement(children: .combine)
  }

  private func legend(_ color: Color, _ text: String) -> some View {
    HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
      Text(verbatim: text)
    }
  }

  /// Đủ bảy cột (ngày trống là khoảng trống thật); đạt mục tiêu tô cam đậm.
  private func chart(_ week: [(date: LocalDate, day: NutritionInsights.Day?)], target: Double, top: Double) -> some View {
    let accent = MascotRoomView.signalColor(.meal)
    return Chart {
      ForEach(week, id: \.date) { slot in
        BarMark(
          x: .value("day", Self.weekday(slot.date)),
          y: .value("protein", slot.day?.protein ?? 0)
        )
        .foregroundStyle((slot.day?.protein ?? 0) >= target ? accent : accent.opacity(0.35))
        .cornerRadius(5)
        .accessibilityLabel(Text(verbatim: Self.weekday(slot.date)))
        .accessibilityValue(Text(Self.a11y(slot.day, target: target)))
      }
      RuleMark(y: .value("target", target))
        .foregroundStyle(accent.opacity(0.7))
        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
        .accessibilityHidden(true)
    }
    .chartXScale(domain: week.map { Self.weekday($0.date) })
    .chartYScale(domain: 0...top)
    .chartYAxis(.hidden)
    .frame(height: 170)
  }

  static func a11y(_ d: NutritionInsights.Day?, target: Double) -> String {
    guard let d else { return String(localized: "insights.a11y.none") }
    return d.protein >= target
      ? String(localized: "insights.a11y.hit \(DiaryView.whole(d.protein))")
      : String(localized: "insights.a11y.miss \(DiaryView.whole(d.protein))")
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
