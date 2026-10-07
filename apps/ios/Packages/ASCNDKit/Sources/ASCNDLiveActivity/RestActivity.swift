// Live Activity của quãng nghỉ — phần dùng chung cho app VÀ widget extension.
//
// Vì sao một target riêng, link vào cả hai: `AdjustRestIntent` phải được biên
// dịch vào cả app lẫn extension. Đó là điều kiện để nút trên Island chạy
// `perform()` trong PROCESS CỦA APP (LiveActivityIntent) — nơi
// `RestTimerController` sống — thay vì trong extension, nơi bản RN chạy và
// không thấy được activity nào (#227 H1).
//
// Chỉ có nội dung trên iOS: ActivityKit không có trên macOS/Linux, và package
// vẫn phải build ở đó (job `core-linux`, `swift test` trên macOS).
#if canImport(ActivityKit) && os(iOS)
public import ActivityKit
public import AppIntents
public import ASCNDCore
public import Foundation

/// `ContentState` chính là phép chiếu `RestActivityContent` của Core — không
/// có bản sao thứ hai của trạng thái nào để lệch (#227 H5).
public struct RestActivityAttributes: ActivityAttributes {
  public typealias ContentState = RestActivityContent
  public init() {}
}

/// Nơi intent tìm `RestTimerController`. App gán lúc khởi động — kể cả khi hệ
/// thống mở app ở nền chỉ để chạy intent.
@MainActor
public enum RestIntentRouter {
  public static var adjust: (@MainActor (Int) -> Void)?
  public static var setPaused: (@MainActor (Bool) -> Void)?
}

/// Nút ±15 trên Island và màn khoá. Là `LiveActivityIntent`: `perform()` chạy
/// trong process của app và gọi đúng đường mà nút trong app gọi.
public struct AdjustRestIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Adjust rest"
  public static let isDiscoverable = false

  @Parameter(title: "Seconds")
  public var seconds: Int

  public init() {}

  public init(seconds: Int) {
    self.seconds = seconds
  }

  @MainActor
  public func perform() async throws -> some IntentResult {
    RestIntentRouter.adjust?(seconds)
    return .result()
  }
}

/// Nút tạm dừng / tiếp tục trên Island và màn khoá (#235; RN `pause` /
/// `resume` của `RestTimerIntents.swift` @ 02/10). Mang trạng thái ĐÍCH chứ
/// không đảo: hai lần chạm trước khi Island kịp vẽ lại không lật ngược nhau.
public struct SetRestPausedIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Pause rest"
  public static let isDiscoverable = false

  @Parameter(title: "Paused")
  public var paused: Bool

  public init() {}

  public init(paused: Bool) {
    self.paused = paused
  }

  @MainActor
  public func perform() async throws -> some IntentResult {
    RestIntentRouter.setPaused?(paused)
    return .result()
  }
}

/// `RestActivityDriver` thật. Không giữ bảng id trong bộ nhớ (bản RN mất bảng
/// ấy khi JS nạp lại và `update` ném lỗi bị nuốt — #227 H2): luôn hỏi hệ
/// thống activity nào đang sống.
///
/// KHÔNG `@MainActor`: `Activity` không `Sendable`, và gọi `end`/`update` của
/// nó từ main actor là "gửi" nó sang ngữ cảnh khác (Swift 6 từ chối). ActivityKit
/// không đòi main thread; thứ tự các lời gọi đã do `RestTimerController` giữ.
public struct ActivityKitRestDriver: RestActivityDriver {
  public init() {}

  private var live: Activity<RestActivityAttributes>? {
    Activity<RestActivityAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
  }

  public func current() async -> RestActivityContent? {
    live?.content.state
  }

  /// Chỉ thành công khi app ở TIỀN CẢNH (Apple: "You start a Live Activity
  /// in your app's code while the app is in the foreground"). Vì vậy
  /// controller không bao giờ gọi `start` khi đã có activity đang hiện. Nếu
  /// gọi, activity cũ sẽ bị end ở dưới đây và request mới bị từ chối từ nền.
  public func start(_ content: RestActivityContent) async -> Bool {
    // Một quãng nghỉ tại một thời điểm: dọn mọi activity cũ trước.
    for a in Activity<RestActivityAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    // Không `try?` rồi giả định đã có activity: request hỏng (app ở nền, hết
    // hạn mức, bị tắt giữa chừng) phải về tới controller (#523 P1).
    do {
      _ = try Activity.request(
        attributes: RestActivityAttributes(),
        content: ActivityContent(state: content, staleDate: Self.stale(content)),
        pushType: nil)
      return true
    } catch {
      return false
    }
  }

  public func update(_ content: RestActivityContent) async -> Bool {
    guard let a = live else {
      return await start(content)
    }
    await a.update(ActivityContent(state: content, staleDate: Self.stale(content)))
    return true
  }

  public func end() async {
    for a in Activity<RestActivityAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
  }

  /// 60 giây sau khi nghỉ xong, hệ thống coi activity là CŨ (`.stale`). Nó
  /// KHÔNG gỡ activity: chú thích của bản RN ("the stale activity is removed
  /// 60s later", `RestTimerLiveActivity.swift` @ fac9ac2) sai. Theo Apple, một
  /// activity không được end sống tới 8 giờ trên Island, và tới 12 giờ trên
  /// màn khoá ("Displaying live data with Live Activities"; `staleDate`:
  /// "the activityState … changes to stale").
  ///
  /// Vì vậy quãng nghỉ hết giờ lúc app ở nền vẫn hiện "0:00" cho tới khi
  /// activity được gỡ thật. Ba đường gỡ:
  /// - app ra tiền cảnh: `settle()`;
  /// - mở lại sau khi bị kill: `reconcile()`;
  /// - chạm ±15: intent → không còn quãng nghỉ → `end`.
  ///
  /// Hiện gì khi `isStale` là quyết định sản phẩm (#274), chưa đổi ở đây.
  ///
  /// Đang dừng: `endsAt` đứng yên giữa chừng, nên mốc cũ tính từ BÂY GIỜ cộng
  /// số giây đóng băng (RN `staleDate` khi `isPaused`).
  static func stale(_ c: RestActivityContent) -> Date {
    if let left = c.pausedLeft { return Date().addingTimeInterval(Double(left) + 60) }
    return c.endsAt.date.addingTimeInterval(60)
  }
}
#endif
