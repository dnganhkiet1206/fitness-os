public import Foundation

/// Một set như được ghi vào `workout_sessions.sets`.
public struct SessionSet: Sendable, Hashable {
  public let exerciseId: String
  public let exerciseName: String
  public let weightKg: Double
  public let reps: Int
  public let rpe: Int
  public let warmup: Bool
  public let durationSec: Int?

  public init(exerciseId: String, exerciseName: String, weightKg: Double, reps: Int, rpe: Int, warmup: Bool = false, durationSec: Int? = nil) {
    self.exerciseId = exerciseId
    self.exerciseName = exerciseName
    self.weightKg = weightKg
    self.reps = reps
    self.rpe = rpe
    self.warmup = warmup
    self.durationSec = durationSec
  }
}

/// Một buổi tập đã chốt — đúng một hàng `workout_sessions`.
///
/// Bản native ghi MỌI buổi qua outbox (ADR-0003), nên hình dạng là của đường
/// hàng đợi baseline (`day-plan.tsx` nhánh offline + `offline-write.ts`
/// `case 'workout'`): `id` do client sinh (idempotency key, server bỏ trùng)
/// và `date_time` luôn có mặt. Các luật làm sạch là của `useLogWorkoutSession`
/// (`use-fitness-data.ts:308`) — "một đường ghi duy nhất" (WS-9).
public struct WorkoutSessionRecord: Sendable, Hashable {
  public let id: String
  public let userId: String
  public let dateTime: EpochMillis
  public let templateId: String?
  public let templateName: String
  public let sessionRpe: Int
  public let sets: [SessionSet]
  /// Kỷ lục là phép so với lịch sử. Không có lịch sử trong tay (mất mạng) thì
  /// KHÔNG nhận kỷ lục — app không ăn mừng điều nó không biết (WS-10).
  public let prDetected: Bool

  /// `nil` khi không có set nào — baseline từ chối ("No sets").
  /// - Parameter sessionRpeFloor: `session_rpe` đã ghi của buổi. Bản ghi lại
  ///   sau khi gỡ set giữ nguyên nó — gỡ một set không đổi cảm nhận của cả buổi
  ///   (`use-fitness-data.ts:756`).
  public init?(
    id: String, userId: String, dateTime: EpochMillis, templateId: String?, templateName: String,
    sets: [SessionSet], prDetected: Bool = false, sessionRpeFloor: Int? = nil
  ) {
    guard let computed = sets.map(\.rpe).max() else { return nil }
    let rpe = max(computed, sessionRpeFloor ?? computed)
    self.id = id
    self.userId = userId
    self.dateTime = dateTime
    self.templateId = templateId
    self.templateName = templateName
    // "A session is remembered by its hardest part" — RPE buổi = RPE set cao nhất.
    self.sessionRpe = rpe
    self.sets = sets
    self.prDetected = prDetected
  }

  /// Σ kg × reps, BỎ set khởi động (WS-5), làm tròn số nguyên như `Math.round`.
  public var volumeLoad: Int {
    let total = sets.reduce(0.0) { $1.warmup ? $0 : $0 + $1.weightKg * Double($1.reps) }
    return Int((total + 0.5).rounded(.down))
  }

  /// Hàng gửi lên `workout_sessions` (upsert theo `id`, bỏ trùng).
  public var row: JSONValue {
    let trimmedTemplate = templateName.trimmingCharacters(in: .whitespacesAndNewlines)
    var o: [String: JSONValue] = [
      "id": .string(id),
      "user_id": .string(userId),
      "date_time": .string(Self.iso8601(dateTime)),
      "template_name": .string(trimmedTemplate.isEmpty ? "Workout" : trimmedTemplate),
      "session_rpe": .number(Double(sessionRpe)),
      "volume_load": .number(Double(volumeLoad)),
      "pr_detected": .bool(prDetected),
      "sets": .array(sets.enumerated().map { i, s in Self.setRow(s, index: i + 1) }),
    ]
    o["template_id"] = templateId.map(JSONValue.string) ?? .null
    return .object(o)
  }

  static func setRow(_ s: SessionSet, index: Int) -> JSONValue {
    let name = s.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
    var o: [String: JSONValue] = [
      "exerciseId": .string(s.exerciseId),
      "exerciseName": .string(name.isEmpty ? "Exercise" : name),
      "setIndex": .number(Double(index)),
      // Hai chữ số, để bước 2,5 không tới nơi thành 82.50000000000001.
      "weight": .number(WorkoutMath.round2(s.weightKg)),
      "reps": .number(Double(s.reps)),
      "rpe": (1...10).contains(s.rpe) ? .number(Double(s.rpe)) : .null,
    ]
    if s.warmup { o["warmup"] = .bool(true) }
    if let d = s.durationSec, d > 0 { o["durationSec"] = .number(Double(d)) }
    return .object(o)
  }

  /// Hàng outbox xoá buổi: server chỉ dùng `id` (+ `user_id` của hàng). Thời
  /// điểm đi kèm để màn Today mở lại app (lệnh xoá chưa gửi) biết ngày nào
  /// thôi "đã tập" (#429) — server bỏ qua trường thừa.
  public static func deletePayload(id: String, at: EpochMillis) -> JSONValue {
    .object(["id": .string(id), "date_time": .string(iso8601(at))])
  }

  /// `Date.prototype.toISOString`: UTC, mili giây, hậu tố `Z` — không qua
  /// formatter phụ thuộc locale.
  public static func iso8601(_ t: EpochMillis) -> String {
    let dayMs: Int64 = 86_400_000
    var days = t.millis / dayMs
    var rem = t.millis % dayMs
    if rem < 0 {
      rem += dayMs
      days -= 1
    }
    let d = LocalDate(daysSinceEpoch: Int(days))
    func pad(_ n: Int64, _ w: Int) -> String {
      let s = String(n)
      return String(repeating: "0", count: max(0, w - s.count)) + s
    }
    let h = rem / 3_600_000, m = rem / 60_000 % 60, s = rem / 1000 % 60, ms = rem % 1000
    return "\(d)T\(pad(h, 2)):\(pad(m, 2)):\(pad(s, 2)).\(pad(ms, 3))Z"
  }

  /// Thời điểm đóng dấu cho buổi tập của ngày `date`:
  /// - hôm nay → đúng lúc này;
  /// - ngày khác (chốt bù hôm qua) → 12:00 TRƯA giờ địa phương của ngày ấy.
  ///   Nửa đêm là ranh giới app đã vấp hai lần; trưa xa nó nhất về cả hai phía,
  ///   nên không lệch múi / giờ DST nào đẩy được buổi sang ngày bên cạnh.
  public static func stamp(for date: LocalDate, today: LocalDate, now: EpochMillis, timeZone: TimeZone) -> EpochMillis {
    guard date != today else { return now }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let comps = DateComponents(year: date.year, month: date.month, day: date.day, hour: 12)
    guard let noon = cal.date(from: comps) else { return now }
    return EpochMillis(noon)
  }
}

extension WorkoutDay {
  /// Các set của buổi khi chốt từ màn ngày tập: CHỈ hàng đã tick, đúng thứ tự
  /// màn hình; RPE là ghi đè trong ngày, không thì RPE kế hoạch
  /// (`day-plan.tsx` `finish`). Hàng kế hoạch là việc thật, không phải khởi
  /// động — baseline cố ý không có cờ warm-up ở màn này.
  public static func sessionSets(_ rows: [PlannedSet], _ progress: DayProgress, toKg: (Double) -> Double = { $0 }) -> [SessionSet] {
    rows.filter { progress.done[$0.key] == true }.map { r in
      let p = performed(r, progress, toKg: toKg)
      return SessionSet(
        exerciseId: r.exerciseId ?? "", exerciseName: r.exerciseName, weightKg: p.weightKg,
        reps: p.reps, rpe: progress.rpe[r.key] ?? r.plannedRpe, durationSec: p.durationSec)
    }
  }
}
