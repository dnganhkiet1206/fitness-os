import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Tổng kết tuần (#527) — `app/weekly-review.tsx` @ fac9ac2 trên `WeeklyReviewBook`.
///
/// Như RN:
/// - lùi / tiến từng tuần (Thứ Hai → Chủ nhật), không quá tuần này;
/// - ô số: TB kcal, TB protein, TB giấc ngủ, khối lượng + số buổi, mức sẵn
///   sàng + ACWR, thực phẩm bổ sung (chỉ khi có kế hoạch), nước — kèm % so với
///   tuần trước ở kcal / protein / khối lượng;
/// - tuần có dữ liệu: cột 7 ngày (kcal theo mục tiêu, giấc ngủ theo mục tiêu,
///   khối lượng + đường 12 tuần), đường mức sẵn sàng, khuyến nghị tuần tới;
///   tuần trống: "Chưa có dữ liệu".
///
/// Khác RN / chưa có: lời khuyên ACWR theo băng của thẻ sẵn sàng (xem
/// `WeeklyReview`); câu khuyến nghị có cả tiếng Tây Ban Nha (RN: chỉ vi / en);
/// chưa có phần phân tích AI (`ai-weekly-review`) — bản iOS chưa gọi edge
/// function; một nguồn đọc hỏng là màn lỗi có thử lại (RN vẽ số của phần đọc được).
struct WeeklyReviewView: View {
  let book: WeeklyReviewBook
  let lang: AppPreferences.Lang

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        weekNav
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "wr.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(.selection, trigger: book.weekOffset)
  }

  // MARK: - Tuần

  private var weekNav: some View {
    let start = book.weekStart
    let style = Date.FormatStyle().day().month(.abbreviated).locale(.app)
    let label = "\(start.calendarDate.formatted(style)) – \(start.adding(days: 6).calendarDate.formatted(style))"
    return HStack {
      Button {
        Task { await book.step(-1) }
      } label: {
        Image(systemName: "chevron.left").frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .accessibilityLabel(Text(String(localized: "wr.prevWeek.a11y")))
      Spacer()
      Text(verbatim: label)
        .font(DS.TextStyle.headline.monospacedDigit())
      Spacer()
      Button {
        Task { await book.step(1) }
      } label: {
        Image(systemName: "chevron.right").frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .disabled(!book.canGoForward)
      .opacity(book.canGoForward ? 1 : 0.35)
      .accessibilityLabel(Text(String(localized: "wr.nextWeek.a11y")))
    }
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView(message: String(localized: "wr.loading"))
    case .failed:
      DSErrorView(message: String(localized: "wr.loadFailed")) {
        Task { await book.load() }
      }
    case .ready(let s):
      stats(s)
      if s.daysWithData > 0 {
        charts(s)
        if !s.recommendations.isEmpty { recommendations(s.recommendations) }
      } else {
        DSCard {
          Text(String(localized: "wr.noData"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }

  // MARK: - Ô số

  private func stats(_ s: WeeklyReview.Summary) -> some View {
    let c = s.cards
    var tiles: [(String, String, WeeklyReview.Card, String)] = [
      ("flame", String(localized: "wr.avgCalories"), c.kcal, c.kcal.sub),
      ("fork.knife", String(localized: "wr.avgProtein"), c.protein, c.protein.sub),
      ("moon.fill", String(localized: "wr.avgSleep"), c.sleep, c.sleep.sub),
      ("dumbbell.fill", String(localized: "wr.volume"), c.volume, Self.sessions(c.sessions)),
      ("waveform.path.ecg", String(localized: "wr.readiness"), c.readiness, c.readiness.sub),
    ]
    if let supp = c.supplements {
      tiles.append(("pills.fill", String(localized: "wr.supplements"), supp, supp.sub))
    }
    tiles.append(("drop.fill", String(localized: "wr.water"), c.water, c.water.sub))
    return LazyVGrid(
      columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm
    ) {
      ForEach(tiles.indices, id: \.self) { i in
        let t = tiles[i]
        tile(icon: t.0, label: t.1, card: t.2, sub: t.3)
      }
    }
  }

  private func tile(icon: String, label: String, card: WeeklyReview.Card, sub: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 4) {
        Image(systemName: icon).font(.caption2).accessibilityHidden(true)
        Text(label).font(DS.TextStyle.caption).lineLimit(1)
        Spacer(minLength: 0)
        if let d = card.delta {
          delta(d)
        }
      }
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(verbatim: card.value)
        .font(DS.TextStyle.title.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(verbatim: sub)
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: label))
    .accessibilityValue(Text(verbatim: a11yValue(card: card, sub: sub)))
  }

  @ViewBuilder private func delta(_ d: Int) -> some View {
    if d == 0 {
      Image(systemName: "minus").font(.caption2).accessibilityHidden(true)
    } else {
      let up = d > 0
      let tint = up ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI
      HStack(spacing: 2) {
        Image(systemName: up ? "arrow.up.right" : "arrow.down.right").font(.caption2)
        Text(verbatim: "\(abs(d))%").font(DS.TextStyle.caption.monospacedDigit())
      }
      .foregroundStyle(tint)
      .accessibilityHidden(true)
    }
  }

  private func a11yValue(card: WeeklyReview.Card, sub: String) -> String {
    var parts = ["\(card.value) \(sub)"]
    if let d = card.delta, d != 0 {
      parts.append(d > 0 ? String(localized: "wr.delta.up \(abs(d))") : String(localized: "wr.delta.down \(abs(d))"))
    }
    return parts.joined(separator: ", ")
  }

  // MARK: - Biểu đồ

  @ViewBuilder private func charts(_ s: WeeklyReview.Summary) -> some View {
    DSCard {
      section(String(localized: "wr.chart.nutrition")) {
        WeekBars(
          days: s.days, values: s.days.map(\.kcal), tint: DS.Color.metricOrange.swiftUI, target: s.kcalTarget, unit: "")
      }
    }
    DSCard {
      section(String(localized: "wr.chart.sleep")) {
        WeekBars(
          days: s.days, values: s.days.map(\.sleepHours), tint: DS.Color.metricPurple.swiftUI,
          target: s.sleepTargetHours, unit: "h")
      }
    }
    DSCard {
      section(String(localized: "wr.chart.volume")) {
        WeekBars(days: s.days, values: s.days.map(\.volume), tint: DS.Color.metricBlue.swiftUI, target: nil, unit: "")
        if s.volumeWeeks.contains(where: { $0.tonnes > 0 }) {
          Text(String(localized: "wr.chart.volume12w"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.top, DS.Spacing.sm)
          Chart(s.volumeWeeks, id: \.weekStart) { w in
            LineMark(x: .value("w", w.weekStart.daysSinceEpoch), y: .value("t", w.tonnes))
              .foregroundStyle(DS.Color.metricBlue.swiftUI)
          }
          .chartXAxis(.hidden)
          .chartYAxis(.hidden)
          .frame(height: 64)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(String(localized: "wr.chart.volume12w")))
          .accessibilityValue(Text(verbatim: s.volumeWeeks.map { "\(Self.plain($0.tonnes))t" }.joined(separator: ", ")))
        }
      }
    }
    let points = s.days.filter { $0.readiness > 0 }
    DSCard {
      section(String(localized: "wr.chart.readiness")) {
        Chart(points, id: \.date) { d in
          LineMark(x: .value("d", d.date.daysSinceEpoch), y: .value("r", d.readiness))
            .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
          PointMark(x: .value("d", d.date.daysSinceEpoch), y: .value("r", d.readiness))
            .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
        }
        .chartXScale(domain: s.days[0].date.daysSinceEpoch...s.days[6].date.daysSinceEpoch)
        .chartYScale(domain: 0...100)
        .chartXAxis(.hidden)
        .frame(height: 140)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "wr.chart.readiness")))
        .accessibilityValue(
          Text(verbatim: points.map { "\(Self.weekday($0.date)): \(Self.plain($0.readiness))" }.joined(separator: ", ")))
      }
    }
  }

  private func section<Body: View>(_ title: String, @ViewBuilder body: () -> Body) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text(title)
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      body()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Khuyến nghị

  private func recommendations(_ recs: [WeeklyReview.Recommendation]) -> some View {
    DSCard {
      section(String(localized: "wr.recommendations")) {
        VStack(spacing: DS.Spacing.xs) {
          ForEach(recs.indices, id: \.self) { i in
            let r = recs[i]
            let st = Self.style(r.kind)
            HStack(alignment: .top, spacing: DS.Spacing.sm) {
              Image(systemName: st.1).foregroundStyle(st.0).accessibilityHidden(true)
              Text(Self.text(r))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(DS.Spacing.sm)
            .background(st.0.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            .accessibilityElement(children: .combine)
          }
        }
      }
    }
  }

  static func style(_ k: WeeklyReview.Recommendation.Kind) -> (Color, String) {
    switch k {
    case .warning: (DS.Color.destructive.swiftUI, "exclamationmark.triangle.fill")
    case .success: (DS.Color.readinessGreen.swiftUI, "checkmark.circle.fill")
    case .info: (DS.Color.metricBlue.swiftUI, "waveform.path.ecg")
    }
  }

  /// Câu của một khuyến nghị theo `id`, chữ chèn sẵn từ Core.
  static func text(_ r: WeeklyReview.Recommendation) -> String {
    let a = r.args + ["", ""]
    switch r.id {
    case "acwrHigh": return String(localized: "wr.rec.acwrHigh \(a[0])")
    case "acwrSlightlyHigh": return String(localized: "wr.rec.acwrSlightlyHigh \(a[0])")
    case "acwrLow": return String(localized: "wr.rec.acwrLow \(a[0])")
    case "acwrOptimal": return String(localized: "wr.rec.acwrOptimal \(a[0])")
    case "deload": return String(localized: "wr.rec.deload")
    case "overloadRecovered": return String(localized: "wr.rec.overloadRecovered")
    case "overloadCapacity": return String(localized: "wr.rec.overloadCapacity")
    case "sleepDebt": return String(localized: "wr.rec.sleepDebt \(a[0]) \(a[1])")
    case "proteinLow": return String(localized: "wr.rec.proteinLow \(a[0]) \(a[1])")
    case "volumeUp": return String(localized: "wr.rec.volumeUp \(a[0])")
    default: return r.id
    }
  }

  /// `{n} {n:session|sessions}` — số ít / số nhiều là hai khoá (catalog không dùng plural variation).
  static func sessions(_ n: Int) -> String {
    n == 1 ? String(localized: "wr.sessions.one \(n)") : String(localized: "wr.sessions.other \(n)")
  }

  /// `Math.round(v * 10) / 10` viết kiểu JS (không phân nhóm nghìn, như RN).
  static func plain(_ v: Double) -> String {
    let r = (v * 10 + 0.5).rounded(.down) / 10
    return r == r.rounded() && abs(r) < 1e15 ? String(Int(r)) : String(r)
  }

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }
}

/// Cột 7 ngày (`WeekBars`): cao theo giá trị lớn nhất (hoặc mục tiêu), vạch
/// mục tiêu nếu có, nhãn thứ + giá trị dưới mỗi cột ("·" khi trống).
private struct WeekBars: View {
  let days: [WeeklyReview.Day]
  let values: [Double]
  let tint: Color
  let target: Double?
  let unit: String

  var body: some View {
    let maxV = Swift.max(values.max() ?? 0, target ?? 0, 1)
    VStack(spacing: 4) {
      GeometryReader { geo in
        ZStack(alignment: .bottom) {
          HStack(alignment: .bottom, spacing: 6) {
            ForEach(values.indices, id: \.self) { i in
              let v = values[i]
              RoundedRectangle(cornerRadius: 4)
                .fill(tint)
                .frame(height: geo.size.height * Swift.max(v / maxV, v > 0 ? 0.03 : 0))
                .frame(maxWidth: .infinity)
            }
          }
          if let target, target > 0 {
            Rectangle()
              .fill(DS.Color.mutedForeground.swiftUI.opacity(0.5))
              .frame(height: 1)
              .offset(y: -geo.size.height * target / maxV)
          }
        }
        .frame(maxHeight: .infinity, alignment: .bottom)
      }
      .frame(height: 120)
      HStack(spacing: 6) {
        ForEach(days.indices, id: \.self) { i in
          VStack(spacing: 0) {
            Text(verbatim: WeeklyReviewView.weekday(days[i].date))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: values[i] > 0 ? "\(WeeklyReviewView.plain(values[i]))\(unit)" : "·")
              .font(.system(size: 9).monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
              .minimumScaleFactor(0.6)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityValue(
      Text(
        verbatim: days.indices.map {
          "\(WeeklyReviewView.weekday(days[$0].date)): \(values[$0] > 0 ? "\(WeeklyReviewView.plain(values[$0]))\(unit)" : "—")"
        }.joined(separator: ", ")))
  }
}
