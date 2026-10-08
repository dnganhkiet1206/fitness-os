public import Foundation

/// Một lượt đồng bộ Apple Health → server — `useSyncMutation` (`use-health-sync.ts`)
/// và `writeHealthSync` (`health-sync-write.ts`) của RN, cùng bảng, cùng cột,
/// cùng khoá xung đột, cùng thứ tự.
///
/// - Sinh trắc mới nhất → `biometric_samples` (khoá `user_id,external_id`).
/// - Giấc ngủ đêm qua → `sleep_logs`, TRỪ khi đã có giấc ghi tay trong ±12 giờ
///   quanh giờ đi ngủ (ghi tay thắng).
/// - Buổi tập từ đồng hồ → `workout_sessions` (sets rỗng, tải 0, tên "Chạy bộ ·
///   32′ · 280 kcal"), TRỪ buổi trong ±2 giờ của một buổi ghi tay.
/// - Bước / kcal / phút hôm nay → `daily_logs` hôm nay; lịch sử bước → các
///   ngày trước; rồi dựng lại MỌI ngày bị chạm (`recomputeDailyLog`).
///
/// Lỗi ở ba bước đầu dừng lượt (như RN `throw`); phần `daily_logs` thì gom lỗi
/// từng phần rồi báo một lần ("đồng bộ chưa trọn"), không bỏ dở phần còn lại.
public enum HealthSync {
  /// Những gì đã đọc từ HealthKit cho một lượt.
  public struct Snapshot: Sendable {
    public var bio: HealthData.Biometrics?
    public var steps: Int?
    public var activeKcal: Int?
    public var exerciseMinutes: Int?
    public var sleep: HealthData.Sleep?
    public var workouts: [HealthData.Workout]
    public var stepDays: [(date: LocalDate, steps: Int)]

    public init(
      bio: HealthData.Biometrics?, steps: Int?, activeKcal: Int?, exerciseMinutes: Int?, sleep: HealthData.Sleep?,
      workouts: [HealthData.Workout], stepDays: [(date: LocalDate, steps: Int)]
    ) {
      self.bio = bio
      self.steps = steps
      self.activeKcal = activeKcal
      self.exerciseMinutes = exerciseMinutes
      self.sleep = sleep
      self.workouts = workouts
      self.stepDays = stepDays
    }

    /// Không có gì cả: thường là chưa cho quyền đọc, hoặc app Sức khoẻ trống.
    public var isEmpty: Bool {
      bio == nil && steps == nil && activeKcal == nil && exerciseMinutes == nil && sleep == nil && workouts.isEmpty
        && stepDays.isEmpty
    }
  }

  public enum Failure: Error, Sendable, Hashable {
    /// RN: "No health data found — open the Health app to confirm data exists".
    case noData
    /// Một lệnh đọc / ghi bắt buộc hỏng: lượt dừng.
    case write(String)
    /// `daily_logs` chỉ ghi được một phần (`nCxHealthSyncIncomplete`).
    case incomplete([String])
  }

  static let hour: Int64 = 3_600_000

  /// Tên buổi tập từ đồng hồ: `"<hoạt động> · <phút>′[ · <kcal> kcal]"`.
  public static func workoutTitle(_ w: HealthData.Workout, lang: String) -> String {
    let kcal = w.kcal.flatMap { $0 != 0 ? " · \($0) kcal" : nil } ?? ""
    return "\(HealthData.activityName(w.activityType, lang: lang)) · \(w.minutes)′\(kcal)"
  }

  public static func run(
    _ s: Snapshot, userId: String, lang: String, store: any RowStore, now: EpochMillis, in tz: TimeZone
  ) async throws(Failure) {
    if s.isEmpty { throw .noData }
    let me: JSONValue = .string(userId)
    func iso(_ t: EpochMillis) -> JSONValue { .string(WorkoutSessionRecord.iso8601(t)) }
    func int(_ v: Int?) -> JSONValue { v.map { .number(Double($0)) } ?? .null }

    do throws(RowStoreError) {
      if let bio = s.bio {
        try await store.upsert(
          "biometric_samples",
          [[
            "user_id": me, "external_id": bio.externalId.map(JSONValue.string) ?? .null, "hr_bpm": int(bio.hrBpm),
            "hrv_sdnn_ms": int(bio.hrvSdnnMs), "spo2_pct": int(bio.spo2Pct), "resp_rate_rpm": int(bio.respRateRpm),
            "source": .string(HealthData.appleSource), "date_time": .string(bio.dateTime), "confidence": .number(1),
          ]], onConflict: "user_id,external_id")
      }

      if let sleep = s.sleep, let bed = EpochMillis(iso8601: sleep.bedtime) {
        let manual = try await store.select(
          RowQuery(
            table: "sleep_logs", columns: "id",
            filters: [
              .eq("user_id", me), .eq("source", .string("manual")), .gte("bedtime", iso(bed - 12 * hour)),
              .lte("bedtime", iso(bed + 12 * hour)),
            ], limit: 1))
        if manual.isEmpty {
          try await store.upsert(
            "sleep_logs",
            [[
              "user_id": me, "bedtime": .string(sleep.bedtime), "waketime": .string(sleep.waketime),
              "asleep_min": int(sleep.asleepMin), "deep_min": int(sleep.deepMin), "light_min": int(sleep.lightMin),
              "rem_min": int(sleep.remMin), "source": .string(HealthData.appleSource), "external_id": .string(sleep.externalId),
            ]], onConflict: "user_id,external_id")
        }
      }

      let times = s.workouts.compactMap { EpochMillis(iso8601: $0.dateTime) }
      if let first = times.min(), let last = times.max() {
        let manuals = try await store.select(
          RowQuery(
            table: "workout_sessions", columns: "date_time",
            filters: [
              .eq("user_id", me), .eq("source", .string("manual")), .gte("date_time", iso(first - 2 * hour)),
              .lte("date_time", iso(last + 2 * hour)),
            ]))
        let manualTimes = manuals.compactMap { $0["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) } }
        let fresh = s.workouts.filter { w in
          guard let t = EpochMillis(iso8601: w.dateTime) else { return true }
          return !manualTimes.contains { abs($0.millis - t.millis) <= 2 * hour }
        }
        if !fresh.isEmpty {
          try await store.upsert(
            "workout_sessions",
            fresh.map {
              [
                "user_id": me, "date_time": .string($0.dateTime), "sets": .array([]), "volume_load": .number(0),
                "template_name": .string(workoutTitle($0, lang: lang)), "source": .string(HealthData.appleSource),
                "external_id": .string($0.externalId),
              ]
            }, onConflict: "user_id,external_id")
        }
      }
    } catch {
      throw .write(error.message)
    }

    // `writeHealthSync`: phần `daily_logs`, gom lỗi từng phần.
    let today = LocalDate(now, in: tz)
    var failures: [String] = []
    var measured: [String: JSONValue] = [:]
    if let v = s.steps { measured["steps"] = int(v) }
    if let v = s.activeKcal { measured["active_kcal"] = int(v) }
    if let v = s.exerciseMinutes { measured["active_minutes"] = int(v) }
    if !measured.isEmpty {
      var row = measured
      row["user_id"] = me
      row["date"] = .string(today.description)
      do {
        try await store.upsert("daily_logs", [row], onConflict: "user_id,date")
      } catch {
        failures.append("nCxHealthSyncPartToday")
      }
    }
    if !s.stepDays.isEmpty {
      do {
        try await store.upsert(
          "daily_logs",
          s.stepDays.map { ["user_id": me, "date": .string($0.date.description), "steps": int($0.steps)] },
          onConflict: "user_id,date")
      } catch {
        failures.append("nCxHealthSyncPartSteps")
      }
    }
    for day in HealthData.touchedDays(bio: s.bio != nil, sleep: s.sleep, workouts: s.workouts, today: today, in: tz) {
      do {
        try await DailyLog.recompute(userId: userId, date: day, store: store, now: now, in: tz)
      } catch {
        failures.append("nCxHealthSyncPartRebuild:\(day)")
      }
    }
    if !failures.isEmpty { throw .incomplete(failures) }
  }

  /// Tự đồng bộ khi app về tiền cảnh: chỉ khi đã hỏi quyền xong, và cách lần
  /// trước ít nhất 15 phút (`AUTO_SYNC_INTERVAL_MS`). Mốc được ghi TRƯỚC khi
  /// chạy, như RN — lượt hỏng không bị thử lại dồn dập.
  public static let autoSyncIntervalMillis: Int64 = 15 * 60_000
  public static func shouldAutoSync(asked: Bool, lastSync: EpochMillis?, now: EpochMillis) -> Bool {
    asked && (lastSync.map { now.millis - $0.millis >= autoSyncIntervalMillis } ?? true)
  }
}

extension HealthSync {
  /// Khoảng thời gian ghi ngược một buổi ghi tay vào Apple Health
  /// (`useLogWorkout` `onSuccess`): tổng giây các set có giờ; không có thì 45
  /// phút — buổi đã diễn ra, ghi với khoảng ước lượng hơn là không ghi.
  public static func manualWorkoutInterval(payload: JSONValue, end: EpochMillis) -> (start: EpochMillis, end: EpochMillis) {
    var total = 0.0
    if case .array(let sets)? = payload["sets"] {
      for s in sets {
        let d = JS.number(s["durationSec"])
        if d > 0 { total += d }
      }
    }
    let seconds = total > 0 ? total : 45 * 60
    return (end - Int64(seconds * 1000), end)
  }
}
