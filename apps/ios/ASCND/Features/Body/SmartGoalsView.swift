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
struct SmartGoalsView: View {
  let book: SmartGoalsBook

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
    .navigationTitle(Text("smartgoals.title"))
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
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
          if a.suggests { suggestion(a) }
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

  private func chart(_ a: SmartGoals.Analysis, unit: WeightUnit) -> some View {
    let green = DS.Color.readinessGreen.swiftUI
    let values = a.weeks.map { unit.display($0.kg) }
    let lo = values.min() ?? 0
    let hi = values.max() ?? 0
    let pad = max((hi - lo) * 0.2, 0.5)
    return Chart(a.weeks, id: \.label) { w in
      LineMark(x: .value("week", w.label), y: .value(unit.label, unit.display(w.kg)))
        .foregroundStyle(green)
        .interpolationMethod(.monotone)
      PointMark(x: .value("week", w.label), y: .value(unit.label, unit.display(w.kg)))
        .foregroundStyle(green)
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
      Text(verbatim: zip(a.weeks, values).map { "\($0.label) \($1.formatted(.number.locale(.app))) \(unit.label)" }.joined(separator: ", "))
    )
  }

  private func callout(_ a: SmartGoals.Analysis, unit: WeightUnit) -> some View {
    let tint = a.onTrack ? DS.Color.readinessGreen.swiftUI : DS.Color.readinessRed.swiftUI
    return VStack(alignment: .leading, spacing: 3) {
      Text("smartgoals.perweek \(SmartGoals.signed(a.weeklyChange, unit: unit)) \(unit.label)")
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text(
        "smartgoals.targetrange \(SmartGoals.signed(a.targetMin, unit: unit)) \(SmartGoals.signed(a.targetMax, unit: unit)) \(unit.label)"
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

  private func suggestion(_ a: SmartGoals.Analysis) -> some View {
    let after = a.currentCal + a.calorieAdjustment
    return VStack(alignment: .leading, spacing: 2) {
      Label("smartgoals.caloriesuggestion", systemImage: "flame.fill")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Text("smartgoals.kcalperday \(SmartGoals.signed(a.calorieAdjustment))")
        .font(DS.TextStyle.title.monospacedDigit())
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        .padding(.top, 2)
      Text("smartgoals.kcalchange \(a.currentCal.formatted(.number.locale(.app))) \(after.formatted(.number.locale(.app)))")
        .font(DS.TextStyle.caption.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      // Chỉ khi đúng là vậy: con số đến từ chính số ăn và số cân của người này.
      if a.fromMeasurement {
        Text("smartgoals.measured \(a.measuredDays.formatted(.number.locale(.app)))")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.readinessYellow.swiftUI.opacity(0.1), in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .overlay(
      RoundedRectangle(cornerRadius: DS.Radius.md).strokeBorder(DS.Color.readinessYellow.swiftUI.opacity(0.25), lineWidth: 0.5)
    )
    .accessibilityElement(children: .combine)
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
              .textCase(.uppercase)
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
