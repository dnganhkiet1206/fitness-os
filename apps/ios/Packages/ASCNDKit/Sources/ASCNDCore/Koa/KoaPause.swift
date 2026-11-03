public import Foundation

/// Tạm nghỉ có hẹn ngày quay lại (Koa Ecosystem V2, Kiệt duyệt 02/11): ốm, đi xa, cần hồi phục.
/// Trong lúc nghỉ: không nhắc tập, phòng Koa không bám bụi, Daily Plan chỉ gợi việc nhẹ, Tuần của
/// Koa không tính những ngày ấy, Nhịp 30 ngày gọi tên là "tạm nghỉ". Hết hẹn thì tự hết, không cần
/// bấm gì; Koa chào như một lần quay lại.
public struct KoaPause: Sendable, Hashable, Codable {
  public static let maxDays = 14

  public let start: LocalDate
  /// Ngày nghỉ cuối cùng (tính cả ngày này).
  public let last: LocalDate

  /// Nghỉ `days` ngày tính từ `today`, giới hạn 1…`maxDays`.
  public init(from today: LocalDate, days: Int) {
    start = today
    last = today.adding(days: min(Self.maxDays, max(1, days)) - 1)
  }

  public init(start: LocalDate, last: LocalDate) {
    self.start = start
    self.last = max(start, min(last, start.adding(days: Self.maxDays - 1)))
  }

  public func contains(_ day: LocalDate) -> Bool { day >= start && day <= last }
  public func active(on today: LocalDate) -> Bool { today <= last }
  /// Ngày đầu tiên tập lại.
  public var returnDay: LocalDate { last.adding(days: 1) }
  public func daysLeft(from today: LocalDate) -> Int { max(0, last.daysSinceEpoch - today.daysSinceEpoch + 1) }

  /// Kết thúc sớm: hôm nay là ngày quay lại, không tính là ngày nghỉ.
  public func ended(on today: LocalDate) -> KoaPause? {
    today <= start ? nil : KoaPause(start: start, last: today.adding(days: -1))
  }
}

extension ReminderContext {
  /// Ngày đang tạm nghỉ không có lời nhắc tập (cả lời nhắc của Koa).
  public func paused(_ pause: KoaPause?, today: LocalDate) -> ReminderContext {
    guard let pause, pause.active(on: today) else { return self }
    var ctx = self
    var planned = ctx.plannedByOffset ?? [:]
    for offset in 0..<14 where pause.contains(today.adding(days: offset)) { planned[offset] = false }
    ctx.plannedByOffset = planned
    return ctx
  }
}
