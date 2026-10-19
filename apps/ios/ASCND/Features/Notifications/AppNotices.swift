import ASCNDCore
import Foundation

/// Tin "nhắc việc" của chính app trong mục Thông báo (16/10, chủ dự án: chuông
/// chuyển về trang Hôm nay thay viên chuỗi ngày, một hộp cho cả app). Không có
/// bảng nào: tính từ phòng linh vật ngay trên máy, tự biến mất khi việc đã xong
/// — nhưng chấm đỏ trên chuông chỉ tính tin CHƯA XEM (16/10, chủ dự án: "nút đỏ
/// chỉ xuất hiện khi có thông báo chưa đọc"), qua `NoticeSeen`.
enum AppNotice: Hashable, Identifiable {
  /// Chuỗi ≥ 1 ngày, hôm nay chưa ghi gì, đã sang buổi tối.
  case streakRisk(days: Int)
  // "Xu đang chờ — mở phòng Koa để nhận" đã bỏ (Koa đợt 1, 19/10): xu tự về.

  var id: String {
    switch self {
    case .streakRisk: "streak"
    }
  }

  /// Khoá "đã xem": cùng loại + cùng giá trị + cùng ngày. Số xu đổi hay sang ngày
  /// mới là một tin mới.
  func seenKey(day: String) -> String {
    switch self {
    case .streakRisk(let d): "streak:\(d):\(day)"
    }
  }

  /// Giờ bắt đầu nhắc chuỗi: trước đó chấm đỏ trên chuông cả ngày chỉ vì sáng
  /// chưa ghi là nhắc vô ích.
  static let streakEveningHour = 18

  @MainActor
  static func of(_ room: MascotRoomController?, now: Date = Date(), calendar: Calendar = .current) -> [AppNotice] {
    guard let room, case .ready = room.phase else { return [] }
    var out: [AppNotice] = []
    if room.streak.count >= 1, !room.streak.loggedToday,
      calendar.component(.hour, from: now) >= streakEveningHour
    {
      out.append(.streakRisk(days: room.streak.count))
    }
    return out
  }
}

/// Tin nhắc việc / thử thách đã xem trong màn Thông báo — lưu trên máy theo tài
/// khoản (tin của app không có bảng nào để ghi "đã đọc").
enum NoticeSeen {
  private static func key(_ userId: String) -> String { "notif.seen.\(userId)" }

  static func load(userId: String) -> Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: key(userId)) ?? [])
  }

  /// Giữ tối đa 60 khoá gần nhất.
  static func save(_ keys: Set<String>, userId: String) {
    UserDefaults.standard.set(Array(keys.sorted().suffix(60)), forKey: key(userId))
  }

  /// Khoá của mọi tin nhắc việc + thử thách đang có.
  static func keys(notices: [AppNotice], challengeIds: [String], day: String) -> Set<String> {
    Set(notices.map { $0.seenKey(day: day) } + challengeIds.map { "challenge:\($0)" })
  }
}
