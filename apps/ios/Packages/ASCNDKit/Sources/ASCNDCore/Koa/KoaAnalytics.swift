/// Thuộc tính sự kiện đo lường của Koa Ecosystem (#793, `docs/KOA_ECOSYSTEM.md` §5): mốc hành trình,
/// mở hành trình, xem Nhịp, tạm nghỉ. Như `KoaRoomVisit`: số đếm gửi theo khoảng, không gửi số đo
/// sức khoẻ, cân nặng, calo — sự kiện chỉ nói "đã làm gì".
public enum KoaAnalytics {
  /// Nơi Koa nhắc một mốc.
  public enum Place: String, Sendable, Hashable, CaseIterable {
    case today, room
  }

  /// Khoá của "đã gửi": mỗi mốc gửi một lần cho mỗi nơi, dù Hôm nay vẽ lại hay mở app nhiều lần
  /// trong những ngày mốc còn được nhắc.
  public static func momentKey(_ m: KoaJourney.Moment, place: Place) -> String { "\(m.id)@\(place.rawValue)" }

  /// `koa_moment_shown`: loại mốc, nơi hiện, mốc lớn hay nhỏ. Không gửi `value` (hạng, số buổi,
  /// số ngày nghỉ) — loại mốc đã đủ để đếm.
  public static func momentProps(_ m: KoaJourney.Moment, place: Place) -> [String: String] {
    ["kind": m.kind.rawValue, "place": place.rawValue, "major": String(m.major)]
  }

  /// Khoá của `rhythm_viewed`: một lần mỗi ngày.
  public static func rhythmKey(today: LocalDate) -> String { "rhythm:\(today)" }

  /// `rhythm_viewed`: số buổi trong 30 ngày theo khoảng, và có ngày tạm nghỉ trong cửa sổ không.
  public static func rhythmProps(_ s: KoaRhythm.State) -> [String: String] {
    ["sessions": sessions(s.sessions), "paused": String(s.days.contains(.paused))]
  }

  /// `pause_started`: số ngày đã chọn (1…`KoaPause.maxDays`).
  public static func pauseStartedProps(days: Int) -> [String: String] {
    ["days": String(min(KoaPause.maxDays, max(1, days)))]
  }

  /// `pause_ended_early`: đã nghỉ bao nhiêu ngày, còn bao nhiêu ngày hẹn.
  public static func pauseEndedEarlyProps(_ p: KoaPause, today: LocalDate) -> [String: String] {
    let used = max(0, today.daysSinceEpoch - p.start.daysSinceEpoch)
    return ["days_used": String(used), "days_left": String(p.daysLeft(from: today))]
  }

  static func sessions(_ n: Int) -> String {
    switch n {
    case ..<1: "0"
    case 1...3: "1_3"
    case 4...8: "4_8"
    case 9...15: "9_15"
    default: "16_plus"
    }
  }
}

/// Các khoá sự kiện đã gửi của một tài khoản, có giới hạn (giữ khoá mới nhất). Dùng để mỗi lần
/// xảy ra chỉ gửi một sự kiện, cả qua nhiều lần mở app.
public struct TelemetryLedger: Sendable, Hashable, Codable {
  public static let capacity = 200
  public private(set) var keys: [String] = []

  public init() {}

  /// `true` khi khoá mới (bên gọi gửi sự kiện); `false` khi đã gửi rồi.
  public mutating func insert(_ key: String) -> Bool {
    guard !keys.contains(key) else { return false }
    keys.append(key)
    if keys.count > Self.capacity { keys.removeFirst(keys.count - Self.capacity) }
    return true
  }
}
