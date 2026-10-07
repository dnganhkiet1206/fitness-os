import SwiftUI
import WidgetKit

@main
struct ASCNDWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWorkoutWidget()
    StreakReadinessWidget()
    RestLiveActivity()
  }
}
