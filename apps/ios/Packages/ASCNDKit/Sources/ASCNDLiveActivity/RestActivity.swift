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

/// `RestActivityDriver` thật. Không giữ bảng id trong bộ nhớ (bản RN mất bảng
/// ấy khi JS nạp lại và `update` ném lỗi bị nuốt — #227 H2): luôn hỏi hệ
/// thống activity nào đang sống.
@MainActor
public struct ActivityKitRestDriver: RestActivityDriver {
  public init() {}

  private var live: Activity<RestActivityAttributes>? {
    Activity<RestActivityAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
  }

  public func current() async -> RestActivityContent? {
    live?.content.state
  }

  public func start(_ content: RestActivityContent) async {
    // Một quãng nghỉ tại một thời điểm: dọn mọi activity cũ trước.
    for a in Activity<RestActivityAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    _ = try? Activity.request(
      attributes: RestActivityAttributes(),
      content: ActivityContent(state: content, staleDate: Self.stale(content)),
      pushType: nil)
  }

  public func update(_ content: RestActivityContent) async {
    guard let a = live else {
      await start(content)
      return
    }
    await a.update(ActivityContent(state: content, staleDate: Self.stale(content)))
  }

  public func end() async {
    for a in Activity<RestActivityAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
  }

  /// Hết hạn 60 giây sau khi nghỉ xong: app không còn chạy để dọn thì hệ
  /// thống tự coi nó là cũ.
  static func stale(_ c: RestActivityContent) -> Date {
    c.endsAt.date.addingTimeInterval(60)
  }
}
#endif
