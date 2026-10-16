import ASCNDCore
import BackgroundTasks
import Foundation
import UserNotifications

/// Thông báo tin cộng đồng khi app không mở (16/10, chủ dự án: "app chưa gửi
/// thông báo"). Chưa có máy chủ push (APNs + bảng token là việc của server), nên
/// dùng làm mới nền của iOS: thỉnh thoảng (iOS quyết định, thường vài chục phút
/// tới vài giờ) app đọc `community_notifications` chưa đọc và tự hiện một thông
/// báo cục bộ. Không đổi schema, không đánh dấu đã đọc (đó vẫn là việc của màn
/// Thông báo).
///
/// Mỗi tin chỉ báo một lần: nhớ mốc `at` mới nhất đã báo, theo tài khoản.
enum CommunityAlerts {
  static let taskId = "com.ascnd.fitnessos.community-refresh"
  /// Định danh riêng — `NotificationReminderScheduler.replaceAll` chỉ huỷ lời nhắc
  /// đang CHỜ, thông báo đã hiện không bị đụng.
  static let requestPrefix = "ascnd-community-"

  private static func markKey(_ userId: String) -> String { "notif.community.alerted.\(userId)" }

  /// Dịch vụ của app cho lượt chạy nền (gán trong `ASCNDApp.init`).
  @MainActor static weak var services: AppServices?

  /// Lượt làm mới nền: xin lượt kế rồi kiểm.
  @MainActor
  static func runInBackground() async {
    schedule()
    guard let services else { return }
    await check(services: services)
  }

  @MainActor
  private static func permitted(_ services: AppServices) async -> Bool {
    await services.reminders.refreshPermission()
    return services.reminders.permission
  }

  /// Xin iOS một lượt làm mới nền, sớm nhất sau 30 phút.
  static func schedule() {
    let req = BGAppRefreshTaskRequest(identifier: taskId)
    req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    try? BGTaskScheduler.shared.submit(req)
  }

  /// Một lượt: đọc tin chưa đọc mới hơn mốc đã báo, hiện MỘT thông báo (một tin
  /// thì nói rõ ai làm gì, nhiều tin thì đếm). Lần đầu chạy chỉ ghi mốc — không dội
  /// tin cũ vào màn khoá.
  @MainActor
  static func check(services: AppServices) async {
    if services.session.session == nil { await services.session.start() }
    guard let userId = services.session.session?.userId,
      await permitted(services),
      let book = services.makeCommunityInbox(userId: userId)
    else { return }
    await book.load(lang: AppServices.appLang)
    guard book.phase == .ready else { return }
    let defaults = UserDefaults.standard
    let unread = book.items.filter(\.unread)
    let newest = unread.map(\.at).max()
    guard let mark = defaults.string(forKey: markKey(userId)) else {
      defaults.set(newest ?? "", forKey: markKey(userId))
      return
    }
    let fresh = unread.filter { $0.at > mark }
    guard let first = fresh.first, let newest else { return }
    defaults.set(newest, forKey: markKey(userId))

    let body: String
    if fresh.count == 1 {
      let p = CommunityInboxView.parts(first)
      body = p.before + p.name + p.after
    } else {
      body = String(localized: "notif.push.community.many \(fresh.count)")
    }
    await post(body: body, id: newest)
  }

  private static func post(body: String, id: String, delay: TimeInterval? = nil) async {
    let content = UNMutableNotificationContent()
    content.title = String(localized: "notif.push.community.title")
    content.body = body
    content.sound = .default
    content.threadIdentifier = "community"
    let trigger = delay.map { UNTimeIntervalNotificationTrigger(timeInterval: $0, repeats: false) }
    try? await UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: requestPrefix + id, content: content, trigger: trigger))
  }

  #if DEBUG
    /// Chỉ bản Debug, `ASCND_NOTIF_TEST=1`: đặt một thông báo cộng đồng mẫu sau 8
    /// giây (kịp về màn chính / khoá máy) — kiểm đường hiện thông báo khi chưa có
    /// tin cộng đồng thật để thử.
    @MainActor
    static func postTestIfAsked(services: AppServices) async {
      guard ProcessInfo.processInfo.environment["ASCND_NOTIF_TEST"] == "1", await permitted(services) else { return }
      await post(body: String(localized: "notif.push.community.many \(2)"), id: "test-\(Date().timeIntervalSince1970)", delay: 8)
    }
  #endif
}
