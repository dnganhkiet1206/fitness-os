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

/// Hiện lời nhắc cả khi app đang mở (`setNotificationHandler` của RN: banner +
/// danh sách + âm thanh, không badge).
final class ReminderPresenter: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }
}
