public import Foundation
public import Observation

/// Thẻ tập luyện của Hôm nay (#527 N3) — phần tính của `TrainingCard`
/// (`components/ascnd/today-widgets-2.tsx:400`) cùng `lib/training-card.ts`,
/// `lib/training-week.ts` (`strengthDaysIn`), `lib/goal-training.ts`
/// (`strengthDays`) @ fac9ac2. Golden: `training-card-golden.json`
/// (`tools/insights-golden/gen-training.mjs`, CHÍNH mã RN biên dịch + biểu thức
/// của component chép nguyên văn, TZ Los Angeles để có hai ngày đổi giờ).
///
/// Đã có từ trước, dùng lại chứ không chép: `acwrZone` / `loadComparison`
/// (`ReadinessCard`), `loadWindow` / `totalReps` (`SessionLoad`), `chronicDays`
/// (`DailyLog.chronicDaysCovered`).
///
/// Như RN:
/// - câu kết luận đọc ACWR engine đã ghi (`daily_logs.acwr`), không tự tính;
///   `nil` hoặc 0 là "chưa đủ lịch sử", KHÔNG phải vùng "mất nền" — cột mới
///   nhất của biểu đồ chỉ tô màu vùng khi có kết luận;
/// - hai số so sánh là tải nội sinh (RPE × rep) của 7 ngày và tuần trung bình
///   của 28 ngày chia theo số ngày cửa sổ thật sự phủ (`averageWeek`), để chúng
///   chia ra đúng phần trăm in bên cạnh; tổng tạ đi riêng, có nhãn;
/// - các cửa sổ cắt ở `daysAgoISO(n)` (lùi n NGÀY LỊCH, không phải n × 24 giờ),
///   nên cột mới nhất là đúng tập buổi của số 7 ngày;
/// - ngày tập cơ đếm theo NGÀY ĐỊA PHƯƠNG trong 7 ngày lịch gần nhất, không
///   đếm ngày tương lai.
public enum TrainingCard {
  /// `TREND_WEEKS`: số tuần của biểu đồ.
  public static let trendWeeks = 8
  /// `PROGRESS_DAYS` = `TREND_WEEKS * 7`: cửa sổ truy vấn chung của các buổi.
  public static var spanDays: Int { trendWeeks * 7 }
  /// `STALE_AFTER_DAYS`: buổi gần nhất cũ hơn chừng này thì thẻ nói ra.
  public static let staleAfterDays = 7
  /// `CHRONIC_MIN_DAYS`.
  public static let chronicMinDays = 7.0
  /// `ACWR_MAX`: đầu phải của thang vẽ.
  public static let acwrMax = 2.0
  /// `TREND_H`: chiều cao biểu đồ 8 tuần (điểm).
  public static let trendHeight = 72.0
  /// `WHO_STRENGTH_DAYS`: sàn ngày tập cơ mỗi tuần cho mọi người lớn.
  public static let whoStrengthDays = 2

  // MARK: - Hàm thuần của `training-card.ts`

  /// `averageWeek`: phía "thói quen" của tỉ số, theo TUẦN — chia cho số ngày
  /// cửa sổ 28 ngày thật sự phủ (tối thiểu 7), không chia cứng cho 4.
  public static func averageWeek(_ volume28d: Double, days: Double = 28) -> Double {
    volume28d * 7 / JS.max(days, chronicMinDays)
  }

  /// `acwrPercent`: vị trí trên thang 0…`acwrMax`, theo phần trăm.
  public static func acwrPercent(_ acwr: Double) -> Double {
    JS.max(0, JS.min(acwr / acwrMax * 100, 100))
  }

  /// `daysAgoISO(n)` (`use-fitness-data.ts:60`): `setDate(getDate() - n)` —
  /// lùi n ngày LỊCH ở múi giờ máy, cùng giờ đồng hồ (167 / 169 giờ qua ngày
  /// đổi giờ, không phải 168).
  public static func daysAgo(_ n: Int, from now: EpochMillis, in tz: TimeZone) -> EpochMillis {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    guard let d = cal.date(byAdding: .day, value: -n, to: now.date) else { return now }
    return EpochMillis(d)
  }

  /// `daysSince`: bao nhiêu NGÀY LỊCH trước (gập cả hai về nửa đêm địa phương);
  /// tương lai là 0. `date_time` hỏng (server không trả) cũng là 0.
  public static func daysSince(_ dateTime: JSONValue?, now: EpochMillis, in tz: TimeZone) -> Int {
    let ms = DailyLog.millis(dateTime)
    guard ms.isFinite else { return 0 }
    let then = LocalDate(EpochMillis(Int64(ms)), in: tz)
    return Swift.max(0, LocalDate(now, in: tz).daysSinceEpoch - then.daysSinceEpoch)
  }

  /// Một tuần của biểu đồ.
  public struct WeekBucket: Sendable, Hashable {
    /// Tổng tạ của tuần (kg như đã lưu).
    public var volume: Double
    public var sessions: Int

    public init(volume: Double, sessions: Int) {
      self.volume = volume
      self.sessions = sessions
    }
  }

  /// `weeklyVolumes`: `weeks` tuần gần nhất, CŨ trước. Tuần k phủ
  /// `[daysAgo(7(k+1)), daysAgo(7k))`; tuần mới nhất KHÔNG có cận trên — buổi
  /// ghi tay đóng dấu trưa địa phương có thể nằm vài giờ ở tương lai, và truy
  /// vấn 7 ngày (chỉ `gte`) vẫn tính nó.
  public static func weeklyVolumes(_ rows: [JSONValue], weeks: Int, now: EpochMillis, in tz: TimeZone) -> [WeekBucket] {
    let edge = (0...weeks).map { Double(daysAgo(7 * $0, from: now, in: tz).millis) }
    var out = Array(repeating: WeekBucket(volume: 0, sessions: 0), count: weeks)
    for row in rows {
      let t = DailyLog.millis(row["date_time"])
      if t.isNaN || t < edge[weeks] { continue }
      for k in 0..<weeks {
        let inBucket = k == 0 ? t >= edge[1] : t >= edge[k + 1] && t < edge[k]
        if inBucket {
          // `Number(row.volume_load) || 0`: NaN thành 0.
          let v = JS.number(row["volume_load"])
          out[k].volume += JS.truthy(v) ? v : 0
          out[k].sessions += 1
          break
        }
      }
    }
    return Array(out.reversed())
  }

  // MARK: - `training-week.ts` / `goal-training.ts`

  /// `strengthDaysIn`: số NGÀY địa phương khác nhau trong 7 ngày lịch gần nhất
  /// (tính cả hôm nay) có ít nhất một rep. Hai buổi cùng ngày là một ngày;
  /// ngày tương lai bị bỏ.
  public static func strengthDaysIn(_ sessions: [JSONValue], today: LocalDate, in tz: TimeZone) -> Int {
    let earliest = today.adding(days: -6)
    var days = Set<LocalDate>()
    for s in sessions {
      if SessionLoad.totalReps(s["sets"]) <= 0 { continue }
      // `if (!raw) continue;` rồi `new Date(raw)` hỏng thì bỏ.
      let ms = DailyLog.millis(s["date_time"])
      guard ms.isFinite else { continue }
      let day = LocalDate(EpochMillis(Int64(ms)), in: tz)
      if day < earliest || today < day { continue }
      days.insert(day)
    }
    return days.count
  }

  /// `goalTraining(goal).strengthDays`: 3 cho `strength` / `bulk` (so sau khi
  /// cắt khoảng trắng, chữ thường), còn lại là sàn WHO 2.
  public static func strengthTarget(goal: String?) -> Int {
    let key = (goal ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return key == "strength" || key == "bulk" ? 3 : whoStrengthDays
  }

  // MARK: - Thẻ

  /// Hồ sơ cho mục tiêu ngày tập cơ: `unloaded` = đang tải (RN `profile ===
  /// undefined`) — dòng ngày tập cơ đợi, không hiện sàn rồi nhảy.
  public enum Goal: Sendable, Hashable {
    case unloaded
    case loaded(String?)
  }

  /// Buổi gần nhất (hàng dưới cùng của thẻ).
  public struct Latest: Sendable, Hashable {
    /// `template_name`; rỗng / thiếu = `nil` (màn viết "Buổi tập").
    public let name: String?
    public let sets: Int
    /// Tổng tạ (kg).
    public let volume: Double
    /// RPE của buổi; `nil` = không ghi.
    public let rpe: Double?
    /// Số ngày lịch trước.
    public let age: Int
    /// `age >= STALE_AFTER_DAYS`.
    public let stale: Bool
  }

  public struct Card: Sendable, Hashable {
    /// Có kết luận (ACWR > 0). Không có thì câu "cần 4 tuần" thay câu kết luận,
    /// và cột mới nhất vẽ như mọi cột khác.
    public let judged: Bool
    public let zone: ReadinessCard.AcwrZone
    public let heavier: Bool
    public let percent: Int
    public let weekSessions: Int
    /// Tổng tạ 7 ngày / tuần thói quen (kg).
    public let weekVolume: Double
    public let habitVolume: Double
    /// Tải nội sinh 7 ngày / tuần thói quen.
    public let weekLoad: Double
    public let habitLoad: Double
    /// Có kỷ lục trong 7 ngày.
    public let hasPR: Bool
    /// `nil` khi hồ sơ chưa tải.
    public let strengthTarget: Int?
    public let strengthDone: Int
    public let trend: [WeekBucket]
    public let trendMax: Double
    public let latest: Latest

    public var showStrength: Bool { strengthTarget != nil }
    /// Biểu đồ chỉ hiện khi có ít nhất một tuần có tạ.
    public var showTrend: Bool { trend.contains { $0.volume > 0 } }

    /// Chiều cao cột (điểm): tuần trống là vạch 2 điểm, còn lại ≥ 3.
    public func barHeight(_ i: Int) -> Double {
      let w = trend[i]
      if w.volume == 0 { return 2 }
      return JS.max(3, w.volume / (JS.truthy(trendMax) ? trendMax : 1) * TrainingCard.trendHeight)
    }

    /// Độ cao vạch thói quen từ đáy biểu đồ; `nil` = không vẽ.
    public var habitLine: Double? {
      habitVolume > 0 && trendMax > 0 ? habitVolume / trendMax * TrainingCard.trendHeight : nil
    }
  }

  /// `Number(x || 0)`: thiếu / null / 0 / "" / false là 0, còn lại `Number`
  /// (chuỗi hỏng giữ NaN như RN).
  static func numberOrZero(_ v: JSONValue?) -> Double {
    switch v {
    case nil, .null?, .bool(false)?: return 0
    case .string(let s)? where s.isEmpty: return 0
    default: return JS.number(v)
    }
  }

  /// JS truthy của một ô (`w.pr_detected`).
  static func truthy(_ v: JSONValue?) -> Bool {
    switch v {
    case nil, .null?: return false
    case .bool(let b)?: return b
    case .number(let n)?: return JS.truthy(n)
    case .string(let s)?: return !s.isEmpty
    default: return true
    }
  }

  /// Các biểu thức của `TrainingCard`. `rows`: hàng 56 ngày như server trả
  /// (`gte date_time daysAgo(56)`); `latest`: buổi mới nhất bất kể ngày.
  /// `nil` = chưa ghi buổi nào (thẻ nói vậy, không biến mất).
  public static func card(
    acwr: Double?, latest: JSONValue?, rows: [JSONValue], goal: Goal, now: EpochMillis, in tz: TimeZone
  ) -> Card? {
    guard let latest, latest != .null else { return nil }
    func within(_ days: Int) -> [JSONValue] {
      if days == spanDays { return rows }
      let cut = Double(daysAgo(days, from: now, in: tz).millis)
      return rows.filter { DailyLog.millis($0["date_time"]) >= cut }
    }
    let week = within(7)
    let month = within(28)

    let a = acwr ?? 0
    let judged = a > 0
    let cmp = ReadinessCard.loadComparison(a)

    let weekVolume = week.reduce(0) { $0 + numberOrZero($1["volume_load"]) }
    let monthVolume = month.reduce(0) { $0 + numberOrZero($1["volume_load"]) }
    let covered = DailyLog.chronicDaysCovered(month, now: now)
    let habitVolume = averageWeek(monthVolume, days: covered)
    let habitLoad = averageWeek(SessionLoad.window(month), days: covered)

    let target: Int? =
      switch goal {
      case .unloaded: nil
      case .loaded(let g): strengthTarget(goal: g)
      }
    let trend = weeklyVolumes(within(spanDays), weeks: trendWeeks, now: now, in: tz)
    let trendMax = trend.reduce(habitVolume) { JS.max($0, $1.volume) }

    let sets: Int
    if case .array(let list)? = latest["sets"] { sets = list.count } else { sets = 0 }
    let age = daysSince(latest["date_time"], now: now, in: tz)
    let name = latest["template_name"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 }
    let rpe: Double? = JS.present(latest["session_rpe"]) ? JS.number(latest["session_rpe"]) : nil

    return Card(
      judged: judged, zone: ReadinessCard.zone(a), heavier: cmp.heavier, percent: cmp.percent,
      weekSessions: week.count, weekVolume: weekVolume, habitVolume: habitVolume,
      weekLoad: SessionLoad.window(week), habitLoad: habitLoad,
      hasPR: week.contains { truthy($0["pr_detected"]) },
      strengthTarget: target, strengthDone: strengthDaysIn(week, today: LocalDate(now, in: tz), in: tz),
      trend: trend, trendMax: trendMax,
      latest: Latest(
        name: name, sets: sets, volume: numberOrZero(latest["volume_load"]), rpe: rpe, age: age,
        stale: age >= staleAfterDays))
  }

  // MARK: - Đọc

  static let historyColumns = "id, date_time, template_name, session_rpe, volume_load, pr_detected, sets"

  /// Hai lệnh đọc của thẻ: các buổi 56 ngày (`useWorkoutSessions`, một truy
  /// vấn cho cả ba cửa sổ 7 / 28 / 56) và buổi gần nhất bất kể ngày
  /// (`useRecentWorkouts()[0]`).
  public static func reads(userId: String, now: EpochMillis, in tz: TimeZone) -> (history: RowQuery, latest: RowQuery) {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let since = WorkoutSessionRecord.iso8601(daysAgo(spanDays, from: now, in: tz))
    let newest = RowQuery.Order(column: "date_time", ascending: false)
    return (
      RowQuery(
        table: "workout_sessions", columns: historyColumns, filters: [me, .gte("date_time", .string(since))],
        order: newest),
      RowQuery(table: "workout_sessions", columns: historyColumns, filters: [me], order: newest, limit: 1)
    )
  }
}

/// Dữ liệu của thẻ tập luyện cho MỘT tài khoản. Đóng khi phiên đổi.
@MainActor @Observable
public final class TrainingCardBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    /// `latest == nil`: chưa ghi buổi nào.
    case ready(rows: [JSONValue], latest: JSONValue?)
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Lúc đọc — mọi cửa sổ của thẻ tính từ cùng một "bây giờ" với truy vấn.
  public private(set) var loadedAt = EpochMillis(Date())

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var generation = 0

  public init(userId: String, store: any RowStore, in tz: TimeZone) {
    self.userId = userId
    self.store = store
    self.tz = tz
  }

  public func close() { closed = true }

  /// Đọc lại. Đọc hỏng mà đã có số thì giữ số cũ; chưa có thì `failed`.
  public func load(now: EpochMillis = EpochMillis(Date())) async {
    generation += 1
    let mine = generation
    let q = TrainingCard.reads(userId: userId, now: now, in: tz)
    let store = self.store
    do {
      async let history = store.select(q.history)
      async let latest = store.select(q.latest)
      let (rows, newest) = try await (history, latest)
      guard !closed, mine == generation else { return }
      loadedAt = now
      phase = .ready(rows: rows, latest: newest.first)
    } catch {
      guard !closed, mine == generation else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }

  /// Thẻ với ACWR của hôm nay và mục tiêu trong hồ sơ.
  public func card(acwr: Double?, goal: TrainingCard.Goal) -> TrainingCard.Card? {
    guard case .ready(let rows, let latest) = phase else { return nil }
    return TrainingCard.card(acwr: acwr, latest: latest, rows: rows, goal: goal, now: loadedAt, in: tz)
  }
}
