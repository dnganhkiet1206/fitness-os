import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Số đo cơ thể (#527) — `app/measurements-trend.tsx` @ fac9ac2 trên
/// `MeasurementsBook`.
///
/// Như RN: đọc hỏng là lỗi có thử lại; không số đo nào có ≥ 2 lần đo là trạng
/// thái trống; mỗi số đo một thẻ — tên, số mới nhất, chênh lệch so với lần cũ
/// nhất kèm mũi tên chéo (lên-phải / xuống-phải / ngang, hướng nằm trong nhãn
/// VoiceOver), đường nhỏ không trục.
///
/// Khác RN: trục ngày thật (cột `date`), 24 lần đo MỚI nhất.
struct MeasurementsView: View {
  let book: MeasurementsBook

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "measure.loadfailed")) {
            Task { await book.load() }
          }
        case .ready(let series) where series.isEmpty:
          DSEmptyState(
            systemImage: "ruler", title: String(localized: "measure.empty.title"),
            message: String(localized: "measure.empty.message"))
        case .ready(let series):
          ForEach(series) { card($0) }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("measure.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
  }

  private func card(_ s: Measurements.Series) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(alignment: .center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(LocalizedStringKey(s.field.labelKey))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: s.lastText)
              .font(DS.TextStyle.title.monospacedDigit())
              .foregroundStyle(DS.Color.foreground.swiftUI)
          }
          .accessibilityElement(children: .combine)
          Spacer()
          delta(s)
        }
        sparkline(s)
      }
    }
  }

  private func delta(_ s: Measurements.Series) -> some View {
    let symbol =
      switch s.direction {
      case .up: "arrow.up.right"
      case .down: "arrow.down.right"
      case .flat: "arrow.right"
      }
    let word: LocalizedStringKey =
      switch s.direction {
      case .up: "measure.dir.up \(s.deltaText)"
      case .down: "measure.dir.down \(s.deltaText)"
      case .flat: "measure.dir.flat \(s.deltaText)"
      }
    return HStack(spacing: 4) {
      Image(systemName: symbol).font(.footnote.weight(.semibold))
      Text(verbatim: s.deltaText).font(DS.TextStyle.footnote.monospacedDigit())
    }
    .foregroundStyle(DS.Color.foreground.swiftUI)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(word))
  }

  private struct Spot: Identifiable {
    let id: Int
    let x: Double
    let value: Double
  }

  /// Trục ngang theo ngày đo (khoảng cách thật giữa các lần đo); một hàng hỏng
  /// ngày thì cả đường lùi về thứ tự đo.
  private func sparkline(_ s: Measurements.Series) -> some View {
    let dated = s.points.allSatisfy { $0.date != nil }
    let spots = s.points.enumerated().map { i, p in
      Spot(id: i, x: dated ? Double(p.date?.daysSinceEpoch ?? 0) : Double(i), value: p.value)
    }
    let values = spots.map(\.value)
    let lo = values.min() ?? 0
    let hi = values.max() ?? 0
    let pad = max((hi - lo) * 0.15, 0.1)
    let x0 = spots.first?.x ?? 0
    let x1 = max(spots.last?.x ?? 1, x0 + 1)
    return Chart(spots) { p in
      LineMark(x: .value("x", p.x), y: .value("v", p.value))
        .foregroundStyle(DS.Color.primary.swiftUI)
        .interpolationMethod(.monotone)
    }
    .chartXScale(domain: x0...x1)
    .chartYScale(domain: (lo - pad)...(hi + pad))
    .chartXAxis(.hidden)
    .chartYAxis(.hidden)
    .frame(height: 64)
    .accessibilityHidden(true)
  }
}
