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

  init(store: (any RowStore)?, data: WidgetDataStore = WidgetDataStore()) {
    self.store = store
    self.data = data
  }

  /// Phiên đổi. Không còn ai: xoá ngay.
  func setUser(_ userId: String?) {
    lock.withLock { user = userId }
    if userId == nil {
      data.clear()
      WidgetCenter.shared.reloadAllTimelines()
    } else {
      Task { await refresh() }
    }
  }

  /// Đọc server, dựng payload, ghi App Group, báo widget vẽ lại. Đọc hỏng thì
  /// giữ số cũ (`WidgetSync.payloads` trả `nil`).
  func refresh() async {
    guard let store, let userId = lock.withLock({ user }) else { return }
    guard
      let p = await WidgetSync.payloads(
        userId: userId, store: store, copy: Self.copy, now: SystemWallClock().nowMillis(), in: .current)
    else { return }
    // Phiên đã đổi trong lúc đọc: bỏ, không ghi số của người khác.
    guard lock.withLock({ user }) == userId else { return }
    data.write(p.today, p.streak)
    WidgetCenter.shared.reloadAllTimelines()
  }

  static var copy: HomeWidgets.Copy {
    HomeWidgets.Copy(
      done: String(localized: "widget.done"), restDay: String(localized: "widget.restDay"),
      noWorkout: String(localized: "widget.noWorkout"), untitled: String(localized: "widget.untitled"))
  }
}
