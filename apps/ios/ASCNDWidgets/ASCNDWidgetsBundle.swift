import SwiftUI
import WidgetKit

@main
struct ASCNDWidgetsBundle: WidgetBundle {
  var body: some Widget {
    KoaWidget()
    MealQuickWidget()
    TodayWorkoutWidget()
    StreakReadinessWidget()
    RestLiveActivity()
  }
}
