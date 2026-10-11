public import Foundation

/// Link `ascnd://` tới một màn (#527, deep link lát 2).
///
/// RN behavior: `app.json` `scheme: "ascnd"` + expo-router — đường dẫn của
///   link là đường dẫn của tệp route (nhóm `(tabs)` bị bỏ: `(tabs)/nutrition`
///   là `/nutrition`, `(tabs)/index` là `/`), query là `useLocalSearchParams`.
///   Đã đăng nhập thì mở đúng màn; chưa thì `Gate` hiện màn đăng nhập.
/// Native behavior: cùng đường dẫn → một `Target`. Màn native có sẵn và mở
///   được độc lập thì mở thẳng (`screen`); màn chỉ có bên trong một tab, hay
///   chưa có bản native, thì mở tab chứa nó (`tab`); route không có trong app
///   native (quản trị, gỡ lỗi) hay lạ thì `nil` — chỉ mở app, không màn lỗi.
/// Reason: Kiệt cho làm (#527 6104187995 → "Được làm hết đi").
public enum DeepLink {
  /// Năm tab cấp cao (`app-tabs.tsx`).
  public enum Tab: String, Sendable, Hashable, CaseIterable {
    case today, nutrition, workouts, community, assistant
  }

  /// Màn mở thẳng được từ link.
  public enum Screen: Sendable, Hashable {
    case water
    case supplements
    /// `diary?date=` — ngày đầu (kẹp về hôm nay ở màn, như RN).
    case diary(date: LocalDate?)
    /// `log-meal?date=&meal=`.
    case logMeal(date: LocalDate?, meal: String?)
    case foods
    case nutritionInsights
    case mealPlans
    /// `meal-plan?plan=`.
    case mealPlan(id: String)
    case logWeight
    /// `sessions`.
    case history
    case logWorkout
    case reminders
    case templates
  }

  public enum Target: Sendable, Hashable {
    case tab(Tab)
    case screen(Screen)

    /// Tab đứng sau màn — link mở tab ấy rồi mới mở màn.
    public var tab: Tab {
      switch self {
      case .tab(let t): t
      case .screen(let s):
        switch s {
        case .water, .supplements, .diary, .logMeal, .foods, .nutritionInsights, .mealPlans, .mealPlan: .nutrition
        case .history, .logWorkout, .templates: .workouts
        case .logWeight, .reminders: .today
        }
      }
    }
  }

  /// `nil`: không phải link `ascnd://`, hay route không có đích native.
  public static func target(_ url: URL) -> Target? {
    guard url.scheme?.lowercased() == "ascnd" else { return nil }
    let c = URLComponents(url: url, resolvingAgainstBaseURL: false)
    // `ascnd://water` → host "water"; `ascnd:///water` → path "/water".
    let segments = ([c?.host ?? ""] + (c?.path ?? "").split(separator: "/").map(String.init))
      .filter { !$0.isEmpty && !($0.hasPrefix("(") && $0.hasSuffix(")")) }
    var query: [String: String] = [:]
    for item in c?.queryItems ?? [] where query[item.name] == nil {
      if let v = item.value, !v.isEmpty { query[item.name] = v }
    }
    return route(segments.joined(separator: "/"), query)
  }

  static func route(_ path: String, _ q: [String: String]) -> Target? {
    let date = q["date"].flatMap(LocalDate.init)
    switch path {
    case "", "index": return .tab(.today)
    case "nutrition": return .tab(.nutrition)
    case "workouts", "workouts/index", "workouts/plan", "workouts/library": return .tab(.workouts)
    case "community": return .tab(.community)
    case "assistant": return .tab(.assistant)

    case "water": return .screen(.water)
    case "supplements": return .screen(.supplements)
    case "diary": return .screen(.diary(date: date))
    case "log-meal": return .screen(.logMeal(date: date, meal: q["meal"]))
    case "food-list", "food-editor": return .screen(.foods)
    case "nutrition-insights": return .screen(.nutritionInsights)
    case "meal-plans": return .screen(.mealPlans)
    case "meal-plan": return q["plan"].map { .screen(.mealPlan(id: $0)) } ?? .screen(.mealPlans)
    case "log-weight": return .screen(.logWeight)
    case "sessions": return .screen(.history)
    case "log-workout": return .screen(.logWorkout)
    case "reminders": return .screen(.reminders)
    case "templates", "workout-builder": return .screen(.templates)

    // Chưa có bản native (#161 / camera): tab chứa nó.
    case "grocery", "scan-barcode", "scan-food": return .tab(.nutrition)
    case "exercises", "exercise-guide", "exercise-insight", "media-viewer": return .tab(.workouts)
    case "ai-coach", "coach-memory": return .tab(.assistant)
    case "mascot-room", "koa-sheet", "shop", "awards", "challenges", "biometrics", "log-biometrics", "weekly-review",
      "steps", "sleep-insights", "log-sleep", "smart-goals", "measurements-trend", "log-measurement",
      "progress-photos", "settings", "edit-profile", "change-password", "legal":
      return .tab(.today)
    default:
      if path.hasPrefix("community-") { return .tab(.community) }
      // `admin/*`, `koa-debug`, route lạ: chỉ mở app.
      return nil
    }
  }
}
