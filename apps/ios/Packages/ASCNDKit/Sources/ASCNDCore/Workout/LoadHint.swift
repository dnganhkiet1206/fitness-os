public import Foundation
public import Observation

/// Gợi ý tải của màn ghi buổi tập (#527, `log-workout`) @ fac9ac2.
///
/// Ba tầng, đúng như RN:
/// - `UserState` — `lib/user-state.ts` (`userStateFrom`): người này đang ở
///   giai đoạn nào (mới bắt đầu, đều đặn, sa sút, quay lại, quá tải, chững).
/// - `LoadProgression` — `lib/load-progression.ts` (`suggestLoad`): RPE người
///   ấy BÁO so với RPE buổi tập YÊU CẦU; chỉ là một câu, không bao giờ sửa
///   template. Ba chốt chặn "tăng tải": quá tải, mới quay lại, sẵn sàng đỏ có
///   tín hiệu hồi phục. "Giảm tải" không bao giờ bị chặn.
/// - `LoadHint` — `askedRpe` + `loadHint` của `app/log-workout.tsx:279-357`.
///
/// Golden: `load-hint-golden.json` (`gen-load-hint.mjs`, mã RN biên dịch).
/// Chuỗi `because` (chỉ cho màn debug, "never for users") không port.
public struct UserState: Sendable, Hashable {
  public enum Situation: String, Sendable, Hashable {
    case settlingIn = "settling_in", steady, slipping, returning, overreaching, stalled
  }

  /// Mức app được phép hành động theo điều nó nghĩ — không phải điểm.
  public enum Confidence: String, Sendable, Hashable { case none, low, medium, high }

  public enum Trend: String, Sendable, Hashable { case up, steady, down }

  public let situation: Situation
  public let confidence: Confidence
  /// Tỉ lệ ngày có ghi trong 7 ngày gần, 0…1.
  public let recent: Double
  /// Cùng tỉ lệ trên nền (tối đa 28 ngày) — "bình thường của chính họ".
  public let baseline: Double
  public let trend: Trend?
  /// Số ngày liền không ghi, tính lùi từ hôm qua; hôm nay đã ghi → 0.
  public let daysQuiet: Int

  public init(
    situation: Situation, confidence: Confidence, recent: Double = 0, baseline: Double = 0, trend: Trend? = nil,
    daysQuiet: Int = 0
  ) {
    self.situation = situation
    self.confidence = confidence
    self.recent = recent
    self.baseline = baseline
    self.trend = trend
    self.daysQuiet = daysQuiet
  }

  public static let recentDays = 7
  public static let baselineDays = 28
  public static let minHistoryDays = 14
  public static let dropFraction = 0.4
  public static let riseFraction = 0.4
  public static let minBaseline = 1 / Double(recentDays)
  public static let awayDays = 3
  public static let returnFreshDays = 2
  public static let overreachAcwr = 1.5
  /// `TREND_WEEKS * 7` (`training-card.ts`).
  public static let progressDays = 56
  public static let minLiftSessions = 8
  public static let progressFraction = 0.05

  /// `UNKNOWN_STATE`: chưa đọc được gì — app không có quyền có ý kiến.
  public static let unknown = UserState(situation: .settlingIn, confidence: .none)

  /// `userStateFrom`.
  /// - Parameters:
  ///   - loggedDates: ngày đã ghi (`useDailyStreak`), thứ tự / trùng không sao.
  ///   - acwr: `daily_logs.acwr` hôm nay; `nil` là câu trả lời thật, không phải 0.
  ///   - sessions: hàng `workout_sessions` (`date_time`, `volume_load`,
  ///     `pr_detected`); `nil` = chưa đọc → không nói gì về tiến bộ.
  ///   - tz: múi để lấy ngày LOCAL của `date_time`.
  public static func from(
    loggedDates: [LocalDate], today: LocalDate, acwr: Double?, sessions: [JSONValue]?, in tz: TimeZone
  ) -> UserState {
    // Khác nhau, không ở tương lai (đồng hồ máy sai).
    var offsets = Set<Int>()
    for d in loggedDates {
      let n = today.daysSinceEpoch - d.daysSinceEpoch
      if n >= 0 { offsets.insert(n) }
    }
    func within(_ days: Int) -> Int { offsets.filter { $0 < days }.count }

    let oldest = offsets.max() ?? -1
    let historyDays = oldest < 0 ? 0 : oldest + 1
    let confidence: Confidence =
      historyDays < minHistoryDays ? .none
      : historyDays < baselineDays ? .low
      : historyDays < baselineDays * 2 ? .medium : .high

    let recent = Double(within(recentDays)) / Double(recentDays)
    // Chia cho phần nền ĐÃ sống qua, không phải 28 — người mới không "sa sút".
    let baselineSpan = min(baselineDays, max(historyDays, recentDays))
    let baseline = Double(within(baselineDays)) / Double(baselineSpan)

    var daysQuiet = 0
    if !offsets.contains(0) {
      while !offsets.contains(daysQuiet + 1) && daysQuiet < baselineDays { daysQuiet += 1 }
    }

    let lastLogged = offsets.min()
    var gapBefore = 0
    if let lastLogged {
      var k = lastLogged + 1
      while !offsets.contains(k) && k <= oldest {
        gapBefore += 1
        k += 1
      }
    }

    let trend: Trend? =
      confidence == .none ? nil
      : recent > baseline * (1 + riseFraction) ? .up
      : recent < baseline * (1 - dropFraction) ? .down : .steady

    func state(_ s: Situation, _ c: Confidence) -> UserState {
      UserState(situation: s, confidence: c, recent: recent, baseline: baseline, trend: trend, daysQuiet: daysQuiet)
    }
    // 1. chưa có nền thì không nhận định gì.
    if confidence == .none { return state(.settlingIn, .none) }
    // 2. quay lại sau một lần vắng thật.
    if let lastLogged, lastLogged <= returnFreshDays, gapBefore >= awayDays { return state(.returning, confidence) }
    // 3. tải chạy trước xa thói quen.
    if let acwr, acwr >= overreachAcwr { return state(.overreaching, confidence) }
    // 4. vẫn tập, số không nhích.
    if trend != .down, stalled(sessions, today: today, in: tz) { return state(.stalled, confidence) }
    // 5. dưới hẳn nhịp của chính mình.
    if trend == .down && baseline >= minBaseline { return state(.slipping, confidence) }
    return state(.steady, confidence)
  }

  /// `progressionOf(…).stalled`: ≥ 8 buổi có tạ trong 56 ngày, không kỷ lục,
  /// khối lượng nửa gần không hơn nửa xa quá 5 %.
  static func stalled(_ sessions: [JSONValue]?, today: LocalDate, in tz: TimeZone) -> Bool {
    guard let sessions else { return false }
    struct Lift { let days: Int, volume: Double, pr: Bool }
    var lifts: [Lift] = []
    for s in sessions {
      let ms = DailyLog.millis(s["date_time"])
      guard ms.isFinite else { continue }  // ngày hỏng: NaN, bị lọc
      let days = today.daysSinceEpoch - LocalDate(EpochMillis(Int64(ms)), in: tz).daysSinceEpoch
      // `Number(s.volume_load) || 0`
      let v = JS.number(s["volume_load"])
      let volume = JS.truthy(v) ? v : 0
      guard days >= 0, days < progressDays, volume > 0 else { continue }
      lifts.append(Lift(days: days, volume: volume, pr: s["pr_detected"] == .bool(true)))
    }
    guard lifts.count >= minLiftSessions, !lifts.contains(where: \.pr) else { return false }
    let half = progressDays / 2
    let recent = lifts.filter { $0.days < half }
    let older = lifts.filter { $0.days >= half }
    guard !recent.isEmpty, !older.isEmpty else { return false }
    func mean(_ xs: [Lift]) -> Double { xs.reduce(0) { $0 + $1.volume } / Double(xs.count) }
    return !(mean(recent) > mean(older) * (1 + progressFraction))
  }
}

public enum LoadProgression {
  public enum Advice: String, Sendable, Hashable { case up, hold, down, unknown }

  public struct Suggestion: Sendable, Hashable {
    public let advice: Advice
    public let confidence: UserState.Confidence
    /// Phần của tải hiện tại (0.05 ≈ thêm 5 %); 0 cho `hold` / `unknown`.
    public let step: Double
    /// RPE mà kết luận đo so với — câu gợi ý trích đúng số này.
    public let target: Double
  }

  public static let minSessions = 3
  public static let rpeMargin = 1.0
  public static let maxStep = 0.1
  public static let step = 0.05

  /// `goalRpeTarget` (`goal-training.ts`): giữa dải RPE của mục tiêu —
  /// `strength` 8…9, mọi mục tiêu khác (và không có) 7…8.
  public static func goalRpeTarget(_ goal: String?) -> Double {
    RepEntry.trimJS(goal ?? "").lowercased() == "strength" ? 8.5 : 7.5
  }

  /// `suggestLoad`.
  /// - Parameters:
  ///   - reported: `session_rpe` các buổi cùng tên; null / 0 / hỏng bị bỏ.
  ///   - target: RPE buổi tập yêu cầu (`askedRpe`); `nil` / 0 → theo mục tiêu.
  ///   - recoverySignal: `hasRecoverySignal(readiness_explain)` của hôm nay.
  public static func suggest(
    reported: [JSONValue?], target: Double?, goal: String?, situation: UserState.Situation?,
    situationConfidence: UserState.Confidence?, readiness: String?, recoverySignal: Bool
  ) -> Suggestion {
    // `Number(input.target) || goalRpeTarget(input.goal) || DEFAULT_RPE` —
    // `goalRpeTarget` luôn ≥ 7.5 nên `DEFAULT_RPE` không bao giờ tới.
    let aim = target.flatMap { JS.truthy($0) ? $0 : nil } ?? goalRpeTarget(goal)
    let said = reported.map { JS.number($0 ?? .null) }.filter { $0.isFinite && $0 > 0 }
    guard said.count >= minSessions else {
      return Suggestion(advice: .unknown, confidence: .none, step: 0, target: aim)
    }
    let mean = said.reduce(0, +) / Double(said.count)
    let gap = mean - aim
    let confidence: UserState.Confidence =
      said.count >= minSessions * 2 ? .high : said.count > minSessions ? .medium : .low

    // Quá nặng thắng mọi thứ, không chốt nào chặn được.
    if gap >= rpeMargin {
      return Suggestion(advice: .down, confidence: confidence, step: -min(step * JS.round(gap), maxStep), target: aim)
    }
    if gap <= -rpeMargin {
      let known = situationConfidence != nil && situationConfidence != UserState.Confidence.none
      let hold = Suggestion(advice: .hold, confidence: confidence, step: 0, target: aim)
      if known && situation == .overreaching { return hold }
      if known && situation == .returning { return hold }
      // Đỏ phải là đỏ về HỒI PHỤC, không phải đỏ vì không tập.
      if readiness == "red" && recoverySignal { return hold }
      return Suggestion(advice: .up, confidence: confidence, step: min(step * JS.round(-gap), maxStep), target: aim)
    }
    return Suggestion(advice: .hold, confidence: confidence, step: 0, target: aim)
  }
}

public enum LoadHint {
  /// Câu gợi ý: "Mấy buổi "<name>" gần đây bạn thấy nhẹ / nặng hơn mức <aim> —
  /// có thể tăng / giảm ~<percent>%".
  public struct Hint: Sendable, Hashable {
    public let up: Bool
    /// Tên đã cắt khoảng trắng hai đầu.
    public let name: String
    public let aim: Double
    public let percent: Int
  }

  /// `key` của màn: `name.trim().toLowerCase()`.
  static func key(_ s: String?) -> String { RepEntry.trimJS(s ?? "").lowercased() }

  /// `effortRange`: [nhỏ nhất, lớn nhất] RPE các bài; không bài nào → nil.
  public static func effortRange(_ exercises: [TemplateExercise]) -> (Double, Double)? {
    let all = exercises.map { Double($0.rpe) }
    guard let lo = all.min(), let hi = all.max() else { return nil }
    return (lo, hi)
  }

  /// `askedRpe` (`:279-286`): giữa dải RPE của template CÙNG TÊN (template đầu
  /// tiên khớp); tên trống / không template nào → nil.
  public static func askedRpe(name: String, templates: [WorkoutTemplate]) -> Double? {
    let k = key(name)
    guard !k.isEmpty else { return nil }
    let tpl = templates.first { key($0.name) == k }
    guard let band = effortRange(tpl?.exercises ?? []) else { return nil }
    return (band.0 + band.1) / 2
  }

  /// `loadHint` (`:288-357`). `sessions`: hàng `workout_sessions` 14 ngày
  /// (`template_name`, `session_rpe`).
  public static func hint(
    name: String, templates: [WorkoutTemplate], sessions: [JSONValue], goal: String?, state: UserState,
    readiness: String?, recoverySignal: Bool
  ) -> Hint? {
    let k = key(name)
    guard !k.isEmpty else { return nil }
    let mine = sessions.filter { key($0["template_name"]?.stringValue) == k }
    guard !mine.isEmpty else { return nil }
    let s = LoadProgression.suggest(
      reported: mine.map { $0["session_rpe"] }, target: askedRpe(name: name, templates: templates), goal: goal,
      situation: state.situation, situationConfidence: state.confidence, readiness: readiness,
      recoverySignal: recoverySignal)
    guard s.advice == .up || s.advice == .down else { return nil }
    return Hint(up: s.advice == .up, name: RepEntry.trimJS(name), aim: s.target, percent: Int(JS.round(abs(s.step) * 100)))
  }
}

/// Dữ liệu cho câu gợi ý tải của màn ghi buổi tập: ngày đã ghi (streak), hàng
/// `daily_logs` hôm nay, các buổi 56 ngày — ba lượt đọc qua kho hàng chung.
///
/// Khác RN (có chủ đích): RN đọc trạng thái người dùng từ CACHE; cache rỗng
/// (mở app sang ngày mới, vào thẳng màn này) thì hai chốt "quá tải" / "mới
/// quay lại" tắt và app có thể khuyên tăng 10 % cho người nó đáng lẽ coi là
/// quá tải — chính chú thích của RN (`log-workout.tsx:220`) gọi đó là lỗi.
/// Native: chỉ đưa ra "tăng" khi đã ĐỌC ĐƯỢC cả streak lẫn hàng hôm nay;
/// "giảm" thì không bao giờ bị chặn (như `suggestLoad`).
@MainActor
@Observable
public final class LoadHintBook {
  public let userId: String
  public private(set) var loaded = false
  /// Các buổi 14 ngày (mới → cũ) — đầu vào của câu gợi ý.
  public private(set) var recent: [JSONValue] = []
  public private(set) var state = UserState.unknown
  public private(set) var readiness: String?
  public private(set) var recoverySignal = false
  /// Cả streak lẫn hàng hôm nay đều đọc được: được phép khuyên "tăng".
  public private(set) var gatesKnown = false

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private let recovery: @Sendable (String?) -> Bool

  /// - Parameter recovery: `hasRecoverySignal` trên `readiness_explain`.
  public init(
    userId: String, store: any RowStore, clock: any WallClock = SystemWallClock(), in tz: TimeZone = .current,
    recovery: @escaping @Sendable (String?) -> Bool
  ) {
    self.userId = userId
    self.store = store
    self.clock = clock
    self.tz = tz
    self.recovery = recovery
  }

  public static let recentDays = 14

  public func load() async {
    let now = clock.nowMillis()
    let today = LocalDate(now, in: tz)
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let streakQ = RowQuery(
      table: "daily_logs", columns: "date", filters: [me, .or(Streak.loggedDayFilter)],
      order: RowQuery.Order(column: "date", ascending: false), limit: Streak.window)
    let logQ = RowQuery(
      table: "daily_logs", columns: "acwr, readiness_status, readiness_explain",
      filters: [me, .eq("date", .string(today.description))], mode: .maybeSingle)
    let sessionsQ = RowQuery(
      table: "workout_sessions", columns: "date_time, template_name, session_rpe, volume_load, pr_detected",
      filters: [me, .gte("date_time", .string(EpochMillis.daysAgoISO(UserState.progressDays, from: now, in: tz)))],
      order: RowQuery.Order(column: "date_time", ascending: false))
    let store = self.store
    async let streak = Self.read(store, streakQ)
    async let log = Self.read(store, logQ)
    async let sessions = Self.read(store, sessionsQ)
    let (dates, logRows, rows) = await (streak, log, sessions)

    let row = logRows?.first
    let acwrRaw = row?["acwr"]
    let acwr = JS.present(acwrRaw) ? JS.number(acwrRaw) : .nan
    readiness = row?["readiness_status"]?.stringValue
    recoverySignal = recovery(row?["readiness_explain"]?.stringValue)
    if let dates {
      state = UserState.from(
        loggedDates: dates.compactMap { $0["date"]?.stringValue.flatMap { LocalDate(String($0.prefix(10))) } },
        today: today, acwr: acwr.isFinite ? acwr : nil, sessions: rows, in: tz)
    }
    gatesKnown = dates != nil && logRows != nil
    // `useWorkoutSessions(14)`: lọc 56 ngày về 14 theo thời điểm.
    let cut = Double(EpochMillis.daysAgo(Self.recentDays, from: now, in: tz).millis)
    recent = (rows ?? []).filter { DailyLog.millis($0["date_time"]) >= cut }
    loaded = true
  }

  private static func read(_ store: any RowStore, _ q: RowQuery) async -> [JSONValue]? {
    try? await store.select(q)
  }

  /// Câu gợi ý cho tên đang gõ. Chưa đủ chốt chặn: chỉ "giảm".
  public func hint(name: String, templates: [WorkoutTemplate], goal: String?) -> LoadHint.Hint? {
    guard loaded else { return nil }
    let h = LoadHint.hint(
      name: name, templates: templates, sessions: recent, goal: goal, state: state, readiness: readiness,
      recoverySignal: recoverySignal)
    if let h, h.up, !gatesKnown { return nil }
    return h
  }
}

extension EpochMillis {
  /// `d.setDate(d.getDate() - days)`: cùng giờ local, lùi `days` ngày lịch.
  static func daysAgo(_ days: Int, from now: EpochMillis, in tz: TimeZone) -> EpochMillis {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    return cal.date(byAdding: .day, value: -days, to: now.date).map { EpochMillis($0) } ?? now - Int64(days) * 86_400_000
  }

  /// `daysAgoISO` (`use-fitness-data.ts:60`).
  static func daysAgoISO(_ days: Int, from now: EpochMillis, in tz: TimeZone) -> String {
    WorkoutSessionRecord.iso8601(daysAgo(days, from: now, in: tz))
  }
}
