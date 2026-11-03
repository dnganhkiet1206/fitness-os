import Foundation

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

/// Bảng `koa_pauses` (migration `20261103120000`, deploy 03/11 khi Kiệt duyệt): mỗi người một
/// dòng, ghi đè. Không xoá: kết thúc sớm là ghi một đợt đã qua.
public enum KoaPauseSync {
  public static let table = "koa_pauses"

  public static func query(userId: String) -> RowQuery {
    RowQuery(table: table, columns: "starts_on,ends_on", filters: [.eq("user_id", .string(userId))], limit: 1)
  }

  public static func decode(_ row: JSONValue?) -> KoaPause? {
    guard let s = row?["starts_on"]?.stringValue.flatMap(LocalDate.init),
      let e = row?["ends_on"]?.stringValue.flatMap(LocalDate.init)
    else { return nil }
    return KoaPause(start: s, last: e)
  }

  /// `nil` = không nghỉ: ghi một ngày đã qua để dòng cũ hết hiệu lực.
  public static func row(_ pause: KoaPause?, userId: String, today: LocalDate) -> [String: JSONValue] {
    let p = pause ?? KoaPause(start: today.adding(days: -1), last: today.adding(days: -1))
    return [
      "user_id": .string(userId), "starts_on": .string(p.start.description), "ends_on": .string(p.last.description),
    ]
  }
}

/// Các đợt tạm nghỉ trong `keepDays` ngày gần nhất, cả đợt đang có (03/11). Đợt đã qua vẫn là
/// ngày nghỉ: Nhịp 30 ngày ghi "tạm nghỉ", phòng Koa không tính bụi cho những ngày ấy, Tuần của
/// Koa không tính chúng vào đích. Trước đây chỉ nhớ đợt đang có, nên vừa quay lại là phòng bám
/// bụi cho đúng những ngày đã nghỉ.
public struct KoaPauseLog: Sendable, Hashable, Codable {
  /// Đủ cho Nhịp 30 ngày và bụi phòng (đọc 30 ngày), dư một tháng.
  public static let keepDays = 60

  /// Theo ngày bắt đầu, không chồng nhau.
  public private(set) var spells: [KoaPause]

  public init(_ spells: [KoaPause] = []) {
    self.spells = spells.sorted { $0.start < $1.start }
  }

  public func contains(_ day: LocalDate) -> Bool { spells.contains { $0.contains(day) } }

  /// Đặt đợt nghỉ mới từ `today`, hoặc kết thúc sớm (`nil`). Đợt đang có hay sắp tới dừng ở hôm qua;
  /// đợt đã qua giữ nguyên.
  public func setting(_ pause: KoaPause?, today: LocalDate) -> KoaPauseLog {
    var out = spells.compactMap { $0.last < today ? $0 : $0.ended(on: today) }
    if let pause { out.append(pause) }
    return KoaPauseLog(out).pruned(today: today)
  }

  /// Ghép đợt đang có đọc từ `koa_pauses` (đặt ở máy khác) nếu sổ chưa có.
  public func including(_ current: KoaPause?, today: LocalDate) -> KoaPauseLog {
    guard let current, !spells.contains(current) else { return self }
    return setting(current, today: current.start).pruned(today: today)
  }

  public func pruned(today: LocalDate) -> KoaPauseLog {
    KoaPauseLog(spells.filter { $0.last >= today.adding(days: -Self.keepDays) })
  }
}

/// Bảng `koa_pause_log` (migration `20261104120000`, **chưa deploy, chờ Kiệt duyệt**): một dòng
/// mỗi đợt, khoá (người, ngày bắt đầu). Không xoá: đợt bị huỷ ngay hôm đầu ghi `ends_on` trước
/// `starts_on` và bị bỏ qua khi đọc. Chưa có bảng thì sổ chỉ nằm trên máy.
public enum KoaPauseLogSync {
  public static let table = "koa_pause_log"
  public static let conflict = "user_id,starts_on"

  public static func query(userId: String, today: LocalDate) -> RowQuery {
    RowQuery(
      table: table, columns: "starts_on,ends_on",
      filters: [
        .eq("user_id", .string(userId)),
        .gte("ends_on", .string(today.adding(days: -KoaPauseLog.keepDays).description)),
      ], limit: 100)
  }

  public static func decode(_ rows: [JSONValue], today: LocalDate) -> KoaPauseLog {
    let spells = rows.compactMap { r -> KoaPause? in
      guard let s = r["starts_on"]?.stringValue.flatMap(LocalDate.init),
        let e = r["ends_on"]?.stringValue.flatMap(LocalDate.init), e >= s
      else { return nil }
      return KoaPause(start: s, last: e)
    }
    return KoaPauseLog(spells).pruned(today: today)
  }

  /// Dòng cần ghi để server đi từ `old` tới `new`: đợt mới hay đổi ngày cuối, và đợt đã bị huỷ.
  public static func rows(from old: KoaPauseLog, to new: KoaPauseLog, userId: String) -> [[String: JSONValue]] {
    func row(_ start: LocalDate, _ last: LocalDate) -> [String: JSONValue] {
      ["user_id": .string(userId), "starts_on": .string(start.description), "ends_on": .string(last.description)]
    }
    let kept = Set(new.spells.map(\.start))
    let changed = new.spells.filter { !old.spells.contains($0) }.map { row($0.start, $0.last) }
    let cancelled = old.spells.filter { !kept.contains($0.start) }.map { row($0.start, $0.start.adding(days: -1)) }
    return changed + cancelled
  }

  /// Toàn bộ sổ, để gửi lại khi lần trước chưa gửi được (ghi đè theo khoá, gửi lại không sao).
  public static func rows(_ log: KoaPauseLog, userId: String) -> [[String: JSONValue]] {
    rows(from: KoaPauseLog(), to: log, userId: userId)
  }
}
