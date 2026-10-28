import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Chữ và màu của "Tiến bộ từng bài" theo mức tạ (Kiệt duyệt mock 28/10):
/// một chỗ cho danh sách và màn chi tiết.
struct ExerciseCompareText {
  let unit: WeightUnit
  let locale: Locale

  func load(_ kg: Double) -> String { unit.localizedLoad(kg, locale: locale) ?? unit.load(kg) }

  /// "18,4 kg × 10", "18 reps", "60 giây".
  func value(_ t: ExerciseCompare.Top, _ metric: ExerciseCompare.Metric) -> String {
    switch metric {
    // Buổi ghi 0 kg của một bài có tạ: nói "không tạ", không in "0 kg".
    case .weight where t.kg == 0: "\(reps(t.reps)) · \(String(localized: "xi.bodyweight").lowercased(with: locale))"
    case .weight: "\(load(t.kg)) × \(t.reps)"
    case .reps: reps(t.reps)
    case .time: String(localized: "xp.seconds \(t.seconds ?? 0)")
    }
  }

  func reps(_ n: Int) -> String {
    n == 1 ? String(localized: "xi.reps.one") : String(localized: "xi.reps.other \(n)")
  }

  /// "21/10" (vi) / "10/21" (en) — mẫu "dM" theo ngôn ngữ app.
  func date(_ d: LocalDate) -> String { date(d.calendarDate) }

  func date(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = locale
    f.setLocalizedDateFormatFromTemplate("dM")
    return f.string(from: d)
  }

  func dayLong(_ d: LocalDate) -> String {
    let f = DateFormatter()
    f.locale = locale
    f.setLocalizedDateFormatFromTemplate("EEEdM")
    return f.string(from: d.calendarDate)
  }

  /// Dòng nhỏ dưới tên bài.
  func previousLine(_ item: ExerciseCompare.Item) -> String {
    guard let p = item.previous else { return String(localized: "xp.first") }
    return String(localized: "xp.prev \(value(p, item.metric)) \(date(p.date))")
  }

  private func signed(_ text: String, _ positive: Bool) -> String { (positive ? "+" : "−") + text }

  func chip(_ d: ExerciseCompare.Delta) -> String {
    switch d {
    case .first: String(localized: "xp.chip.first")
    case .same: String(localized: "xp.chip.same")
    case .noWeight: String(localized: "xp.chip.noWeight")
    case .weight(let kg):
      signed(
        "\(unit.display(abs(kg)).formatted(.number.precision(.fractionLength(0...1)).locale(locale))) \(unit.label)",
        kg > 0)
    case .reps(let n): String(localized: "xp.chip.reps \(signed("\(abs(n))", n > 0))")
    case .seconds(let s): String(localized: "xp.chip.seconds \(signed("\(abs(s))", s > 0))")
    }
  }

  /// Tăng tạ: nền đặc; thêm reps / giây: nền nhạt; giảm: hổ phách; còn lại: xám.
  static func chipColors(_ d: ExerciseCompare.Delta) -> (fg: Color, bg: Color) {
    let good = DS.Color.statusGood.swiftUI
    switch d {
    case .weight(let kg) where kg > 0: return (DS.Color.background.swiftUI, good)
    case .reps(let n) where n > 0, .seconds(let n) where n > 0: return (good, good.opacity(0.14))
    case _ where d.isDown:
      return (DS.Color.statusAttention.swiftUI, DS.Color.statusAttention.swiftUI.opacity(0.14))
    default: return (DS.Color.mutedForeground.swiftUI, DS.Color.foreground.swiftUI.opacity(0.08))
    }
  }

  func next(_ n: ExerciseCompare.Next) -> String {
    switch n {
    case .holdWeight(let kg, let low, let high): String(localized: "xp.next.hold \(load(kg)) \(low) \(high)")
    case .addWeight(let kg): String(localized: "xp.next.add \(load(kg))")
    case .moreReps(let low, let high): String(localized: "xp.next.reps \(low) \(high)")
    }
  }
}

/// Chip thay đổi so với buổi trước ("+2,5 kg", "+5 reps", "Lần đầu").
struct ExerciseDeltaChip: View {
  let delta: ExerciseCompare.Delta
  let text: ExerciseCompareText

  var body: some View {
    let c = ExerciseCompareText.chipColors(delta)
    Text(verbatim: text.chip(delta))
      .font(DS.TextStyle.caption.weight(.bold))
      .monospacedDigit()
      .foregroundStyle(c.fg)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(c.bg, in: Capsule())
  }
}

/// Một hàng của danh sách: tên + buổi trước bên trái, set đỉnh mới + chip bên phải.
struct ExerciseCompareRow: View {
  let item: ExerciseCompare.Item
  let text: ExerciseCompareText

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 3) {
        Text(verbatim: item.name).font(DS.TextStyle.body.weight(.semibold)).lineLimit(1)
        Text(verbatim: text.previousLine(item))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      VStack(alignment: .trailing, spacing: 4) {
        Text(verbatim: text.value(item.last, item.metric))
          .font(DS.TextStyle.body.weight(.bold))
          .monospacedDigit()
        ExerciseDeltaChip(delta: item.delta, text: text)
      }
      Image(systemName: "chevron.right")
        .font(.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.vertical, 10)
    .frame(minHeight: 44)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
  }
}

/// Màn chi tiết một bài: set đỉnh mới nhất, biểu đồ set đỉnh mỗi buổi, các buổi,
/// gợi ý lần tới, rồi phân tích cũ (xu hướng, kỷ lục, 1RM) ở cuối.
struct ExerciseCompareDetail: View {
  let item: ExerciseCompare.Item
  let insight: ExerciseInsight?

  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale
  private var text: ExerciseCompareText { ExerciseCompareText(unit: unit, locale: locale) }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text(String(localized: "xp.meta \(item.sessions.count)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        latest
        if (item.metric == .weight ? item.sessions.filter { $0.kg > 0 } : item.sessions).count > 1 { chart }
        sessions
        if let next = ExerciseCompare.next(item) {
          Text(verbatim: text.next(next))
            .font(DS.TextStyle.body)
            .padding(DS.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DS.Color.statusGood.swiftUI.opacity(0.08), in: RoundedRectangle(cornerRadius: DS.Radius.lg))
        }
        if let insight {
          Text("xp.more")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .textCase(.uppercase)
            .accessibilityAddTraits(.isHeader)
          InsightCard(insight: insight, unit: unit, locale: locale)
          Text("xi.footnote")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Text("xp.footnote")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(verbatim: item.name))
    .ascndPage()
  }

  private var latest: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(String(localized: "xp.last \(text.dayLong(item.last.date))"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .textCase(.uppercase)
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
          Text(verbatim: text.value(item.last, item.metric))
            .font(DS.TextStyle.number(34, .largeTitle).weight(.bold))
            .monospacedDigit()
            .minimumScaleFactor(0.7)
            .lineLimit(1)
          ExerciseDeltaChip(delta: item.delta, text: text)
        }
        if let p = item.previous {
          Text(String(localized: "xp.prevDetail \(text.date(p.date)) \(text.value(p, item.metric)) \(p.sets)"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// Giá trị vẽ: tạ theo đơn vị của người dùng, reps, hoặc giây.
  private func plotted(_ t: ExerciseCompare.Top) -> Double {
    switch item.metric {
    case .weight: unit.display(t.kg)
    case .reps: Double(t.reps)
    case .time: Double(t.seconds ?? 0)
    }
  }

  private var chartTitle: LocalizedStringKey {
    switch item.metric {
    case .weight: "xp.chart.weight"
    case .reps: "xp.chart.reps"
    case .time: "xp.chart.time"
    }
  }

  private var chart: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(chartTitle).font(DS.TextStyle.headline)
        // Buổi 0 kg của bài có tạ không mang thông tin mức tạ — không vẽ.
        let points = item.metric == .weight ? item.sessions.filter { $0.kg > 0 } : item.sessions
        Chart(Array(points.enumerated()), id: \.offset) { pair in
          let t = pair.element
          LineMark(x: .value("date", t.date.calendarDate), y: .value("v", plotted(t)))
            .foregroundStyle(DS.Color.statusGood.swiftUI)
            .interpolationMethod(.linear)
          PointMark(x: .value("date", t.date.calendarDate), y: .value("v", plotted(t)))
            .foregroundStyle(DS.Color.statusGood.swiftUI)
            .annotation(position: .top, spacing: 4) {
              Text(verbatim: item.metric == .weight ? "\(text.load(t.kg).replacingOccurrences(of: " \(unit.label)", with: "")) × \(t.reps)" : text.value(t, item.metric))
                .font(DS.TextStyle.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(DS.Color.foreground.swiftUI)
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .chartXScale(range: .plotDimension(padding: 28))
        .chartXAxis {
          AxisMarks(values: points.map(\.date.calendarDate)) { v in
            if let d = v.as(Date.self) { AxisValueLabel { Text(verbatim: text.date(d)) } }
          }
        }
        .frame(height: 180)
        .accessibilityLabel(Text(chartTitle))
        .accessibilityValue(Text(verbatim: item.sessions.map { "\(text.date($0.date)): \(text.value($0, item.metric))" }.joined(separator: ", ")))
      }
    }
  }

  private var sessions: some View {
    DSCard {
      VStack(alignment: .leading, spacing: 0) {
        Text("xp.sessions")
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .textCase(.uppercase)
          .padding(.bottom, DS.Spacing.xs)
        let rows = Array(item.sessions.enumerated()).reversed()
        ForEach(Array(rows), id: \.offset) { pair in
          let i = pair.offset
          let t = pair.element
          let prev = i > 0 ? item.sessions[i - 1] : nil
          HStack {
            Text(verbatim: text.dayLong(t.date)).font(DS.TextStyle.body)
            Spacer()
            Text(verbatim: text.value(t, item.metric)).font(DS.TextStyle.body.weight(.semibold)).monospacedDigit()
            ExerciseDeltaChip(delta: ExerciseCompare.delta(t, prev, item.metric), text: text)
          }
          .padding(.vertical, 10)
          .accessibilityElement(children: .combine)
          if i > 0 { Divider() }
        }
      }
    }
  }
}
