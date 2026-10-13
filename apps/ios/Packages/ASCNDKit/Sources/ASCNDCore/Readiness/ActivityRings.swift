public import Foundation
public import Observation

/// Ba vòng hoạt động của Hôm nay (#527 N4) — `lib/activity.ts`
/// (`activityModel`, `ringValueText`, `ringTargetText`) và các đầu vào của
/// `ActivityRingsCard` (`(tabs)/index.tsx:1371`, `useTodayTrainingMinutes` /
/// `useTodayActiveKcal` của `use-fitness-data.ts`) @ fac9ac2. Golden:
/// `activity-golden.json` (`tools/insights-golden/gen-activity.mjs`, CHÍNH mã
/// RN biên dịch).
///
/// Như RN:
/// - mỗi vòng mang nguồn của con số: đo (Apple Health), ước lượng (từ buổi đã
///   ghi), hay không có; số ước lượng có dấu `~`;
/// - Move và Exercise: Health dương thì Health thắng, không thì ước lượng —
///   KHÔNG lấy số lớn hơn, không cộng dồn; Health báo 0 vẫn thua buổi đã ghi;
/// - mục tiêu Move 300 kcal và Exercise 30 phút là hằng số; mục tiêu bước của
///   người dùng, chưa đặt thì 10.000;
/// - phút tập là `trainingMinutes` trên MỌI set của các buổi hôm nay gộp lại,
///   kcal ước lượng tính theo TỪNG buổi rồi cộng (`SessionEnergy`), `nil` khi
///   không buổi nào tính được (hồ sơ thiếu) chứ không phải 0.
public enum ActivityRings {
  /// `MOVE_TARGET_KCAL`.
  public static let moveTargetKcal = 300.0
  /// `EXERCISE_TARGET_MIN`.
  public static let exerciseTargetMin = 30.0
  /// Mục tiêu bước khi người dùng chưa đặt.
  public static let defaultStepsTarget = 10000.0

  public enum Key: String, Sendable, Hashable, CaseIterable { case move, exercise, steps }
  public enum Source: String, Sendable, Hashable { case measured, estimated, none }

  public struct Ring: Sendable, Hashable {
    public let key: Key
    public let current: Double
    public let target: Double
    public let source: Source
    /// `current / target`, không chặn — một vòng có thể vượt 1.
    public let pct: Double
  }

  public struct Model: Sendable, Hashable {
    public let rings: [Ring]
    /// Số vòng đã chạm hoặc vượt mục tiêu.
    public let closed: Int
    /// `false` khi cả ba vòng trống.
    public let hasAny: Bool

    public var estimated: Bool { rings.contains { $0.source == .estimated } }
  }

  public struct Input: Sendable, Hashable {
    /// `daily_logs.active_kcal`; `nil` khi Health chưa ghi.
    public var moveKcal: Double?
    /// Ước lượng từ các buổi hôm nay; `nil` khi hồ sơ chưa đủ để tính.
    public var estimatedMoveKcal: Double?
    /// `daily_logs.active_minutes`; `nil` khi Health chưa ghi.
    public var healthMinutes: Double?
    /// Từ các set đã ghi hôm nay; 0 khi chưa ghi gì.
    public var loggedMinutes: Double
    public var steps: Double
    public var stepsTarget: Double

    public init(
      moveKcal: Double?, estimatedMoveKcal: Double?, healthMinutes: Double?, loggedMinutes: Double, steps: Double,
      stepsTarget: Double
    ) {
      self.moveKcal = moveKcal
      self.estimatedMoveKcal = estimatedMoveKcal
      self.healthMinutes = healthMinutes
      self.loggedMinutes = loggedMinutes
      self.steps = steps
      self.stepsTarget = stepsTarget
    }
  }

  /// `Number(x) || 0`.
  static func orZero(_ x: Double?) -> Double {
    guard let x, JS.truthy(x) else { return 0 }
    return x
  }

  /// `activityModel`.
  public static func model(_ input: Input) -> Model {
    let move = orZero(input.moveKcal)
    let moveEst = orZero(input.estimatedMoveKcal)
    let moveShown = move > 0 ? move : moveEst
    let health = orZero(input.healthMinutes)
    let logged = JS.max(0, JS.round(input.loggedMinutes))
    let steps = JS.max(0, JS.round(input.steps))
    let exercise = health > 0 ? health : logged
    let exerciseSource: Source = health > 0 ? .measured : logged > 0 ? .estimated : .none
    let stepsTarget = input.stepsTarget > 0 ? input.stepsTarget : defaultStepsTarget
    let rings = [
      Ring(
        key: .move, current: JS.round(moveShown), target: moveTargetKcal,
        source: move > 0 ? .measured : moveEst > 0 ? .estimated : .none, pct: moveShown / moveTargetKcal),
      Ring(
        key: .exercise, current: exercise, target: exerciseTargetMin, source: exerciseSource,
        pct: exercise / exerciseTargetMin),
      Ring(
        key: .steps, current: steps, target: stepsTarget, source: steps > 0 ? .measured : .none,
        pct: steps / stepsTarget),
    ]
    return Model(rings: rings, closed: rings.filter { $0.pct >= 1 }.count, hasAny: rings.contains { $0.current > 0 })
  }

  /// `Math.round(x).toLocaleString()` — nhóm nghìn theo `locale`.
  static func grouped(_ x: Double, locale: Locale) -> String {
    let r = JS.round(x)
    guard r.isFinite else { return r.isNaN ? "NaN" : (r > 0 ? "∞" : "-∞") }
    return Int(r).formatted(.number.locale(locale))
  }

  /// `ringValueText`: số của vòng, có `~` nếu là ước lượng.
  public static func valueText(_ ring: Ring, locale: Locale) -> String {
    (ring.source == .estimated ? "~" : "") + grouped(ring.current, locale: locale)
  }

  /// `ringTargetText`: "/ 10,000 steps".
  public static func targetText(_ ring: Ring, unit: String, locale: Locale) -> String {
    "/ \(grouped(ring.target, locale: locale)) \(unit)"
  }

  // MARK: - Đầu vào của hôm nay

  /// `minutesOf`: `trainingMinutes` trên mọi set của các buổi hôm nay
  /// (`sets` không phải mảng thì bỏ).
  public static func loggedMinutes(_ sessions: [JSONValue]) -> Double {
    var sets: [JSONValue] = []
    for s in sessions {
      if case .array(let list)? = s["sets"] { sets += list }
    }
    return SessionEnergy.trainingMinutes(sets)
  }

  /// `useTodayActiveKcal`: cộng kcal của TỪNG buổi tính được; không buổi nào
  /// tính được (hoặc không có hồ sơ) → `nil`.
  public static func estimatedKcal(_ sessions: [JSONValue], body: SessionEnergy.Body?) -> Double? {
    guard let body else { return nil }
    var total = 0
    var counted = 0
    for s in sessions {
      if let k = SessionEnergy.kcal(sets: s["sets"], rpe: s["session_rpe"], body: body) {
        total += k
        counted += 1
      }
    }
    return counted > 0 ? Double(total) : nil
  }

  /// Hai lệnh đọc: hàng `daily_logs` của hôm nay (ba cột của vòng) và các buổi
  /// trong ngày địa phương (`sets, session_rpe`, như `useTodaySessionRows`).
  public static func reads(userId: String, today: LocalDate, in tz: TimeZone) -> (daily: RowQuery, sessions: RowQuery) {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let day = DailyLog.dayRange(today, in: tz)
    return (
      RowQuery(
        table: "daily_logs", columns: "active_kcal, active_minutes, steps",
        filters: [me, .eq("date", .string(today.description))], mode: .maybeSingle),
      RowQuery(
        table: "workout_sessions", columns: "sets, session_rpe",
        filters: [me, .gte("date_time", .string(day.start)), .lt("date_time", .string(day.end))])
    )
  }

  /// Đầu vào của `model` từ hai lần đọc. Cột `numeric` có thể là chuỗi; ô
  /// trống / `null` là "Health chưa ghi".
  public static func input(
    daily: JSONValue?, sessions: [JSONValue], body: SessionEnergy.Body?, stepsTarget: Double
  ) -> Input {
    func col(_ k: String) -> Double? {
      guard let v = daily?[k], JS.present(v) else { return nil }
      return JS.number(v)
    }
    return Input(
      moveKcal: col("active_kcal"), estimatedMoveKcal: estimatedKcal(sessions, body: body),
      healthMinutes: col("active_minutes"), loggedMinutes: loggedMinutes(sessions), steps: col("steps") ?? 0,
      stepsTarget: stepsTarget)
  }
}

/// Dữ liệu của ba vòng cho MỘT tài khoản. Đóng khi phiên đổi.
@MainActor @Observable
public final class ActivityRingsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready(daily: JSONValue?, sessions: [JSONValue])
  }

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var phase: Phase = .loading

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var generation = 0

  public init(userId: String, today: LocalDate, store: any RowStore, in tz: TimeZone) {
    self.userId = userId
    self.today = today
    self.store = store
    self.tz = tz
  }

  public func close() { closed = true }

  /// Đọc lại cho `today` (qua nửa đêm thì là ngày mới, số cũ không mang sang).
  /// Đọc hỏng mà đã có số của CÙNG ngày thì giữ số cũ.
  public func load(today: LocalDate? = nil) async {
    if let today, today != self.today {
      self.today = today
      phase = .loading
    }
    generation += 1
    let mine = generation
    let q = ActivityRings.reads(userId: userId, today: self.today, in: tz)
    let store = self.store
    do {
      async let daily = store.select(q.daily)
      async let sessions = store.select(q.sessions)
      let (d, s) = try await (daily, sessions)
      guard !closed, mine == generation else { return }
      phase = .ready(daily: d.first, sessions: s)
    } catch {
      guard !closed, mine == generation else { return }
      if case .ready = phase { return }
      phase = .failed
    }
  }

  /// Ba vòng với hồ sơ (cho kcal ước lượng) và mục tiêu bước của người dùng.
  public func model(body: SessionEnergy.Body?, stepsTarget: Int) -> ActivityRings.Model? {
    guard case .ready(let daily, let sessions) = phase else { return nil }
    return ActivityRings.model(
      ActivityRings.input(daily: daily, sessions: sessions, body: body, stepsTarget: Double(stepsTarget)))
  }
}
