public import Foundation

/// Nhắc nhở (#427) — `lib/reminder-plan.ts`, `lib/notifications.ts`
/// (`DEFAULT_REMINDERS`), `hooks/use-reminders.ts` (`merge`) @ fac9ac2.
///
/// RN behavior (giữ nguyên):
/// - chín khoá; tám khoá "việc hằng ngày" mặc định TẮT (một khoá mới không được
///   tự ý thêm thông báo vào máy của ai), `challengeClaim` mặc định BẬT (nó chỉ
///   bắn khi một phần thưởng sắp mất thật);
/// - không phải chuông lặp mỗi ngày mà là các lần MỘT LẦN có ngày giờ cho 7 ngày
///   tới, dựng lại từ dữ liệu thật — iOS không chạy mã nào của app lúc bắn, nên
///   lời nhắc "có điều kiện" chỉ có thể là lời nhắc không được đặt;
/// - hôm nay đã xong thì hôm nay im (các ngày sau vẫn đặt); `bedtime` không
///   bao giờ bị bỏ; ngày nghỉ của lịch tập không có lời nhắc tập, lịch CHƯA
///   ĐỌC (`nil`) thì không được làm câm lời nhắc;
/// - thời điểm đã qua không bao giờ đặt; sắp theo giờ rồi cắt ở 64 (trần yêu
///   cầu chờ của iOS) — giữ những cái sớm nhất.
public enum ReminderKey: String, Sendable, Hashable, Codable, CaseIterable {
  case water, supplements, bedtime, weighIn, workout, meal, biometrics, sleepLog, challengeClaim

  /// `TimedReminderKey`: mọi khoá trừ `water` (khoảng lặp) và `challengeClaim`
  /// (một lần theo hạn nhận).
  public static let timed: [ReminderKey] = [.supplements, .bedtime, .weighIn, .workout, .meal, .biometrics, .sleepLog]
}

/// Giờ trong ngày.
public struct ReminderClock: Sendable, Hashable, Codable {
  public var hour: Int
  public var minute: Int
  public init(hour: Int, minute: Int) {
    self.hour = hour
    self.minute = minute
  }
  var minutes: Int { hour * 60 + minute }
}

public struct ReminderPrefs: Sendable, Hashable {
  public struct Timed: Sendable, Hashable {
    public var enabled: Bool
    public var hour: Int
    public var minute: Int
    public init(enabled: Bool, hour: Int, minute: Int) {
      self.enabled = enabled
      self.hour = hour
      self.minute = minute
    }
    public var clock: ReminderClock { ReminderClock(hour: hour, minute: minute) }
  }
  public struct Water: Sendable, Hashable {
    public var enabled: Bool
    public var everyHours: Double
    public init(enabled: Bool, everyHours: Double) {
      self.enabled = enabled
      self.everyHours = everyHours
    }
  }

  public var water: Water
  public var supplements: Timed
  public var bedtime: Timed
  public var weighIn: Timed
  public var workout: Timed
  public var meal: Timed
  public var biometrics: Timed
  public var sleepLog: Timed
  public var challengeClaim: Bool

  /// `DEFAULT_REMINDERS`. Giờ mặc định đến từ LÚC việc ấy làm được: bữa ăn
  /// 20:00 (cuối ngày, khi "chưa ghi bữa nào" còn sửa được), ghi giấc ngủ
  /// 08:00 (sau khi dậy), chỉ số cơ thể 07:30 (lệch nửa tiếng khỏi cân nặng).
  public static let defaults = ReminderPrefs(
    water: Water(enabled: false, everyHours: 2),
    supplements: Timed(enabled: false, hour: 9, minute: 0),
    bedtime: Timed(enabled: false, hour: 22, minute: 30),
    weighIn: Timed(enabled: false, hour: 7, minute: 0),
    workout: Timed(enabled: false, hour: 17, minute: 0),
    meal: Timed(enabled: false, hour: 20, minute: 0),
    biometrics: Timed(enabled: false, hour: 7, minute: 30),
    sleepLog: Timed(enabled: false, hour: 8, minute: 0),
    challengeClaim: true)

  public init(
    water: Water, supplements: Timed, bedtime: Timed, weighIn: Timed, workout: Timed, meal: Timed, biometrics: Timed,
    sleepLog: Timed, challengeClaim: Bool
  ) {
    self.water = water
    self.supplements = supplements
    self.bedtime = bedtime
    self.weighIn = weighIn
    self.workout = workout
    self.meal = meal
    self.biometrics = biometrics
    self.sleepLog = sleepLog
    self.challengeClaim = challengeClaim
  }

  /// Khoá có giờ. `water` / `challengeClaim` không có giờ — đọc chúng ở đây là
  /// lỗi lập trình, trả về mặc định của `supplements` thì giấu lỗi, nên dừng.
  public subscript(timed key: ReminderKey) -> Timed {
    get {
      switch key {
      case .supplements: supplements
      case .bedtime: bedtime
      case .weighIn: weighIn
      case .workout: workout
      case .meal: meal
      case .biometrics: biometrics
      case .sleepLog: sleepLog
      case .water, .challengeClaim: preconditionFailure("\(key) không có giờ")
      }
    }
    set {
      switch key {
      case .supplements: supplements = newValue
      case .bedtime: bedtime = newValue
      case .weighIn: weighIn = newValue
      case .workout: workout = newValue
      case .meal: meal = newValue
      case .biometrics: biometrics = newValue
      case .sleepLog: sleepLog = newValue
      case .water, .challengeClaim: preconditionFailure("\(key) không có giờ")
      }
    }
  }

  public func isEnabled(_ key: ReminderKey) -> Bool {
    switch key {
    case .water: water.enabled
    case .challengeClaim: challengeClaim
    default: self[timed: key].enabled
    }
  }

  public mutating func setEnabled(_ key: ReminderKey, _ on: Bool) {
    switch key {
    case .water: water.enabled = on
    case .challengeClaim: challengeClaim = on
    default: self[timed: key].enabled = on
    }
  }

  /// `Object.values(prefs).some((r) => r.enabled)` — gồm cả `challengeClaim`.
  public var anyEnabled: Bool { ReminderKey.allCases.contains(where: isEnabled) }
}

// MARK: - Lưu trữ (`ascnd_reminders`)

extension ReminderPrefs {
  /// Đọc giá trị đã lưu như `merge` của RN: mỗi khoá trộn lên mặc định của nó
  /// — bộ cũ thiếu `meal` / `challengeClaim`… thì khoá ấy là mặc định. Đây là
  /// chỗ di trú duy nhất. JSON hỏng = mặc định (`catch` của `hydratePrefs`).
  ///
  /// Khác RN (cứng hoá, không đổi hành vi nào UI tạo ra được): trường SAI KIỂU
  /// hoặc NGOÀI CẬN (giờ 25, phút 75, `enabled: "yes"`, khoảng nước âm / không
  /// hữu hạn) cũng như THIẾU — lấy mặc định của trường ấy. RN trộn nguyên văn,
  /// và `new Date(y, m, d, 25, 0)` lặng lẽ thành 01:00 hôm sau; khoảng `NaN`
  /// thì vòng nước dừng sau đúng một lần. Màn Nhắc nhở không bao giờ ghi ra
  /// những giá trị ấy — chỉ dữ liệu hỏng mới có.
  public static func decode(_ raw: String?) -> ReminderPrefs {
    guard let raw, let data = raw.data(using: .utf8),
      let json = try? JSONDecoder().decode(JSONValue.self, from: data), case .object(let o) = json
    else { return defaults }
    let d = defaults
    func timed(_ key: ReminderKey, _ base: Timed) -> Timed {
      guard case .object(let s)? = o[key.rawValue] else { return base }
      let hour = s["hour"]?.intValue.flatMap { (0...23).contains($0) ? $0 : nil }
      let minute = s["minute"]?.intValue.flatMap { (0...59).contains($0) ? $0 : nil }
      return Timed(enabled: s["enabled"]?.boolValue ?? base.enabled, hour: hour ?? base.hour, minute: minute ?? base.minute)
    }
    var water = d.water
    if case .object(let s)? = o[ReminderKey.water.rawValue] {
      water.enabled = s["enabled"]?.boolValue ?? water.enabled
      if let h = s["everyHours"]?.doubleValue, h.isFinite, h >= 0 { water.everyHours = h }
    }
    var claim = d.challengeClaim
    if case .object(let s)? = o[ReminderKey.challengeClaim.rawValue] { claim = s["enabled"]?.boolValue ?? claim }
    return ReminderPrefs(
      water: water, supplements: timed(.supplements, d.supplements), bedtime: timed(.bedtime, d.bedtime),
      weighIn: timed(.weighIn, d.weighIn), workout: timed(.workout, d.workout), meal: timed(.meal, d.meal),
      biometrics: timed(.biometrics, d.biometrics), sleepLog: timed(.sleepLog, d.sleepLog), challengeClaim: claim)
  }

  /// Cùng hình dạng RN ghi (`JSON.stringify(prefs)`), khoá sắp xếp — cùng một
  /// cài đặt luôn ra cùng một chuỗi.
  public func encoded() -> String {
    func t(_ x: Timed) -> JSONValue {
      .object(["enabled": .bool(x.enabled), "hour": .number(Double(x.hour)), "minute": .number(Double(x.minute))])
    }
    let json: JSONValue = .object([
      "water": .object(["enabled": .bool(water.enabled), "everyHours": .number(water.everyHours)]),
      "supplements": t(supplements), "bedtime": t(bedtime), "weighIn": t(weighIn), "workout": t(workout),
      "meal": t(meal), "biometrics": t(biometrics), "sleepLog": t(sleepLog),
      "challengeClaim": .object(["enabled": .bool(challengeClaim)]),
    ])
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return (try? encoder.encode(json)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }
}

// MARK: - Kế hoạch

/// Thử thách đã đạt mà chưa nhận (`pendingClaims` của `challenge-reminders`);
/// tiêu đề / nội dung do bên gọi dựng (bên ấy giữ i18n).
public struct PendingClaim: Sendable, Hashable {
  public let id: String
  public let title: String
  /// `YYYY-MM-DD` cuối cùng còn nhận được.
  public let claimBy: String
  public let rewardCoins: Int
  public let body: String
  public init(id: String, title: String, claimBy: String, rewardCoins: Int, body: String) {
    self.id = id
    self.title = title
    self.claimBy = claimBy
    self.rewardCoins = rewardCoins
    self.body = body
  }
}

/// Điều hôm nay đã biết (`ReminderContext`).
public struct ReminderContext: Sendable, Hashable {
  public var workedOutToday = false
  public var weighedToday = false
  /// Mọi thực phẩm bổ sung đã tick, hoặc không có gì phải uống.
  public var supplementsDone = false
  public var mealLoggedToday = false
  public var bioLoggedToday = false
  public var sleepLoggedToday = false
  public var waterDone = false
  /// Thứ trong tuần có buổi tập (thứ Hai = 0). `nil` = lịch CHƯA ĐỌC — không
  /// phải một tuần toàn ngày nghỉ.
  public var trainingDays: [Int]?
  public var pendingClaims: [PendingClaim] = []

  public init() {}

  /// Chưa biết gì: không việc nào xong, lịch chưa đọc, không thử thách nào.
  public static let unknown = ReminderContext()
}

public struct PlannedReminder: Sendable, Hashable {
  public let key: ReminderKey
  /// Thời điểm địa phương chính xác để bắn.
  public let at: Date
  /// Chữ riêng của mục (lời nhắc nhận thưởng gọi tên thử thách).
  public let title: String?
  public let body: String?
  /// Phần của mục trong chữ ký kế hoạch.
  let token: String
}

public enum ReminderPlan {
  /// Nước bắn đúng giờ chẵn trong ngày thức.
  public static let waterStartHour = 8
  public static let waterEndHour = 20
  /// Đặt trước bao xa — một tuần dùng bình thường không bao giờ thấy hụt.
  public static let horizonDays = 7
  /// Trần yêu cầu chờ của `UNUserNotificationCenter` cho một app.
  public static let maxPending = 64
  /// Lời nhắc nhận thưởng: 10:00 ngày cuối; đã qua thì nửa tiếng nữa.
  static let claimHour = 10
  static let lateClaimDelay: TimeInterval = 30 * 60

  /// `routineIndexOf`: thứ Hai = 0, khớp `routine_days.day_of_week`.
  public static func routineIndex(_ d: Date, calendar: Calendar) -> Int {
    (calendar.component(.weekday, from: d) + 5) % 7
  }

  /// `new Date(y, m, d + dayOffset, h, min)` — giờ địa phương, tràn ngày / giờ
  /// rơi vào khoảng đổi giờ mùa hè được chuẩn hoá như JS (golden New York).
  static func at(_ now: Date, _ dayOffset: Int, _ hour: Int, _ minute: Int, _ calendar: Calendar) -> Date {
    let c = calendar.dateComponents([.year, .month, .day], from: now)
    return local(c.year!, c.month!, c.day! + dayOffset, hour, minute, calendar)
  }

  static func local(_ y: Int, _ m: Int, _ d: Int, _ hour: Int, _ minute: Int, _ calendar: Calendar) -> Date {
    // Ngày 1 rồi cộng ngày: `date(from:)` không hứa chuẩn hoá ngày tràn
    // (`2026-13-40`) giống nhau trên mọi nền; `date(byAdding:)` thì có.
    var first = DateComponents()
    first.year = y
    first.month = 1
    first.day = 1
    first.hour = 12
    let jan1 = calendar.date(from: first)!
    let month = calendar.date(byAdding: .month, value: m - 1, to: jan1)!
    let day = calendar.date(byAdding: .day, value: d - 1, to: month)!
    var c = calendar.dateComponents([.year, .month, .day], from: day)
    c.hour = hour
    c.minute = minute
    c.second = 0
    // Giờ trong khoảng trống mùa xuân (02:30 không tồn tại): JS tiến lên đúng
    // độ dài khoảng trống (03:30); giờ lặp mùa thu (01:30 hai lần): JS lấy lần
    // ĐẦU. `nextDate` + `.nextTimePreservingSmallerComponents` / `.first`
    // nói đúng hai điều ấy thay vì phụ thuộc mặc định của `date(from:)`.
    let midnight = calendar.startOfDay(for: day)
    return calendar.nextDate(
      after: midnight.addingTimeInterval(-1), matching: DateComponents(hour: hour, minute: minute, second: 0),
      matchingPolicy: .nextTimePreservingSmallerComponents, repeatedTimePolicy: .first, direction: .forward)
      ?? calendar.date(from: c)!
  }

  /// `planReminders`: mọi lời nhắc đáng bắn từ `now` tới hết tầm, theo giờ.
  public static func plan(
    _ prefs: ReminderPrefs, _ ctx: ReminderContext, now: Date, calendar: Calendar
  ) -> [PlannedReminder] {
    var out: [PlannedReminder] = []
    func push(_ key: ReminderKey, _ when: Date) {
      if when > now { out.append(PlannedReminder(key: key, at: when, title: nil, body: nil, token: stamp(key, when))) }
    }
    for day in 0..<horizonDays {
      let isToday = day == 0
      let weekday = routineIndex(at(now, day, 12, 0, calendar), calendar: calendar)

      if prefs.water.enabled && !(isToday && ctx.waterDone) {
        let step = max(1, FitnessCalc.jsRound(prefs.water.everyHours))
        for h in stride(from: waterStartHour, through: waterEndHour, by: step) { push(.water, at(now, day, h, 0, calendar)) }
      }
      if prefs.supplements.enabled && !(isToday && ctx.supplementsDone) {
        push(.supplements, at(now, day, prefs.supplements.hour, prefs.supplements.minute, calendar))
      }
      // Không bao giờ bỏ: không có trạng thái nào làm việc đi ngủ thành thừa.
      if prefs.bedtime.enabled { push(.bedtime, at(now, day, prefs.bedtime.hour, prefs.bedtime.minute, calendar)) }
      if prefs.weighIn.enabled && !(isToday && ctx.weighedToday) {
        push(.weighIn, at(now, day, prefs.weighIn.hour, prefs.weighIn.minute, calendar))
      }
      if prefs.meal.enabled && !(isToday && ctx.mealLoggedToday) {
        push(.meal, at(now, day, prefs.meal.hour, prefs.meal.minute, calendar))
      }
      if prefs.biometrics.enabled && !(isToday && ctx.bioLoggedToday) {
        push(.biometrics, at(now, day, prefs.biometrics.hour, prefs.biometrics.minute, calendar))
      }
      // Ghi lại đêm qua XONG được; đi ngủ thì không — hai khoá, hai điều kiện.
      if prefs.sleepLog.enabled && !(isToday && ctx.sleepLoggedToday) {
        push(.sleepLog, at(now, day, prefs.sleepLog.hour, prefs.sleepLog.minute, calendar))
      }
      let trainsToday = ctx.trainingDays.map { $0.contains(weekday) } ?? true
      if prefs.workout.enabled && trainsToday && !(isToday && ctx.workedOutToday) {
        push(.workout, at(now, day, prefs.workout.hour, prefs.workout.minute, calendar))
      }
    }

    if prefs.challengeClaim {
      let today = calendar.dateComponents([.year, .month, .day], from: now)
      let pad = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
      let todayText = "\(today.year!)-\(pad(today.month!))-\(pad(today.day!))"
      for claim in ctx.pendingClaims {
        guard let (y, m, d) = claimDate(claim.claimBy) else { continue }
        let lastDay = local(y, m, d, claimHour, 0, calendar)
        if lastDay > now {
          out.append(PlannedReminder(
            key: .challengeClaim, at: lastDay, title: claim.title, body: claim.body,
            token: stamp(.challengeClaim, lastDay)))
        } else if claim.claimBy >= todayText {
          // Ngày cuối, buổi sáng đã qua — nhắc sớm còn hơn không bao giờ.
          //
          // RN BUG FOUND: `now + 30 phút` đổi theo từng mili giây, nên chữ ký
          // kế hoạch đổi ở MỌI lần dựng màn Hôm nay trong ngày cuối ấy → huỷ
          // hết rồi đặt lại toàn bộ thông báo ở mỗi lần dựng, và lời nhắc nhận
          // thưởng bị đẩy lùi nửa tiếng mãi khi app đang mở. NATIVE FIX: phần
          // của mục này trong chữ ký là danh tính của nó (`soon:<id>`), không
          // phải giờ bắn — đã đặt một lần thì lần đồng bộ sau thấy kế hoạch
          // không đổi. Giờ bắn vẫn đúng như RN: nửa tiếng sau lần đặt.
          let soon = now.addingTimeInterval(lateClaimDelay)
          out.append(PlannedReminder(
            key: .challengeClaim, at: soon, title: claim.title, body: claim.body,
            token: "\(ReminderKey.challengeClaim.rawValue)@soon:\(claim.id)"))
        }
      }
    }

    // Sắp ổn định theo giờ (cùng giờ giữ thứ tự thêm vào, như `Array.sort`
    // của JS), rồi giữ những cái sớm nhất.
    let sorted = out.enumerated().sorted { a, b in
      a.element.at != b.element.at ? a.element.at < b.element.at : a.offset < b.offset
    }.map(\.element)
    return Array(sorted.prefix(maxPending))
  }

  /// `planSignature`: đổi đúng khi kế hoạch đổi; bên gọi chỉ đặt lại khi nó khác.
  public static func signature(_ plan: [PlannedReminder]) -> String {
    plan.map(\.token).joined(separator: "|")
  }

  static func stamp(_ key: ReminderKey, _ at: Date) -> String {
    "\(key.rawValue)@\(Int64((at.timeIntervalSince1970 * 1000).rounded()))"
  }

  /// `claimBy.split('-').map(Number)`, bỏ qua nếu một trong ba là 0 / không
  /// phải số. Ngày tràn (`2026-13-40`) được chuẩn hoá như `new Date` của JS.
  static func claimDate(_ text: String) -> (Int, Int, Int)? {
    let parts = text.split(separator: "-", omittingEmptySubsequences: false).map {
      Int($0.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    guard parts.count >= 3, let y = parts[0], let m = parts[1], let d = parts[2], y != 0, m != 0, d != 0 else {
      return nil
    }
    return (y, m, d)
  }
}
