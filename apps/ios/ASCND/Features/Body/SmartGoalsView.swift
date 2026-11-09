import ASCNDCore
import ASCNDDesignSystem
import Charts
import SwiftUI

/// Hiệu chỉnh mục tiêu (#527) — `app/smart-goals.tsx` @ fac9ac2 trên
/// `SmartGoalsBook`.
///
/// Như RN: thẻ xu hướng cân 4 tuần (viên mục tiêu, đường trung bình tuần theo
/// đơn vị của tài khoản, ô "±x.xx kg/tuần · Mục tiêu: … · đúng / lệch hướng",
/// gợi ý calo "+N kcal/ngày · A kcal → B kcal" kèm dòng "đo từ chính số ăn và
/// số cân của bạn" khi đúng là vậy); thiếu dữ liệu là trạng thái trống; thẻ
/// phân bổ đạm (mục tiêu/ngày · mỗi bữa · ngày thấp) và chia bốn bữa.
///
/// Khác RN: đọc hỏng (bất kỳ bảng nào) là màn lỗi có thử lại; "tuần" / "ngày"
/// dịch cả tiếng Tây Ban Nha (RN: tiếng Anh); mục tiêu lạ thì không vẽ viên rỗng.
///
/// 09/11 (Kiệt duyệt mock "Áp dụng gợi ý calo" bản 2): gợi ý đi qua `CalorieAdvice` —
/// chỉ ăn sát mục tiêu hiện tại mới có nút "Áp dụng"; ăn lệch thì "ăn đủ mục tiêu
/// trước"; chưa đủ ngày ghi bữa thì không đoán; vừa áp dụng thì 14 ngày "đang thử".
struct SmartGoalsView: View {
  let book: SmartGoalsBook
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var confirming: Confirm?
  @State private var applying = false
  @State private var applyFailure: ProfileSaveFailure?
  /// Vừa áp dụng: mục tiêu cũ để "Hoàn tác".
  @State private var undoTo: Int?
  @State private var applied: Int?
  /// "Để sau" đã bấm: dòng gợi ý ở Dinh dưỡng ẩn 7 ngày; thẻ ở đây vẫn hiện.
  @State private var laterTapped = false

  /// Một gợi ý đang chờ xác nhận.
  struct Confirm: Identifiable {
    let from: Int
    let to: Int
    let avgKcal: Int
    let days: Int
    let weeklyChange: Double
    let unit: WeightUnit
    var id: Int { to }
  }

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "smartgoals.loadfailed")) {
            Task { await book.load() }
          }
        case .ready(let s):
          trend(s)
          protein(s.protein)
        }
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(Text("smartgoals.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sheet(item: $confirming) { c in
      ConfirmCalorieSheet(
        confirm: c, proteinG: profile?.profile?.macroProteinG ?? 150, applying: applying,
        onApply: { Task { await apply(c) } }, onCancel: { confirming = nil })
      .presentationDetents([.medium, .large])
    }
    .alert(
      String(localized: applyFailure == .offline ? "smartgoals.applyFailed.offline" : "smartgoals.applyFailed"),
      isPresented: Binding(get: { applyFailure != nil }, set: { if !$0 { applyFailure = nil } })
    ) {
      Button(String(localized: "common.ok"), role: .cancel) {}
    }
    .overlay(alignment: .bottom) {
      if let kcal = applied { appliedToast(kcal) }
    }
  }

  // MARK: - Áp dụng

  private func apply(_ c: Confirm) async {
    guard let profile, !applying else { return }
    applying = true
    defer { applying = false }
    do throws(ProfileSaveFailure) {
      try await profile.saveCalorieTarget(c.to)
      book.memory?.markApplied(book.today)
      confirming = nil
      undoTo = c.from
      applied = c.to
      AccessibilityNotification.Announcement(String(localized: "smartgoals.applied \(Self.kcal(c.to))")).post()
      await book.load()
    } catch {
      confirming = nil
      applyFailure = error
    }
  }

  private func undo() async {
    guard let profile, let old = undoTo else { return }
    do throws(ProfileSaveFailure) {
      try await profile.saveCalorieTarget(old)
      book.memory?.clearApplied()
      applied = nil
      undoTo = nil
      await book.load()
    } catch {
      applyFailure = error
    }
  }

  private func appliedToast(_ kcal: Int) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Text("smartgoals.applied \(Self.kcal(kcal))")
        .font(DS.TextStyle.footnote.weight(.semibold))
      Spacer(minLength: 0)
      Button { Task { await undo() } } label: {
        Text("smartgoals.undo")
          .font(DS.TextStyle.footnote.weight(.bold))
          .underline()
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(minWidth: 44, minHeight: 44)
      }
    }
    .foregroundStyle(DS.Color.background.swiftUI)
    .padding(DS.Spacing.md)
    .background(DS.Color.foreground.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .padding(DS.Spacing.md)
    .transition(.move(edge: .bottom).combined(with: .opacity))
    .task(id: kcal) {
      try? await Task.sleep(for: .seconds(8))
      withAnimation { applied = nil }
    }
  }

  static func kcal(_ n: Int) -> String { n.formatted(.number.locale(.app)) }

  // MARK: - Lời khuyên calo

  @ViewBuilder private func advice(_ s: SmartGoalsBook.Snapshot, _ a: SmartGoals.Analysis) -> some View {
    switch s.shownAdvice {
    case .none:
      EmptyView()
    case .change(let from, let to, let avg, let days):
      suggestion(a, from: from, to: to) {
        confirming = Confirm(from: from, to: to, avgKcal: avg, days: days, weeklyChange: a.weeklyChange, unit: s.unit)
      }
    case .eatToTarget(let avg, let target, let days):
      eatFirst(avg: avg, target: target, days: days)
    case .needIntake(let days):
      note("smartgoals.needIntake \(days.formatted(.number.locale(.app)))", systemImage: "fork.knife")
    case .trial(let since, let until):
      note(
        "smartgoals.trial \(Self.day(since)) \(Self.day(until))", systemImage: "hourglass")
    }
  }

  static func day(_ d: LocalDate) -> String {
    d.calendarDate.formatted(.dateTime.day().month(.abbreviated).locale(.app))
  }

  private func note(_ key: LocalizedStringKey, systemImage: String) -> some View {
    Label { Text(key) } icon: { Image(systemName: systemImage) }
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .fixedSize(horizontal: false, vertical: true)
      .padding(DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  /// Ăn lệch mục tiêu hiện tại quá 10 %: không có nút đổi (mock ②b).
  private func eatFirst(avg: Int, target: Int, days: Int) -> some View {
    let gap = abs(avg - target)
    return VStack(alignment: .leading, spacing: 4) {
      Text("smartgoals.eat.title")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      (Text(verbatim: Self.kcal(avg)).font(DS.TextStyle.title.monospacedDigit())
        + Text(verbatim: " ") + Text("smartgoals.eat.of \(Self.kcal(target))").font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundColor(DS.Color.mutedForeground.swiftUI))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .padding(.top, 2)
      Text(
        avg < target
          ? "smartgoals.eat.below \(days.formatted(.number.locale(.app))) \(Self.kcal(gap))"
          : "smartgoals.eat.above \(days.formatted(.number.locale(.app))) \(Self.kcal(gap))"
      )
      .font(DS.TextStyle.caption)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .fixedSize(horizontal: false, vertical: true)
      Text("smartgoals.eat.next")
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      NavigationLink {
        InsightsScreen(userId: book.userId)
      } label: {
        Text("smartgoals.eat.meals")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.primary.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .padding(.top, 2)
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  // MARK: - Xu hướng cân

  private func trend(_ s: SmartGoalsBook.Snapshot) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        HStack {
          Text("smartgoals.weighttrend")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .accessibilityAddTraits(.isHeader)
          Spacer()
          if let label = Self.goalLabel(s.goal) {
            Text(label)
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.primary.swiftUI)
              .padding(.horizontal, DS.Spacing.sm)
              .padding(.vertical, 3)
              .background(DS.Color.secondary.swiftUI, in: Capsule())
          }
        }
        if let a = s.analysis {
          chart(a, unit: s.unit)
          callout(a, unit: s.unit)
          advice(s, a)
        } else {
          DSEmptyState(
            systemImage: "target", title: String(localized: "smartgoals.needdata"),
            message: String(localized: "smartgoals.needdatamsg"))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private static func goalLabel(_ goal: String) -> LocalizedStringKey? {
    switch goal {
    case "bulk": "ep.goal.bulk"
    case "cut": "ep.goal.cut"
    case "maintain": "ep.goal.maintain"
    case "recomp": "ep.goal.recomp"
    case "strength": "ep.goal.strength"
    case "endurance": "ep.goal.endurance"
    default: nil
    }
  }

  /// "W3" → Thứ Hai của tuần ấy ("20 thg 10"): `W4` là tuần này, `W1` ba tuần trước.
  private func weekLabel(_ label: String) -> String {
    guard let n = Int(label.dropFirst()) else { return label }
    let monday = SmartGoals.weekStart(book.today).adding(days: -7 * (4 - n))
    return monday.calendarDate.formatted(.dateTime.day().month(.abbreviated).locale(.app))
  }

  /// Số theo ngôn ngữ của app, hai số lẻ tối đa, dấu "−" thật ("−12,31", không phải "-12.31").
  private static func signed(_ value: Double, unit: WeightUnit) -> String {
    let v = unit.convert(value)
    return (v > 0 ? "+" : v < 0 ? "−" : "") + abs(v).formatted(.number.precision(.fractionLength(0...2)).locale(.app))
  }

  private func chart(_ a: SmartGoals.Analysis, unit: WeightUnit) -> some View {
    // Màu của Cân nặng, không phải xanh lá: xanh lá đọc thành "tốt" trong khi ô dưới có thể
    // đang báo lệch mục tiêu (29/10).
    let tint = DS.Color.metricSteel.swiftUI
    let values = a.weeks.map { unit.display($0.kg) }
    let lo = values.min() ?? 0
    let hi = values.max() ?? 0
    let pad = max((hi - lo) * 0.2, 0.5)
    return Chart(a.weeks, id: \.label) { w in
      LineMark(x: .value("week", weekLabel(w.label)), y: .value(unit.label, unit.display(w.kg)))
        .foregroundStyle(tint)
        .interpolationMethod(.monotone)
      PointMark(x: .value("week", weekLabel(w.label)), y: .value(unit.label, unit.display(w.kg)))
        .foregroundStyle(tint)
        .annotation(position: .top, spacing: 4) {
          Text(verbatim: unit.display(w.kg).formatted(.number.precision(.fractionLength(0...1)).locale(.app)))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
    }
    .chartYScale(domain: (lo - pad)...(hi + pad))
    .chartYAxis {
      AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { v in
        AxisGridLine()
        AxisValueLabel {
          if let d = v.as(Double.self) {
            Text(verbatim: d.formatted(.number.precision(.fractionLength(1)).locale(.app))).font(DS.TextStyle.caption)
          }
        }
      }
    }
    .frame(height: 140)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("smartgoals.weighttrend"))
    .accessibilityValue(
      Text(verbatim: zip(a.weeks, values).map { "\(weekLabel($0.label)) \($1.formatted(.number.locale(.app))) \(unit.label)" }.joined(separator: ", "))
    )
  }

  private func callout(_ a: SmartGoals.Analysis, unit: WeightUnit) -> some View {
    let tint = a.onTrack ? DS.Color.readinessGreen.swiftUI : DS.Color.readinessRed.swiftUI
    return VStack(alignment: .leading, spacing: 3) {
      Text("smartgoals.perweek \(Self.signed(a.weeklyChange, unit: unit)) \(unit.label)")
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(
        "smartgoals.targetrange \(Self.signed(a.targetMin, unit: unit)) \(Self.signed(a.targetMax, unit: unit)) \(unit.label)"
      )
      .font(DS.TextStyle.caption.monospacedDigit())
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Label {
        Text(a.onTrack ? LocalizedStringKey("smartgoals.ontrack") : LocalizedStringKey("smartgoals.offtrack"))
      } icon: {
        Image(systemName: a.onTrack ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
      }
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(tint)
      .padding(.top, 2)
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }

  private func suggestion(_ a: SmartGoals.Analysis, from: Int, to after: Int, onApply: @escaping () -> Void)
    -> some View
  {
    VStack(alignment: .leading, spacing: 2) {
      Label("smartgoals.caloriesuggestion", systemImage: "flame.fill")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text("smartgoals.kcalperday \(SmartGoals.signed(after - from))")
        .font(DS.TextStyle.title.monospacedDigit())
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        .padding(.top, 2)
      Text("smartgoals.kcalchange \(from.formatted(.number.locale(.app))) \(after.formatted(.number.locale(.app)))")
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      // Chỉ khi đúng là vậy: con số đến từ chính số ăn và số cân của người này.
      if a.fromMeasurement {
        Text("smartgoals.measured \(a.measuredDays.formatted(.number.locale(.app)))")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      VStack(spacing: DS.Spacing.xs) {
        Button(action: onApply) {
          Text("smartgoals.apply \(Self.kcal(after))").frame(maxWidth: .infinity)
        }
        .buttonStyle(.dsPill)
        Button {
          book.memory?.snooze(book.today, to: after)
          laterTapped = true
        } label: {
          Text(laterTapped ? "smartgoals.later.done" : "smartgoals.later")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .disabled(laterTapped)
      }
      .padding(.top, DS.Spacing.sm)
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.readinessYellow.swiftUI.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .overlay(
      RoundedRectangle(cornerRadius: DS.Radius.md).strokeBorder(DS.Color.readinessYellow.swiftUI.opacity(0.25), lineWidth: 0.5)
    )
  }

  // MARK: - Đạm

  private func protein(_ p: SmartGoals.Protein?) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("smartgoals.proteincoach")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        if let p {
          let perMeal = SmartGoals.grams(Double(p.perMeal))
          HStack(spacing: DS.Spacing.sm) {
            stat(SmartGoals.grams(p.target), "smartgoals.perday", tint: DS.Color.primary.swiftUI)
            stat(perMeal, "smartgoals.permeal", tint: DS.Color.metricBlue.swiftUI)
            stat(
              p.lowDays.formatted(.number.locale(.app)), "smartgoals.lowdays",
              tint: p.lowDays > 0 ? DS.Color.readinessRed.swiftUI : DS.Color.readinessGreen.swiftUI)
          }
          VStack(alignment: .leading, spacing: DS.Spacing.xs) {
            Text("smartgoals.proteinsplit")
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            ForEach(Self.meals, id: \.self) { meal in
              HStack {
                Text(LocalizedStringKey(meal)).foregroundStyle(DS.Color.mutedForeground.swiftUI)
                Spacer()
                Text(verbatim: perMeal)
                  .fontWeight(.semibold)
                  .monospacedDigit()
                  .foregroundStyle(DS.Color.foreground.swiftUI)
              }
              .font(DS.TextStyle.footnote)
              .accessibilityElement(children: .combine)
            }
          }
          .padding(DS.Spacing.md)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        } else {
          Text("smartgoals.nonutrition")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
      }
    }
  }

  /// Thứ tự của RN: sáng · trưa · phụ · tối.
  private static let meals = [
    "smartgoals.meal.breakfast", "smartgoals.meal.lunch", "smartgoals.meal.snack", "smartgoals.meal.dinner",
  ]

  private func stat(_ value: String, _ label: LocalizedStringKey, tint: Color) -> some View {
    VStack(spacing: 2) {
      Text(verbatim: value)
        .font(DS.TextStyle.title.monospacedDigit())
        .foregroundStyle(tint)
      Text(label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
    }
    .padding(.vertical, DS.Spacing.md)
    .frame(maxWidth: .infinity)
    .background(DS.Color.background.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }
}

/// Xác nhận trước khi đổi (mock ③): vì sao, đổi gì, đạm giữ nguyên.
struct ConfirmCalorieSheet: View {
  let confirm: SmartGoalsView.Confirm
  let proteinG: Double
  let applying: Bool
  let onApply: () -> Void
  let onCancel: () -> Void

  var body: some View {
    let c = confirm
    let delta = abs(c.to - c.from)
    let change = (c.weeklyChange > 0 ? "+" : c.weeklyChange < 0 ? "−" : "")
      + abs(c.unit.convert(c.weeklyChange)).formatted(.number.precision(.fractionLength(0...2)).locale(.app))
      + " " + c.unit.label
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text("smartgoals.confirm.title")
          .font(DS.TextStyle.title2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Text(
          c.to > c.from
            ? "smartgoals.confirm.more \(c.days.formatted(.number.locale(.app))) \(SmartGoalsView.kcal(c.avgKcal)) \(change) \(SmartGoalsView.kcal(delta))"
            : "smartgoals.confirm.less \(c.days.formatted(.number.locale(.app))) \(SmartGoalsView.kcal(c.avgKcal)) \(change) \(SmartGoalsView.kcal(delta))"
        )
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
        VStack(spacing: 0) {
          row("smartgoals.confirm.kcal", "\(SmartGoalsView.kcal(c.from)) → \(SmartGoalsView.kcal(c.to))")
          Divider()
          row(
            "smartgoals.confirm.protein",
            String(localized: "smartgoals.confirm.proteinKeep \(Int(proteinG.rounded()).formatted(.number.locale(.app)))"))
          Divider()
          row("smartgoals.confirm.from", String(localized: "smartgoals.confirm.today"))
        }
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        Text("smartgoals.confirm.note")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Button(action: onApply) {
          Group {
            if applying { ProgressView() } else { Text("smartgoals.confirm.apply") }
          }
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.dsPill)
        .disabled(applying)
        Button(action: onCancel) {
          Text("smartgoals.confirm.cancel")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
      }
      .padding(DS.Spacing.lg)
    }
    .ascndPage()
  }

  private func row(_ label: LocalizedStringKey, _ value: String) -> some View {
    HStack {
      Text(label).foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer()
      Text(verbatim: value).fontWeight(.semibold).monospacedDigit().foregroundStyle(DS.Color.foreground.swiftUI)
    }
    .font(DS.TextStyle.footnote)
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 12)
    .accessibilityElement(children: .combine)
  }
}
