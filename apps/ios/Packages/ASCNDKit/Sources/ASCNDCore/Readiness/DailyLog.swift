public import Foundation

/// Dựng lại một hàng `daily_logs` — `recomputeDailyLog` của
/// `lib/daily-log-service.ts` @ fac9ac2 (#266).
///
/// Server không có RPC / trigger làm việc này: đó là logic phía client, và hai
/// app phải ghi CÙNG một hàng cho cùng một ngày. Mọi truy vấn (bảng, cột, cửa
/// sổ) và mọi phép tính ở đây khoá bằng golden sinh từ chính mã RN chạy trên
/// một Supabase giả, ở sáu múi giờ (`DailyLogGoldenTests`).
///
/// Luật RN giữ nguyên:
/// - cửa sổ thuộc về NGÀY, không về lúc dựng (BUG-106, Model B): 7 / 28 ngày
///   địa phương KẾT THÚC ở chính ngày ấy, hai đầu đóng — không hàng nào sau
///   ngày ấy lọt vào;
/// - đọc hỏng một nguồn = KHÔNG ghi (một ngày sai lưu lặng lẽ tệ hơn một lỗi);
///   riêng hồ sơ thiếu thì dùng mục tiêu ngủ mặc định;
/// - ghi có điều kiện theo `updated_at` đã đọc TRƯỚC mọi nguồn: hàng đổi từ
///   lúc ấy nghĩa là có người ghi bản mới hơn → đọc lại, tối đa 3 lần.
public enum DailyLog {
  public static let acuteDays = 7
  public static let chronicDays = 28
  public static let rebuildAttempts = 3

  /// Cột của hàng dựng ra, theo thứ tự `PROJECTION_COLUMNS`.
  public static let projectionColumns = [
    "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "water_ml", "sleep_duration_min", "sleep_quality",
    "workout_count", "volume_load", "supplement_taken", "supplement_planned",
    "readiness_score", "readiness_status", "readiness_explain", "readiness_recommendation", "acwr",
  ]

  // MARK: - Cửa sổ ngày (`local-date.ts`)

  /// `[start, end)` của một ngày địa phương, dạng `toISOString`.
  public struct Window: Sendable, Hashable {
    public let start: String
    public let end: String
  }

  /// `localDayRangeISO`: nửa đêm địa phương → nửa đêm địa phương hôm sau (ngày
  /// đổi giờ dài 23 / 25 giờ, như `setDate(+1)` của JS).
  public static func dayRange(_ date: LocalDate, in tz: TimeZone) -> Window {
    let start = midnight(date, tz)
    let end = midnight(date.adding(days: 1), tz)
    return Window(start: WorkoutSessionRecord.iso8601(start), end: WorkoutSessionRecord.iso8601(end))
  }

  /// `localWindowISO(endDate, days)`: `days` ngày địa phương kết thúc ở `endDate`.
  public static func window(endingOn date: LocalDate, days: Int, in tz: TimeZone) -> Window {
    Window(start: dayRange(date.adding(days: -(days - 1)), in: tz).start, end: dayRange(date, in: tz).end)
  }

  static func midnight(_ date: LocalDate, _ tz: TimeZone) -> EpochMillis {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    if let d = cal.date(from: DateComponents(year: date.year, month: date.month, day: date.day, hour: 0, minute: 0)) {
      return EpochMillis(d)
    }
    // Lịch không dựng được ngày: nửa đêm UTC lệch theo múi (như `TodayController.startOfDay`).
    let utc = Date(timeIntervalSince1970: TimeInterval(date.daysSinceEpoch) * 86_400)
    return EpochMillis(utc.addingTimeInterval(-TimeInterval(tz.secondsFromGMT(for: utc))))
  }

  /// `new Date(s).getTime()`; không đọc được → NaN.
  static func millis(_ v: JSONValue?) -> Double {
    guard case .string(let s)? = v, let t = EpochMillis(iso8601: s) else { return .nan }
    return Double(t.millis)
  }

  /// `localDateStr(new Date(s))` — ngày hỏng ra "NaN-NaN-NaN" như JS.
  static func localDay(_ v: JSONValue?, _ tz: TimeZone) -> String {
    let ms = millis(v)
    guard ms.isFinite else { return "NaN-NaN-NaN" }
    return LocalDate(EpochMillis(Int64(ms)), in: tz).description
  }

  // MARK: - Giấc ngủ

  /// `asleepMinutes`: `asleep_min` > 0 thì dùng (làm tròn), không thì thức − ngủ.
  public static func asleepMinutes(_ sleep: JSONValue) -> Double {
    if JS.present(sleep["asleep_min"]) {
      let a = JS.number(sleep["asleep_min"])
      if a > 0 { return JS.round(a) }
    }
    return JS.max(0, JS.round((millis(sleep["waketime"]) - millis(sleep["bedtime"])) / 60_000))
  }

  /// `mainSleep`: giấc DÀI nhất; bằng nhau thì giấc dậy muộn hơn.
  public static func mainSleep(_ rows: [JSONValue]) -> JSONValue? {
    var best: JSONValue?
    var bestMin = -1.0
    for r in rows {
      let m = asleepMinutes(r)
      if m > bestMin || (m == bestMin && best != nil && jsString(r["waketime"]) > jsString(best?["waketime"])) {
        best = r
        bestMin = m
      }
    }
    return best
  }

  /// `String(x)` của JS cho một ô.
  static func jsString(_ v: JSONValue?) -> String {
    switch v {
    case .string(let s)?: return s
    case .null?: return "null"
    case nil: return "undefined"
    case .number(let n)?: return ReadinessEngine.jsString(n)
    case .bool(let b)?: return b ? "true" : "false"
    default: return "[object Object]"
    }
  }

  /// `sleepDebtFrom`: mục tiêu đêm − trung bình giấc chính MỖI NGÀY (theo ngày
  /// địa phương của lúc dậy), không âm.
  public static func sleepDebt(_ rows: [JSONValue], targetMin: Double, in tz: TimeZone) -> Double {
    var order: [String] = []
    var byDay: [String: [JSONValue]] = [:]
    for r in rows {
      let k = localDay(r["waketime"], tz)
      if byDay[k] == nil { order.append(k) }
      byDay[k, default: []].append(r)
    }
    if order.isEmpty { return 0 }
    var total = 0.0
    for k in order {
      if let night = mainSleep(byDay[k] ?? []) { total += asleepMinutes(night) }
    }
    return JS.max(0, targetMin - total / Double(order.count))
  }

  /// `chronicDays` (`training-card.ts`): cửa sổ 28 ngày thật sự phủ bao nhiêu
  /// ngày, tính từ buổi cũ nhất tới BÂY GIỜ (đồng hồ, như RN — không phải tới
  /// ngày đang dựng).
  public static func chronicDaysCovered(_ sessions: [JSONValue], now: EpochMillis) -> Double {
    var oldest: Double?
    for s in sessions {
      let t = millis(s["date_time"])
      if t.isFinite, oldest == nil || t < oldest! { oldest = t }
    }
    guard let oldest else { return 0 }
    return Swift.min(28, JS.ceil((Double(now.millis) - oldest) / 86_400_000) + 1)
  }

  // MARK: - Truy vấn

  /// Các truy vấn RN gửi, đúng thứ tự, đúng cột, đúng cửa sổ.
  public static func queries(userId: String, date: LocalDate, in tz: TimeZone) -> Reads {
    let day = dayRange(date, in: tz)
    let acute = window(endingOn: date, days: acuteDays, in: tz)
    let chronic = window(endingOn: date, days: chronicDays, in: tz)
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    func range(_ col: String, _ w: Window) -> [RowQuery.Filter] {
      [.gte(col, .string(w.start)), .lt(col, .string(w.end))]
    }
    return Reads(
      existing: RowQuery(
        table: "daily_logs", columns: "id, updated_at", filters: [me, .eq("date", .string(date.description))],
        mode: .maybeSingle),
      meals: RowQuery(
        table: "meal_entries", columns: "total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g",
        filters: [me] + range("date_time", day)),
      workouts: RowQuery(table: "workout_sessions", columns: "volume_load", filters: [me] + range("date_time", day)),
      sleeps: RowQuery(
        table: "sleep_logs", columns: "bedtime, waketime, quality, light_min, deep_min, rem_min, asleep_min",
        filters: [me] + range("waketime", day), order: .init(column: "waketime", ascending: false)),
      supplements: RowQuery(table: "supplements", columns: "id", filters: [me]),
      intakes: RowQuery(
        table: "supplement_intake_logs", columns: "id",
        filters: [me, .eq("taken", .bool(true))] + range("date_time", day)),
      bio: RowQuery(
        table: "biometric_samples", columns: "hr_bpm, hrv_rmssd_ms, hrv_sdnn_ms, soreness_1_10, illness_flag",
        filters: [me] + range("date_time", day), order: .init(column: "date_time", ascending: false), limit: 1),
      profile: RowQuery(table: "profiles", columns: "sleep_target_hours", filters: [me], mode: .single),
      bioHistory: RowQuery(
        table: "biometric_samples", columns: "hrv_rmssd_ms, hrv_sdnn_ms, hr_bpm, date_time",
        filters: [me] + range("date_time", chronic), order: .init(column: "date_time", ascending: true)),
      load7d: RowQuery(table: "workout_sessions", columns: "session_rpe, sets", filters: [me] + range("date_time", acute)),
      load28d: RowQuery(
        table: "workout_sessions", columns: "session_rpe, sets, date_time", filters: [me] + range("date_time", chronic)),
      sleeps7d: RowQuery(table: "sleep_logs", columns: "bedtime, waketime, asleep_min", filters: [me] + range("waketime", acute)),
      water: RowQuery(table: "water_logs", columns: "amount_ml", filters: [me, .eq("date", .string(date.description))]))
  }

  public struct Reads: Sendable {
    public let existing, meals, workouts, sleeps, supplements, intakes, bio, profile, bioHistory, load7d, load28d,
      sleeps7d, water: RowQuery

    /// Thứ tự RN gửi: `existing` một mình TRƯỚC, rồi 12 nguồn (`Promise.all`).
    public var sources: [RowQuery] {
      [meals, workouts, sleeps, supplements, intakes, bio, profile, bioHistory, load7d, load28d, sleeps7d, water]
    }
  }

  /// Kết quả 12 nguồn (hồ sơ có thể thiếu).
  public struct Sources: Sendable {
    public var meals, workouts, sleeps, supplements, intakes, bio, bioHistory, load7d, load28d, sleeps7d,
      water: [JSONValue]
    public var profile: JSONValue?

    public init(
      meals: [JSONValue], workouts: [JSONValue], sleeps: [JSONValue], supplements: [JSONValue],
      intakes: [JSONValue], bio: [JSONValue], profile: JSONValue?, bioHistory: [JSONValue], load7d: [JSONValue],
      load28d: [JSONValue], sleeps7d: [JSONValue], water: [JSONValue]
    ) {
      self.meals = meals
      self.workouts = workouts
      self.sleeps = sleeps
      self.supplements = supplements
      self.intakes = intakes
      self.bio = bio
      self.profile = profile
      self.bioHistory = bioHistory
      self.load7d = load7d
      self.load28d = load28d
      self.sleeps7d = sleeps7d
      self.water = water
    }
  }

  // MARK: - Hàng

  /// Hàng `daily_logs` dựng từ các nguồn — phần thuần của `recomputeDailyLog`.
  /// `historyWindow` (iOS 27) chỉ để engine ghi cờ "lịch sử giới hạn" — không
  /// đổi điểm; mặc định không biết cửa sổ, hành vi như trước.
  public static func row(
    userId: String, date: LocalDate, sources s: Sources, now: EpochMillis, in tz: TimeZone,
    historyWindow: HealthHistoryWindow = .unknown
  ) -> [String: JSONValue] {
    func sum(_ rows: [JSONValue], _ col: String) -> Double { rows.reduce(0) { $0 + JS.number($1[col]) } }

    var sleepDuration = 0.0
    var sleepQuality = 0.0
    if let sleep = mainSleep(s.sleeps) {
      sleepDuration = asleepMinutes(sleep)
      // `sleep.quality ?? 5`: chỉ null / thiếu mới là 5.
      sleepQuality = JS.present(sleep["quality"]) ? JS.number(sleep["quality"]) : 5
    }

    var score: JSONValue = .null
    var status: JSONValue = .null
    var explain = ""
    var recommendation = ""
    var acwr: JSONValue = .null

    if let input = readinessInput(sources: s, date: date, now: now, in: tz, historyWindow: historyWindow) {
      if let r = ReadinessEngine.compute(input) {
        score = JS.json(r.score)
        status = .string(r.status.rawValue)
        explain = r.explainToken
        recommendation = r.recommendationKey
        acwr = r.acwr.map(JS.json) ?? .null
      }
    }

    return [
      "user_id": .string(userId),
      "date": .string(date.description),
      "kcal": JS.json(sum(s.meals, "total_kcal")),
      "protein_g": JS.json(sum(s.meals, "total_protein_g")),
      "carbs_g": JS.json(sum(s.meals, "total_carbs_g")),
      "fat_g": JS.json(sum(s.meals, "total_fat_g")),
      "fiber_g": JS.json(sum(s.meals, "total_fiber_g")),
      "water_ml": JS.json(sum(s.water, "amount_ml")),
      "sleep_duration_min": JS.json(sleepDuration),
      "sleep_quality": JS.json(sleepQuality),
      "workout_count": .number(Double(s.workouts.count)),
      "volume_load": JS.json(sum(s.workouts, "volume_load")),
      "supplement_taken": .number(Double(s.intakes.count)),
      "supplement_planned": .number(Double(s.supplements.count)),
      "readiness_score": score,
      "readiness_status": status,
      "readiness_explain": .string(explain),
      "readiness_recommendation": .string(recommendation),
      "acwr": acwr,
    ]
  }

  /// Đầu vào của điểm sẵn sàng từ các nguồn của ngày — CHUNG cho hàng
  /// `daily_logs` và tín hiệu phục hồi của Daily Plan (GĐ1), nên hai nơi không
  /// bao giờ đọc số khác nhau. `nil` khi chưa đủ dữ liệu để chấm.
  /// `historyWindow` (iOS 27) chỉ để engine ghi cờ "lịch sử giới hạn".
  public static func readinessInput(
    sources s: Sources, date: LocalDate, now: EpochMillis, in tz: TimeZone,
    historyWindow: HealthHistoryWindow = .unknown
  ) -> ReadinessInput? {
    let measured28d = s.load28d.filter { SessionLoad.load($0) != nil }
    let trainingDays28d = chronicDaysCovered(measured28d, now: now)
    let sleepDuration = mainSleep(s.sleeps).map(asleepMinutes) ?? 0

    let target = JS.present(s.profile?["sleep_target_hours"]) ? JS.number(s.profile?["sleep_target_hours"]) : 8
    let sleepTargetMin = target * 60

    // Một họ HRV, không bao giờ hai: SDNN hôm nay thì nền cũng chỉ SDNN.
    let today = s.bio.first
    let usingSdnn = JS.present(today?["hrv_sdnn_ms"])
    let hrvColumn = usingSdnn ? "hrv_sdnn_ms" : "hrv_rmssd_ms"
    // Nền và "hôm nay" theo NGÀY (24/10): đồng hồ ghi nhiều mẫu một ngày (mỗi lần
    // đồng bộ một mẫu mới nhất) — đếm theo mẫu thì ngày nhiều mẫu lấn nền, và một
    // lần đo lẻ giữa buổi chiều thành "HRV hôm nay". Mỗi ngày = trung bình các mẫu;
    // hôm nay không nằm trong nền của chính nó.
    let key = date.description
    let hrvDays = dailyMeans(s.bioHistory, hrvColumn, in: tz)
    let rhrDays = dailyMeans(s.bioHistory, "hr_bpm", in: tz)
    let hrvHistory = hrvDays.filter { $0.day != key }.map(\.mean)
    let rhrHistory = rhrDays.filter { $0.day != key }.map(\.mean)
    let todayHrv = hrvDays.first { $0.day == key }?.mean
    let hrvToday: Double? =
      todayHrv ?? (JS.present(today?[hrvColumn]) ? JS.number(today?[hrvColumn]) : nil)

    let load7d = SessionLoad.window(s.load7d)
    let load28d = SessionLoad.window(s.load28d)
    let debt = sleepDebt(s.sleeps7d, targetMin: sleepTargetMin, in: tz)

    let hasEnoughData = s.bioHistory.count >= 3 || s.sleeps7d.count >= 3 || load28d > 0
    guard hasEnoughData else { return nil }
    let hr = rhrDays.first { $0.day == key }?.mean ?? JS.number(today?["hr_bpm"])
    let soreness: Double? = JS.present(today?["soreness_1_10"]) ? JS.number(today?["soreness_1_10"]) : nil
    return ReadinessInput(
      hrvToday: hrvToday,
      rhrToday: JS.truthy(hr) ? hr : nil,
      sleepMinLastNight: sleepDuration, sleepTargetMin: sleepTargetMin, sleepDebt7dMin: debt,
      trainingLoad7d: load7d, trainingLoad28d: load28d, trainingDays28d: trainingDays28d,
      // Đau cơ đã trừ vào điểm tải; KHÔNG coi nó là "chấn thương" (trần 45) nữa —
      // một con số bị trừ hai lần (24/10). App chưa có ô ghi chấn thương riêng.
      sorenessToday: soreness, illness: today?["illness_flag"] == .bool(true), painFlagMax: nil,
      hrvHistory28d: hrvHistory, rhrHistory28d: rhrHistory,
      readableHistoryDays: historyWindow.readableDays(through: date))
  }

  /// Trung bình mỗi ngày địa phương của một cột (bỏ ô trống), theo thứ tự ngày.
  static func dailyMeans(_ rows: [JSONValue], _ column: String, in tz: TimeZone) -> [(day: String, mean: Double)] {
    var order: [String] = []
    var sums: [String: (total: Double, n: Double)] = [:]
    for r in rows where JS.present(r[column]) {
      let v = JS.number(r[column])
      guard v.isFinite, v > 0 else { continue }
      let d = localDay(r["date_time"], tz)
      if sums[d] == nil { order.append(d) }
      sums[d, default: (0, 0)].total += v
      sums[d, default: (0, 0)].n += 1
    }
    return order.map { ($0, sums[$0]!.total / sums[$0]!.n) }
  }

  /// `projectionEquals`: hàng đang lưu đã mang đúng các số ta vừa tính chưa.
  public static func projectionEquals(_ stored: JSONValue, _ computed: [String: JSONValue]) -> Bool {
    projectionColumns.allSatisfy { col in
      let a = stored[col], b = computed[col]
      if !JS.present(a) || !JS.present(b) { return !JS.present(a) && !JS.present(b) }
      if case .number(let n)? = b { return JS.number(a) == n }
      return jsString(a) == jsString(b)
    }
  }
}

// MARK: - Truy vấn chung

/// Một truy vấn PostgREST dạng dữ liệu — để Core quyết ĐỌC GÌ, còn Backend chỉ
/// thực thi; test thực thi cùng truy vấn trên bảng giả và so với RN.
public struct RowQuery: Sendable, Hashable {
  public enum Filter: Sendable, Hashable {
    case eq(String, JSONValue)
    case gte(String, JSONValue)
    case lt(String, JSONValue)
    case lte(String, JSONValue)
    /// `.or('a.gt.0,b.gt.0')` của PostgREST, nguyên chuỗi.
    case or(String)
  }
  public struct Order: Sendable, Hashable {
    public let column: String
    public let ascending: Bool
  }
  public enum Mode: Sendable, Hashable { case many, single, maybeSingle }

  public let table: String
  public let columns: String
  public let filters: [Filter]
  public let order: Order?
  public let limit: Int?
  /// Bỏ qua chừng này hàng đầu (`.range(offset, offset + limit - 1)`) — đọc theo trang.
  public let offset: Int?
  public let mode: Mode

  public init(
    table: String, columns: String, filters: [Filter], order: Order? = nil, limit: Int? = nil, offset: Int? = nil,
    mode: Mode = .many
  ) {
    self.table = table
    self.columns = columns
    self.filters = filters
    self.order = order
    self.limit = limit
    self.offset = offset
    self.mode = mode
  }
}

/// Lỗi một lệnh đọc / ghi của server, mang mã PostgREST nếu có.
public struct RowStoreError: Error, Sendable, Hashable {
  public let code: String?
  public let message: String
  /// Yêu cầu chắc chắn chưa tới máy chủ (`NetworkFailure.neverSent`) — bên ghi được
  /// đẩy lần ghi vào hàng chờ thay vì báo lỗi.
  public let neverSent: Bool
  public init(code: String?, message: String, neverSent: Bool = false) {
    self.code = code
    self.message = message
    self.neverSent = neverSent
  }
}

/// Thực thi truy vấn. `select` trả các hàng (`maybeSingle` / `single`: 0 hoặc 1
/// hàng; `single` không có hàng là `RowStoreError` mã `PGRST116`).
public protocol RowStore: Sendable {
  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue]
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError)
  /// `update(row).eq…​.select('id')` — trả số hàng đã chạm.
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int
  /// `upsert(rows, { onConflict })`.
  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError)
}

extension RowStore {
  /// Mặc định cho kho chỉ đọc / chỉ dựng `daily_logs` (test): không hỗ trợ.
  public func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {
    throw RowStoreError(code: nil, message: "upsert không hỗ trợ ở kho này")
  }
}

/// Dựng lại không được — hàng cũ ở yên, lỗi nổi lên cho bên gọi.
public struct DailyLogRebuildError: Error, Sendable, Hashable {
  public let message: String
}

extension DailyLog {
  /// `recomputeDailyLog(userId, date)`: đọc token, đọc 12 nguồn, tính, ghi có
  /// điều kiện; bị chen thì làm lại (tối đa `rebuildAttempts`).
  /// `historyWindow` (iOS 27) chỉ để engine ghi cờ "lịch sử giới hạn".
  public static func recompute(
    userId: String, date: LocalDate, store: any RowStore, now: EpochMillis, in tz: TimeZone,
    historyWindow: HealthHistoryWindow = .unknown
  ) async throws(DailyLogRebuildError) {
    let reads = queries(userId: userId, date: date, in: tz)
    for attempt in 0..<rebuildAttempts {
      let last = attempt + 1 >= rebuildAttempts
      // Token đọc MỘT MÌNH, trước mọi nguồn.
      let seen: JSONValue?
      do {
        seen = try await store.select(reads.existing).first
      } catch {
        throw DailyLogRebuildError(message: "Không đọc được ngày \(date): \(error.message)")
      }

      let s: Sources
      do {
        s = try await readSources(reads, store)
      } catch {
        throw DailyLogRebuildError(message: "Không dựng lại được ngày \(date): không đọc được \(error.message)")
      }
      let computed = row(userId: userId, date: date, sources: s, now: now, in: tz, historyWindow: historyWindow)

      guard let seen, let id = seen["id"], let token = seen["updated_at"] else {
        do {
          try await store.insert("daily_logs", computed)
          return
        } catch {
          if error.code == "23505" && !last { continue }
          throw DailyLogRebuildError(message: "Không lưu được ngày \(date): \(error.message)")
        }
      }
      let touched: Int
      do {
        touched = try await store.update("daily_logs", computed, where: [.eq("id", id), .eq("updated_at", token)])
      } catch {
        throw DailyLogRebuildError(message: "Không lưu được ngày \(date): \(error.message)")
      }
      if touched > 0 { return }
      if !last { continue }
      // Hết lượt: hàng đang lưu đã đúng số ta tính thì người thắng đã ghi đúng.
      let settled = try? await store.select(
        RowQuery(
          table: "daily_logs", columns: projectionColumns.joined(separator: ", "), filters: [.eq("id", id)],
          mode: .maybeSingle))
      if let stored = settled?.first, projectionEquals(stored, computed) { return }
      throw DailyLogRebuildError(
        message: "Không dựng lại được ngày \(date): hàng bị ghi đè liên tục sau \(rebuildAttempts) lần thử")
    }
  }

  /// 12 nguồn đọc SONG SONG (`Promise.all` của RN — AUD-50): cả 12 chuyến
  /// cùng bay, chờ HẾT rồi mới xét lỗi. Lỗi ném ra là lỗi ĐẦU TIÊN theo thứ
  /// tự cố định của `Reads.sources` — đúng lỗi mà bản tuần tự cũ ném, nên
  /// `recompute` / `DailyPlanRecovery` thấy cùng một lỗi như trước. Hồ sơ vẫn
  /// "lỗi nào cũng là không có hồ sơ" (`profileRes.error ? null`).
  static func readSources(_ r: Reads, _ store: any RowStore) async throws(RowStoreError) -> Sources {
    let ordered: [Result<[JSONValue], RowStoreError>] = await withTaskGroup(
      of: (Int, Result<[JSONValue], RowStoreError>).self
    ) { group in
      for (index, query) in r.sources.enumerated() {
        group.addTask {
          do {
            return (index, .success(try await store.select(query)))
          } catch {
            return (index, .failure(error))
          }
        }
      }
      var collected: [(Int, Result<[JSONValue], RowStoreError>)] = []
      collected.reserveCapacity(r.sources.count)
      for await pair in group { collected.append(pair) }
      return collected.sorted { $0.0 < $1.0 }.map(\.1)
    }
    // Lắp theo đúng thứ tự của `Reads.sources` (bữa, buổi, ngủ, thực phẩm bổ
    // sung, lần uống bổ sung, sinh trắc, hồ sơ, lịch sử sinh trắc, tải 7 ngày,
    // tải 28 ngày, ngủ 7 ngày, nước). Lỗi đầu tiên theo thứ tự này thì ném;
    // riêng hồ sơ hỏng thì coi như không có hồ sơ.
    var values: [[JSONValue]] = []
    values.reserveCapacity(ordered.count)
    for (offset, result) in ordered.enumerated() {
      switch result {
      case .success(let rows):
        values.append(rows)
      case .failure(let error):
        if r.sources[offset] == r.profile {
          values.append([])
        } else {
          throw error
        }
      }
    }
    return Sources(
      meals: values[0], workouts: values[1], sleeps: values[2], supplements: values[3], intakes: values[4],
      bio: values[5], profile: values[6].first, bioHistory: values[7], load7d: values[8], load28d: values[9],
      sleeps7d: values[10], water: values[11])
  }
}

// MARK: - Dựng lại sau khi ghi

extension DailyLog {
  /// Ngày nào phải dựng lại sau khi server đã nhận `entry`.
  ///
  /// RN: ghi buổi (phát lại hàng đợi) → ngày của buổi; ghi thêm / gỡ set /
  /// khôi phục → ngày của buổi; xoá buổi và ghi tay → ngày của buổi VÀ hôm nay
  /// (cửa sổ 7 / 28 ngày của hôm nay chứa ngày ấy — WH-3a). Native lấy luật
  /// rộng nhất cho mọi lệnh buổi tập: ngày của buổi, cộng hôm nay khi khác —
  /// dựng lại là idempotent, thêm hôm nay không bao giờ sai, thiếu thì Today
  /// hiện điểm từ một buổi không còn.
  ///
  /// Lệnh không về buổi tập (kế hoạch, bài tập) không chạm `daily_logs`.
  /// Lệnh xoá xếp hàng trước khi payload mang `date_time`: chỉ còn hôm nay.
  public static func rebuildDays(after entry: OutboxEntry, today: LocalDate, in tz: TimeZone) -> [LocalDate] {
    // Bữa ăn (#527 Phase 3 · 3.2): CHỈ ngày ăn — `rebuildAfterReplay(userId,
    // localDateStr(dateTime))` của `case 'meal'`. Bữa không vào cửa sổ tải
    // 7 / 28 ngày nên không cần hôm nay.
    if entry.kind == MealLog.kind { return MealLog.day(entry, in: tz).map { [$0] } ?? [] }
    // Giấc ngủ (#527 `log-sleep`): ngày THỨC DẬY — `case 'sleep'`.
    if entry.kind == SleepLog.kind { return SleepLog.replayDay(entry, in: tz).map { [$0] } ?? [] }
    // Sinh trắc (#527 `log-biometrics`): ngày của bộ số — `case 'biometrics'`.
    if entry.kind == BiometricLog.kind { return BiometricLog.day(entry, in: tz).map { [$0] } ?? [] }
    // Nước (audit 25/10): ngày của lần uống. RN không dựng lại sau `case 'water'`,
    // nên `daily_logs.water_ml` (Tiến bộ, tổng kết tuần, TB 7 ngày của Insight)
    // lệch sổ Nước tới lần ghi bữa / ngủ / tập kế tiếp của ngày ấy.
    if entry.kind == Water.addKind { return Water.day(entry).map { [$0] } ?? [] }
    let kinds = [WorkoutSessionRecord.outboxKind, WorkoutSessionRecord.revisionKind, WorkoutSessionRecord.deleteKind]
    guard kinds.contains(entry.kind) else { return [] }
    guard let at = entry.payload["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }) else {
      return [today]
    }
    let day = LocalDate(at, in: tz)
    return day == today ? [day] : [day, today]
  }
}

extension DailyLog {
  /// Sau khi server nhận NHIỀU entry trong MỘT lượt gửi (AUD-50): gom các ngày
  /// phân biệt của mọi entry rồi dựng lại mỗi (người, ngày) MỘT lần — 20 entry
  /// chạm 2 ngày chỉ tốn 2 lượt dựng, không phải 20. KHÔNG ném, như bản một
  /// entry: ghi đã thành, lỗi dựng lại chỉ trả về để test / chẩn đoán, ngày
  /// tạm lệch tự sửa ở lần ghi kế vào ngày ấy.
  public static func rebuildAfterWrites(
    _ entries: [OutboxEntry], store: any RowStore, clock: any WallClock = SystemWallClock(), in tz: TimeZone = .current
  ) async -> [DailyLogRebuildError] {
    let now = clock.nowMillis()
    let today = LocalDate(now, in: tz)
    var done: Set<RebuildDay> = []
    var failures: [DailyLogRebuildError] = []
    for entry in entries {
      for day in rebuildDays(after: entry, today: today, in: tz) {
        guard done.insert(RebuildDay(userId: entry.userId, day: day)).inserted else { continue }
        do {
          try await recompute(userId: entry.userId, date: day, store: store, now: now, in: tz)
        } catch {
          failures.append(error)
        }
      }
    }
    return failures
  }

  /// Một (người, ngày) đã dựng lại trong lượt này — trùng thì bỏ, không dựng nữa.
  private struct RebuildDay: Hashable {
    let userId: String
    let day: LocalDate
  }

  /// Sau khi server nhận `entry`: dựng lại từng ngày `rebuildDays` chỉ ra.
  /// KHÔNG ném (`rebuildAfterReplay` của RN): ghi đã thành; để lỗi dựng lại làm
  /// hỏng lượt gửi thì hàng đợi phát lại và nhân đôi bản ghi — tệ hơn một ngày
  /// tạm lệch, tự sửa ở lần ghi kế vào ngày ấy. Trả các lỗi để test / chẩn đoán.
  @discardableResult
  public static func rebuildAfterWrite(
    _ entry: OutboxEntry, store: any RowStore, clock: any WallClock = SystemWallClock(), in tz: TimeZone = .current
  ) async -> [DailyLogRebuildError] {
    await rebuildAfterWrites([entry], store: store, clock: clock, in: tz)
  }
}
