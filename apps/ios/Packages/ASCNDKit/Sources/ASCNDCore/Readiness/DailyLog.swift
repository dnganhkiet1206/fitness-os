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
  public static func row(
    userId: String, date: LocalDate, sources s: Sources, now: EpochMillis, in tz: TimeZone
  ) -> [String: JSONValue] {
    func sum(_ rows: [JSONValue], _ col: String) -> Double { rows.reduce(0) { $0 + JS.number($1[col]) } }

    let measured28d = s.load28d.filter { SessionLoad.load($0) != nil }
    let trainingDays28d = chronicDaysCovered(measured28d, now: now)

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

    let target = JS.present(s.profile?["sleep_target_hours"]) ? JS.number(s.profile?["sleep_target_hours"]) : 8
    let sleepTargetMin = target * 60

    // Một họ HRV, không bao giờ hai: SDNN hôm nay thì nền cũng chỉ SDNN.
    let today = s.bio.first
    let usingSdnn = JS.present(today?["hrv_sdnn_ms"])
    let hrvToday: Double? =
      usingSdnn
      ? JS.number(today?["hrv_sdnn_ms"])
      : (JS.present(today?["hrv_rmssd_ms"]) ? JS.number(today?["hrv_rmssd_ms"]) : nil)
    let hrvHistory = s.bioHistory
      .map { usingSdnn ? $0["hrv_sdnn_ms"] : $0["hrv_rmssd_ms"] }
      .filter(JS.present)
      .map(JS.number)
    let rhrHistory = s.bioHistory.filter { JS.present($0["hr_bpm"]) }.map { JS.number($0["hr_bpm"]) }

    let load7d = SessionLoad.window(s.load7d)
    let load28d = SessionLoad.window(s.load28d)
    let debt = sleepDebt(s.sleeps7d, targetMin: sleepTargetMin, in: tz)

    let hasEnoughData = s.bioHistory.count >= 3 || s.sleeps7d.count >= 3 || load28d > 0
    if hasEnoughData {
      let hr = JS.number(today?["hr_bpm"])
      let soreness: Double? = JS.present(today?["soreness_1_10"]) ? JS.number(today?["soreness_1_10"]) : nil
      let input = ReadinessInput(
        hrvToday: hrvToday,
        rhrToday: JS.truthy(hr) ? hr : nil,
        sleepMinLastNight: sleepDuration, sleepTargetMin: sleepTargetMin, sleepDebt7dMin: debt,
        trainingLoad7d: load7d, trainingLoad28d: load28d, trainingDays28d: trainingDays28d,
        sorenessToday: soreness, illness: today?["illness_flag"] == .bool(true), painFlagMax: soreness,
        hrvHistory28d: hrvHistory, rhrHistory28d: rhrHistory)
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
  public let mode: Mode

  public init(
    table: String, columns: String, filters: [Filter], order: Order? = nil, limit: Int? = nil, mode: Mode = .many
  ) {
    self.table = table
    self.columns = columns
    self.filters = filters
    self.order = order
    self.limit = limit
    self.mode = mode
  }
}

/// Lỗi một lệnh đọc / ghi của server, mang mã PostgREST nếu có.
public struct RowStoreError: Error, Sendable, Hashable {
  public let code: String?
  public let message: String
  public init(code: String?, message: String) {
    self.code = code
    self.message = message
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
  public static func recompute(
    userId: String, date: LocalDate, store: any RowStore, now: EpochMillis, in tz: TimeZone
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
      let computed = row(userId: userId, date: date, sources: s, now: now, in: tz)

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

  /// 12 nguồn. RN gửi song song và chờ HẾT rồi mới xét lỗi; ở đây tuần tự —
  /// kết quả như nhau, lỗi nào cũng là không ghi.
  static func readSources(_ r: Reads, _ store: any RowStore) async throws(RowStoreError) -> Sources {
    let meals = try await store.select(r.meals)
    let workouts = try await store.select(r.workouts)
    let sleeps = try await store.select(r.sleeps)
    let supplements = try await store.select(r.supplements)
    let intakes = try await store.select(r.intakes)
    let bio = try await store.select(r.bio)
    // Hồ sơ: lỗi nào cũng là "không có hồ sơ" (`profileRes.error ? null`).
    let profile: JSONValue?
    do {
      profile = try await store.select(r.profile).first
    } catch {
      profile = nil
    }
    let bioHistory = try await store.select(r.bioHistory)
    let load7d = try await store.select(r.load7d)
    let load28d = try await store.select(r.load28d)
    let sleeps7d = try await store.select(r.sleeps7d)
    let water = try await store.select(r.water)
    return Sources(
      meals: meals, workouts: workouts, sleeps: sleeps, supplements: supplements, intakes: intakes, bio: bio,
      profile: profile, bioHistory: bioHistory, load7d: load7d, load28d: load28d, sleeps7d: sleeps7d, water: water)
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
  /// Sau khi server nhận `entry`: dựng lại từng ngày `rebuildDays` chỉ ra.
  /// KHÔNG ném (`rebuildAfterReplay` của RN): ghi đã thành; để lỗi dựng lại làm
  /// hỏng lượt gửi thì hàng đợi phát lại và nhân đôi bản ghi — tệ hơn một ngày
  /// tạm lệch, tự sửa ở lần ghi kế vào ngày ấy. Trả các lỗi để test / chẩn đoán.
  @discardableResult
  public static func rebuildAfterWrite(
    _ entry: OutboxEntry, store: any RowStore, clock: any WallClock = SystemWallClock(), in tz: TimeZone = .current
  ) async -> [DailyLogRebuildError] {
    let now = clock.nowMillis()
    var failures: [DailyLogRebuildError] = []
    for day in rebuildDays(after: entry, today: LocalDate(now, in: tz), in: tz) {
      do {
        try await recompute(userId: entry.userId, date: day, store: store, now: now, in: tz)
      } catch {
        failures.append(error)
      }
    }
    return failures
  }
}
