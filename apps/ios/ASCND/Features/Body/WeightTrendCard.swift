import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Thẻ Cân nặng của phân đoạn Cơ thể (#527, tab Tập luyện 14/10) — phần cân
/// nặng của `body-panel.tsx` @ fac9ac2 trên `WeightTrendBook`.
///
/// Như RN: số hiện tại + chênh lệch 90 ngày (xanh khi đúng hướng mục tiêu hồ
/// sơ); biểu đồ Tuần / Tháng / Năm / Tất cả (mặc định Tất cả) lọc từ toàn bộ
/// lịch sử; đường cân mục tiêu (lưu trên máy); BMI theo chiều cao hồ sơ với
/// thước bốn vùng WHO; "Ghi cân nặng".
///
/// Khác RN: chưa có danh sách lần cân / kéo đọc số trên biểu đồ; cân mục tiêu
/// đặt bằng một hộp nhập (RN: `WeightGoalDialog`).
struct WeightTrendCard: View {
  let book: WeightTrendBook
  var onLog: () -> Void

  @Environment(\.weightUnit) private var unit
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var range: WeightTrend.Range = .all
  @State private var editingGoal = false
  @State private var goalText = ""

  static let tint = DS.Color.metricPurple.swiftUI

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      header
      switch book.phase {
      case .loading:
        RoundedRectangle(cornerRadius: DS.Radius.lg).fill(DS.Color.foreground.swiftUI.opacity(0.05)).frame(height: 160)
      case .failed:
        DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
      case .ready(let all) where all.isEmpty:
        Text(String(localized: "wt.empty"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      case .ready(let all):
        chart(WeightTrend.filter(all, range: range, today: book.today))
        rangePicker
        bmi
      }
      Button(action: onLog) {
        Label(String(localized: "wh.body.logWeight"), systemImage: "plus")
          .font(DS.TextStyle.headline)
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 50)
          .background(Capsule().fill(DS.Color.foreground.swiftUI))
      }
      .buttonStyle(TodayPressStyle())
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .alert(String(localized: "wt.goal.title"), isPresented: $editingGoal) {
      TextField(unit.label, text: $goalText).keyboardType(.decimalPad)
      Button(String(localized: "common.save")) { saveGoal() }
      if book.goalKg != nil {
        Button(String(localized: "wt.goal.clear"), role: .destructive) { book.setGoal(nil) }
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: {
      Text(String(localized: "wt.goal.hint"))
    }
  }

  // MARK: - Đầu thẻ

  private var header: some View {
    let s = book.summary
    return HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 4) {
        Label(String(localized: "wh.body.weight"), systemImage: "scalemass")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(Self.tint)
        if let s {
          (Text(verbatim: Self.number(unit.convert(s.currentKg)))
            .font(.custom("Menlo", size: 32, relativeTo: .largeTitle).weight(.bold))
            + Text(verbatim: " " + unit.label)
            .font(.custom("Menlo", size: 15, relativeTo: .body))
            .foregroundColor(DS.Color.mutedForeground.swiftUI))
          let d = unit.convert(s.deltaKg)
          let good = WeightTrend.deltaGood(s.deltaKg, goal: profile?.profile?.goal)
          Text(String(localized: "wt.delta \(Self.signed(d)) \(unit.label)"))
            .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
            .foregroundStyle(good ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
        }
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: DS.Spacing.sm)
      Button {
        goalText = book.goalKg.map { Self.number(unit.convert($0)) } ?? ""
        editingGoal = true
      } label: {
        VStack(alignment: .trailing, spacing: 2) {
          Text(String(localized: "wt.goal"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: book.goalKg.map { Self.number(unit.convert($0)) + " " + unit.label } ?? String(localized: "wt.goal.set"))
            .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
            .foregroundStyle(Self.tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Self.tint.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.md))
        .frame(minHeight: 44)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "wt.goal.title")))
    }
  }

  // MARK: - Biểu đồ

  private func chart(_ points: [WeightTrend.Point]) -> some View {
    let values = points.map { unit.convert($0.kg) }
    let goal = book.goalKg.map { unit.convert($0) }
    let lo = (values + (goal.map { [$0] } ?? [])).min() ?? 0
    let hi = (values + (goal.map { [$0] } ?? [])).max() ?? 1
    let pad = max(0.5, (hi - lo) * 0.15)
    return Group {
      if points.count < 2 {
        Text(String(localized: "wt.notEnough"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 120)
      } else {
        Chart {
          ForEach(points) { p in
            AreaMark(x: .value("date", p.date.calendarDate), yStart: .value("lo", lo - pad), yEnd: .value("kg", unit.convert(p.kg)))
              .foregroundStyle(LinearGradient(colors: [Self.tint.opacity(0.22), Self.tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
              .interpolationMethod(.monotone)
            LineMark(x: .value("date", p.date.calendarDate), y: .value("kg", unit.convert(p.kg)))
              .foregroundStyle(Self.tint)
              .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
              .interpolationMethod(.monotone)
          }
          if let last = points.last {
            PointMark(x: .value("date", last.date.calendarDate), y: .value("kg", unit.convert(last.kg)))
              .foregroundStyle(Self.tint)
              .symbolSize(50)
          }
          if let goal {
            RuleMark(y: .value("goal", goal))
              .foregroundStyle(Self.tint.opacity(0.6))
              .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
          }
        }
        .chartYScale(domain: (lo - pad)...(hi + pad))
        .chartYAxis {
          AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in
            AxisGridLine().foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.08))
            AxisValueLabel()
          }
        }
        .chartXAxis {
          AxisMarks(values: .automatic(desiredCount: 4)) { _ in
            AxisValueLabel(format: .dateTime.day().month(.abbreviated))
          }
        }
        .frame(height: 170)
        .accessibilityLabel(Text(String(localized: "wh.body.weight")))
      }
    }
  }

  private var rangePicker: some View {
    HStack(spacing: 4) {
      ForEach(WeightTrend.Range.allCases, id: \.self) { r in
        let on = range == r
        Button {
          withAnimation(.snappy) { range = r }
        } label: {
          Text(Self.rangeLabel(r))
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(on ? DS.Color.metricPurple.swiftUI : DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(on ? Self.tint.opacity(0.14) : .clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .sensoryFeedback(.selection, trigger: range)
  }

  // MARK: - BMI

  @ViewBuilder private var bmi: some View {
    if let s = book.summary, let b = WeightTrend.bmi(kg: s.currentKg, heightCm: profile?.profile?.heightCm) {
      let z = WeightTrend.zone(b)
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(String(localized: "wt.bmi"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: Self.number(b))
            .font(.custom("Menlo", size: 15, relativeTo: .body).weight(.semibold))
          Spacer()
          Text(Self.zoneLabel(z))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(Self.zoneColor(z))
        }
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule()
              .fill(LinearGradient(
                stops: [
                  .init(color: Self.zoneColor(.under).opacity(0.55), location: 0),
                  .init(color: Self.zoneColor(.under).opacity(0.55), location: WeightTrend.bmiPosition(18.5) - 0.03),
                  .init(color: Self.zoneColor(.healthy).opacity(0.55), location: WeightTrend.bmiPosition(18.5) + 0.03),
                  .init(color: Self.zoneColor(.healthy).opacity(0.55), location: WeightTrend.bmiPosition(25) - 0.03),
                  .init(color: Self.zoneColor(.over).opacity(0.55), location: WeightTrend.bmiPosition(25) + 0.03),
                  .init(color: Self.zoneColor(.over).opacity(0.55), location: WeightTrend.bmiPosition(30) - 0.03),
                  .init(color: Self.zoneColor(.obese).opacity(0.55), location: WeightTrend.bmiPosition(30) + 0.03),
                  .init(color: Self.zoneColor(.obese).opacity(0.55), location: 1),
                ], startPoint: .leading, endPoint: .trailing))
              .frame(height: 8)
            Circle()
              .fill(.white)
              .overlay(Circle().stroke(Self.zoneColor(z), lineWidth: 3))
              .frame(width: 16, height: 16)
              .offset(x: (geo.size.width - 16) * WeightTrend.bmiPosition(b))
          }
        }
        .frame(height: 16)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "wt.bmi")))
      .accessibilityValue(Text(verbatim: Self.number(b) + ", " + Self.zoneLabel(z)))
    }
  }

  // MARK: - Chữ

  private func saveGoal() {
    let v = Double(goalText.replacingOccurrences(of: ",", with: "."))
    guard let v, v > 0 else { return }
    book.setGoal(unit.toKg(v))
  }

  static func number(_ x: Double) -> String {
    x.formatted(.number.precision(.fractionLength(0...1)).locale(.app))
  }

  static func signed(_ x: Double) -> String {
    let r = (x * 10).rounded() / 10
    return (r > 0 ? "+" : r < 0 ? "−" : "±") + abs(r).formatted(.number.precision(.fractionLength(0...1)).locale(.app))
  }

  static func rangeLabel(_ r: WeightTrend.Range) -> String {
    switch r {
    case .week: String(localized: "wt.range.week")
    case .month: String(localized: "wt.range.month")
    case .year: String(localized: "wt.range.year")
    case .all: String(localized: "wt.range.all")
    }
  }

  static func zoneLabel(_ z: WeightTrend.BMIZone) -> String {
    switch z {
    case .under: String(localized: "wt.bmi.under")
    case .healthy: String(localized: "wt.bmi.healthy")
    case .over: String(localized: "wt.bmi.over")
    case .obese: String(localized: "wt.bmi.obese")
    }
  }

  static func zoneColor(_ z: WeightTrend.BMIZone) -> Color {
    switch z {
    case .under: DS.Color.metricBlue.swiftUI
    case .healthy: DS.Color.readinessGreen.swiftUI
    case .over: DS.Color.readinessYellow.swiftUI
    case .obese: DS.Color.readinessRed.swiftUI
    }
  }
}
