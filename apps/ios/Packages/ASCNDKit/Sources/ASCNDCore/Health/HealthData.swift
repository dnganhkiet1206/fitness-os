public import Foundation

/// Đồng bộ Apple Health — phần thuần của `lib/health.ts`, `step-days.ts`,
/// `health-days.ts` (RN), port nguyên văn. Lớp đọc HealthKit thật (chỉ iOS)
/// đưa mẫu vào đây; mọi phép gom / làm tròn / lọc nằm ở đây và khoá bằng
/// golden sinh từ chính mã RN chạy trên HealthKit giả (`HealthGoldenTests`).
public enum HealthData {
  public static let appleSource = "apple_health"
  /// Khoảng thức dài hơn chừng này tách hai giấc (`NIGHT_GAP_MIN`).
  public static let nightGapMinutes = 90
  /// Số ngày lịch sử bước điền lại (`STEP_HISTORY_DAYS`).
  public static let stepHistoryDays = 14

  // MARK: - Giấc ngủ

  /// Một mẫu `HKCategoryTypeIdentifierSleepAnalysis`.
  public struct SleepSample: Sendable, Hashable {
    public let start: EpochMillis
    public let end: EpochMillis
    /// `HKCategoryValueSleepAnalysis`: 0 inBed, 1 asleepUnspecified, 2 awake,
    /// 3 core, 4 deep, 5 REM.
    public let value: Int
    /// Metadata `HKExternalUUID` (mẫu app tự ghi mang `ascnd:`).
    public let externalUUID: String?
    public init(start: EpochMillis, end: EpochMillis, value: Int, externalUUID: String?) {
      self.start = start
      self.end = end
      self.value = value
      self.externalUUID = externalUUID
    }
  }

  public struct Sleep: Sendable, Hashable {
    public let externalId: String
    public let bedtime: String
    public let waketime: String
    public let asleepMin: Int
    public let deepMin: Int?
    public let lightMin: Int?
    public let remMin: Int?
  }

  /// `getLastNightSleep`: bỏ mẫu app tự ghi; giấc CUỐI = chuỗi mẫu liền nhau
  /// (khoảng thức ≤ 90') tính ngược từ mẫu muộn nhất; inBed / awake không
  /// tính; giai đoạn chỉ có khi đồng hồ có ghi giai đoạn.
  public static func lastNight(_ samples: [SleepSample]) -> Sleep? {
    let foreign = samples.filter { !($0.externalUUID?.hasPrefix("ascnd:") ?? false) }
    guard !foreign.isEmpty else { return nil }
    // `sort` ổn định của JS theo thời điểm bắt đầu.
    let sorted = foreign.enumerated()
      .sorted { $0.element.start != $1.element.start ? $0.element.start < $1.element.start : $0.offset < $1.offset }
      .map(\.element)
    var start = sorted.count - 1
    while start > 0 {
      let gap = sorted[start].start.millis - sorted[start - 1].end.millis
      if gap > Int64(nightGapMinutes) * 60_000 { break }
      start -= 1
    }
    let night = sorted[start...]
    var asleep = 0.0, deep = 0.0, light = 0.0, rem = 0.0
    for s in night {
      let m = Double(s.end.millis - s.start.millis) / 60_000
      if s.value == 2 || s.value == 0 { continue }
      asleep += m
      if s.value == 4 {
        deep += m
      } else if s.value == 3 {
        light += m
      } else if s.value == 5 {
        rem += m
      }
    }
    if asleep < 1 { return nil }
    let bedtime = WorkoutSessionRecord.iso8601(night.first!.start)
    let staged = deep + light + rem > 0
    return Sleep(
      externalId: "sleep:\(bedtime)", bedtime: bedtime, waketime: WorkoutSessionRecord.iso8601(night.last!.end),
      asleepMin: Int(JS.round(asleep)), deepMin: staged ? Int(JS.round(deep)) : nil,
      lightMin: staged ? Int(JS.round(light)) : nil, remMin: staged ? Int(JS.round(rem)) : nil)
  }

  // MARK: - Sinh trắc

  /// Mẫu mới nhất (trong 7 ngày) của một loại.
  public struct Reading: Sendable, Hashable {
    public let value: Double
    public let at: EpochMillis
    public let uuid: String
    public init(value: Double, at: EpochMillis, uuid: String) {
      self.value = value
      self.at = at
      self.uuid = uuid
    }
  }

  public struct Biometrics: Sendable, Hashable {
    public let hrBpm: Int?
    public let hrvSdnnMs: Int?
    public let spo2Pct: Int?
    public let respRateRpm: Int?
    public let dateTime: String
    public let externalId: String?
  }

  /// SpO₂ HealthKit trả dạng phân số (0.97) hoặc phần trăm (97) tuỳ nguồn.
  public static func asPercent(_ v: Double) -> Int? {
    if v > 1 && v <= 100 { return Int(JS.round(v)) }
    if v > 0 && v <= 1 { return Int(JS.round(v * 100)) }
    return nil
  }

  /// `getLatestBiometrics`: thời điểm và `external_id` lấy từ mẫu MỚI NHẤT
  /// trong bốn loại (bằng nhau thì mẫu đứng trước).
  public static func latestBiometrics(hr: Reading?, hrv: Reading?, spo2: Reading?, resp: Reading?) -> Biometrics? {
    let readings = [hr, hrv, spo2, resp].compactMap { $0 }
    guard var newest = readings.first else { return nil }
    for r in readings.dropFirst() where r.at > newest.at { newest = r }
    return Biometrics(
      hrBpm: hr.map { Int(JS.round($0.value)) }, hrvSdnnMs: hrv.map { Int(JS.round($0.value)) },
      spo2Pct: spo2.flatMap { asPercent($0.value) }, respRateRpm: resp.map { Int(JS.round($0.value)) },
      dateTime: WorkoutSessionRecord.iso8601(newest.at), externalId: newest.uuid.isEmpty ? nil : "hk:\(newest.uuid)")
  }

  // MARK: - Buổi tập từ đồng hồ

  public struct WorkoutSample: Sendable, Hashable {
    public let uuid: String
    public let start: EpochMillis
    public let durationSec: Double?
    public let kcal: Double?
    public let activityType: Int
    public let externalUUID: String?
    public init(uuid: String, start: EpochMillis, durationSec: Double?, kcal: Double?, activityType: Int, externalUUID: String?) {
      self.uuid = uuid
      self.start = start
      self.durationSec = durationSec
      self.kcal = kcal
      self.activityType = activityType
      self.externalUUID = externalUUID
    }
  }

  public struct Workout: Sendable, Hashable {
    public let externalId: String
    public let dateTime: String
    public let minutes: Int
    public let kcal: Int?
    public let activityType: Int
  }

  /// `getRecentWorkouts`: bỏ buổi app tự ghi, phút làm tròn, < 5 phút bỏ.
  public static func workouts(_ samples: [WorkoutSample]) -> [Workout] {
    samples
      .filter { !($0.externalUUID?.hasPrefix("ascnd:") ?? false) }
      .map {
        Workout(
          externalId: "hk:\($0.uuid)", dateTime: WorkoutSessionRecord.iso8601($0.start),
          minutes: Int(JS.round(($0.durationSec ?? 0) / 60)), kcal: $0.kcal.map { Int(JS.round($0)) },
          activityType: $0.activityType)
      }
      .filter { $0.minutes >= 5 }
  }

  /// Tên hoạt động theo ngôn ngữ (`ACTIVITY_NAMES`); mã lạ → "Buổi tập".
  public static func activityName(_ type: Int, lang: String) -> String {
    let names: [Int: (vi: String, en: String, es: String)] = [
      13: ("Đạp xe", "Cycling", "Ciclismo"),
      16: ("Máy elliptical", "Elliptical", "Elíptica"),
      20: ("Tập chức năng", "Functional strength", "Fuerza funcional"),
      24: ("Đi bộ đường dài", "Hiking", "Senderismo"),
      35: ("Chèo thuyền", "Rowing", "Remo"),
      37: ("Chạy bộ", "Running", "Carrera"),
      44: ("Leo cầu thang", "Stair climbing", "Subir escaleras"),
      46: ("Bơi", "Swimming", "Natación"),
      50: ("Tập tạ", "Strength training", "Entrenamiento de fuerza"),
      52: ("Đi bộ", "Walking", "Caminata"),
      59: ("Tập core", "Core training", "Entrenamiento de core"),
      63: ("HIIT", "HIIT", "HIIT"),
      3000: ("Buổi tập", "Workout", "Entrenamiento"),
    ]
    let hit = names[type] ?? names[3000]!
    switch lang {
    case "vi": return hit.vi
    case "es": return hit.es
    default: return hit.en
    }
  }

  // MARK: - Tổng hôm nay, bước theo ngày, ngày bị chạm

  /// Tổng hôm nay (`todayTotal`): làm tròn; không có số → `nil`.
  public static func total(_ sum: Double?) -> Int? { sum.map { Int(JS.round($0)) } }

  public struct StepBucket: Sendable, Hashable {
    public let start: EpochMillis
    public let sum: Double?
    public init(start: EpochMillis, sum: Double?) {
      self.start = start
      self.sum = sum
    }
  }

  /// `dailyStepsFrom`: một số mỗi ngày địa phương TRƯỚC hôm nay (hôm nay đi
  /// đường khác), làm tròn, theo ngày tăng dần.
  public static func dailySteps(_ buckets: [StepBucket], today: LocalDate, in tz: TimeZone) -> [(date: LocalDate, steps: Int)] {
    var out: [LocalDate: Int] = [:]
    for b in buckets {
      guard let q = b.sum, q.isFinite else { continue }
      let date = LocalDate(b.start, in: tz)
      if date >= today { continue }
      out[date] = Int(JS.round(q))
    }
    return out.keys.sorted().map { ($0, out[$0]!) }
  }

  /// `touchedDays`: ngày `daily_logs` phải dựng lại sau một lượt đồng bộ.
  public static func touchedDays(bio: Bool, sleep: Sleep?, workouts: [Workout], today: LocalDate, in tz: TimeZone) -> [LocalDate] {
    var days = Set<LocalDate>()
    if bio { days.insert(today) }
    if let w = sleep.flatMap({ EpochMillis(iso8601: $0.waketime) }) { days.insert(LocalDate(w, in: tz)) }
    for w in workouts {
      if let t = EpochMillis(iso8601: w.dateTime) { days.insert(LocalDate(t, in: tz)) }
    }
    return days.sorted()
  }

  // MARK: - Cửa sổ truy vấn HealthKit

  public struct Windows: Sendable, Hashable {
    /// Giấc ngủ: 36 giờ qua tới bây giờ.
    public let sleepSince: EpochMillis
    /// Sinh trắc, buổi tập: 7 ngày qua.
    public let weekAgo: EpochMillis
    /// Tổng hôm nay: từ nửa đêm địa phương.
    public let todayStart: EpochMillis
    /// Lịch sử bước: neo nửa đêm hôm nay, bắt đầu 13 ngày trước đó.
    public let stepHistoryStart: EpochMillis
  }

  public static func windows(now: EpochMillis, in tz: TimeZone) -> Windows {
    let today = LocalDate(now, in: tz)
    return Windows(
      sleepSince: now - 36 * 3_600_000, weekAgo: now - 7 * 86_400_000, todayStart: DailyLog.midnight(today, tz),
      stepHistoryStart: DailyLog.midnight(today.adding(days: -(stepHistoryDays - 1)), tz))
  }
}
