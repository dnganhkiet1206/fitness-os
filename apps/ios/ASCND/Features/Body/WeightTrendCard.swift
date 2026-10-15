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
  @Environment(\.locale) private var locale
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var range: WeightTrend.Range = .all
  @State private var editingGoal = false
  @State private var showsAll = false
  /// Ngày ngón tay đang chỉ trên biểu đồ (kéo để đọc số, 14/10).
  @State private var scrubDate: Date?

  /// Xám thép = màu cân nặng ở Hôm nay (`TodayYourDay.color`, 14/10).
  static let tint = DS.Color.metricSteel.swiftUI

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
        goalRow
        bmi
      }
      Button(action: onLog) {
        Label(String(localized: "wh.body.logWeight"), systemImage: "plus")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 50)
          .background(Capsule().fill(DS.Color.foreground.swiftUI))
      }
      .buttonStyle(TodayPressStyle())
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
    .sheet(isPresented: $editingGoal) {
      WeightGoalSheet(goalKg: book.goalKg, currentKg: book.summary?.currentKg, unit: unit) { book.setGoal($0) }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    if case .ready(let all) = book.phase, !all.isEmpty { logList(WeightTrend.entries(all)) }
  }

  // MARK: - Cân mục tiêu

  /// Một hàng, một sheet (RN `goalRow` + `WeightGoalDialog`).
  private var goalRow: some View {
    Button {
      editingGoal = true
    } label: {
      HStack(spacing: 10) {
        Image(systemName: "target")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(Self.tint)
          .frame(width: 30, height: 30)
          .background(Self.tint.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 1) {
          Text(String(localized: "wt.goal.title"))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          if let line = toGoLine {
            Text(verbatim: line)
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Spacer(minLength: DS.Spacing.sm)
        Text(verbatim: book.goalKg.map { Self.number(unit.convert($0)) + " " + unit.label } ?? String(localized: "wt.goal.unset"))
          .font(book.goalKg == nil ? DS.TextStyle.body : .custom("Menlo", size: 15, relativeTo: .body).weight(.semibold))
          .foregroundStyle(book.goalKg == nil ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.vertical, 6)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .overlay(alignment: .top) { Divider().opacity(0.5) }
  }

  /// "Còn 2,8 kg" / "Đã đạt mục tiêu" (`nWeightGoalToGo` / `nWeightGoalReached`).
  private var toGoLine: String? {
    guard let g = book.goalKg, let c = book.summary?.currentKg else { return nil }
    let d = abs(unit.convert(c) - unit.convert(g))
    if d < 0.05 { return String(localized: "wt.goal.reached") }
    return String(localized: "wt.goal.toGo \(Self.number(d)) \(unit.label)")
  }

  // MARK: - Các lần cân

  private func logList(_ entries: [WeightTrend.Entry]) -> some View {
    let shown = showsAll ? entries : Array(entries.prefix(5))
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text(String(localized: "wt.log.title"))
          .font(DS.TextStyle.title)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Text(String(localized: "wt.log.count \(entries.count)"))
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(.horizontal, 4)
      .padding(.top, DS.Spacing.sm)
      VStack(spacing: 0) {
        ForEach(Array(shown.enumerated()), id: \.element.id) { i, e in
          if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
          logRow(e)
        }
        if entries.count > 5 {
          Divider().opacity(0.6)
          Button {
            withAnimation(.snappy) { showsAll.toggle() }
          } label: {
            Text(showsAll ? String(localized: "wt.log.less") : String(localized: "wt.log.all \(entries.count)"))
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(Self.tint)
              .frame(maxWidth: .infinity, minHeight: 48)
          }
          .buttonStyle(.plain)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard()
    }
  }

  private func logRow(_ e: WeightTrend.Entry) -> some View {
    HStack(spacing: 12) {
      Image(systemName: "scalemass.fill")
        .font(.footnote)
        .foregroundStyle(Self.tint)
        .frame(width: 32, height: 32)
        .background(Self.tint.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      Text(verbatim: e.date.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated).locale(.app)))
        .font(DS.TextStyle.body)
      Spacer(minLength: DS.Spacing.sm)
      if let c = e.changeKg {
        let d = unit.convert(c)
        Text(verbatim: Self.signed(d))
          .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
          .foregroundStyle(abs(d) < 0.05 ? DS.Color.mutedForeground.swiftUI
            : WeightTrend.deltaGood(c, goal: profile?.profile?.goal) ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
      }
      (Text(verbatim: Self.number(unit.convert(e.kg)))
        .font(.custom("Menlo", size: 16, relativeTo: .body).weight(.semibold))
        + Text(verbatim: " " + unit.label).font(DS.TextStyle.caption).foregroundColor(DS.Color.mutedForeground.swiftUI))
        .frame(minWidth: 76, alignment: .trailing)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 52)
    .accessibilityElement(children: .combine)
  }

  // MARK: - Đầu thẻ

  private var header: some View {
    let s = book.summary
    return HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 4) {
        Label(String(localized: "wh.body.weight"), systemImage: "scalemass.fill")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(Self.tint)
        // Đang kéo trên biểu đồ: số lớn là của ngày đang chỉ, dòng dưới là
        // ngày + chênh lệch với lần cân trước (như Sức khoẻ / Chứng khoán) —
        // không có nhãn nổi đè lên đường.
        let all = WeightTrend.filter(book.all, range: range, today: book.today)
        if let p = scrubbed(all) {
          (Text(verbatim: Self.number(unit.convert(p.kg)))
            .font(.custom("Menlo", size: 32, relativeTo: .largeTitle).weight(.bold))
            + Text(verbatim: " " + unit.label)
            .font(.custom("Menlo", size: 15, relativeTo: .body))
            .foregroundColor(DS.Color.mutedForeground.swiftUI))
            .contentTransition(.numericText())
          HStack(spacing: 6) {
            Text(p.date.calendarDate, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(.app))
            if let c = WeightTrend.change(of: p, in: all) {
              Text(verbatim: "\(Self.signed(unit.convert(c))) \(unit.label)").monospacedDigit()
            }
          }
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(Self.tint)
        } else if let s {
          (Text(verbatim: Self.number(unit.convert(s.currentKg)))
            .font(.custom("Menlo", size: 32, relativeTo: .largeTitle).weight(.bold))
            + Text(verbatim: " " + unit.label)
            .font(.custom("Menlo", size: 15, relativeTo: .body))
            .foregroundColor(DS.Color.mutedForeground.swiftUI))
            .contentTransition(.numericText())
          let d = unit.convert(s.deltaKg)
          let good = WeightTrend.deltaGood(s.deltaKg, goal: profile?.profile?.goal)
          Text(String(localized: "wt.delta \(Self.signed(d)) \(unit.label)"))
            .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
            .foregroundStyle(good ? DS.Color.readinessGreen.swiftUI : DS.Color.mutedForeground.swiftUI)
        }
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: 0)
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
          if let picked = scrubbed(points) {
            RuleMark(x: .value("date", picked.date.calendarDate))
              .foregroundStyle(Self.tint.opacity(0.35))
              .lineStyle(StrokeStyle(lineWidth: 1))
            PointMark(x: .value("date", picked.date.calendarDate), y: .value("kg", unit.convert(picked.kg)))
              .foregroundStyle(Self.tint)
              .symbolSize(80)
          } else if let last = points.last {
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
        .chartXSelection(value: $scrubDate)
        .sensoryFeedback(.selection, trigger: scrubbed(points)?.date)
        .frame(height: 170)
        .accessibilityLabel(Text(String(localized: "wh.body.weight")))
      }
    }
  }

  /// Lần cân gần chỗ ngón tay nhất.
  private func scrubbed(_ points: [WeightTrend.Point]) -> WeightTrend.Point? {
    guard let scrubDate else { return nil }
    return WeightTrend.nearest(points, to: LocalDate(EpochMillis(scrubDate), in: .current))
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
            .foregroundStyle(on ? Self.tint : DS.Color.mutedForeground.swiftUI)
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

/// Đặt cân nặng mục tiêu — `weight-goal-dialog.tsx` + `weight-goal-ruler.tsx`
/// @ fac9ac2, vẽ lại 14/10 (chủ dự án: "vẽ cái cân theo kiểu RN nhưng đẹp hơn").
///
/// Như RN: màn riêng; câu hướng (Giảm / Tăng / Giữ so với cân hiện tại); số to
/// luôn một chữ số lẻ (không giật khi kéo); thước kéo bước 0,1 trong 30–300 kg
/// theo đơn vị, kim cố định ở giữa; mỗi vạch rung nhẹ, qua một đơn vị nguyên rung
/// chắc hơn; mở ở mục tiêu cũ → cân hiện tại → 70 kg; "Bỏ mục tiêu" chỉ khi có.
///
/// Đẹp hơn RN: một CÁI CÂN vẽ tay phía trên — mặt cân bo tròn, ô kính có mặt số
/// cong xoay theo thước (lò xo), kim đỏ; số đổi bằng hiệu ứng chữ số; ±0,1 và
/// điều chỉnh bằng VoiceOver.
struct WeightGoalSheet: View {
  let goalKg: Double?
  let currentKg: Double?
  let unit: WeightUnit
  let onSave: (Double?) -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var tick: Int?

  private var minTick: Int { Int((unit.convert(WeightTrend.goalRange.lowerBound) * 10).rounded(.up)) }
  private var maxTick: Int { Int((unit.convert(WeightTrend.goalRange.upperBound) * 10).rounded(.down)) }
  private var current: Int { tick ?? seed }
  private var value: Double { Double(current) / 10 }
  private var seed: Int {
    let kg = goalKg ?? currentKg ?? 70
    return min(maxTick, max(minTick, Int((unit.convert(kg) * 10).rounded())))
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Button(String(localized: "common.cancel")) { dismiss() }
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Spacer()
        Text(String(localized: "wt.goal.title")).font(DS.TextStyle.headline)
        Spacer()
        Button(String(localized: "common.cancel")) {}.hidden()
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 52)

      Spacer(minLength: DS.Spacing.sm).frame(maxHeight: 40)

      Text(verbatim: intentLine)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(WeightTrendCard.tint)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, 6)
        .background(WeightTrendCard.tint.opacity(0.12), in: Capsule())
        .opacity(currentKg == nil ? 0 : 1)
        .animation(.snappy, value: intentLine)

      BathroomScale(value: value, unit: unit.label)
        .frame(width: 250, height: 250)
        .animation(reduceMotion ? nil : .spring(duration: 0.45, bounce: 0.25), value: value)
        .padding(.vertical, DS.Spacing.md)
        .accessibilityHidden(true)

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(verbatim: value.formatted(.number.precision(.fractionLength(1)).locale(.app)))
          .font(.custom("Menlo", size: 48, relativeTo: .largeTitle).weight(.bold))
          .monospacedDigit()
          .contentTransition(.numericText(value: value))
          .animation(.snappy(duration: 0.2), value: value)
        Text(verbatim: unit.label)
          .font(.custom("Menlo", size: 18, relativeTo: .title3))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "wt.goal.title")))
      .accessibilityValue(Text(verbatim: WeightTrendCard.number(value) + " " + unit.label))
      .accessibilityAdjustableAction { dir in step(dir == .increment ? 1 : -1) }

      HStack(spacing: DS.Spacing.sm) {
        stepButton("minus", -1)
        ruler
        stepButton("plus", 1)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.top, DS.Spacing.md)

      Spacer(minLength: DS.Spacing.md)

      HStack(spacing: DS.Spacing.sm) {
        if goalKg != nil {
          Button {
            onSave(nil)
            dismiss()
          } label: {
            Text(String(localized: "wt.goal.clear"))
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 52)
              .background(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
          }
          .buttonStyle(TodayPressStyle())
        }
        Button {
          onSave(unit.toKg(value))
          dismiss()
        } label: {
          Text(String(localized: "wt.goal.done"))
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.background.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Capsule().fill(DS.Color.foreground.swiftUI))
        }
        .buttonStyle(TodayPressStyle())
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.bottom, DS.Spacing.md)
    }
    .ascndPage()
    .onAppear { tick = seed }
    // Mỗi vạch rung nhẹ; qua một đơn vị nguyên rung chắc hơn (RN: selection /
    // light) — cú kéo có "khấc" để cảm.
    .sensoryFeedback(trigger: tick) { old, new in
      guard let old, let new else { return nil }
      return Int((Double(old) / 10).rounded(.down)) != Int((Double(new) / 10).rounded(.down))
        ? .impact(weight: .medium, intensity: 0.8) : .selection
    }
  }

  private var intentLine: String {
    guard let c = currentKg else { return " " }
    switch WeightTrend.intent(goalKg: unit.toKg(value), currentKg: c) {
    case .maintain: return String(localized: "wt.goal.maintain")
    case .lose(let d): return String(localized: "wt.goal.lose \(WeightTrendCard.number(unit.convert(d))) \(unit.label)")
    case .gain(let d): return String(localized: "wt.goal.gain \(WeightTrendCard.number(unit.convert(d))) \(unit.label)")
    }
  }

  private func step(_ by: Int) {
    let next = min(maxTick, max(minTick, current + by))
    withAnimation(.snappy) { tick = next }
  }

  private func stepButton(_ symbol: String, _ by: Int) -> some View {
    Button { step(by) } label: {
      Image(systemName: symbol)
        .font(.body.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(width: 44, height: 44)
        .background(Circle().fill(DS.Color.foreground.swiftUI.opacity(0.06)))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(symbol == "plus" ? String(localized: "wt.goal.up") : String(localized: "wt.goal.down")))
  }

  /// Thước kéo: vạch 0,1; dài ở đơn vị nguyên (kèm số), vừa ở nửa đơn vị; kim
  /// có quầng; hai đầu mờ dần. Dải chỉ từ min tới max — không vạch nào ngoài dải.
  private var ruler: some View {
    GeometryReader { geo in
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 0) {
          ForEach(minTick...maxTick, id: \.self) { t in
            let major = t % 10 == 0
            let half = t % 5 == 0
            VStack(spacing: 6) {
              Capsule()
                .fill(DS.Color.foreground.swiftUI.opacity(major ? 0.6 : half ? 0.35 : 0.18))
                .frame(width: major ? 2 : 1.5, height: major ? 34 : half ? 24 : 14)
              Text(verbatim: major ? "\(t / 10)" : " ")
                .font(.caption2.weight(.semibold).monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .fixedSize()
                .frame(width: 10, height: 14)
            }
            .frame(width: 10, height: 60, alignment: .top)
            .id(t)
          }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, geo.size.width / 2 - 5, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
      .scrollPosition(id: $tick, anchor: .center)
      .mask(LinearGradient(stops: [
        .init(color: .clear, location: 0), .init(color: .black, location: 0.18),
        .init(color: .black, location: 0.82), .init(color: .clear, location: 1),
      ], startPoint: .leading, endPoint: .trailing))
      .overlay(alignment: .top) {
        Capsule()
          .fill(DS.Color.readinessRed.swiftUI)
          .frame(width: 3, height: 46)
          .shadow(color: DS.Color.readinessRed.swiftUI.opacity(0.5), radius: 6)
          .offset(y: -6)
          .allowsHitTesting(false)
      }
    }
    .frame(height: 60)
    .accessibilityHidden(true)
  }
}

/// Cái cân vẽ tay: mặt cân bo tròn có bóng mềm, hai chân, ô kính bán nguyệt
/// với mặt số cong (vạch 0,5, số mỗi 5 đơn vị) xoay quanh trục dưới ô — giá
/// trị đang chọn nằm dưới kim đỏ. `value` là animatable: mặt số quay êm theo
/// lò xo của bên gọi.
struct BathroomScale: View, @preconcurrency Animatable {
  var value: Double
  let unit: String
  @Environment(\.colorScheme) private var scheme

  var animatableData: Double {
    get { value }
    set { value = newValue }
  }

  /// Độ quay cho mỗi đơn vị.
  static let degreesPerUnit = 15.0

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      ZStack {
        // Bóng sàn.
        Ellipse()
          .fill(.black.opacity(scheme == .dark ? 0.45 : 0.12))
          .frame(width: w * 0.86, height: h * 0.08)
          .blur(radius: 8)
          .offset(y: h * 0.47)
        // Chân.
        HStack {
          Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.35)).frame(width: w * 0.12, height: h * 0.05)
          Spacer()
          Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.35)).frame(width: w * 0.12, height: h * 0.05)
        }
        .padding(.horizontal, w * 0.12)
        .offset(y: h * 0.45)
        // Mặt cân.
        RoundedRectangle(cornerRadius: w * 0.2, style: .continuous)
          .fill(LinearGradient(
            colors: scheme == .dark
              ? [Color(white: 0.30), Color(white: 0.18)]
              : [Color(red: 0.99, green: 0.98, blue: 0.96), Color(red: 0.90, green: 0.88, blue: 0.85)],
            startPoint: .top, endPoint: .bottom))
          .overlay(
            RoundedRectangle(cornerRadius: w * 0.2, style: .continuous)
              .strokeBorder(LinearGradient(colors: [.white.opacity(0.9), .white.opacity(0.05)], startPoint: .top, endPoint: .bottom), lineWidth: 1.5))
          .shadow(color: .black.opacity(scheme == .dark ? 0.4 : 0.12), radius: 14, y: 8)
          .frame(width: w * 0.92, height: h * 0.88)
        // Hai tấm đặt chân.
        HStack(spacing: w * 0.06) {
          pad(w: w, h: h)
          pad(w: w, h: h)
        }
        .offset(y: h * 0.22)
        // Ô kính + mặt số.
        dialWindow(w: w, h: h)
          .offset(y: -h * 0.14)
      }
      .frame(width: w, height: h)
    }
  }

  private func pad(w: CGFloat, h: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: w * 0.08, style: .continuous)
      .fill(DS.Color.foreground.swiftUI.opacity(scheme == .dark ? 0.10 : 0.05))
      .overlay(
        VStack(spacing: h * 0.025) {
          ForEach(0..<4, id: \.self) { _ in
            Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.08)).frame(height: 2)
          }
        }
        .padding(.horizontal, w * 0.05))
      .frame(width: w * 0.3, height: h * 0.3)
  }

  private func dialWindow(w: CGFloat, h: CGFloat) -> some View {
    let ww = w * 0.62
    let wh = h * 0.34
    return ZStack {
      RoundedRectangle(cornerRadius: wh * 0.32, style: .continuous)
        .fill(scheme == .dark ? Color(white: 0.08) : Color(red: 0.99, green: 0.99, blue: 0.97))
      Canvas { ctx, size in
        drawDial(ctx, size)
      }
      .clipShape(RoundedRectangle(cornerRadius: wh * 0.32, style: .continuous))
      // Kim: mũi nhọn từ mép trên, không đè lên số.
      VStack(spacing: 0) {
        NeedleShape()
          .fill(DS.Color.readinessRed.swiftUI)
          .frame(width: 12, height: wh * 0.40)
          .shadow(color: DS.Color.readinessRed.swiftUI.opacity(0.45), radius: 3, y: 1)
        Spacer(minLength: 0)
      }
      // Kính: phản chiếu chéo.
      RoundedRectangle(cornerRadius: wh * 0.32, style: .continuous)
        .fill(LinearGradient(colors: [.white.opacity(0.45), .white.opacity(0)], startPoint: .topLeading, endPoint: .center))
        .allowsHitTesting(false)
      RoundedRectangle(cornerRadius: wh * 0.32, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 2)
    }
    .frame(width: ww, height: wh)
  }

  /// Mặt số: vòng tròn lớn tâm dưới ô kính; vạch treo từ mép trên, số ở mỗi
  /// đơn vị (số đang chọn đậm hơn); giá trị `value` nằm dưới kim.
  private func drawDial(_ ctx: GraphicsContext, _ size: CGSize) {
    let radius = size.width * 0.95
    let center = CGPoint(x: size.width / 2, y: size.height * 0.08 + radius)
    let ink = scheme == .dark ? Color.white : Color(red: 0.11, green: 0.11, blue: 0.10)
    let span = 4.5
    let lo = Int(((value - span) * 2).rounded(.down))
    let hi = Int(((value + span) * 2).rounded(.up))
    for half in lo...hi {
      let v = Double(half) / 2
      let angle = (v - value) * Self.degreesPerUnit * .pi / 180
      let whole = half % 2 == 0
      let five = half % 10 == 0
      let len: CGFloat = five ? size.height * 0.30 : whole ? size.height * 0.22 : size.height * 0.12
      let dir = CGPoint(x: sin(angle), y: -cos(angle))
      let p1 = CGPoint(x: center.x + dir.x * radius, y: center.y + dir.y * radius)
      let p2 = CGPoint(x: center.x + dir.x * (radius - len), y: center.y + dir.y * (radius - len))
      var path = Path()
      path.move(to: p1)
      path.addLine(to: p2)
      let fade = max(0, 1 - abs(v - value) / span)
      ctx.stroke(
        path, with: .color(ink.opacity((five ? 0.9 : whole ? 0.65 : 0.35) * fade)),
        style: StrokeStyle(lineWidth: five ? 2.2 : whole ? 1.6 : 1, lineCap: .round))
      if whole {
        let near = abs(v - value) < 0.5
        let lp = CGPoint(x: center.x + dir.x * (radius - size.height * 0.30 - 13), y: center.y + dir.y * (radius - size.height * 0.30 - 13))
        var label = ctx
        label.opacity = fade
        label.translateBy(x: lp.x, y: lp.y)
        label.rotate(by: .radians(angle))
        label.draw(
          Text(verbatim: "\(Int(v))")
            .font(.system(size: near ? 15 : 11, weight: near ? .heavy : .semibold, design: .rounded))
            .foregroundStyle(ink),
          at: .zero)
      }
    }
    ctx.draw(
      Text(verbatim: unit).font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(ink.opacity(0.45)),
      at: CGPoint(x: size.width / 2, y: size.height * 0.88))
  }
}

/// Kim của cân: tam giác nhọn xuống, đầu tròn.
struct NeedleShape: Shape {
  func path(in r: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: r.minX, y: r.minY))
    p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
    p.addLine(to: CGPoint(x: r.midX + 1, y: r.maxY))
    p.addQuadCurve(to: CGPoint(x: r.midX - 1, y: r.maxY), control: CGPoint(x: r.midX, y: r.maxY + 2))
    p.closeSubpath()
    return p
  }
}
