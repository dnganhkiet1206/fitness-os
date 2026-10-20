import ASCNDCore
import Foundation

/// Kế hoạch ăn áp dụng hôm nay (19/10, chủ dự án: "log, kế hoạch ăn và bữa ăn hôm
/// nay có sự liên kết với nhau") — MỘT nguồn cho trang Dinh dưỡng (bữa hôm nay) và
/// "Ghi hôm nay". Kế hoạch mới nhất có món cho hôm nay (`MealPlans.activePlan`);
/// ngày 1 = thứ Hai.
@MainActor
struct TodayMealPlan {
  let plan: MealPlans.Plan
  let book: MealPlanBook
  let day: Int

  /// Món dự kiến của một khung hôm nay.
  func planned(_ meal: String) -> [MealPlans.Item] {
    book.items.filter { $0.day == day && $0.mealType == meal }
  }

  /// Khung có món dự kiến mà hôm nay chưa ghi.
  var openMeals: [String] {
    MealPlans.rows(mealsPerDay: plan.mealsPerDay, items: book.items.filter { $0.day == day }).filter { !planned($0).isEmpty && !book.isLoggedToday($0, day: day) }
  }

  static func load(_ services: AppServices, userId: String, now: Date = Date()) async -> TodayMealPlan? {
    guard let plans = services.makeMealPlans(userId: userId) else { return nil }
    defer { plans.close() }
    await plans.load()
    guard case .ready(let list) = plans.phase else { return nil }
    let day = MealPlans.dayIndex(now)
    guard let plan = MealPlans.activePlan(list, fill: plans.fill, day: day),
      let book = services.makeMealPlan(userId: userId, planId: plan.id)
    else { return nil }
    await book.load()
    return TodayMealPlan(plan: plan, book: book, day: day)
  }
}
