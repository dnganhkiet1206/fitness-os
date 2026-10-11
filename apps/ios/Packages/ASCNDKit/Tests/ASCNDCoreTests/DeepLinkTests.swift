import ASCNDCore
import Foundation
import Testing

/// Link `ascnd://` tới một màn (#527 deep link lát 2): đường dẫn expo-router
/// (tệp route @ fac9ac2, bỏ nhóm `(tabs)`) → đích native.
struct DeepLinkTests {
  static func target(_ s: String) -> DeepLink.Target? { URL(string: s).flatMap(DeepLink.target) }

  /// Cả ba cách viết của cùng một route.
  @Test func hostOrPathOrGroup() {
    #expect(Self.target("ascnd://water") == .screen(.water))
    #expect(Self.target("ascnd:///water") == .screen(.water))
    #expect(Self.target("ascnd:///(tabs)/nutrition") == .tab(.nutrition))
    #expect(Self.target("ascnd://nutrition/") == .tab(.nutrition))
  }

  @Test func tabs() {
    #expect(Self.target("ascnd://") == .tab(.today))
    #expect(Self.target("ascnd:///") == .tab(.today))
    #expect(Self.target("ascnd://index") == .tab(.today))
    #expect(Self.target("ascnd://workouts") == .tab(.workouts))
    #expect(Self.target("ascnd://workouts/plan?day=2") == .tab(.workouts))
    #expect(Self.target("ascnd://workouts/library") == .tab(.workouts))
    #expect(Self.target("ascnd://community") == .tab(.community))
    #expect(Self.target("ascnd://assistant") == .tab(.assistant))
  }

  /// Màn mở thẳng, kèm tham số của chúng.
  @Test func screensWithParams() throws {
    let day = try #require(LocalDate("2026-10-01"))
    #expect(Self.target("ascnd://diary?date=2026-10-01") == .screen(.diary(date: day)))
    #expect(Self.target("ascnd://diary") == .screen(.diary(date: nil)))
    #expect(Self.target("ascnd://diary?date=abc") == .screen(.diary(date: nil)), "ngày hỏng → hôm nay")
    #expect(Self.target("ascnd://diary?date=2026-02-30") == .screen(.diary(date: nil)))
    #expect(Self.target("ascnd://log-meal?date=2026-10-01&meal=lunch") == .screen(.logMeal(date: day, meal: "lunch")))
    #expect(Self.target("ascnd://log-meal") == .screen(.logMeal(date: nil, meal: nil)))
    #expect(Self.target("ascnd://meal-plan?plan=p-1") == .screen(.mealPlan(id: "p-1")))
    #expect(Self.target("ascnd://meal-plan") == .screen(.mealPlans), "thiếu id → danh sách")
    #expect(Self.target("ascnd://meal-plan?plan=") == .screen(.mealPlans))
  }

  @Test func everyNativeScreen() {
    let cases: [(String, DeepLink.Screen)] = [
      ("supplements", .supplements), ("food-list", .foods), ("food-editor?id=x", .foods),
      ("nutrition-insights", .nutritionInsights), ("meal-plans", .mealPlans), ("log-weight", .logWeight), ("log-measurement", .logMeasurement),
      ("sessions", .history), ("log-workout", .logWorkout), ("reminders", .reminders), ("templates", .templates),
      ("workout-builder", .templates),
    ]
    for (path, screen) in cases {
      #expect(Self.target("ascnd://\(path)") == .screen(screen), "\(path)")
    }
  }

  /// Màn chỉ có trong một tab, hay chưa có bản native → tab chứa nó.
  @Test func fallbacksToTheirTab() {
    #expect(Self.target("ascnd://community-post?id=abc") == .tab(.community))
    #expect(Self.target("ascnd://community-user?id=u") == .tab(.community))
    #expect(Self.target("ascnd://ai-coach?q=hi") == .tab(.assistant))
    #expect(Self.target("ascnd://mascot-room") == .tab(.today))
    #expect(Self.target("ascnd://settings") == .tab(.today))
    #expect(Self.target("ascnd://exercises?group=chest") == .tab(.workouts))
    #expect(Self.target("ascnd://grocery") == .tab(.nutrition))
    #expect(Self.target("ascnd://scan-food") == .tab(.nutrition))
  }

  /// Quản trị, gỡ lỗi, route lạ, scheme khác: không có đích — chỉ mở app.
  @Test func noTarget() {
    #expect(Self.target("ascnd://admin/users") == nil)
    #expect(Self.target("ascnd://koa-debug") == nil)
    #expect(Self.target("ascnd://nope") == nil)
    #expect(Self.target("https://example.com/water") == nil)
  }

  /// Màn biết tab đứng sau nó.
  @Test func screensKnowTheirTab() {
    #expect(DeepLink.Target.screen(.water).tab == .nutrition)
    #expect(DeepLink.Target.screen(.mealPlan(id: "x")).tab == .nutrition)
    #expect(DeepLink.Target.screen(.history).tab == .workouts)
    #expect(DeepLink.Target.screen(.templates).tab == .workouts)
    #expect(DeepLink.Target.screen(.logWeight).tab == .today)
    #expect(DeepLink.Target.screen(.reminders).tab == .today)
    #expect(DeepLink.Target.screen(.logMeasurement).tab == .today)
    #expect(DeepLink.Target.tab(.community).tab == .community)
  }
}
