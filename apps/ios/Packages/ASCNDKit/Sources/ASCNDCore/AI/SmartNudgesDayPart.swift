extension SmartNudges {
  /// Khung giờ của insight (24/10, chủ dự án): 0 giờ mà khuyên uống nước là
  /// sai. Prompt của server chỉ có "sáng / tối", nên 0–4 giờ bị tính là sáng.
  /// Mỗi khung một lượt AI (khoá bộ nhớ đệm có khung), và câu không hợp giờ
  /// bị bỏ ở máy, kể cả khi AI vẫn viết ra.
  public enum DayPart: String, Sendable, Hashable, CaseIterable {
    /// 5–10 giờ.
    case morning
    /// 11–17 giờ.
    case day
    /// 18–21 giờ.
    case evening
    /// 22–4 giờ: chỉ còn ngủ và nghỉ.
    case night

    public init(hour: Int) {
      switch hour {
      case 5...10: self = .morning
      case 11...17: self = .day
      case 18...21: self = .evening
      default: self = .night
      }
    }
  }

  /// Câu hợp với khung giờ này. Đêm khuya không câu nào của AI hợp: "chưa
  /// ghi giấc ngủ đêm qua" lúc 0 giờ là lạ, nước / ăn / tập thì để sáng mai —
  /// chỉ còn lời nhắc đi ngủ (Kiệt 24/10).
  public static func fits(_ n: Nudge, _ part: DayPart) -> Bool {
    switch part {
    case .night: n.type == bedtimeType
    case .morning: n.type != "calories"
    case .day, .evening: true
    }
  }

  /// Các câu hợp giờ. Đêm khuya: một câu nhắc đi ngủ sớm thay cho mọi câu khác
  /// (không thẻ số liệu giấc ngủ — đêm nay chưa ngủ thì chưa có gì để đo).
  public static func fitting(_ nudges: [Nudge], hour: Int, lang: String) -> [Nudge] {
    let part = DayPart(hour: hour)
    if part == .night { return nudges.isEmpty ? [] : [goToBed(lang)] }
    return nudges.filter { fits($0, part) }
  }

  /// Loại của câu nhắc đi ngủ: không thuộc chủ đề nào của thẻ số liệu.
  public static let bedtimeType = "bedtime"

  static func goToBed(_ lang: String) -> Nudge {
    let message = switch CoachQuickReply.Lang(lang) {
    case .vi: "Đi ngủ sớm để mai cơ thể hồi phục tốt hơn."
    case .en: "Get to bed early so you recover well for tomorrow."
    case .es: "Acuéstate pronto para recuperarte bien mañana."
    }
    return Nudge(type: bedtimeType, message: message, priority: .high)
  }
}
