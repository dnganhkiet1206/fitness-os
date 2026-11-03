import ASCNDCore
import Foundation
import UserNotifications

/// `ReminderScheduler` trên `UNUserNotificationCenter` (`lib/notifications.ts`
/// @ fac9ac2). Chỉ thông báo cục bộ — không có máy chủ push.
///
/// - Quyền: alert + âm thanh, không badge (đúng các cờ RN xin).
/// - Mỗi lời nhắc là MỘT LẦN theo ngày giờ lịch (`UNCalendarNotificationTrigger`
///   không lặp), như `SchedulableTriggerInputTypes.DATE` của RN.
/// - Nội dung chỉ có tiêu đề + nội dung, như RN.
/// - Huỷ hết rồi thêm từng cái; một cái bị từ chối chỉ mất cái ấy.
/// Thứ tự một-bên-ghi nằm ở `ReminderCenter`, không ở đây.
struct NotificationReminderScheduler: ReminderScheduler {
  var isAvailable: Bool { true }

  func hasPermission() async -> Bool {
    Self.granted(await UNUserNotificationCenter.current().notificationSettings().authorizationStatus)
  }

  func requestPermission() async -> Bool {
    let center = UNUserNotificationCenter.current()
    if Self.granted(await center.notificationSettings().authorizationStatus) { return true }
    return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
  }

  func replaceAll(_ items: [ScheduledReminder]) async -> ScheduleOutcome {
    let center = UNUserNotificationCenter.current()
    center.removeAllPendingNotificationRequests()
    let calendar = Calendar.current
    var scheduled = 0
    for (i, item) in items.enumerated() {
      let content = UNMutableNotificationContent()
      content.title = item.text.title
      content.body = item.text.body
      if item.key == .meal { content.categoryIdentifier = MealNotification.category }
      let when = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: item.at)
      let request = UNNotificationRequest(
        identifier: "ascnd-reminder-\(i)-\(item.key.rawValue)", content: content,
        trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
      do {
        try await center.add(request)
        scheduled += 1
      } catch {
        // Một lần từ chối (trần, ngày không nhận) chỉ mất MỘT lời nhắc.
      }
    }
    return ScheduleOutcome(requested: items.count, scheduled: scheduled, supported: true)
  }

  func cancelAll() async {
    UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
  }

  private static func granted(_ status: UNAuthorizationStatus) -> Bool {
    status == .authorized || status == .provisional || status == .ephemeral
  }
}

/// Nút trên thông báo nhắc bữa (Kiệt 01/11): nhấn giữ thông báo → "Ghi như mọi khi"
/// (ghi bữa quen theo giờ, không mở app) hay "Ghi món khác" (mở màn ghi bữa).
enum MealNotification {
  static let category = "ascnd-meal"
  static let usual = "ascnd-meal-usual"
  static let other = "ascnd-meal-other"
  static let confirm = "ascnd-meal-logged"

  /// Gọi một lần khi app chạy (trước khi thông báo nào được bấm).
  static func register() {
    let usual = UNNotificationAction(
      identifier: usual, title: String(localized: "notify.meal.usual"), options: [],
      icon: UNNotificationActionIcon(systemImageName: "checkmark.circle"))
    let other = UNNotificationAction(
      identifier: other, title: String(localized: "notify.meal.other"), options: [.foreground],
      icon: UNNotificationActionIcon(systemImageName: "fork.knife"))
    let cat = UNNotificationCategory(identifier: category, actions: [usual, other], intentIdentifiers: [])
    UNUserNotificationCenter.current().setNotificationCategories([cat])
  }

  /// Báo lại đã ghi gì (hay vì sao chưa) — thông báo ngay, không âm thanh.
  static func confirm(title: String, body: String) async {
    let c = UNMutableNotificationContent()
    c.title = title
    c.body = body
    c.interruptionLevel = .passive
    try? await UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: confirm, content: c, trigger: nil))
  }
}

/// Hiện lời nhắc cả khi app đang mở (`setNotificationHandler` của RN: banner +
/// danh sách + âm thanh, không badge).
final class ReminderPresenter: NSObject, UNUserNotificationCenterDelegate {
  /// "Ghi như mọi khi" — AppServices gắn; trả tên món + kcal đã ghi, `nil` nếu không ghi được.
  /// Gắn một lần lúc app dựng dịch vụ, trước khi thông báo nào được bấm.
  nonisolated(unsafe) var logUsualMeal: (@Sendable () async -> (names: String, kcal: Int)?)?
  /// "Ghi món khác" — mở màn ghi bữa (link `ascnd://log-meal`).
  nonisolated(unsafe) var openMealLog: (@Sendable () async -> Void)?

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  /// Chạm một thông báo (đợt 2): đo `notification_opened` theo khoá (`ascnd-reminder-<i>-<khoá>`).
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let id = response.notification.request.identifier
    switch response.actionIdentifier {
    case MealNotification.usual:
      let done = await logUsualMeal?()
      await MainActor.run { Telemetry.capture(.notificationOpened, ["key": "meal-usual", "logged": done != nil ? "1" : "0"]) }
      if let done {
        await MealNotification.confirm(
          title: String(localized: "notify.meal.logged"), body: String(localized: "notify.meal.logged.body \(done.names) \(done.kcal)"))
      } else {
        await MealNotification.confirm(
          title: String(localized: "notify.meal.none"), body: String(localized: "notify.meal.none.body"))
      }
      return
    case MealNotification.other:
      await openMealLog?()
      return
    default:
      break
    }
    guard id.hasPrefix("ascnd-reminder-") else { return }
    let key = id.split(separator: "-").last.map(String.init) ?? "unknown"
    await MainActor.run { Telemetry.capture(.notificationOpened, ["key": key]) }
  }
}
