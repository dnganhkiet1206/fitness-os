import ASCNDCore
import ASCNDDesignSystem
import Observation
import SwiftUI

/// Link `ascnd://` chờ được mở (#527, deep link lát 2). Sống cả đời app: link
/// đến lúc chưa đăng nhập chờ tới khi `RootTabView` của người vừa đăng nhập
/// nhận nó — như RN, nơi `Gate` hiện màn đăng nhập rồi mới tới route của link.
@MainActor
@Observable
final class DeepLinkInbox {
  private(set) var pending: DeepLink.Target?

  func receive(_ target: DeepLink.Target) {
    pending = target
  }

  /// Lấy và xoá — mỗi link mở đúng một lần.
  func take() -> DeepLink.Target? {
    defer { pending = nil }
    return pending
  }
}

extension AppTab {
  init(_ tab: DeepLink.Tab) {
    switch tab {
    case .today: self = .today
    case .nutrition: self = .nutrition
    case .workouts: self = .workouts
    case .community: self = .community
    case .assistant: self = .assistant
    }
  }
}

/// Màn mà một link mở thẳng, trình bày thành sheet trên tab của nó. Dựng từ
/// cùng sổ / luồng của phiên như khi đi từ tab, nên dữ liệu không tách đôi.
struct DeepLinkScreen: View {
  let screen: DeepLink.Screen
  @Environment(AppServices.self) private var services
  @Environment(WorkoutFlow.self) private var flow
  @Environment(NutritionBooks.self) private var nutrition: NutritionBooks?
  @Environment(\.dismiss) private var dismiss

  private var userId: String { services.session.session?.userId ?? "" }

  var body: some View {
    switch screen {
    // Năm màn ghi tự có `NavigationStack` và nút đóng của chúng.
    case .logMeal(let date, let meal):
      LogMealView(userId: userId, date: date, mealType: meal) { dismiss() }
    case .logWeight:
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }) { dismiss() }
    case .logMeasurement:
      LogMeasurementView(makeLogger: { services.makeMeasurementLogger(userId: userId) }) { dismiss() }
    case .logSleep:
      LogSleepView(makeLogger: { services.makeSleepLogger(userId: userId) }) { dismiss() }
    case .logWorkout:
      ManualLogView(flow: flow)
    default:
      NavigationStack {
        content
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(String(localized: "common.close")) { dismiss() }
            }
          }
      }
    }
  }

  @ViewBuilder private var content: some View {
    switch screen {
    case .water:
      if let water = nutrition?.water { WaterView(book: water) } else { DSLoadingView() }
    case .supplements:
      if let supplements = nutrition?.supplements { SupplementsView(book: supplements) } else { DSLoadingView() }
    case .diary(let date):
      DiaryScreen(userId: userId, date: date)
    case .foods:
      FoodsScreen(userId: userId)
    case .nutritionInsights:
      InsightsScreen(userId: userId)
    case .mealPlans:
      MealPlansScreen(userId: userId)
    case .mealPlan(let id):
      MealPlanScreen(route: MealPlanRoute(userId: userId, planId: id, plan: nil))
    case .history:
      if let history = flow.history { WorkoutHistoryView(book: history) } else { DSLoadingView() }
    case .reminders:
      RemindersView()
    case .templates:
      TemplateListView(flow: flow)
    case .logMeal, .logWeight, .logMeasurement, .logSleep, .logWorkout:
      EmptyView()
    }
  }
}
