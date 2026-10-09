public import Foundation
public import Observation

/// `useAssistantSignal` @ fac9ac2: hôm nay dưới dạng `suggestionsFor` đọc —
/// hàng `daily_logs` của hôm nay, hồ sơ (mục tiêu calo / đạm) và buổi tập gần
/// nhất. Thẻ chip của Trợ lý và màn chat trống dùng CÙNG một tín hiệu, nên
/// cùng bốn chip.
extension AssistantSuggestions.Signal {
  /// Dựng từ ba lượt đọc (thiếu hàng nào thì như RN: `undefined`).
  public static func from(
    log: JSONValue?, profile: JSONValue?, lastWorkoutAt: JSONValue?, today: LocalDate, in tz: TimeZone
  ) -> Self {
    let kcalTarget = MacroTargets.calorieTarget(text(profile?["tdee_target_kcal"]))
    // `macroTargetsFor(profile).protein`: đạm đã đặt, không thì 27 % calo / 4.
    let protein = MacroTargets.stored(text(profile?["macro_protein_g"])) ?? JS.round(kcalTarget * 0.27 / 4)
    // `daysSince`: ngày lịch, không phải mili giây; chưa ghi buổi nào → nil.
    var days: Int?
    if let last = lastWorkoutAt, JS.truthyValue(last) {
      let ms = DailyLog.millis(last)
      // Ngày hỏng: JS ra NaN, không luật nào bắn — ở đây là `nil`.
      days = ms.isFinite ? max(0, today.daysSinceEpoch - LocalDate(EpochMillis(Int64(ms)), in: tz).daysSinceEpoch) : nil
    }
    var score: Int?
    if JS.present(log?["readiness_score"]) {
      let v = JS.round(JS.number(log?["readiness_score"]))
      score = v.isFinite ? Int(v) : nil
    }
    return Self(
      readiness: score,
      status: log?["readiness_status"]?.stringValue,
      acwr: JS.present(log?["acwr"]) ? JS.number(log?["acwr"]) : nil,
      sleepMin: or0(JS.number(log?["sleep_duration_min"])),
      kcal: JS.round(or0(JS.number(log?["kcal"]))),
      kcalTarget: kcalTarget,
      proteinG: or0(JS.number(log?["protein_g"])),
      proteinTarget: protein,
      steps: or0(JS.number(log?["steps"])),
      daysSinceWorkout: days)
  }

  /// `Number(x) || 0`.
  private static func or0(_ x: Double) -> Double { JS.truthy(x) ? x : 0 }

  /// Ô hồ sơ → chữ cho `stored` (số hoặc chuỗi số đều được, như `Number(v)`).
  private static func text(_ v: JSONValue?) -> String {
    switch v {
    case .number(let n)?: ReadinessEngine.jsString(n)
    case .string(let s)?: s
    default: ""
    }
  }
}

extension JS {
  /// Tính "truthy" của một ô JSON (`if (last)`).
  static func truthyValue(_ v: JSONValue) -> Bool {
    switch v {
    case .null: false
    case .string(let s): !s.isEmpty
    case .number(let n): truthy(n)
    case .bool(let b): b
    default: true
    }
  }
}

/// Tín hiệu hôm nay của MỘT tài khoản cho chip gợi ý. Đọc hỏng → không có
/// tín hiệu → chip vẫn có (bốn câu chung), như RN khi query chưa có dữ liệu.
@MainActor @Observable
public final class AssistantSignalBook {
  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var signal = AssistantSuggestions.Signal()

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let tz: TimeZone
  @ObservationIgnored private var closed = false

  public init(userId: String, today: LocalDate, store: any RowStore, in tz: TimeZone) {
    self.userId = userId
    self.today = today
    self.store = store
    self.tz = tz
  }

  public func close() { closed = true }

  public var suggestions: [AssistantSuggestions.Suggestion] { AssistantSuggestions.suggestions(for: signal) }

  public func move(to day: LocalDate) async {
    today = day
    await load()
  }

  public func load() async {
    let store = self.store
    let user = JSONValue.string(userId)
    let day = today
    async let log = Self.read(
      store,
      RowQuery(
        table: "daily_logs", columns: "*", filters: [.eq("user_id", user), .eq("date", .string(day.description))],
        mode: .maybeSingle))
    async let profile = Self.read(
      store,
      RowQuery(
        table: "profiles", columns: "tdee_target_kcal, macro_protein_g", filters: [.eq("user_id", user)],
        mode: .maybeSingle))
    async let last = Self.read(
      store,
      RowQuery(
        table: "workout_sessions", columns: "date_time", filters: [.eq("user_id", user)],
        order: RowQuery.Order(column: "date_time", ascending: false), limit: 1))
    let (l, p, w) = await (log, profile, last)
    guard !closed, day == today else { return }
    signal = .from(log: l, profile: p, lastWorkoutAt: w?["date_time"], today: day, in: tz)
  }

  /// Một lượt đọc; hỏng → `nil` (RN: `data` của query là `undefined`).
  nonisolated private static func read(_ store: any RowStore, _ q: RowQuery) async -> JSONValue? {
    guard let rows = try? await store.select(q) else { return nil }
    return rows.first
  }
}
