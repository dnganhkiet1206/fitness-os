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

  /// Chủ đề còn hợp ở đêm khuya: ngủ, nghỉ, hồi phục. Uống nước, ăn, đi bộ,
  /// tập thì để sáng mai.
  static let nightTypes: Set<String> = ["sleep", "recovery", "readiness"]

  /// Câu hợp với khung giờ này.
  public static func fits(_ n: Nudge, _ part: DayPart) -> Bool {
    switch part {
    case .night: nightTypes.contains(n.type)
    case .morning: n.type != "calories"
    case .day, .evening: true
    }
  }

  /// Các câu hợp giờ. Đêm khuya mà không còn câu nào về ngủ thì thêm một
  /// câu nhắc đi ngủ, thay cho thẻ trống.
  public static func fitting(_ nudges: [Nudge], hour: Int, lang: String) -> [Nudge] {
    let part = DayPart(hour: hour)
    var out = nudges.filter { fits($0, part) }
    if part == .night, !out.contains(where: { $0.type == "sleep" }), !nudges.isEmpty {
      out.insert(goToBed(lang), at: 0)
    }
    return out
  }

  static func goToBed(_ lang: String) -> Nudge {
    let message = switch CoachQuickReply.Lang(lang) {
    case .vi: "Đã khuya rồi — đi ngủ để mai cơ thể hồi phục tốt hơn."
    case .en: "It's late — get to bed so you recover well for tomorrow."
    case .es: "Ya es tarde: a dormir para recuperarte bien mañana."
    }
    return Nudge(type: "sleep", message: message, priority: .high)
  }
}
