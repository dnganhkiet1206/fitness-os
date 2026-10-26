import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Chữ trên thẻ / chi tiết của một nhóm (mock bản 10): một dòng đếm, một dòng số, một câu
/// nên làm gì. Số theo ngôn ngữ app; cân theo đơn vị người dùng.
extension ProgressStyle {
  static func n(_ x: Double, _ digits: Int = 0) -> String {
    x.formatted(.number.precision(.fractionLength(0...digits)).locale(.app))
  }

  /// "7h30" / "6h".
  static func hours(_ minutes: Double) -> String {
    let m = Int(minutes.rounded())
    return m % 60 == 0 ? "\(m / 60)h" : String(format: "%dh%02d", m / 60, m % 60)
  }

  static func count(_ r: ProgressStatus.Result) -> String {
    switch r.group {
    case .training:
      r.of == 0 ? String(localized: "ps.c.noPlan") : String(localized: "ps.c.training \(r.have) \(r.of)")
    case .steps: String(localized: "ps.c.steps \(r.have) \(r.of)")
    case .nutrition: String(localized: "ps.c.nutrition \(r.have) \(r.of)")
    case .sleep: String(localized: "ps.c.sleep \(r.have) \(r.of)")
    case .recovery: String(localized: "ps.c.recovery \(r.have) \(r.of)")
    case .body: String(localized: "ps.c.body \(r.have)")
    }
  }

  /// Dòng số; `nil` khi chưa có gì để so.
  static func numbers(_ r: ProgressStatus.Result, unit: WeightUnit) -> String? {
    switch r.group {
    case .training:
      guard r.of > 0, let due = r.today else { return nil }
      return String(localized: "ps.n.training \(Int(due))")
    case .steps:
      guard let avg = r.average else { return nil }
      // Hôm nay chưa có số → chỉ nói trung bình, không "—" lơ lửng (24/10).
      guard let today = r.today else { return String(localized: "ps.n.steps \(n(avg))") }
      return String(localized: "ps.n.stepsToday \(n(today)) \(n(avg))")
    case .nutrition:
      guard let avg = r.average, let t = r.target else { return nil }
      return String(localized: "ps.n.protein \(n(avg)) \(n(t))")
    case .sleep:
      guard let avg = r.average, let t = r.target else { return nil }
      return String(localized: "ps.n.sleep \(hours(avg)) \(hours(t))")
    case .recovery:
      guard let avg = r.average else { return nil }
      return String(localized: "ps.n.recovery \(n(avg))")
    case .body:
      // Lần cân gần nhất + thay đổi trong 4 tuần (đúng số mà "Tốt / Cần chú ý" xét).
      guard let last = r.today, let change = r.target else { return nil }
      let delta = unit.display(abs(change))
      let sign = change > 0.05 ? "+" : change < -0.05 ? "−" : ""
      return String(localized: "ps.n.weight \("\(n(unit.display(last), 1)) \(unit.label)") \("\(sign)\(n(delta, 1)) \(unit.label)")")
    }
  }

  static func advice(_ r: ProgressStatus.Result) -> String? {
    switch r.level {
    case .good: return String(localized: "ps.a.good")
    case .insufficient: return nil
    case .attention:
      switch r.group {
      case .training: return String(localized: "ps.a.training")
      case .steps: return String(localized: "ps.a.steps")
      case .nutrition: return String(localized: "ps.a.nutrition")
      case .sleep: return String(localized: "ps.a.sleep")
      case .recovery: return String(localized: "ps.a.recovery")
      case .body: return String(localized: "ps.a.body")
      }
    }
  }

  /// "0 / 7 đêm · cần 3".
  static func missing(_ r: ProgressStatus.Result) -> String {
    r.group == .training ? String(localized: "ps.c.noPlan") : String(localized: "ps.m.need \(count(r)) \(r.need)")
  }
}

/// Thẻ kết quả: nhãn màu (icon + tên) · chữ trạng thái trắng · dòng đếm · câu nên làm · dòng số.
struct ProgressResultCard: View {
  let result: ProgressStatus.Result
  let open: () -> Void
  @Environment(\.weightUnit) private var unit

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 6) {
          Image(systemName: ProgressStyle.symbol(result.group)).font(.caption.weight(.semibold))
          Text(verbatim: ProgressStyle.name(result.group)).font(DS.TextStyle.footnote.weight(.semibold))
          Spacer(minLength: 0)
          Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .foregroundStyle(ProgressStyle.color(result.group))
        ProgressStatusWord(level: result.level, font: .system(size: 24, weight: .bold))
          .tracking(-0.4)
          .padding(.top, 8)
        Text(verbatim: ProgressStyle.count(result))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.top, 1)
        if let advice = ProgressStyle.advice(result) {
          Text(verbatim: advice)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.85))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 8)
        }
        if let line = ProgressStyle.numbers(result, unit: unit) {
          Text(verbatim: line)
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.top, 8)
        }
      }
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .todayCard()
    .accessibilityElement(children: .combine)
    .accessibilityHint(Text("ps.open.hint"))
  }
}

/// "Cần thêm dữ liệu": mỗi nhóm một dòng (icon, tên, còn thiếu bao nhiêu) + nút Ghi khi
/// có màn ghi cho nhóm ấy.
struct ProgressMissingCard: View {
  let results: [ProgressStatus.Result]
  let log: (ProgressStatus.Group) -> Void

  static func canLog(_ g: ProgressStatus.Group) -> Bool { [.sleep, .nutrition, .recovery, .body].contains(g) }

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(results.enumerated()), id: \.element.group) { i, r in
        if i > 0 { Divider().padding(.leading, 48).opacity(0.6) }
        HStack(spacing: 12) {
          Image(systemName: ProgressStyle.symbol(r.group))
            .font(.footnote.weight(.semibold))
            .foregroundStyle(ProgressStyle.color(r.group))
            .frame(width: 24)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: ProgressStyle.name(r.group)).font(DS.TextStyle.body.weight(.semibold))
            Text(verbatim: ProgressStyle.missing(r)).font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer(minLength: 0)
          if Self.canLog(r.group) {
            Button { log(r.group) } label: {
              Text("ps.log").font(DS.TextStyle.footnote.weight(.semibold))
                .padding(.horizontal, 12).frame(minHeight: 30)
                .background(DS.Color.metricBlue.swiftUI.opacity(0.16), in: Capsule())
                .foregroundStyle(DS.Color.metricBlue.swiftUI)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("ps.log.a11y \(ProgressStyle.name(r.group))"))
          }
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 60)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard()
  }
}

/// Chi tiết một nhóm: chữ trạng thái, một câu, biểu đồ 7 ngày với đường mục tiêu, chỉ số con.
struct ProgressGroupView: View {
  let result: ProgressStatus.Result
  let snapshot: ProgressStatusBook.Snapshot?
  let week: KoaWeek.State?
  var openTrends: (() -> Void)?
  @Environment(\.weightUnit) private var unit
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: 4) {
          ProgressStatusWord(level: result.level, font: .system(size: 26, weight: .bold))
            .tracking(-0.4)
          Text(verbatim: ProgressStyle.advice(result) ?? ProgressStyle.missing(result))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        content
        Text("ps.about.short")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(verbatim: ProgressStyle.name(result.group)))
    .ascndPage()
  }

  @ViewBuilder private var content: some View {
    switch result.group {
    case .training:
      if let week {
        TodayWeekStrip(
          days: week.days.map { .init(date: $0.date, trained: $0.trained, planned: $0.planned, rest: $0.rest) },
          today: flow.today.today, target: week.target)
          .padding(DS.Spacing.md)
          .todayCard()
        // Hôm nay còn buổi theo lịch → mở buổi ấy ở Tập luyện (cùng đường với Hôm nay).
        if let today = week.days.first(where: { $0.date == flow.today.today }), today.planned, !today.trained {
          DSButton(String(localized: "today.start"), style: .primary) { services.sessionRequest += 1 }
        }
      }
    case .body:
      BodySection(userId: flow.today.userId, today: flow.today.today)
    case .steps:
      chart(values: snapshot?.steps, target: result.target, label: String(localized: "ps.g.steps"))
    case .sleep:
      chart(values: snapshot?.sleepMinutes.map { $0.map { $0 / 60 } }, target: result.target.map { $0 / 60 },
            label: String(localized: "ps.g.sleep"))
    case .recovery:
      chart(values: snapshot?.readiness, target: result.target, label: String(localized: "ps.g.recovery"))
      if let openTrends {
        Button(action: openTrends) {
          WorkoutsHomeView.toolRow("chart.line.uptrend.xyaxis", String(localized: "assistant.trends"), sub: nil,
                                   tint: ProgressStyle.color(.recovery))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("assistant.trends"))
        .todayCard()
      }
    case .nutrition:
      chart(values: snapshot?.protein, target: result.target, label: String(localized: "ps.m.protein"))
      if let s = snapshot { nutritionRows(s) }
    }
  }

  private func chart(values: [Double?]?, target: Double?, label: String) -> some View {
    let days = snapshot?.days ?? []
    let vals = values ?? []
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(verbatim: label).font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(ProgressStyle.color(result.group))
      Chart {
        ForEach(Array(zip(days, vals).enumerated()), id: \.offset) { _, pair in
          BarMark(x: .value("d", Self.weekday(pair.0)), y: .value("v", pair.1 ?? 0))
            .foregroundStyle(pair.1 == nil ? DS.Color.mutedForeground.swiftUI.opacity(0.3) : ProgressStyle.color(result.group))
            .cornerRadius(5)
        }
        if let target {
          RuleMark(y: .value("t", target))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 4]))
        }
      }
      .chartYAxis { AxisMarks(position: .trailing) }
      .frame(height: 170)
      .accessibilityLabel(Text(verbatim: label))
    }
    .padding(DS.Spacing.md)
    .todayCard()
  }

  private func nutritionRows(_ s: ProgressStatusBook.Snapshot) -> some View {
    let protein = ProgressStatus.nutrition(s.protein, target: s.proteinTarget)
    let kcal = ratio(s.kcal, s.kcalTarget, low: 0.85, high: 1.15)
    let water = ratio(s.waterMl, s.waterTargetMl, low: 0.8, high: .infinity)
    let logged = s.protein.compactMap { $0 }.count
    let rows: [(String, ProgressStatus.Level, String)] = [
      (String(localized: "ps.m.protein"), protein.level,
       String(localized: "ps.m.avg \(ProgressStyle.n(protein.average ?? 0)) \(ProgressStyle.n(s.proteinTarget)) \("g")")),
      (String(localized: "ps.m.kcal"), kcal.0,
       String(localized: "ps.m.avg \(ProgressStyle.n(kcal.1)) \(ProgressStyle.n(s.kcalTarget)) \("kcal")")),
      (String(localized: "ps.m.water"), water.0,
       String(localized: "ps.m.avg \(ProgressStyle.n(water.1 / 1000, 1)) \(ProgressStyle.n(s.waterTargetMl / 1000, 1)) \("L")")),
      (String(localized: "ps.m.days"), logged >= 5 ? .good : logged >= ProgressStatus.minDays ? .attention : .insufficient,
       "\(logged) / \(s.days.count)"),
    ]
    return VStack(spacing: 0) {
      ForEach(rows.indices, id: \.self) { i in
        if i > 0 { Divider().opacity(0.6) }
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: rows[i].0).font(DS.TextStyle.body)
            Text(verbatim: rows[i].2).font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          ProgressStatusWord(level: rows[i].1, font: DS.TextStyle.footnote.weight(.semibold))
        }
        .padding(.vertical, 10)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .todayCard()
  }

  /// Chỉ số con: ≥ 3 ngày có số; trong [low, high] × mục tiêu là Tốt.
  private func ratio(_ v: [Double?], _ target: Double, low: Double, high: Double) -> (ProgressStatus.Level, Double) {
    let have = v.compactMap { $0 }
    guard have.count >= ProgressStatus.minDays, target > 0 else { return (.insufficient, 0) }
    let avg = have.reduce(0, +) / Double(have.count)
    return (avg >= target * low && avg <= target * high ? .good : .attention, avg)
  }

  static func weekday(_ d: LocalDate) -> String {
    d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).locale(.app))
  }
}
