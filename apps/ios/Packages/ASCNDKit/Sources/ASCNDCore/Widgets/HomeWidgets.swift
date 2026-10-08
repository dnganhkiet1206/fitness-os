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
    public init(done: String, restDay: String, noWorkout: String, untitled: String) {
      self.done = done
      self.restDay = restDay
      self.noWorkout = noWorkout
      self.untitled = untitled
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
  public static func streakReadiness(streak: Int, readinessScore: JSONValue?, copy: Copy) -> StreakReadinessWidgetData {
    let present = JS.present(readinessScore)
    let score = present ? JS.number(readinessScore) : .nan
    guard present, score.isFinite else {
      // `readiness !== undefined`: NaN vẫn "có" ở RN, ra "NaN/100" — một hàng
      // hỏng không bao giờ đáng hiện; coi như chưa có điểm.
      return StreakReadinessWidgetData(streakDays: streak, readinessScore: nil, statusText: copy.noWorkout)
    }
    let r = Int(JS.round(score))
    return StreakReadinessWidgetData(streakDays: streak, readinessScore: r, statusText: "\(r)/100")
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
  public func streakReadiness() -> StreakReadinessWidgetData? { read(Self.streakReadinessKey) }

  /// Đăng xuất: widget không được hiện dữ liệu của người vừa rời đi
  /// (`clearWidgetData` của RN).
  public func clear() {
    defaults?.removeObject(forKey: Self.todayWorkoutKey)
    defaults?.removeObject(forKey: Self.streakReadinessKey)
  }

  private func read<T: Decodable>(_ key: String) -> T? {
    guard let data = defaults?.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
  }
}
