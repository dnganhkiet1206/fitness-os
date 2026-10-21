import ASCNDCore
import Foundation
import WidgetKit

/// Đẩy dữ liệu thật cho hai widget màn hình chính (`usePushWidgetData` của RN)
/// và xoá chúng khi phiên kết thúc (`clearWidgetData`).
///
/// Biết người đang đăng nhập để một lượt làm mới về MUỘN (sau khi gửi hàng
/// đợi, sau khi đăng xuất) không bao giờ ghi số của người vừa rời đi lên màn
/// hình chính.
final class WidgetRefresher: @unchecked Sendable {
  private let lock = NSLock()
  private var user: String?
  private let store: (any RowStore)?
  private let data: WidgetDataStore
  /// Lịch tập đã cache của người dùng (`TodayRepository.cached`), `nil` = không dùng.
  private let plans: (@Sendable (String) async -> TemplateSnapshot?)?
  /// Câu của Daily Plan cho buổi hôm nay (GĐ1) — `AppServices.widgetPlanStatus`.
  var planStatus: (@Sendable (String) async -> String?)? {
    get { lock.withLock { _planStatus } }
    set { lock.withLock { _planStatus = newValue } }
  }
  private var _planStatus: (@Sendable (String) async -> String?)?

  init(
    store: (any RowStore)?, data: WidgetDataStore = WidgetDataStore(),
    plans: (@Sendable (String) async -> TemplateSnapshot?)? = nil
  ) {
    self.store = store
    self.data = data
    self.plans = plans
  }

  /// Phiên đổi. Không còn ai: xoá ngay.
  func setUser(_ userId: String?) {
    lock.withLock { user = userId }
    if userId == nil {
      data.clear()
      Task { @MainActor in KoaWidgetResetHook.reset?() }
      WidgetCenter.shared.reloadAllTimelines()
    } else {
      Task { await refresh() }
    }
  }

  /// Đọc server, dựng payload, ghi App Group, báo widget vẽ lại. Đọc hỏng thì
  /// giữ số cũ (`WidgetSync.payloads` trả `nil`).
  func refresh() async {
    guard let store, let userId = lock.withLock({ user }) else { return }
    let snapshot = await plans?(userId)
    let status = await planStatus?(userId)
    guard
      let p = await WidgetSync.payloads(
        userId: userId, store: store, copy: Self.copy, now: SystemWallClock().nowMillis(), in: .current,
        recovery: ReadinessCopyStore.copy.map { copy in { ReadinessCard.hasRecoverySignal($0, copy: copy) } },
        plans: snapshot, planStatus: status)
    else { return }
    // Phiên đã đổi trong lúc đọc: bỏ, không ghi số của người khác.
    guard lock.withLock({ user }) == userId else { return }
    data.write(p.today, p.streak)
    WidgetCenter.shared.reloadAllTimelines()
  }

  /// Ngôn ngữ trong app đổi (hoặc lúc mở app): widget và Live Activity đọc
  /// khoá này từ App Group. Dòng trạng thái trong payload được dựng bằng chữ
  /// của app (`copy`), nên dựng lại theo ngôn ngữ mới. `nil` = "Theo máy".
  func setLanguage(_ code: String?) {
    let changed = data.language() != code
    data.writeLanguage(code)
    guard changed else { return }
    WidgetCenter.shared.reloadAllTimelines()
    Task { await refresh() }
  }

  static var copy: HomeWidgets.Copy {
    HomeWidgets.Copy(
      done: String(localized: "widget.done"), restDay: String(localized: "widget.restDay"),
      noWorkout: String(localized: "widget.noWorkout"), untitled: String(localized: "widget.untitled"),
      noScore: String(localized: "widget.noScore"), notStarted: String(localized: "widget.notStarted"))
  }
}

/// Đăng xuất xoá ảnh Koa; bộ đẩy widget (của `AppServices`) quên ảnh đã vẽ.
@MainActor enum KoaWidgetResetHook {
  static var reset: (() -> Void)?
}
