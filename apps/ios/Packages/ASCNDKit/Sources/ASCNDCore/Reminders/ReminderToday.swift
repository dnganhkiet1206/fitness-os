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
  /// Một tín hiệu — đọc lại riêng được (lưu cân xong chỉ hỏi lại `weight_logs`).
  public enum Signal: Sendable, Hashable, CaseIterable {
    case weighed, meal, sleep, bio
  }

  public let userId: String
  public private(set) var signals = ReminderToday.Signals.unread
  /// Ngày của `signals`; qua nửa đêm thì tín hiệu cũ bỏ đi trước khi đọc lại.
  public private(set) var date: LocalDate

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  /// Thế hệ theo TỪNG tín hiệu: một lượt đọc hẹp (chỉ cân) không làm rơi kết
  /// quả các tín hiệu khác của một lượt đọc đầy đủ đang bay, và lượt cũ về
  /// muộn không đè lượt mới của cùng tín hiệu.
  @ObservationIgnored private var generation: [Signal: Int] = [:]
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
    for s in Signal.allCases { generation[s, default: 0] += 1 }
  }

  /// Dữ liệu của ngày `day` vừa đổi ở nơi khác (ví dụ Nhật ký sửa món ngày
  /// ấy): chỉ đọc lại `which` khi `day` là HÔM NAY địa phương — sửa một ngày
  /// đã qua không đổi lời nhắc nào, không cần truy vấn.
  public func changed(on day: LocalDate, _ which: Set<Signal>) async {
    guard day == LocalDate(clock.nowMillis(), in: timeZone) else { return }
    await refresh(which)
  }

  /// Đọc lại `which` (mặc định cả bốn). Mỗi truy vấn độc lập: một cái hỏng
  /// thì tín hiệu ấy giữ giá trị đã đọc của CÙNG ngày (hoặc `nil`), các cái
  /// khác vẫn cập nhật. Chỉ chạy các truy vấn mà `which` cần.
  public func refresh(_ which: Set<Signal> = Set(Signal.allCases)) async {
    guard !closed, !which.isEmpty else { return }
    let today = LocalDate(clock.nowMillis(), in: timeZone)
    var which = which
    if today != date {
      // Qua nửa đêm: mọi tín hiệu cũ là của hôm qua — bỏ hết và đọc cả bốn.
      date = today
      signals = .unread
      which = Set(Signal.allCases)
    }
    var gens: [Signal: Int] = [:]
    for s in which {
      generation[s, default: 0] += 1
      gens[s] = generation[s]
    }
    let q = ReminderToday.queries(userId: userId, date: today, in: timeZone)
    let store = self.store
    let needDaily = which.contains(.meal) || which.contains(.sleep)
    let weightQ = which.contains(.weighed) ? q.weight : nil
    let dailyQ = needDaily ? q.dailyLog : nil
    let sleepQ = which.contains(.sleep) ? q.sleep : nil
    let bioQ = which.contains(.bio) ? q.bio : nil
    async let weight = Self.read(store, weightQ)
    async let daily = Self.read(store, dailyQ)
    async let sleep = Self.read(store, sleepQ)
    async let bio = Self.read(store, bioQ)
    let (w, d, sl, b) = await (weight, daily, sleep, bio)
    guard !closed, today == date else { return }
    func current(_ s: Signal) -> Bool { gens[s] != nil && gens[s] == generation[s] }
    var next = signals
    if current(.weighed), let w { next.weighed = ReminderToday.weighed(w) }
    if current(.meal), let d { next.mealLogged = ReminderToday.mealLogged(d) }
    if current(.sleep), let v = ReminderToday.sleepLogged(sleep: sl, dailyLog: d) {
      // Một vế chưa đọc thì chỉ nâng lên "đã ghi", không hạ một "đã ghi" cũ.
      next.sleepLogged = (sl != nil && d != nil) ? v : (v || (next.sleepLogged ?? false))
    }
    if current(.bio), let b { next.bioLogged = !b.isEmpty }
    signals = next
  }

  /// `nil` = không hỏi (tín hiệu không nằm trong lượt này) hoặc đọc hỏng.
  nonisolated private static func read(_ store: any RowStore, _ q: RowQuery?) async -> [JSONValue]? {
    guard let q else { return nil }
    return try? await store.select(q)
  }
}
