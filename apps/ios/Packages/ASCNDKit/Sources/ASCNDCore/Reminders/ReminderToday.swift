public import Foundation
public import Observation

/// Bốn tín hiệu "hôm nay đã làm chưa" còn lại của `useReminders`
/// (`hooks/use-reminders.ts` @ fac9ac2) — #527 A-NEXT-4.
///
/// RN đọc chúng bằng bốn query mà màn Hôm nay đã hỏi:
/// - `weighedToday: !!todayWeight` — `useTodayWeight` (`use-fitness-data.ts:71`):
///   `weight_logs.weight_kg` của (người, ngày địa phương), `maybeSingle`;
///   `Number(weight_kg)`, nên một hàng 0 kg là "chưa cân";
/// - `mealLoggedToday: mealDone(dailyLog?.kcal)` — `useDailyLog`
///   (`use-today-data.ts:49`) + `lib/todo.ts:89`: `(Number(kcal) || 0) > 0`;
/// - `sleepLoggedToday: sleepDone(todaySleep != null, dailyLog?.sleep_duration_min)`
///   — `useTodaySleep` (`:68`, `sleep_logs` có `waketime` trong ngày; `mainSleep`
///   của một danh sách có hàng không bao giờ là null) + `lib/todo.ts:100`;
/// - `bioLoggedToday: todayBio != null` — `useTodayBiometrics` (`:111`,
///   `biometric_samples` có `date_time` trong ngày, `limit(1)`).
///
/// Một query CHƯA VỀ (đang tải / lỗi) ở RN là `undefined`, và cả bốn vị từ
/// trên cho `false` với nó: lời nhắc vẫn được đặt. Ở đây là `nil` → `false`,
/// đúng như thế — không suy ra "đã làm" từ một việc chưa đọc được.
///
/// Không đổi gì của RN: không đếm lần cân / bữa còn trong outbox (RN không
/// `setQueryData` cho hai thứ ấy khi mất mạng), không thêm khoá, không đổi giờ.
public enum ReminderToday {
  /// Bốn tín hiệu; `nil` = chưa đọc được.
  public struct Signals: Sendable, Hashable {
    public var weighed: Bool?
    public var mealLogged: Bool?
    public var sleepLogged: Bool?
    public var bioLogged: Bool?

    public init(weighed: Bool? = nil, mealLogged: Bool? = nil, sleepLogged: Bool? = nil, bioLogged: Bool? = nil) {
      self.weighed = weighed
      self.mealLogged = mealLogged
      self.sleepLogged = sleepLogged
      self.bioLogged = bioLogged
    }

    public static let unread = Signals()
  }

  /// Bốn truy vấn của ngày địa phương `date`.
  public struct Reads: Sendable, Hashable {
    public let weight: RowQuery
    public let dailyLog: RowQuery
    public let sleep: RowQuery
    public let bio: RowQuery
  }

  public static func queries(userId: String, date: LocalDate, in tz: TimeZone) -> Reads {
    let day = DailyLog.dayRange(date, in: tz)
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let onDate = RowQuery.Filter.eq("date", .string(date.description))
    return Reads(
      weight: RowQuery(table: "weight_logs", columns: "weight_kg", filters: [me, onDate], mode: .maybeSingle),
      dailyLog: RowQuery(table: "daily_logs", columns: "kcal, sleep_duration_min", filters: [me, onDate], mode: .maybeSingle),
      sleep: RowQuery(
        table: "sleep_logs", columns: "id", filters: [me, .gte("waketime", .string(day.start)), .lt("waketime", .string(day.end))],
        limit: 1),
      bio: RowQuery(
        table: "biometric_samples", columns: "id",
        filters: [me, .gte("date_time", .string(day.start)), .lt("date_time", .string(day.end))], limit: 1))
  }

  /// `!!todayWeight` với `todayWeight = data ? Number(data.weight_kg) : null`.
  public static func weighed(_ rows: [JSONValue]) -> Bool {
    guard let row = rows.first else { return false }
    return JS.truthy(JS.number(row["weight_kg"]))
  }

  /// `mealDone(dailyLog?.kcal)`.
  public static func mealLogged(_ dailyLog: [JSONValue]) -> Bool {
    MealDiary.num(dailyLog.first?["kcal"]) > 0
  }

  /// `sleepDone(todaySleep != null, dailyLog?.sleep_duration_min)`. `sleep` hay
  /// `dailyLog` chưa đọc (`nil`) là vế ấy `false` — như `undefined` của RN.
  public static func sleepLogged(sleep: [JSONValue]?, dailyLog: [JSONValue]?) -> Bool? {
    if sleep == nil && dailyLog == nil { return nil }
    return !(sleep ?? []).isEmpty || MealDiary.num(dailyLog?.first?["sleep_duration_min"]) > 0
  }
}

extension ReminderContext {
  /// Ghép bốn tín hiệu vào ngữ cảnh; chưa đọc → `false` (lời nhắc vẫn đặt).
  public func with(_ s: ReminderToday.Signals) -> ReminderContext {
    var c = self
    c.weighedToday = s.weighed ?? false
    c.mealLoggedToday = s.mealLogged ?? false
    c.sleepLoggedToday = s.sleepLogged ?? false
    c.bioLoggedToday = s.bioLogged ?? false
    return c
  }
}

/// Bốn tín hiệu của MỘT người cho ngày địa phương hôm nay, sống theo phiên.
@MainActor
@Observable
public final class ReminderTodayBook {
  public let userId: String
  public private(set) var signals = ReminderToday.Signals.unread
  /// Ngày của `signals`; qua nửa đêm thì tín hiệu cũ bỏ đi trước khi đọc lại.
  public private(set) var date: LocalDate

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(userId: String, store: any RowStore, clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current) {
    self.userId = userId
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.date = LocalDate(clock.nowMillis(), in: timeZone)
  }

  /// Đổi tài khoản / kết thúc phiên: lượt đọc về muộn không ghi gì nữa.
  public func close() {
    closed = true
    generation += 1
  }

  /// Đọc lại bốn tín hiệu. Mỗi truy vấn độc lập: một cái hỏng thì tín hiệu ấy
  /// giữ giá trị đã đọc của CÙNG ngày (hoặc `nil`), các cái khác vẫn cập nhật.
  public func refresh() async {
    guard !closed else { return }
    let today = LocalDate(clock.nowMillis(), in: timeZone)
    if today != date {
      date = today
      signals = .unread
    }
    generation += 1
    let gen = generation
    let q = ReminderToday.queries(userId: userId, date: today, in: timeZone)
    let store = self.store
    async let weight = Self.read(store, q.weight)
    async let daily = Self.read(store, q.dailyLog)
    async let sleep = Self.read(store, q.sleep)
    async let bio = Self.read(store, q.bio)
    let (w, d, s, b) = await (weight, daily, sleep, bio)
    guard !closed, gen == generation, today == date else { return }
    var next = signals
    if let w { next.weighed = ReminderToday.weighed(w) }
    if let d { next.mealLogged = ReminderToday.mealLogged(d) }
    if let sl = ReminderToday.sleepLogged(sleep: s, dailyLog: d) {
      // Một vế chưa đọc thì chỉ nâng lên "đã ghi", không hạ một "đã ghi" cũ.
      next.sleepLogged = (s != nil && d != nil) ? sl : (sl || (next.sleepLogged ?? false))
    }
    if let b { next.bioLogged = !b.isEmpty }
    signals = next
  }

  nonisolated private static func read(_ store: any RowStore, _ q: RowQuery) async -> [JSONValue]? {
    try? await store.select(q)
  }
}
