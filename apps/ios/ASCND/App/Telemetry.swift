import Foundation
import PostHog
import Sentry

/// Đo lường (15/10, chủ dự án: Sentry + PostHog — "người dùng bỏ app ở đâu").
///
/// - Sentry: crash và lỗi. PostHog: phễu (onboarding → bữa đầu → buổi tập đầu) và
///   tỉ lệ quay lại.
/// - TẮT HẲN khi chưa có khoá: `ASCND_SENTRY_DSN` / `ASCND_POSTHOG_KEY` trống trong
///   `Config/Backend.xcconfig`; khoá thật nằm ở `Backend.local.xcconfig` (không commit)
///   hoặc biến của CI. Không khoá → không SDK nào khởi động, không gửi gì.
/// - Không PII: không email / tên; người dùng gắn bằng mã tài khoản (UUID). Không gửi
///   số liệu sức khoẻ (cân, giấc ngủ, nhịp tim, kcal) — sự kiện chỉ nói "đã làm gì".
///   Không ghi lại phiên (session replay), không tự chụp màn.
@MainActor
enum Telemetry {
  /// Danh sách sự kiện CỐ ĐỊNH — thêm sự kiện là thêm một case, không gửi chuỗi tự do.
  enum Event: String {
    case appOpened = "app_opened"
    case onboardingCompleted = "onboarding_completed"
    case healthConnected = "health_connected"
    case mealLogged = "meal_logged"
    case workoutLogged = "workout_logged"
    case workoutCompleted = "workout_completed"
    case quickLogOpened = "quick_log_opened"
    case quickLogPick = "quick_log_pick"
    case eatAgainUsed = "eat_again_used"
    case startCardAction = "start_card_action"
  }

  private static var analytics = false
  private static let firstOpenKey = "telemetry.firstOpen"

  static var build: String {
    #if DEBUG
      "debug"
    #else
      "release"
    #endif
  }

  /// Khởi động khi có khoá; gọi một lần lúc mở app.
  static func start(bundle: Bundle = .main) {
    let info = bundle.infoDictionary ?? [:]
    if let dsn = configured(info["ASCNDSentryDSN"]) {
      SentrySDK.start { o in
        o.dsn = dsn
        o.environment = build
        o.sendDefaultPii = false
        o.tracesSampleRate = 0.2
      }
      #if DEBUG
        // Kiểm tra cấu hình: chạy bản Debug với ASCND_TELEMETRY_TEST=1 → một tin lên Sentry.
        if ProcessInfo.processInfo.environment["ASCND_TELEMETRY_TEST"] == "1" {
          SentrySDK.capture(message: "ASCND: kiểm tra Sentry (debug)")
        }
      #endif
    }
    if let key = configured(info["ASCNDPostHogKey"]), let host = configured(info["ASCNDPostHogHost"]) {
      let config = PostHogConfig(apiKey: key, host: host)
      config.captureScreenViews = false
      config.captureApplicationLifecycleEvents = false
      config.sessionReplay = false
      PostHogSDK.shared.setup(config)
      PostHogSDK.shared.register(["build": build])
      analytics = true
    }
  }

  /// Giá trị Info.plist dùng được: không trống, không còn là biến chưa thay, không chỉ
  /// là "https://" (xcconfig ghép `https://$(…)` khi biến trống).
  static func configured(_ v: Any?) -> String? {
    guard let s = (v as? String)?.trimmingCharacters(in: .whitespaces), !s.isEmpty,
      !s.contains("$("), s != "https://"
    else { return nil }
    return s
  }

  /// Phiên đổi: gắn / bỏ mã tài khoản (UUID — không email).
  static func setUser(_ userId: String?) {
    if let userId {
      SentrySDK.setUser(User(userId: userId))
      if analytics { PostHogSDK.shared.identify(userId) }
    } else {
      SentrySDK.setUser(nil)
      if analytics { PostHogSDK.shared.reset() }
    }
  }

  static func capture(_ event: Event, _ props: [String: String] = [:]) {
    guard analytics else { return }
    PostHogSDK.shared.capture(event.rawValue, properties: props)
  }

  /// Mỗi lần app ra tiền cảnh: kèm số ngày kể từ lần mở đầu tiên (ngày 1 / ngày 7…).
  static func appOpened(now: Date = Date()) {
    let d = UserDefaults.standard
    if d.object(forKey: firstOpenKey) == nil { d.set(now.timeIntervalSince1970, forKey: firstOpenKey) }
    let first = Date(timeIntervalSince1970: d.double(forKey: firstOpenKey))
    let days = Calendar.current.dateComponents([.day], from: first, to: now).day ?? 0
    capture(.appOpened, ["days_since_first_open": String(days)])
  }
}
