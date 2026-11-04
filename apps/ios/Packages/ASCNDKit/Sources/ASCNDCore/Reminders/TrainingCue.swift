import Foundation

/// Kế hoạch "nếu… thì…" cho buổi tập (Kiệt duyệt 03/11): "Mình sẽ tập sau khi tan làm", và tuỳ
/// chọn "Nếu hôm đó bận thì tập bản 15 phút". Gắn buổi tập vào một việc sẵn có trong ngày.
/// Bằng chứng riêng cho vận động: SMD 0,31 ngay sau can thiệp, 0,24 khi theo dõi; kế hoạch có
/// cách xử lý trở ngại hiệu quả hơn (Bélanger-Gravel et al. 2013,
/// `docs/research/WEEK_RULES_EVIDENCE.md`).
public struct TrainingCue: Sendable, Hashable, Codable {
  public enum Anchor: String, Sendable, Hashable, Codable, CaseIterable {
    case wake, lunch, afterWork, dinner, custom
  }

  /// Hôm đó bận thì làm gì.
  public enum Busy: String, Sendable, Hashable, Codable, CaseIterable {
    case short, tomorrow
  }

  public var anchor: Anchor
  /// Giờ nhắc; mặc định theo mốc, người dùng sửa được.
  public var clock: ReminderClock
  public var busy: Busy?

  public init(anchor: Anchor, clock: ReminderClock? = nil, wake: ReminderClock? = nil, busy: Busy? = nil) {
    self.anchor = anchor
    self.clock = clock ?? Self.defaultClock(anchor, wake: wake)
    self.busy = busy
  }

  /// Giờ mặc định của mỗi mốc: thức dậy theo giờ dậy đã lưu nếu có.
  public static func defaultClock(_ anchor: Anchor, wake: ReminderClock? = nil) -> ReminderClock {
    switch anchor {
    case .wake: wake ?? ReminderClock(hour: 6, minute: 30)
    case .lunch: ReminderClock(hour: 12, minute: 0)
    case .afterWork, .custom: ReminderClock(hour: 18, minute: 0)
    case .dinner: ReminderClock(hour: 19, minute: 30)
    }
  }

  /// Câu nhắc nói đúng mốc của người dùng; phần thân thêm câu xử lý lúc bận nếu có.
  public func text(_ lang: AppPreferences.Lang) -> ReminderText {
    let title: String = switch (lang, anchor) {
    case (.vi, .wake): "Dậy rồi. Buổi tập hôm nay chờ bạn"
    case (.vi, .lunch): "Nghỉ trưa rồi. Buổi tập hôm nay chờ bạn"
    case (.vi, .afterWork): "Tan làm rồi. Buổi tập hôm nay chờ bạn"
    case (.vi, .dinner): "Ăn tối xong rồi. Buổi tập hôm nay chờ bạn"
    case (.vi, .custom): "Tới giờ tập bạn đã hẹn"
    case (.en, .wake): "You're up. Today's session is waiting"
    case (.en, .lunch): "Lunch break. Today's session is waiting"
    case (.en, .afterWork): "Work's done. Today's session is waiting"
    case (.en, .dinner): "Dinner's done. Today's session is waiting"
    case (.en, .custom): "It's the time you set to train"
    case (.es, .wake): "Ya despertaste. Tu sesión de hoy te espera"
    case (.es, .lunch): "Hora del almuerzo. Tu sesión de hoy te espera"
    case (.es, .afterWork): "Terminaste el trabajo. Tu sesión de hoy te espera"
    case (.es, .dinner): "Ya cenaste. Tu sesión de hoy te espera"
    case (.es, .custom): "Es la hora que elegiste para entrenar"
    }
    let body: String = switch (lang, busy) {
    case (.vi, .short): "Bận thì tập bản 15 phút cũng tính."
    case (.vi, .tomorrow): "Bận thì dời sang mai, không sao."
    case (.vi, nil): "Koa khởi động xong rồi."
    case (.en, .short): "Busy? The 15-minute version still counts."
    case (.en, .tomorrow): "Busy? Move it to tomorrow, that's fine."
    case (.en, nil): "Koa is warmed up."
    case (.es, .short): "¿Sin tiempo? La versión de 15 minutos también cuenta."
    case (.es, .tomorrow): "¿Sin tiempo? Pásala a mañana, no pasa nada."
    case (.es, nil): "Koa ya calentó."
    }
    return ReminderText(title: title, body: body)
  }
}
