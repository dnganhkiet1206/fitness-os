import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Tiến bộ từng bài (#527 Phase 2) — `app/exercise-insight.tsx` @ fac9ac2,
/// trên `InsightBook` (#437, golden) và `InsightScreen` (phạm vi, nhóm, chữ số
/// — golden sinh từ RN). Lịch tuần lấy từ `TodayController.library`.
///
/// RN behavior (giữ nguyên):
/// - phạm vi theo kế hoạch, mặc định cả tuần; mở từ chip của một bài (`ex`)
///   thì chỉ bài ấy, kèm "Xem tất cả" thay vì một bộ lọc phải tự gỡ;
/// - một câu tóm tắt trước mọi con số — và câu riêng khi chưa bài nào đủ buổi
///   (không in "0 đang tiến bộ · 0 đáng để ý" ngay trên một thẻ);
/// - phạm vi rỗng là HAI trạng thái: lịch thật sự trống, hay lịch có bài mà
///   chưa ghi buổi nào trong 90 ngày — hai câu, hai lời khuyên khác nhau;
/// - ba nhóm: Đáng để ý / Đang ổn / Cần thêm buổi;
/// - thẻ: tên, loại · số buổi · lần gần nhất, chip xu hướng, con số tốt nhất +
///   % thay đổi, đường nhỏ theo NGÀY THẬT của buổi (không nhãn số: chỉ số nội
///   bộ in ra trông như mức tải), một dòng cảnh báo (dao động hay bỏ lâu);
///   chạm để mở bằng chứng, kỷ lục 90 ngày, độ sẵn sàng, 1RM ước lượng, độ
///   tin cậy;
/// - chú thích 1RM nói MỘT lần ở cuối, cùng câu về cửa sổ 90 ngày;
/// - lỗi đọc ≠ chưa ghi gì.
struct ExerciseInsightView: View {
  let insights: InsightBook
  let today: TodayController
  @State private var single: String?
  @State private var scope: InsightScreen.Scope = .week

  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  /// - Parameter single: `exerciseKey` của một bài (chip trên hàng kế hoạch).
  init(insights: InsightBook, today: TodayController, single: String? = nil) {
    self.insights = insights
    self.today = today
    _single = State(initialValue: single)
  }

  private var keys: Set<String>? {
    InsightScreen.planKeys(
      scope, days: today.library?.routine ?? [], templates: today.library?.templates ?? [], today: today.today)
  }
  private var shown: [ExerciseInsight] { InsightScreen.shown(insights.insights, keys: keys, single: single) }

  var body: some View {
    content
      .navigationTitle(Text("xi.title"))
      .refreshable { await insights.refresh() }
      .task { if !insights.loaded { await insights.load() } }
  }

  @ViewBuilder private var content: some View {
    if insights.insights.isEmpty, insights.failure != nil {
      DSErrorView(message: String(localized: "eg.loadFailed")) {
        Task { await insights.refresh() }
      }
    } else if !insights.loaded {
      DSLoadingView()
    } else if insights.insights.isEmpty {
      DSEmptyState(
        systemImage: "waveform.path.ecg", title: String(localized: "xi.empty"),
        message: String(localized: "xi.empty.hint"))
    } else {
      list
    }
  }

  private var list: some View {
    let groups = InsightScreen.grouped(shown)
    return ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if single != nil {
          HStack {
            Text("xi.only").font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Spacer()
            Button(String(localized: "xi.showAll")) { single = nil }
              .frame(minHeight: 44)
          }
        } else {
          Picker(selection: $scope) {
            Text("xi.scope.today").tag(InsightScreen.Scope.today)
            Text("xi.scope.week").tag(InsightScreen.Scope.week)
            Text("xi.scope.all").tag(InsightScreen.Scope.all)
          } label: {
            EmptyView()
          }
          .pickerStyle(.segmented)
          .sensoryFeedback(.selection, trigger: scope)
          Text(verbatim: summary(groups))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }

        if shown.isEmpty {
          emptyScope
        }

        ForEach(InsightScreen.Group.allCases, id: \.self) { g in
          if let list = groups[g], !list.isEmpty {
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              Text(heading(g))
                .font(DS.TextStyle.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .textCase(.uppercase)
                .accessibilityAddTraits(.isHeader)
              ForEach(list) { i in
                InsightCard(insight: i, unit: unit, locale: locale)
              }
            }
          }
        }

        Text("xi.footnote")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(String(localized: "xi.windowNote \(PerformanceHistory.windowDays)"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(DS.Spacing.md)
    }
  }

  private func summary(_ groups: [InsightScreen.Group: [ExerciseInsight]]) -> String {
    let fine = groups[.fine]?.count ?? 0, attention = groups[.attention]?.count ?? 0, thin = groups[.thin]?.count ?? 0
    if fine == 0, attention == 0, thin > 0 { return String(localized: "xi.summaryThin \(thin)") }
    return String(localized: "xi.summary \(fine) \(attention)")
  }

  /// Phạm vi rỗng không phải lịch sử rỗng — và là hai trạng thái.
  @ViewBuilder private var emptyScope: some View {
    let planned = (keys?.isEmpty == false)
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text(emptyTitle(planned: planned))
          .font(DS.TextStyle.body)
        Text(emptyHint(planned: planned))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func emptyTitle(planned: Bool) -> LocalizedStringKey {
    if planned { return "xi.scope.unlogged" }
    return scope == .today ? "xi.scope.emptyToday" : "xi.scope.emptyWeek"
  }

  private func emptyHint(planned: Bool) -> LocalizedStringKey {
    planned ? "xi.empty.hint" : "xi.scope.hint"
  }

  private func heading(_ g: InsightScreen.Group) -> LocalizedStringKey {
    switch g {
    case .attention: "xi.group.attention"
    case .fine: "xi.group.fine"
    case .thin: "xi.group.thin"
    }
  }
}

/// Một thẻ: chạm để mở / đóng phần bằng chứng.
private struct InsightCard: View {
  let insight: ExerciseInsight
  let unit: WeightUnit
  let locale: Locale
  @State private var open = false

  private var i: ExerciseInsight { insight }

  /// Một mức tải dương theo đơn vị + dấu thập phân của máy ("62,5 kg").
  private func load(_ kg: Double) -> String { unit.localizedLoad(kg, locale: locale) ?? unit.load(kg) }
  private func number(_ kg: Double) -> String {
    unit.text(kg).replacingOccurrences(of: ".", with: locale.decimalSeparator ?? ".")
  }

  private var tint: Color {
    switch i.trend {
    case .improving: DS.Color.readinessGreen.swiftUI
    case .declining: DS.Color.readinessRed.swiftUI
    case .plateau: DS.Color.readinessYellow.swiftUI
    case .stable, .insufficientData: DS.Color.mutedForeground.swiftUI
    }
  }

  private var trendIcon: String {
    switch i.trend {
    case .improving: "arrow.up.right"
    case .declining: "arrow.down.right"
    case .plateau, .stable: "minus"
    case .insufficientData: "waveform.path.ecg"
    }
  }

  var body: some View {
    Button {
      open.toggle()
    } label: {
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          head
          figures
          if let warn { Text(verbatim: warn).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.readinessYellow.swiftUI) }
          if open { detail }
          Image(systemName: "chevron.down")
            .font(.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .rotationEffect(.degrees(open ? 180 : 0))
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: "\(i.exerciseName) — \(Self.trendName(i.trend))"))
    .accessibilityValue(Text(open ? LocalizedStringKey("xi.a11y.expanded") : LocalizedStringKey("xi.a11y.collapsed")))
    .sensoryFeedback(.selection, trigger: open)
  }

  private var head: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: i.exerciseName).font(DS.TextStyle.headline).lineLimit(1)
        Text(verbatim: meta)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      Spacer()
      Label(Self.trendName(i.trend), systemImage: trendIcon)
        .font(DS.TextStyle.caption)
        .foregroundStyle(tint)
        .padding(.horizontal, DS.Spacing.sm)
        .padding(.vertical, 2)
        .overlay(Capsule().stroke(tint))
    }
  }

  /// Loại · số buổi · lần gần nhất (dạng ngắn — con số là phần đổi).
  private var meta: String {
    var parts = [Self.kindName(i.kind)]
    parts.append(i.sessions == 1 ? String(localized: "xi.sessions.one") : String(localized: "xi.sessions.other \(i.sessions)"))
    for e in i.evidence {
      if case .lastTrained(let days, _) = e {
        parts.append(days == 0 ? String(localized: "xi.lastToday") : String(localized: "xi.agoShort \(days)"))
      }
    }
    return parts.joined(separator: "  ·  ")
  }

  private var figures: some View {
    HStack(alignment: .center, spacing: DS.Spacing.md) {
      HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.xs) {
        Text(verbatim: InsightScreen.headline(i, load: load))
          .font(DS.TextStyle.title2.monospacedDigit())
          .lineLimit(1)
        if let pct = InsightScreen.changePercent(i) {
          Label {
            Text(verbatim: "\(abs(pct))%")
          } icon: {
            Image(systemName: pct > 0 ? "arrow.up" : pct < 0 ? "arrow.down" : "minus")
          }
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(pct == 0 ? DS.Color.mutedForeground.swiftUI : tint)
        }
      }
      Spacer(minLength: 0)
      let spark = InsightScreen.spark(i)
      if spark.count >= 2 {
        // Theo ngày thật: ba buổi trong một tuần rồi một buổi sáu tuần sau là một hình dạng.
        Chart(Array(spark.enumerated()), id: \.offset) { item in
          LineMark(x: .value("d", item.element.date.daysSinceEpoch), y: .value("v", item.element.value))
            .foregroundStyle(tint)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
        .frame(width: 96, height: 46)
        .accessibilityHidden(true)
      }
    }
  }

  /// Dòng duy nhất đổi việc người ta nên làm với thẻ này.
  private var warn: String? {
    for e in i.evidence {
      if case .volatile(let spread) = e {
        let percent = Int((spread * 100 + 0.5).rounded(.down))
        return String(localized: "xi.volatile \(percent)")
      }
    }
    for e in i.evidence {
      if case .lastTrained(_, let stale) = e, stale { return String(localized: "xi.stale") }
    }
    return nil
  }

  @ViewBuilder private var detail: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      if let sets = InsightScreen.bestSets(of: i) {
        let s = InsightScreen.seriesText(sets, load: load)
        if !s.parts.isEmpty {
          VStack(alignment: .leading, spacing: 2) {
            Text("xi.evidence").font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(verbatim: (s.prefix.map { "\($0)  →  " } ?? "") + s.parts.joined(separator: "  ·  "))
              .font(DS.TextStyle.footnote.monospacedDigit())
          }
        }
      }
      if let best = windowBest {
        Text(verbatim: best).font(DS.TextStyle.footnote)
      }
      ForEach(Array(notes.enumerated()), id: \.offset) { _, n in
        Text(verbatim: n).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: Self.readinessName(i.readiness)).font(DS.TextStyle.footnote.weight(.semibold))
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          if let e1 = i.bestE1rmKg {
            Text(verbatim: "\(String(localized: "xi.e1rm")) \(unit.volume(e1)) \(unit.label)")
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Text(String(localized: "xi.conf \(Self.confidenceName(i.confidence))"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
  }

  /// Kỷ lục 90 ngày: tải, hay rep ở một mức tải, hay rep trần.
  private var windowBest: String? {
    for e in i.evidence {
      guard case .windowBest(let of, let value, let previous, let atWeightKg, let daysAgo) = e else { continue }
      var text: String
      if of == .weight {
        text = String(localized: "xi.window.weight \(load(value)) \(number(previous))")
      } else {
        let reps = Int(value)
        let prev = Int(previous)
        if let w = atWeightKg, w > 0 {
          text = reps == 1
            ? String(localized: "xi.window.reps.one \(load(w)) \(prev)")
            : String(localized: "xi.window.reps.other \(reps) \(load(w)) \(prev)")
        } else {
          text = reps == 1
            ? String(localized: "xi.window.repsBody.one \(prev)")
            : String(localized: "xi.window.repsBody.other \(reps) \(prev)")
        }
      }
      if let days = daysAgo {
        text += "  ·  " + (days == 1 ? String(localized: "xi.window.ago.one") : String(localized: "xi.window.ago.other \(days)"))
      }
      return text
    }
    return nil
  }

  private var notes: [String] {
    var out: [String] = []
    for e in i.evidence {
      switch e {
      case .noUpwardTrend(let sessions): out.append(String(localized: "xi.noUpward \(sessions)"))
      case .tooFewSessions: out.append(String(localized: "xi.needMore \(ExerciseTrend.minSessions)"))
      case .bodyweightUnknown: out.append(String(localized: "xi.bodyweightUnknown"))
      default: continue
      }
    }
    return out
  }

  static func trendName(_ t: ExerciseTrend.Trend) -> String {
    switch t {
    case .improving: String(localized: "xi.trend.improving")
    case .stable: String(localized: "xi.trend.stable")
    case .plateau: String(localized: "xi.trend.plateau")
    case .declining: String(localized: "xi.trend.declining")
    case .insufficientData: String(localized: "xi.trend.insufficient")
    }
  }

  static func kindName(_ k: ExerciseKind) -> String {
    switch k {
    case .compound: String(localized: "ex.kind.compound")
    case .isolation: String(localized: "ex.kind.isolation")
    case .bodyweight: String(localized: "ex.kind.bodyweight")
    case .timed: String(localized: "ex.kind.timed")
    }
  }

  static func readinessName(_ r: ExerciseTrend.Readiness) -> String {
    switch r {
    case .notReady: String(localized: "xi.ready.notReady")
    case .maintain: String(localized: "xi.ready.maintain")
    case .readyToProgress: String(localized: "xi.ready.progress")
    }
  }

  static func confidenceName(_ c: ExerciseTrend.Confidence) -> String {
    switch c {
    case .none: String(localized: "xi.conf.none")
    case .low: String(localized: "xi.conf.low")
    case .medium: String(localized: "xi.conf.medium")
    case .high: String(localized: "xi.conf.high")
    }
  }
}
