/// Đổi lịch cho RIÊNG một ngày (#527 GĐ1 — bảng `plan_day_overrides`, Kiệt chọn
/// "bảng mới trên server" 21/10; điều kiện 03 của lần duyệt GĐ1).
///
/// `routine_days` là lịch mẫu theo thứ. Một hàng ở đây thắng lịch mẫu cho đúng
/// ngày của nó: nghỉ, hay một buổi cụ thể. Quyết định được GHI LẠI (`movedTo` /
/// `movedFrom`), không xoá gì — thống kê đọc cùng một lịch đã áp.
public struct DayOverride: Sendable, Hashable, Codable {
  public let date: LocalDate
  /// Buổi của ngày; `nil` + `!isRest` = "chưa lên lịch".
  public let templateId: String?
  public let isRest: Bool
  /// Buổi này dời từ ngày nào tới đây.
  public let movedFrom: LocalDate?
  /// Buổi của ngày này đã dời tới ngày nào (ngày này thành nghỉ).
  public let movedTo: LocalDate?

  public init(date: LocalDate, templateId: String?, isRest: Bool, movedFrom: LocalDate? = nil, movedTo: LocalDate? = nil) {
    self.date = date
    self.templateId = templateId?.lowercased()
    self.isRest = isRest
    self.movedFrom = movedFrom
    self.movedTo = movedTo
  }

  /// Hàng outbox / server.
  public func row(userId: String) -> JSONValue {
    .object([
      "user_id": .string(userId),
      "date": .string(date.description),
      "template_id": templateId.map(JSONValue.string) ?? .null,
      "is_rest": .bool(isRest),
      "moved_from": movedFrom.map { .string($0.description) } ?? .null,
      "moved_to": movedTo.map { .string($0.description) } ?? .null,
    ])
  }

  public init?(row: JSONValue) {
    guard let date = row["date"]?.stringValue.flatMap({ LocalDate(String($0.prefix(10))) }) else { return nil }
    self.init(
      date: date, templateId: row["template_id"]?.stringValue, isRest: row["is_rest"]?.boolValue ?? false,
      movedFrom: row["moved_from"]?.stringValue.flatMap { LocalDate(String($0.prefix(10))) },
      movedTo: row["moved_to"]?.stringValue.flatMap { LocalDate(String($0.prefix(10))) })
  }
}

/// Chọn ngày đích khi dời một buổi (điều kiện 03): ngày GẦN NHẤT sau `from`,
/// trong 6 ngày, CHƯA có buổi — ưu tiên ngày trống, rồi mới tới ngày nghỉ đã
/// đặt. Không có thì `nil` (không có phương án dời) — không bao giờ chồng hai
/// buổi lên một ngày.
public enum Reschedule {
  public static let window = 6

  public static func target(from: LocalDate, in snapshot: TemplateSnapshot) -> LocalDate? {
    let days = (1...window).map { from.adding(days: $0) }
    let free = days.filter { snapshot.plan(for: $0, today: from).template == nil }
    return free.first { snapshot.plan(for: $0, today: from).status == .unplanned } ?? free.first
  }
}

extension TemplateSnapshot {
  /// Hàng đổi lịch của `date`, nếu có.
  public func override(on date: LocalDate) -> DayOverride? {
    overrides.first { $0.date == date }
  }

  /// Ngày `date` có buổi theo lịch đã áp.
  public func isPlanned(_ date: LocalDate) -> Bool {
    plan(for: date, today: date).template != nil
  }

  /// Ngày `date` là ngày nghỉ đã đặt theo lịch đã áp.
  public func isRest(_ date: LocalDate) -> Bool {
    plan(for: date, today: date).status == .rest
  }
}
