/// Việc chính của hôm nay (#527 GĐ1, Kiệt duyệt có điều kiện 21/10 —
/// `docs/design/mocks/daily-plan-today.html`, `docs/GD1-DAILY-PLAN.md`).
///
/// Luật thuần, không AI: MỘT hành động, lý do bằng số liệu có thật, tối đa hai
/// phương án. Today, widget và lời nhắc đọc CÙNG một kết quả. Thứ tự luật là
/// quyết định sản phẩm — dừng ở luật đầu tiên đúng:
///
/// 0. chưa đọc xong lịch / ngày → không đoán;
/// 1. có buổi đang dở → tiếp tục;
/// 2. chưa có lịch nào → lên lịch tuần;
/// 3. còn buổi trong lịch hôm nay CHƯA tập (kể cả khi đã tập một buổi khác —
///    điều kiện 01): quay lại sau ≥ 3 ngày nghỉ (④, không nhắc mất mát) hoặc
///    bắt đầu buổi; "tập nhẹ hơn" chỉ khi phục hồi thấp ĐỦ chắc (điều kiện 02);
/// 4. đã tập hôm nay → ghi bữa sau tập nếu còn thiếu đạm, không thì xem tiến bộ;
/// 5. ngày nghỉ đã đặt → hồi phục;
/// 6. ngày trống → buổi kế tiếp trong lịch, không thì ghi tự do.
public enum DailyPlan {
  /// Một buổi trong lịch.
  public struct Session: Sendable, Hashable {
    public let templateId: String
    public let name: String
    public let minutes: Int
    public init(templateId: String, name: String, minutes: Int) {
      self.templateId = templateId
      self.name = name
      self.minutes = minutes
    }
  }

  /// Hôm nay theo lịch (đã áp đổi lịch theo ngày).
  public enum Day: Sendable, Hashable {
    case planned([Session])
    case rest
    case empty
  }

  /// Một chỉ số phục hồi lệch khỏi mức thường của người này, kèm số thật.
  public enum Signal: Sendable, Hashable {
    /// Ngủ đêm qua (phút) so với mục tiêu (phút).
    case shortSleep(minutes: Int, target: Int)
    /// HRV thấp hơn trung bình 28 ngày, theo %.
    case lowHRV(percentBelow: Int)
    /// Nhịp tim nghỉ cao hơn trung bình 28 ngày, theo nhịp/phút.
    case highRestingHR(bpmAbove: Int)
  }

  /// Buổi kế tiếp trong lịch sau hôm nay.
  public struct Upcoming: Sendable, Hashable {
    public let date: LocalDate
    public let session: Session
    public init(date: LocalDate, session: Session) {
      self.date = date
      self.session = session
    }
  }

  /// Phục hồi của một ngày, đã tiêu hoá từ điểm sẵn sàng.
  public struct Recovery: Sendable, Hashable {
    public enum Level: Sendable, Hashable { case low, normal, high }
    public let date: LocalDate
    public let level: Level
    /// Điểm có đủ dữ liệu để tin không (`ReadinessResult.Confidence` ≠ low).
    public let confident: Bool
    public let signals: [Signal]
    public init(date: LocalDate, level: Level, confident: Bool, signals: [Signal]) {
      self.date = date
      self.level = level
      self.confident = confident
      self.signals = signals
    }

    /// Số chỉ số lệch tối thiểu để gợi ý tập nhẹ: MỘT chỉ số lệch không đủ.
    public static let minSignals = 2

    /// Điều kiện 02: chỉ gợi ý khi điểm thấp, đủ dữ liệu, của ĐÚNG hôm nay, và
    /// ít nhất hai chỉ số cùng lệch. Thiếu / cũ / một chỉ số → không nói gì.
    public func suggestsLighter(today: LocalDate) -> Bool {
      level == .low && confident && date == today && signals.count >= Self.minSignals
    }
  }

  public struct Input: Sendable, Hashable {
    /// Lịch và các buổi hôm nay đã đọc xong (cache cũng được).
    public var loaded: Bool
    /// Buổi đang tập dở (chưa chốt).
    public var inProgress: Session?
    /// Có ít nhất một ngày có buổi trong lịch tuần.
    public var hasSchedule: Bool
    public var today: Day
    /// Template của các buổi đã ghi hôm nay; `nil` = buổi tự do (không theo mẫu).
    public var doneToday: [String?]
    /// Ngày không tập liền trước hôm nay, không tính ngày nghỉ (`KoaGains.missedDays`).
    public var daysOff: Int
    public var recovery: Recovery?
    /// Đạm còn thiếu tới mục tiêu hôm nay (g); `nil` = chưa biết (không đoán).
    public var proteinLeftG: Int?
    public var next: Upcoming?
    /// Ghi được đổi lịch theo ngày (bảng `plan_day_overrides` có trên server).
    public var canReschedule: Bool
    /// Ngày đích nếu dời buổi hôm nay (`Reschedule.target`); `nil` = không có ngày trống.
    public var postponeTo: LocalDate?
    public var date: LocalDate

    public init(
      date: LocalDate, loaded: Bool, inProgress: Session? = nil, hasSchedule: Bool, today: Day,
      doneToday: [String?] = [], daysOff: Int = 0, recovery: Recovery? = nil, proteinLeftG: Int? = nil,
      next: Upcoming? = nil, canReschedule: Bool = false, postponeTo: LocalDate? = nil
    ) {
      self.date = date
      self.loaded = loaded
      self.inProgress = inProgress
      self.hasSchedule = hasSchedule
      self.today = today
      self.doneToday = doneToday
      self.daysOff = daysOff
      self.recovery = recovery
      self.proteinLeftG = proteinLeftG
      self.next = next
      self.canReschedule = canReschedule
      self.postponeTo = postponeTo
    }
  }

  public enum Action: Sendable, Hashable {
    /// Chưa đọc xong: giữ chỗ, không nút.
    case loading
    case resume(Session)
    case setUpWeek
    case start(Session)
    /// Quay lại sau khi nghỉ — buổi trong lịch, không nhắc mất mát.
    case comeback(Session)
    case postWorkoutMeal
    case progress
    case recovery
    case nextSession(date: LocalDate, session: Session)
    case logFree

    /// Hành động mở buổi tập trong lịch hôm nay.
    public var session: Session? {
      switch self {
      case .resume(let s), .start(let s), .comeback(let s): s
      default: nil
      }
    }
  }

  /// Lý do — chỉ dựng từ số liệu có trong `Input`.
  public enum Reason: Sendable, Hashable {
    case none
    case planned
    /// Buổi thứ hai trong ngày (đã tập một buổi khác).
    case anotherSession
    case lowRecovery([Signal])
    case returning(daysOff: Int)
    case proteinLeft(grams: Int)
    case trainedToday
    case restDay
    case noSchedule
    case nextOn(LocalDate)
  }

  public enum Alternative: Sendable, Hashable {
    /// Bớt một hiệp mỗi bài cho buổi HÔM NAY; mẫu gốc giữ nguyên (điều kiện 02).
    case lighter
    /// Dời buổi hôm nay sang ngày trống kế tiếp (điều kiện 03).
    case postpone(to: LocalDate)
    /// Đổi hôm nay thành ngày nghỉ — ghi lại quyết định, không xoá buổi.
    case makeRest
    case logFree
    case viewSession
    case viewPlan
  }

  public struct Result: Sendable, Hashable {
    public let action: Action
    public let reason: Reason
    /// Tối đa `maxAlternatives`.
    public let alternatives: [Alternative]
    public init(action: Action, reason: Reason, alternatives: [Alternative] = []) {
      self.action = action
      self.reason = reason
      self.alternatives = Array(alternatives.prefix(DailyPlan.maxAlternatives))
    }
  }

  public static let maxAlternatives = 2
  /// Ngày nghỉ liền trước để coi là "quay lại".
  public static let comebackDays = 3
  /// Đạm còn thiếu từ mức này thì gợi ý ghi bữa sau tập.
  public static let proteinNudgeG = 20

  public static func decide(_ i: Input) -> Result {
    // 0
    guard i.loaded else { return Result(action: .loading, reason: .none) }
    // 1
    if let s = i.inProgress { return Result(action: .resume(s), reason: .none) }
    // 2
    guard i.hasSchedule else { return Result(action: .setUpWeek, reason: .noSchedule, alternatives: [.logFree]) }
    let trained = !i.doneToday.isEmpty
    // 3 — buổi trong lịch còn lại (khớp theo template; buổi tự do không "trả" cho buổi nào)
    if case .planned(let sessions) = i.today, let s = remaining(sessions, done: i.doneToday).first {
      let reschedule: [Alternative] =
        i.canReschedule ? [i.postponeTo.map { .postpone(to: $0) }, .makeRest].compactMap { $0 } : []
      if !trained, i.daysOff >= comebackDays {
        return Result(action: .comeback(s), reason: .returning(daysOff: i.daysOff), alternatives: [.lighter, .viewPlan])
      }
      if let r = i.recovery, r.suggestsLighter(today: i.date) {
        return Result(action: .start(s), reason: .lowRecovery(r.signals), alternatives: [.lighter] + reschedule)
      }
      return Result(action: .start(s), reason: trained ? .anotherSession : .planned, alternatives: reschedule)
    }
    // 4
    if trained {
      if let left = i.proteinLeftG, left >= proteinNudgeG {
        return Result(action: .postWorkoutMeal, reason: .proteinLeft(grams: left), alternatives: [.viewSession])
      }
      return Result(action: .progress, reason: .trainedToday, alternatives: [.logFree])
    }
    // 5
    if case .rest = i.today { return Result(action: .recovery, reason: .restDay, alternatives: [.logFree]) }
    // 6
    if let n = i.next {
      return Result(action: .nextSession(date: n.date, session: n.session), reason: .nextOn(n.date), alternatives: [.logFree])
    }
    return Result(action: .logFree, reason: .none)
  }

  /// Buổi trong lịch chưa có buổi ghi khớp template, theo thứ tự lịch. Mỗi buổi
  /// đã ghi "trả" cho đúng MỘT buổi cùng template.
  public static func remaining(_ planned: [Session], done: [String?]) -> [Session] {
    var pool = done.compactMap { $0 }
    return planned.filter { s in
      if let i = pool.firstIndex(of: s.templateId) {
        pool.remove(at: i)
        return false
      }
      return true
    }
  }
}
