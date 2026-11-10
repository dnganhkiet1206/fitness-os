import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Biểu đồ "một số theo ngày" của nhóm Cơ thể (10/11, Kiệt duyệt mock "Thống nhất nút và
/// biểu đồ", https://claude.ai/artifact/Kmt7Y9vxeMnmsBGA79FdV3). Cân nặng, Số đo cơ thể,
/// Hiệu chỉnh mục tiêu và mỡ ước tính của Ảnh tiến trình dùng chung MỘT nét — trước đây mỗi
/// màn một kiểu (đường kem không trục, Swift Charts mặc định có nhãn từng điểm, đường tự vẽ…):
/// - đường 2 pt màu Cơ thể (`metricSteel`), vùng tô mờ dần xuống;
/// - 3 vạch lưới ngang mảnh, số trục bên phải;
/// - chấm ở điểm mới nhất (hay điểm đang chạm khi kéo ngón);
/// - ngày đầu và ngày cuối dưới đường;
/// - mục tiêu (nếu có) là vạch ngang nét đứt;
/// - số ước tính (AI) vẽ nét đứt để không lẫn với số đo thật.
struct BodyTrendChart: View {
  struct Point: Identifiable, Hashable {
    let id: Int
    let date: Date
    let value: Double
  }

  let points: [Point]
  var goal: Double?
  /// Số ước tính (Đo AI): đường nét đứt.
  var estimate = false
  /// Mỗi lần đo một chấm (Số đo: đường trơn không cho biết đã đo mấy lần).
  var showsEveryPoint = false
  var height: CGFloat = 140
  /// Ngày thật dưới đường; tắt khi điểm không có ngày (Số đo có hàng hỏng ngày).
  var showsDates = true
  /// Kéo ngón chọn ngày (Cân nặng). `selected` là điểm đang chạm, cha tính.
  var selection: Binding<Date?>?
  var selected: Point?

  static let tint = DS.Color.metricSteel.swiftUI

  /// Ngày lịch → điểm; thiếu ngày thì xếp theo thứ tự đo và tắt nhãn ngày.
  static func points(_ raw: [(date: LocalDate?, value: Double)]) -> (points: [Point], dated: Bool) {
    let dated = raw.allSatisfy { $0.date != nil }
    let base = Date(timeIntervalSince1970: 0)
    let pts = raw.enumerated().map { i, r in
      Point(id: i, date: dated ? (r.date?.calendarDate ?? base) : base.addingTimeInterval(Double(i) * 86_400), value: r.value)
    }
    return (pts, dated)
  }

  var body: some View {
    let values = points.map(\.value) + (goal.map { [$0] } ?? [])
    let lo = values.min() ?? 0
    let hi = values.max() ?? 1
    let pad = max((hi - lo) * 0.15, 0.5)
    VStack(spacing: 4) {
      selectable(chart(floor: lo - pad))
        .chartYScale(domain: (lo - pad)...(hi + pad))
        .chartYAxis {
          AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in
            AxisGridLine().foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.08))
            AxisValueLabel {
              if let d = v.as(Double.self) {
                Text(verbatim: d.formatted(.number.precision(.fractionLength(0...1)).locale(.app)))
                  .font(DS.TextStyle.caption.monospacedDigit())
              }
            }
          }
        }
        .chartXAxis(.hidden)
        .frame(height: height)
      if showsDates, let first = points.first?.date, let last = points.last?.date,
        !Calendar.current.isDate(first, inSameDayAs: last)
      {
        HStack {
          Text(first, format: .dateTime.day().month(.abbreviated).locale(.app))
          Spacer()
          Text(last, format: .dateTime.day().month(.abbreviated).locale(.app))
        }
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.trailing, 36)
      }
    }
  }

  private func chart(floor: Double) -> some View {
    let tint = Self.tint
    let marked = selected ?? points.last
    return Chart {
      ForEach(points) { p in
        AreaMark(x: .value("date", p.date), yStart: .value("floor", floor), yEnd: .value("value", p.value))
          .foregroundStyle(LinearGradient(colors: [tint.opacity(0.2), tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
          .interpolationMethod(.monotone)
        LineMark(x: .value("date", p.date), y: .value("value", p.value))
          .foregroundStyle(tint)
          .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: estimate ? [5, 4] : []))
          .interpolationMethod(.monotone)
        if showsEveryPoint, p.id != marked?.id {
          PointMark(x: .value("date", p.date), y: .value("value", p.value))
            .foregroundStyle(tint.opacity(0.55))
            .symbolSize(18)
        }
      }
      if let selected {
        RuleMark(x: .value("date", selected.date))
          .foregroundStyle(tint.opacity(0.35))
          .lineStyle(StrokeStyle(lineWidth: 1))
      }
      if let marked {
        PointMark(x: .value("date", marked.date), y: .value("value", marked.value))
          .foregroundStyle(tint)
          .symbolSize(selected == nil ? 50 : 80)
      }
      if let goal {
        RuleMark(y: .value("goal", goal))
          .foregroundStyle(tint.opacity(0.6))
          .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
      }
    }
  }

  @ViewBuilder private func selectable(_ chart: some View) -> some View {
    if let selection {
      chart.chartXSelection(value: selection)
    } else {
      chart
    }
  }
}
