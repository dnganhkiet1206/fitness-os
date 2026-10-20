public import Foundation

/// Gains — vóc dáng của Koa CHỈ lên nhờ tập (#527 đợt 1, Kiệt duyệt 20/10
/// `docs/design/mocks/koa-train-loop.html`). Cấp (XP) vẫn đến từ mọi thói quen;
/// Gains quyết định 6 hạng vóc dáng Newbie → Mass Monster.
///
/// Tính lại từ đầu mỗi lần, từ lịch sử buổi tập (ngày + cờ PR) và lịch tuần —
/// không có sổ riêng trên server, nên không thể "mua" hay ghi sai: hai máy cùng
/// lịch sử ra cùng một số.
///
/// Luật (theo từng ngày, từ ngày tập đầu tiên tới hôm nay):
/// - ngày có buổi: +10 nếu thứ đó trong lịch có buổi, +6 nếu tập ngoài lịch
///   (một ngày tính một lần); buổi có kỷ lục cá nhân: +4;
/// - tuần (T2 → CN) đủ số buổi đã đặt: +15, cộng ngay ngày đạt;
/// - bỏ tập: đếm các ngày không tập, KHÔNG tính ngày nghỉ đã đặt; cứ đủ 7 ngày
///   thì −8, nhưng một đợt nghỉ không làm tụt quá MỘT nấc so với hạng lúc bắt
///   đầu nghỉ (Kiệt: "cho tụt một nấc sau 7 ngày bỏ tập");
/// - lên lại nhanh gấp đôi ("muscle memory") cho tới mức cao nhất từng đạt;
/// - lỡ lịch 3 ngày trở lên (cùng cách đếm) thì "mất pump" — chỉ là dáng, không trừ.
public enum KoaGains {
  /// Mốc Gains của sáu hạng, cùng thứ tự `MascotRules.ranks`.
  public static let thresholds = [0, 40, 120, 260, 450, 700]

  public static let plannedSession = 10
  public static let offPlanSession = 6
  public static let personalRecord = 4
  public static let fullWeek = 15
  public static let layoffDays = 7
  public static let layoffLoss = 8
  public static let pumpLostDays = 3
  /// Không có lịch tuần: đích tuần mặc định.
  public static let defaultWeeklyTarget = 3

  /// Một ngày có tập.
  public struct Day: Sendable, Hashable {
    public let date: LocalDate
    public let personalRecord: Bool
    public init(date: LocalDate, personalRecord: Bool) {
      self.date = date
      self.personalRecord = personalRecord
    }
  }

  /// Lịch tuần, theo `WorkoutPlanning.routineIndex` (T2 = 0 … CN = 6).
  public struct Week: Sendable, Hashable {
    public let planned: Set<Int>
    public let rest: Set<Int>
    public init(planned: Set<Int>, rest: Set<Int>) {
      self.planned = planned
      self.rest = rest
    }
    public static let none = Week(planned: [], rest: [])
    public var target: Int { planned.isEmpty ? KoaGains.defaultWeeklyTarget : planned.count }

    public init(_ snapshot: TemplateSnapshot) {
      var planned: Set<Int> = [], rest: Set<Int> = []
      for d in snapshot.routine {
        if d.isRest {
          rest.insert(d.dayOfWeek)
        } else if let id = d.templateId, snapshot.templates.contains(where: { $0.id == id }) {
          planned.insert(d.dayOfWeek)
        }
      }
      self.init(planned: planned, rest: rest)
    }
  }

  public struct State: Sendable, Hashable {
    public var points: Int
    /// Mức cao nhất từng đạt — đích của "muscle memory".
    public var peak: Int
    /// 0 … 5, chỉ số trong `MascotRules.ranks`.
    public var rank: Int { KoaGains.rank(points) }
    /// Ngày không tập liên tiếp tính tới hôm nay (bỏ ngày nghỉ đã đặt).
    public var missedDays: Int
    public var pumpLost: Bool { missedDays >= KoaGains.pumpLostDays }
    /// Đang lên lại sau một đợt tụt (Gains ×2).
    public var rebuilding: Bool { points < peak }
    public var lastSession: LocalDate?

    public static let zero = State(points: 0, peak: 0, missedDays: 0, lastSession: nil)
  }

  public static func rank(_ points: Int) -> Int { thresholds.lastIndex { points >= $0 } ?? 0 }

  /// Gains còn thiếu tới hạng kế; `nil` khi đã ở hạng cao nhất.
  public static func toNext(_ points: Int) -> (have: Int, need: Int)? {
    let r = rank(points)
    guard r + 1 < thresholds.count else { return nil }
    return (points - thresholds[r], thresholds[r + 1] - thresholds[r])
  }

  /// Tính lại từ đầu, từ ngày tập đầu tiên tới `today`.
  public static func compute(_ days: [Day], week: Week, today: LocalDate) -> State {
    var byDate: [LocalDate: Bool] = [:]
    for d in days where d.date <= today { byDate[d.date] = (byDate[d.date] ?? false) || d.personalRecord }
    guard let first = byDate.keys.min() else {
      return State(points: 0, peak: 0, missedDays: 0, lastSession: nil)
    }
    var s = State.zero
    var weekSessions = 0
    var weekPaid = false
    // hạng lúc bắt đầu đợt nghỉ hiện tại; sàn của đợt = mốc của hạng ngay dưới
    var layoffFloor: Int?
    var day = first
    while day <= today {
      let dow = WorkoutPlanning.routineIndex(day)
      if dow == 0 {
        weekSessions = 0
        weekPaid = false
      }
      if let pr = byDate[day] {
        var gain = week.planned.contains(dow) ? plannedSession : offPlanSession
        if pr { gain += personalRecord }
        weekSessions += 1
        if !weekPaid, weekSessions >= week.target {
          gain += fullWeek
          weekPaid = true
        }
        s.points = add(gain, to: s.points, peak: s.peak)
        s.peak = max(s.peak, s.points)
        s.missedDays = 0
        s.lastSession = day
        layoffFloor = nil
      } else if !week.rest.contains(dow) {
        if s.missedDays == 0 { layoffFloor = thresholds[max(0, rank(s.points) - 1)] }
        s.missedDays += 1
        if s.missedDays % layoffDays == 0 {
          s.points = max(layoffFloor ?? 0, s.points - layoffLoss)
        }
      }
      day = day.adding(days: 1)
    }
    return s
  }

  /// Cộng `gain`; dưới mức cao nhất từng đạt thì gấp đôi cho tới mức ấy.
  static func add(_ gain: Int, to points: Int, peak: Int) -> Int {
    guard points < peak else { return points + gain }
    let doubled = points + gain * 2
    if doubled <= peak { return doubled }
    // phần vượt `peak` tính thường: (peak − points) / 2 điểm gốc đã được nhân đôi
    let usedRaw = (peak - points + 1) / 2
    return peak + max(0, gain - usedRaw)
  }

  /// Gains một buổi mới hôm nay sẽ mang lại (cho màn kết thúc buổi tập).
  public static func preview(
    _ days: [Day], week: Week, today: LocalDate, personalRecord: Bool
  ) -> (before: State, after: State) {
    let before = compute(days, week: week, today: today)
    let after = compute(days + [Day(date: today, personalRecord: personalRecord)], week: week, today: today)
    return (before, after)
  }
}

/// Đọc lịch sử tập cho Gains: mọi buổi của người dùng, chỉ ngày + cờ kỷ lục.
public enum KoaGainsSync {
  /// Trần số buổi đọc — ~5 năm tập mỗi ngày; đủ cho một đời Koa.
  public static let limit = 2000

  public static func query(userId: String) -> RowQuery {
    RowQuery(
      table: "workout_sessions", columns: "date_time, pr_detected",
      filters: [.eq("user_id", .string(userId))], order: .init(column: "date_time", ascending: false), limit: limit)
  }

  /// Hàng `workout_sessions` → ngày tập theo giờ địa phương.
  public static func days(_ rows: [JSONValue], in tz: TimeZone) -> [KoaGains.Day] {
    rows.compactMap { row in
      guard let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }) else { return nil }
      return KoaGains.Day(date: LocalDate(at, in: tz), personalRecord: row["pr_detected"]?.boolValue == true)
    }
  }

  /// `nil` khi đọc hỏng — giữ Gains cũ.
  public static func load(
    userId: String, store: any RowStore, plans: TemplateSnapshot?, now: EpochMillis, in tz: TimeZone
  ) async -> (days: [KoaGains.Day], week: KoaGains.Week, state: KoaGains.State)? {
    guard let rows = try? await store.select(query(userId: userId)) else { return nil }
    let days = days(rows, in: tz)
    let week = plans.map(KoaGains.Week.init) ?? .none
    return (days, week, KoaGains.compute(days, week: week, today: LocalDate(now, in: tz)))
  }
}
