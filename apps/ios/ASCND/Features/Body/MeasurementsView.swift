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
///
/// Lối vào ghi số đo (RN `body-panel.tsx:952`, `:1016`: "Nhập số đo" ở đầu mục
/// và ở trạng thái trống): "+" trên thanh điều hướng, và nút viên nang ở trạng
/// thái trống. Lưu xong đọc lại để thẻ mới hiện ngay.
struct MeasurementsView: View {
  let book: MeasurementsBook

  @Environment(AppServices.self) private var services
  @State private var logging = false

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
          BodyLogButton(title: String(localized: "measure.add")) { logging = true }
        case .ready(let series):
          ForEach(series) { card($0) }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("measure.title"))
    .ascndPage()
    .toolbar {
      BodyLogToolbarButton(label: String(localized: "measure.add")) { logging = true }
    }
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sheet(isPresented: $logging) {
      let userId = services.session.session?.userId ?? ""
      LogMeasurementView(makeLogger: { services.makeMeasurementLogger(userId: userId) }) {
        Task { await book.load() }
      }
    }
  }

  private func card(_ s: Measurements.Series) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(alignment: .center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(LocalizedStringKey(s.field.labelKey))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: "\(Self.n(s.last)) \(s.field.unit)")
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
    // Nói rõ so với lúc nào: "−12 cm" trơ trọi không cho biết là từ lần đo nào (29/10).
    let since = s.points.first?.date.map {
      String(localized: "measure.since \($0.calendarDate.formatted(.dateTime.day().month(.abbreviated).locale(.app)))")
    }
    return VStack(alignment: .trailing, spacing: 2) {
      HStack(spacing: 4) {
        Image(systemName: symbol).font(.footnote.weight(.semibold))
        Text(verbatim: "\(Self.signed(s.delta)) \(s.field.unit)").font(DS.TextStyle.footnote.monospacedDigit())
      }
      .foregroundStyle(DS.Color.foreground.swiftUI)
      if let since {
        Text(verbatim: since).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(word))
  }

  static func n(_ x: Double) -> String {
    x.formatted(.number.precision(.fractionLength(0...1)).locale(.app))
  }

  static func signed(_ x: Double) -> String {
    (x > 0 ? "+" : x < 0 ? "−" : "±") + n(abs(x))
  }

  /// Nét chung của nhóm Cơ thể (`BodyTrendChart`, 10/11): mỗi lần đo một chấm, hai đầu có ngày;
  /// một hàng hỏng ngày thì cả đường lùi về thứ tự đo (không có nhãn ngày).
  private func sparkline(_ s: Measurements.Series) -> some View {
    let (pts, dated) = BodyTrendChart.points(s.points.map { (date: $0.date, value: $0.value) })
    return BodyTrendChart(points: pts, showsEveryPoint: true, height: 96, showsDates: dated)
      .accessibilityHidden(true)
  }
}
