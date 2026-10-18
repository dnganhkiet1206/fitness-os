import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Ăn như hôm qua" (17/10, chủ dự án: app bắt ghi quá nhiều): một chạm chép mọi
/// bữa hôm qua sang hôm nay (`MealLogger.copyYesterday`). Dùng ở bảng Ghi nhanh.
struct YesterdayMealsCard: View {
  let meals: [MealLog.RecentMeal]
  let done: Bool
  let busy: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: done ? "checkmark" : "arrow.uturn.backward")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(done ? DS.Color.readinessGreen.swiftUI : DS.Color.metricOrangeGraphic.swiftUI)
          .frame(width: 44, height: 44)
          .background(DS.Color.metricOrangeGraphic.swiftUI.opacity(0.14), in: Circle())
        VStack(alignment: .leading, spacing: 3) {
          Text("meal.yesterday.title").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(verbatim: Self.detail(meals))
            .font(.system(size: 13))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        if busy { ProgressView() }
      }
      .padding(12)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
      }
      .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .disabled(done || busy)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("meal.yesterday.title"))
    .accessibilityValue(Text(verbatim: Self.detail(meals)))
    .accessibilityAddTraits(.isButton)
  }

  /// "Bữa sáng · Bữa tối · 1.050 kcal" — tên bữa theo thứ tự, không lặp.
  static func detail(_ meals: [MealLog.RecentMeal]) -> String {
    var names: [String] = []
    for m in meals {
      let n = DiaryView.mealName(m.mealType)
      if !names.contains(n) { names.append(n) }
    }
    let kcal = meals.reduce(0) { $0 + $1.kcal }
    return (names + ["\(DiaryView.whole(kcal)) kcal"]).joined(separator: " · ")
  }
}
