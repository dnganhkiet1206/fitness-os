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
///   (một ngày tính một lần); buổi có kỷ lục cá nhân: +4; làm theo gợi ý tăng
///   tải: +3 (29/10, `OverloadQuest` — ngày đọc từ sổ xu `d:<ngày>:overload`);
/// - tuần (T2 → CN) đủ số buổi đã đặt: +15, cộng ngay ngày đạt;
/// - nghỉ KHÔNG bao giờ trừ Gains (Kiệt 21/10, duyệt GĐ1: "bỏ cơ chế tụt hạng /
///   mất tiến trình vì vắng mặt"); thành tích đã kiếm được giữ nguyên;
/// - `missedDays` chỉ để Daily Plan biết người dùng đang QUAY LẠI (không tính
///   ngày nghỉ đã đặt, kể cả ngày đổi thành nghỉ ở `plan_day_overrides`);
/// - "muscle memory" (×2 tới mức cao nhất) giữ trong mã cho Gains cũ đã tụt
///   trước 21/10 — từ nay không còn đợt tụt mới nên không phát sinh thêm.
public enum KoaGains {
  /// Mốc Gains của sáu hạng, cùng thứ tự `MascotRules.ranks`.
  ///
  /// Theo THỜI GIAN TẬP ngoài đời (Kiệt 24/10: "giai đoạn đầu thì nhanh nhưng chậm
  /// dần về sau"). Lịch 3 buổi / tuần tập đủ = 3 × 10 + 15 = 45 Gains / tuần
  /// (`weeklyReference`): Gym Rat sau ~1 tuần, Lifter ~1 tháng, Swole ~3 tháng,
  /// Beast ~6 tháng, Mass Monster ~1 năm. Trước đây [0, 40, 120, 260, 450, 700]:
  /// Mass Monster sau ~4 tháng, và mọi hạng cách nhau gần đều.
  public static let thresholds = [0, 40, 180, 540, 1150, 2300]
  /// Gains một tuần tập đủ lịch 3 buổi — thước đo của `thresholds`.
  public static let weeklyReference = 3 * plannedSession + fullWeek

  public static let plannedSession = 10
  public static let offPlanSession = 6
  public static let personalRecord = 4
  public static let fullWeek = 15
  /// Làm theo gợi ý tăng tải (`OverloadQuest.gains`).
  public static let overload = OverloadQuest.gains
  /// Ngày nghỉ liền trước để coi là "quay lại" (`DailyPlan.comebackDays`).
  public static let comebackDays = 3
  /// Không có lịch tuần: đích tuần mặc định.
  public static let defaultWeeklyTarget = 3

  /// Một ngày có tập.
  public struct Day: Sendable, Hashable {
    public let date: LocalDate
    public let personalRecord: Bool
    /// Hôm ấy đã tăng tải theo gợi ý (nhận thưởng `d:<ngày>:overload`).
    public let overload: Bool
    public init(date: LocalDate, personalRecord: Bool, overload: Bool = false) {
      self.date = date
      self.personalRecord = personalRecord
      self.overload = overload
    }
  }

  /// Lịch tuần, theo `WorkoutPlanning.routineIndex` (T2 = 0 … CN = 6).
  public struct Week: Sendable, Hashable {
    public let planned: Set<Int>
    public let rest: Set<Int>
    /// Đổi lịch theo ngày (GĐ1) — thắng `planned` / `rest` cho đúng ngày.
    public let overrides: [LocalDate: DayOverride]
    public init(planned: Set<Int>, rest: Set<Int>, overrides: [LocalDate: DayOverride] = [:]) {
      self.planned = planned
      self.rest = rest
      self.overrides = overrides
    }
    public static let none = Week(planned: [], rest: [])
    /// Đích tuần theo lịch mẫu. Dời buổi trong tuần không đổi số buổi; dời qua
    /// tuần khác thì tuần ấy vẫn giữ đích của lịch mẫu (một buổi dư không thưởng thêm).
    public var target: Int { planned.isEmpty ? KoaGains.defaultWeeklyTarget : planned.count }

    public func isPlanned(_ date: LocalDate) -> Bool {
      if let o = overrides[date] { return !o.isRest && o.templateId != nil }
      return planned.contains(WorkoutPlanning.routineIndex(date))
    }

    public func isRest(_ date: LocalDate) -> Bool {
      overrides[date]?.isRest ?? rest.contains(WorkoutPlanning.routineIndex(date))
    }

    public init(_ snapshot: TemplateSnapshot) {
      var planned: Set<Int> = [], rest: Set<Int> = []
      for d in snapshot.routine {
        if d.isRest {
          rest.insert(d.dayOfWeek)
        } else if let id = d.templateId, snapshot.templates.contains(where: { $0.id == id }) {
          planned.insert(d.dayOfWeek)
        }
      }
      // Buổi trỏ vào mẫu đã mất = ngày chưa lên lịch, như lịch mẫu.
      var byDate: [LocalDate: DayOverride] = [:]
      for o in snapshot.overrides {
        let known = o.templateId.map { id in snapshot.templates.contains { $0.id == id } } ?? true
        byDate[o.date] = known ? o : DayOverride(date: o.date, templateId: nil, isRest: false)
      }
      self.init(planned: planned, rest: rest, overrides: byDate)
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
    /// Đang quay lại sau ≥ 3 ngày nghỉ (không tính ngày nghỉ đã đặt).
    public var returning: Bool { missedDays >= KoaGains.comebackDays }
    /// Đang lên lại sau một đợt tụt cũ (Gains ×2).
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
    var overloaded: Set<LocalDate> = []
    for d in days where d.date <= today {
      byDate[d.date] = (byDate[d.date] ?? false) || d.personalRecord
      if d.overload { overloaded.insert(d.date) }
    }
    guard let first = byDate.keys.min() else {
      return State(points: 0, peak: 0, missedDays: 0, lastSession: nil)
    }
    var s = State.zero
    var weekSessions = 0
    var weekPaid = false
    var day = first
    while day <= today {
      let dow = WorkoutPlanning.routineIndex(day)
      if dow == 0 {
        weekSessions = 0
        weekPaid = false
      }
      if let pr = byDate[day] {
        var gain = week.isPlanned(day) ? plannedSession : offPlanSession
        if pr { gain += personalRecord }
        if overloaded.contains(day) { gain += overload }
        weekSessions += 1
        if !weekPaid, weekSessions >= week.target {
          gain += fullWeek
          weekPaid = true
        }
        s.points = add(gain, to: s.points, peak: s.peak)
        s.peak = max(s.peak, s.points)
        s.missedDays = 0
        s.lastSession = day
      } else if !week.isRest(day) {
        // Chỉ đếm — nghỉ không trừ Gains (21/10).
        s.missedDays += 1
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

  /// Ngày đã nhận thưởng tăng tải (`d:<ngày>:overload`) trong sổ xu. Giá trị trong
  /// `or=` có `:` (ký tự dành riêng của PostgREST) nên bọc ngoặc kép.
  public static func overloadQuery(userId: String) -> RowQuery {
    RowQuery(
      table: "mascot_transactions", columns: "ref_key",
      filters: [.eq("user_id", .string(userId)), .or("ref_key.like.\"*\(OverloadQuest.suffix)\"")], limit: limit)
  }

  public static func overloadDays(_ rows: [JSONValue]) -> Set<LocalDate> {
    Set(rows.compactMap { $0["ref_key"]?.stringValue.flatMap(OverloadQuest.day(of:)) })
  }

  /// Gắn cờ tăng tải lên các ngày có tập.
  public static func mark(_ days: [KoaGains.Day], overload: Set<LocalDate>) -> [KoaGains.Day] {
    guard !overload.isEmpty else { return days }
    return days.map { .init(date: $0.date, personalRecord: $0.personalRecord, overload: $0.overload || overload.contains($0.date)) }
  }

  /// `nil` khi đọc hỏng — giữ Gains cũ. Sổ tăng tải hỏng thì tính như chưa có ngày nào
  /// (Gains có thể thấp hơn một chút tới lần đọc sau, không bao giờ cao hơn).
  public static func load(
    userId: String, store: any RowStore, plans: TemplateSnapshot?, now: EpochMillis, in tz: TimeZone
  ) async -> Loaded? {
    guard let rows = try? await store.select(query(userId: userId)) else { return nil }
    let overload = (try? await store.select(overloadQuery(userId: userId))).map(overloadDays) ?? []
    let days = mark(days(rows, in: tz), overload: overload)
    let week = plans.map(KoaGains.Week.init) ?? .none
    return Loaded(
      days: days, week: week, state: KoaGains.compute(days, week: week, today: LocalDate(now, in: tz)),
      lastSessionAt: lastSessionAt(rows))
  }

  public struct Loaded: Sendable {
    public let days: [KoaGains.Day]
    public let week: KoaGains.Week
    public let state: KoaGains.State
    /// Giờ của buổi tập gần nhất — cho trạng thái "pump" (2 giờ sau buổi tập).
    public let lastSessionAt: EpochMillis?
  }

  public static func lastSessionAt(_ rows: [JSONValue]) -> EpochMillis? {
    rows.compactMap { $0["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) } }.max()
  }
}
