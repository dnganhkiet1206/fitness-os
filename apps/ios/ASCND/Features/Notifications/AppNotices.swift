import ASCNDCore
import Foundation

/// Tin "nhắc việc" của chính app trong mục Thông báo (16/10, chủ dự án: chuông
/// chuyển về trang Hôm nay thay viên chuỗi ngày, một hộp cho cả app). Không có
/// bảng nào: tính từ phòng linh vật ngay trên máy, tự biến mất khi việc đã xong
/// — nên không cần trạng thái "đã đọc".
enum AppNotice: Hashable, Identifiable {
  /// Chuỗi ≥ 1 ngày, hôm nay chưa ghi gì, đã sang buổi tối.
  case streakRisk(days: Int)
  /// Việc hôm nay đã xong mà xu chưa nhận (nhận ở phòng linh vật).
  case coinsWaiting(Int)

  var id: String {
    switch self {
    case .streakRisk: "streak"
    case .coinsWaiting: "coins"
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
    let coins = room.activeQuests
      .filter { room.questDone($0.key) && !room.isClaimed(MascotRules.questRefKey(room.today, $0.key)) }
      .map(\.coins).reduce(0, +)
    if coins > 0 { out.append(.coinsWaiting(coins)) }
    return out
  }
}
