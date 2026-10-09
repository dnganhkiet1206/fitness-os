import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Bốn ô chỉ số hôm nay + bảng 7 ngày của ô đang chọn — các ô `metrics` của
/// `(tabs)/assistant.tsx` và `components/ascnd/metric-panel.tsx` @ fac9ac2.
///
/// Như RN: ô hiện số của hôm nay hoặc "—" (không bao giờ 0 thay cho "chưa
/// có"), kèm nhận xét ngắn (nhịp tim < 60 thấp / ≤ 80 bình thường / cao; ngủ
/// ≥ 7 giờ tốt; sẵn sàng theo trạng thái); chạm một ô thì chỉ loại ấy được đọc;
/// bảng có dòng đầu, ô số, 7 cột (ngày thiếu là cột mờ, hôm nay đậm), đường
/// mốc (7 giờ / mục tiêu calo / trung bình) và nút "Hỏi coach về chỉ số này"
/// gửi đúng câu có số.
struct MetricPanelView: View {
  let book: MetricHistoryBook
  let signal: AssistantSignalBook?
  let lang: AppPreferences.Lang
  let onAsk: (String) -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      tiles
      panel
    }
    .sensoryFeedback(.selection, trigger: book.kind)
  }

  private var kcalTarget: Double { signal?.signal.kcalTarget ?? 2200 }

  // MARK: - Ô

  private struct Tile {
    let kind: MetricAnalysis.Kind
    let symbol: String
    let tint: Color
    let label: String
    let value: String
    let note: String
    let noteTint: Color
  }

  private var tileList: [Tile] {
    let s = signal?.signal
    let hr = signal?.heartRate
    let sleep = s?.sleepMin ?? 0
    let kcal = s?.kcal ?? 0
    let readiness = s?.readiness
    let green = DS.Color.readinessGreen.swiftUI
    let yellow = DS.Color.readinessYellow.swiftUI
    let muted = DS.Color.mutedForeground.swiftUI
    let hrNote: (String, Color) =
      if let hr {
        hr < 60
          ? (String(localized: "metric.note.low"), green)
          : hr <= 80 ? (String(localized: "metric.note.normal"), green) : (String(localized: "metric.note.high"), yellow)
      } else {
        (String(localized: "metric.note.noData"), muted)
      }
    let sleepNote: (String, Color) =
      sleep == 0
      ? (String(localized: "metric.note.notLogged"), muted)
      : sleep >= 420 ? (String(localized: "metric.note.good"), green) : (String(localized: "metric.note.short"), yellow)
    let readinessNote: (String, Color) =
      switch (readiness, s?.status) {
      case (nil, _): (String(localized: "metric.note.needsData"), muted)
      case (_, "green"?): (String(localized: "metric.note.good"), green)
      case (_, "yellow"?): (String(localized: "metric.note.moderate"), yellow)
      default: (String(localized: "metric.note.low"), DS.Color.readinessRed.swiftUI)
      }
    let sleepMin = Int(sleep)
    return [
      Tile(
        kind: .hr, symbol: "heart.fill", tint: DS.Color.readinessRed.swiftUI, label: String(localized: "metric.hr"),
        value: hr.map { "\($0) bpm" } ?? "—", note: hrNote.0, noteTint: hrNote.1),
      Tile(
        kind: .sleep, symbol: "moon.fill", tint: DS.Color.metricPurple.swiftUI,
        label: String(localized: "metric.sleep"),
        value: sleep > 0 ? "\(sleepMin / 60)h \(sleepMin % 60)m" : "—", note: sleepNote.0, noteTint: sleepNote.1),
      Tile(
        kind: .kcal, symbol: "flame.fill", tint: DS.Color.metricBlue.swiftUI, label: String(localized: "metric.kcal"),
        value: kcal > 0 ? Int(kcal).formatted(.number.locale(.app)) : "—", note: String(localized: "metric.note.today"),
        noteTint: DS.Color.metricBlue.swiftUI),
      Tile(
        kind: .readiness, symbol: "gauge.with.dots.needle.50percent", tint: green,
        label: String(localized: "metric.readiness"), value: readiness.map(String.init) ?? "—", note: readinessNote.0,
        noteTint: readinessNote.1),
    ]
  }

  private var tiles: some View {
    LazyVGrid(columns: [GridItem(.flexible(), spacing: DS.Spacing.sm), GridItem(.flexible())], spacing: DS.Spacing.sm) {
      ForEach(tileList, id: \.kind) { t in
        let selected = book.kind == t.kind
        Button {
          Task { await book.select(t.kind, kcalTarget: kcalTarget) }
        } label: {
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
              Image(systemName: t.symbol).foregroundStyle(t.tint).accessibilityHidden(true)
              Text(verbatim: t.label)
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(1)
            }
            Text(verbatim: t.value)
              .font(DS.TextStyle.title2.monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Text(verbatim: t.note)
              .font(DS.TextStyle.caption)
              .foregroundStyle(t.noteTint)
          }
          .padding(DS.Spacing.sm)
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
          .overlay {
            RoundedRectangle(cornerRadius: DS.Radius.md)
              .strokeBorder(selected ? t.tint : .clear, lineWidth: 2)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
  }

  // MARK: - Bảng

  @ViewBuilder private var panel: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed:
      DSErrorView(message: String(localized: "metric.loadFailed")) {
        Task { await book.load(kcalTarget: kcalTarget) }
      }
    case .ready(let a):
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          Text(verbatim: a.headline(lang))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
          if !a.stats.isEmpty {
            HStack(spacing: DS.Spacing.lg) {
              ForEach(a.stats) { st in
                VStack(alignment: .leading, spacing: 2) {
                  Text(verbatim: st.label(lang))
                    .font(DS.TextStyle.caption)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  Text(verbatim: st.value(lang))
                    .font(DS.TextStyle.headline.monospacedDigit())
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                }
                .accessibilityElement(children: .combine)
              }
            }
          }
          chart(a)
          Button {
            onAsk(a.ask(lang))
          } label: {
            Label("metric.ask", systemImage: "sparkles")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(minHeight: 44)
          }
          .buttonStyle(.plain)
          .foregroundStyle(DS.Color.brand.swiftUI)
          // Đọc cả câu sẽ hỏi.
          .accessibilityHint(Text(verbatim: a.ask(lang)))
        }
      }
    }
  }

  private func chart(_ a: MetricAnalysis.Analysis) -> some View {
    Chart {
      ForEach(a.bars) { b in
        BarMark(
          x: .value("day", b.date.description),
          y: .value("value", b.missing ? 0 : b.value)
        )
        .foregroundStyle(
          b.today ? DS.Color.brand.swiftUI : DS.Color.brand.swiftUI.opacity(0.45)
        )
        .cornerRadius(3)
      }
      if let base = a.baseline {
        RuleMark(y: .value("baseline", base.value))
          .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .annotation(position: .top, alignment: .trailing) {
            Text(verbatim: base.label(lang))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
      }
    }
    .chartXAxis {
      AxisMarks(values: a.bars.map { $0.date.description }) { v in
        AxisValueLabel {
          if let d = v.as(String.self), let bar = a.bars.first(where: { $0.date.description == d }) {
            Text(verbatim: bar.weekday(lang))
              .font(DS.TextStyle.caption.weight(bar.today ? .bold : .regular))
              .foregroundStyle(bar.missing ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
          }
        }
      }
    }
    .chartYAxis(.hidden)
    .frame(height: 140)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: a.headline(lang)))
    .transaction { if reduceMotion { $0.animation = nil } }
  }
}
