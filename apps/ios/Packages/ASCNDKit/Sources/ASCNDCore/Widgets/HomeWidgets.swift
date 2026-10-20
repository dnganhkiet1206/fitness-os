public import Foundation

/// Hai widget màn hình chính — `TodayWorkoutWidget`, `StreakReadinessWidget`
/// và `usePushWidgetData` (`use-fitness-data.ts`) của RN.
///
/// Hợp đồng dữ liệu GIỮ NGUYÊN RN: cùng App Group, cùng khoá, cùng tên trường
/// JSON — app nào ghi thì widget nào cũng đọc được, cập nhật đè từ bản RN không
/// để lại dữ liệu lạ. Payload dựng ở app (app biết ngôn ngữ), widget chỉ vẽ.
public struct TodayWorkoutWidgetData: Codable, Sendable, Hashable {
  public var workoutName: String
  public var statusText: String
  public var nextExerciseName: String?
  public var completedExercises: Int
  public var totalExercises: Int

  public init(
    workoutName: String, statusText: String, nextExerciseName: String? = nil, completedExercises: Int,
    totalExercises: Int
  ) {
    self.workoutName = workoutName
    self.statusText = statusText
    self.nextExerciseName = nextExerciseName
    self.completedExercises = completedExercises
    self.totalExercises = totalExercises
  }
}

public struct StreakReadinessWidgetData: Codable, Sendable, Hashable {
  public var streakDays: Int
  /// 0–100; `nil` khi hôm nay chưa có điểm sẵn sàng.
  public var readinessScore: Int?
  public var statusText: String

  public init(streakDays: Int, readinessScore: Int?, statusText: String) {
    self.streakDays = streakDays
    self.readinessScore = readinessScore
    self.statusText = statusText
  }
}

public enum HomeWidgets {
  /// Chữ app dịch sẵn cho payload (RN `nCxWidgetDone` / `RestDay` / `NoWorkout`).
  public struct Copy: Sendable {
    public let done: String
    public let restDay: String
    public let noWorkout: String
    /// Tên buổi khi `template_name` trống (RN: `'Workout'`).
    public let untitled: String
    /// Chưa chấm được điểm hôm nay (19/10 — trước dùng nhầm "Chưa có buổi tập").
    public let noScore: String
    public init(done: String, restDay: String, noWorkout: String, untitled: String, noScore: String? = nil) {
      self.done = done
      self.restDay = restDay
      self.noWorkout = noWorkout
      self.untitled = untitled
      self.noScore = noScore ?? noWorkout
    }
  }

  /// Payload "Buổi tập hôm nay" từ các buổi của hôm nay (mới trước): buổi mới
  /// nhất, đếm BÀI khác nhau (không đếm hàng set — RN: "12/12" luôn đầy).
  public static func todayWorkout(sessions: [JSONValue], copy: Copy) -> TodayWorkoutWidgetData {
    guard let latest = sessions.first else {
      return TodayWorkoutWidgetData(
        workoutName: copy.restDay, statusText: copy.noWorkout, completedExercises: 0, totalExercises: 0)
    }
    var names = Set<String>()
    if case .array(let sets)? = latest["sets"] {
      for s in sets {
        // `String(s?.exerciseName ?? '').trim().toLowerCase()`, bỏ chuỗi rỗng.
        let raw = s["exerciseName"]
        let text: String =
          switch raw {
          case nil, .null?: ""
          default: DailyLog.jsString(raw)
          }
        let key = RepEntry.trimJS(text).lowercased()
        if !key.isEmpty { names.insert(key) }
      }
    }
    // `latest.template_name || 'Workout'`: rỗng / null đều là "Workout".
    let name = latest["template_name"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 } ?? copy.untitled
    return TodayWorkoutWidgetData(
      workoutName: name, statusText: copy.done, completedExercises: names.count, totalExercises: names.count)
  }

  /// Payload "Chuỗi + Sẵn sàng": điểm của hàng `daily_logs` hôm nay (làm tròn),
  /// chữ trạng thái "N/100" hoặc "chưa có buổi tập".
  ///
  /// `hasRecovery == false` (điểm chỉ dựa vào tải tập): như mọi màn trong app —
  /// không hiện số (19/10: widget màn hình chính từng hiện "80").
  public static func streakReadiness(
    streak: Int, readinessScore: JSONValue?, hasRecovery: Bool = true, copy: Copy
  ) -> StreakReadinessWidgetData {
    let present = JS.present(readinessScore)
    let score = present ? JS.number(readinessScore) : .nan
    guard present, score.isFinite, hasRecovery else {
      // `readiness !== undefined`: NaN vẫn "có" ở RN, ra "NaN/100" — một hàng
      // hỏng không bao giờ đáng hiện; coi như chưa có điểm.
      return StreakReadinessWidgetData(streakDays: streak, readinessScore: nil, statusText: copy.noScore)
    }
    let r = Int(JS.round(score))
    return StreakReadinessWidgetData(streakDays: streak, readinessScore: r, statusText: "\(r)/100")
  }
}

/// Widget Koa (#527, đợt 2C): Koa của Hôm nay trên màn hình chính / màn khoá.
///
/// Widget không chạy được bộ vẽ Canvas của Koa (hoạt ảnh, bộ nhớ), nên app vẽ sẵn
/// hai ảnh tĩnh vào App Group (`koaImage` / `nightImage`) và ghi phần chữ ở đây —
/// câu của Koa đã ở ngôn ngữ của app, CÙNG câu với Hôm nay (một Koa, một bộ não).
public struct KoaWidgetData: Codable, Sendable, Hashable {
  enum CodingKeys: String, CodingKey {
    case day, line, next, done, total, streak, nightLine, imageVersion, checks, nextQuest, waterTaps, short
  }

  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    day = try c.decode(String.self, forKey: .day)
    line = try c.decode(String.self, forKey: .line)
    next = try c.decodeIfPresent(String.self, forKey: .next)
    done = try c.decode(Int.self, forKey: .done)
    total = try c.decode(Int.self, forKey: .total)
    streak = try c.decode(Int.self, forKey: .streak)
    nightLine = try c.decode(String.self, forKey: .nightLine)
    imageVersion = try c.decode(Int.self, forKey: .imageVersion)
    checks = try c.decodeIfPresent([String].self, forKey: .checks) ?? []
    nextQuest = try c.decodeIfPresent(String.self, forKey: .nextQuest)
    waterTaps = try c.decodeIfPresent(Int.self, forKey: .waterTaps) ?? 0
    short = try c.decodeIfPresent(String.self, forKey: .short) ?? ""
  }

  /// Ngày địa phương của dữ liệu (`YYYY-MM-DD`). Khác hôm nay → widget không nói
  /// tâm trạng cũ, chỉ mời mở app.
  public var day: String
  public var line: String
  /// Việc kế tiếp, đã dịch ("Ghi bữa ăn"); `nil` = không còn việc tới giờ.
  public var next: String?
  /// "Hôm nay của bạn · X/Y xong" — cùng con số với Hôm nay.
  public var done: Int
  public var total: Int
  public var streak: Int
  /// Câu khi Koa đi ngủ (từ `nightHour`), đã dịch.
  public var nightLine: String
  /// Phiên bản ảnh — widget đọc lại ảnh khi số này đổi.
  public var imageVersion: Int
  /// Bốn ống của "Hôm nay của bạn" theo thứ tự ngủ · bữa · nước · tập:
  /// `done` / `todo` / `rest` (`DayCheckIn.State`). Dữ liệu cũ không có → rỗng.
  public var checks: [String] = []
  /// Nhiệm vụ của việc kế tiếp (`MascotRules.Quest.rawValue`) — màu của nút.
  public var nextQuest: String?
  /// Câu rất ngắn cho cỡ nhỏ (≤ 5 chữ, đã dịch) — nhìn một giây là hiểu.
  public var short = ""
  /// Số ly vừa thêm từ widget từ lần app ghi gần nhất (để widget nói "+1 ly").
  public var waterTaps = 0

  public init(
    day: String, line: String, next: String?, done: Int, total: Int, streak: Int, nightLine: String, imageVersion: Int,
    checks: [String] = [], nextQuest: String? = nil
  ) {
    self.checks = checks
    self.nextQuest = nextQuest
    self.day = day
    self.line = line
    self.next = next
    self.done = done
    self.total = total
    self.streak = streak
    self.nightLine = nightLine
    self.imageVersion = imageVersion
  }

  /// Koa đi ngủ lúc 22:00 (như `KoaMood.nightFrom`).
  public static let nightHour = KoaMood.nightFrom

  /// Widget nên hiện gì lúc `now`: dữ liệu cũ hơn hôm nay → `.stale`; từ 22 giờ
  /// (hoặc trước 6 giờ) → `.night`; còn lại `.day`.
  public enum Phase: Sendable, Hashable { case stale, day, night }

  public func phase(now: Date, calendar: Calendar) -> Phase {
    let c = calendar.dateComponents([.year, .month, .day, .hour], from: now)
    let today = String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    guard today == day else { return .stale }
    let h = c.hour!
    return h >= Self.nightHour || h < KoaMood.morningFrom ? .night : .day
  }
}

/// Nơi app ghi và widget đọc — UserDefaults của App Group, như
/// `WidgetDataStore` / `updateWidgetData` của RN.
public struct WidgetDataStore: Sendable {
  public static let appGroup = "group.com.ascnd.fitnessos"
  public static let todayWorkoutKey = "ascnd.widget.todayWorkout"
  public static let streakReadinessKey = "ascnd.widget.streakReadiness"
  /// Ngôn ngữ chọn TRONG APP (`vi` / `en` / `es`) cho chữ của widget và Live
  /// Activity (#527 A-NEXT 4). Vắng = "Theo máy". Theo máy, không theo người:
  /// đăng xuất KHÔNG xoá (như `ascnd_lang` của RN nằm trong `DEVICE_KEYS`).
  public static let languageKey = "ascnd.widget.lang"
  public static let koaKey = "ascnd.widget.koa"
  /// Ảnh Koa vẽ sẵn trong thư mục App Group (sáng / tối × ngày / đêm).
  public static func koaImageName(night: Bool, dark: Bool) -> String {
    "koa-widget-\(night ? "night" : "day")-\(dark ? "dark" : "light").png"
  }

  private let suite: String

  public init(suite: String = WidgetDataStore.appGroup) {
    self.suite = suite
  }

  /// `nil` khi App Group chưa được cấp (máy dev chưa ký): mọi thao tác là no-op.
  private var defaults: UserDefaults? { UserDefaults(suiteName: suite) }

  public func write(_ today: TodayWorkoutWidgetData, _ streak: StreakReadinessWidgetData) {
    guard let d = defaults else { return }
    let e = JSONEncoder()
    if let a = try? e.encode(today) { d.set(a, forKey: Self.todayWorkoutKey) }
    if let b = try? e.encode(streak) { d.set(b, forKey: Self.streakReadinessKey) }
  }

  /// `nil` = "Theo máy": xoá khoá, widget theo ngôn ngữ máy.
  public func writeLanguage(_ code: String?) {
    guard let d = defaults else { return }
    if let code { d.set(code, forKey: Self.languageKey) } else { d.removeObject(forKey: Self.languageKey) }
  }

  public func language() -> String? { defaults?.string(forKey: Self.languageKey) }

  /// Locale cho `\.locale` của widget: `Text("widget.…")` tra theo nó.
  public var locale: Locale { language().map(Locale.init(identifier:)) ?? .autoupdatingCurrent }

  public func todayWorkout() -> TodayWorkoutWidgetData? { read(Self.todayWorkoutKey) }
  public func koa() -> KoaWidgetData? { read(Self.koaKey) }

  /// Nút nước trên widget vừa ghi một ly: ô Nước của widget sáng NGAY (lạc quan),
  /// không chờ app dựng lại Hôm nay. Ngày khác / chưa có dữ liệu → để nguyên.
  @discardableResult
  public func markKoaWaterLogged(today: LocalDate) -> Bool {
    guard var d = koa(), d.day == today.description else { return false }
    if d.checks.count == 4, d.checks[2] == "todo" {
      d.checks[2] = "done"
      d.done = min(d.done + 1, d.total)
    }
    d.waterTaps += 1
    writeKoa(d)
    return true
  }

  public func writeKoa(_ data: KoaWidgetData) {
    guard let d = defaults, let a = try? JSONEncoder().encode(data) else { return }
    d.set(a, forKey: Self.koaKey)
  }

  /// Thư mục App Group (ảnh Koa); `nil` khi chưa được cấp.
  public var containerURL: URL? {
    #if canImport(Darwin)
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite)
    #else
      nil  // Linux (core-linux CI): không có App Group.
    #endif
  }
  public func streakReadiness() -> StreakReadinessWidgetData? { read(Self.streakReadinessKey) }

  /// Đăng xuất: widget không được hiện dữ liệu của người vừa rời đi
  /// (`clearWidgetData` của RN).
  public func clear() {
    defaults?.removeObject(forKey: Self.todayWorkoutKey)
    defaults?.removeObject(forKey: Self.streakReadinessKey)
    defaults?.removeObject(forKey: Self.koaKey)
    if let dir = containerURL {
      for night in [false, true] {
        for dark in [false, true] {
          try? FileManager.default.removeItem(at: dir.appendingPathComponent(Self.koaImageName(night: night, dark: dark)))
        }
      }
    }
  }

  private func read<T: Decodable>(_ key: String) -> T? {
    guard let data = defaults?.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
  }
}
