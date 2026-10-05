public import Foundation

/// Giờ nhắc suy từ điều app đã biết — `lib/reminder-timing.ts` @ fac9ac2.
///
/// RN behavior (giữ nguyên):
/// - đi ngủ: giờ ngủ trong hồ sơ trừ 30 phút (quấn qua nửa đêm: 00:15 → 23:45);
/// - cân: giờ dậy + 15 phút; ghi giấc ngủ: giờ dậy + 15 + 45 phút;
/// - tập: giờ quen GHI buổi tập (đã học) trừ 60 phút;
/// - thực phẩm bổ sung / bữa ăn / chỉ số cơ thể: KHÔNG đoán (`nil`) — một giờ
///   bịa khoác áo "đã học" tệ hơn hằng số nó thay;
/// - chỉ đáng gợi ý khi lệch ≥ 20 phút, đo QUANH đồng hồ (23:50 ↔ 00:05 là 15).
public enum ReminderTiming {
  public static let windDownMin = 30
  public static let afterWakeMin = 15
  public static let workoutLeadMin = 60
  public static let sleepLogLagMin = 45
  public static let worthOfferingMin = 20

  /// Điều app biết. Giờ ngủ / dậy chỉ tính khi người dùng TỰ lưu trong hồ sơ
  /// (`sleep_target_*_set`) — giá trị mặc định của cột không phải bằng chứng.
  public struct Known: Sendable, Hashable {
    public var bedtime: String?
    public var waketime: String?
    public var workoutHour: Double?
    public init(bedtime: String? = nil, waketime: String? = nil, workoutHour: Double? = nil) {
      self.bedtime = bedtime
      self.waketime = waketime
      self.workoutHour = workoutHour
    }
  }

  /// `HH:MM` / `HH:MM:SS` → phút từ nửa đêm (`/^(\d{1,2}):(\d{2})(?::\d{2})?$/`
  /// sau `trim`), hoặc `nil`.
  public static func parseClock(_ value: String?) -> Int? {
    guard let t = value?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
    let parts = t.split(separator: ":", omittingEmptySubsequences: false)
    let digits = { (s: Substring) in !s.isEmpty && s.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 } }
    guard parts.count == 2 || parts.count == 3, parts.allSatisfy(digits),
      (1...2).contains(parts[0].count), parts[1].count == 2, parts.count == 2 || parts[2].count == 2,
      let h = Int(parts[0]), let m = Int(parts[1]), (0...23).contains(h), (0...59).contains(m)
    else { return nil }
    return h * 60 + m
  }

  /// Phút → giờ, quấn quanh ngày thay vì âm.
  public static func toClock(_ minutes: Double) -> ReminderClock {
    let r = FitnessCalc.jsRound(minutes)
    let wrapped = ((r % 1440) + 1440) % 1440
    return ReminderClock(hour: wrapped / 60, minute: wrapped % 60)
  }

  /// `suggestedTime`. `nil` = app thật sự không biết — dòng ấy giữ giờ của nó
  /// và không nói gì.
  public static func suggested(_ key: ReminderKey, _ known: Known) -> ReminderClock? {
    switch key {
    case .bedtime:
      return parseClock(known.bedtime).map { toClock(Double($0 - windDownMin)) }
    case .weighIn:
      return parseClock(known.waketime).map { toClock(Double($0 + afterWakeMin)) }
    case .workout:
      guard let h = known.workoutHour, h.isFinite else { return nil }
      return toClock(h * 60 - Double(workoutLeadMin))
    case .sleepLog:
      return parseClock(known.waketime).map { toClock(Double($0 + afterWakeMin + sleepLogLagMin)) }
    case .supplements, .meal, .biometrics, .water, .challengeClaim:
      return nil
    }
  }

  /// `worthOffering`: lệch đủ xa để đáng hiện, đo quanh đồng hồ.
  public static func worthOffering(_ current: ReminderClock, _ suggested: ReminderClock) -> Bool {
    let raw = abs(current.minutes - suggested.minutes)
    return min(raw, 1440 - raw) >= worthOfferingMin
  }

  /// Lời mời đổi giờ của một dòng ở màn Nhắc nhở: chỉ khi lời nhắc đang BẬT,
  /// có gợi ý, và lệch đáng kể (`offer` ở `app/reminders.tsx`).
  public static func offer(_ key: ReminderKey, prefs: ReminderPrefs, known: Known) -> ReminderClock? {
    guard ReminderKey.timed.contains(key) else { return nil }
    let row = prefs[timed: key]
    guard row.enabled, let s = suggested(key, known), worthOffering(row.clock, s) else { return nil }
    return s
  }

  /// `7:05`.
  public static func format(_ c: ReminderClock) -> String {
    "\(c.hour):\(c.minute < 10 ? "0" : "")\(c.minute)"
  }

  /// Giờ tự áp MỘT LẦN (P1-12, `use-reminders.ts`): chỉ khi người dùng đã tự
  /// lưu giờ ngủ / giờ dậy, và chỉ cho lời nhắc còn ở ĐÚNG giờ mặc định gõ
  /// tay (22:30 / 07:00) — giờ người dùng tự chọn không bao giờ bị dời. Như
  /// RN: chỉ `bedtime` và `weighIn`. Trả về `nil` nếu không có gì đổi.
  public static func smartDefaults(_ prefs: ReminderPrefs, bedtime: String?, waketime: String?) -> ReminderPrefs? {
    let known = Known(bedtime: bedtime, waketime: waketime)
    var next = prefs
    var moved = false
    if bedtime != nil, prefs.bedtime.hour == 22, prefs.bedtime.minute == 30,
      let t = suggested(.bedtime, known), t != ReminderClock(hour: 22, minute: 30)
    {
      next.bedtime.hour = t.hour
      next.bedtime.minute = t.minute
      moved = true
    }
    if waketime != nil, prefs.weighIn.hour == 7, prefs.weighIn.minute == 0,
      let t = suggested(.weighIn, known), t != ReminderClock(hour: 7, minute: 0)
    {
      next.weighIn.hour = t.hour
      next.weighIn.minute = t.minute
      moved = true
    }
    return moved ? next : nil
  }
}
