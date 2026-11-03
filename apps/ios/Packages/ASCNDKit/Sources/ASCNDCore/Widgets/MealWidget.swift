public import Foundation

/// Widget "Bữa quen" (Kiệt 01/11, duyệt "thông báo trước, widget sau"): chạm một lần
/// là ghi bữa quen của giờ này (`MealLog.usualMeal`), không mở app; vừa ghi thì hiện
/// "Đã ghi · Hoàn tác" một lúc; nút camera mở chụp món.
///
/// App tính sẵn bữa quen của bốn loại bữa và ghi vào App Group; widget chỉ đọc và
/// chọn theo giờ (`MealLog.mealForHour`, cùng luật với màn ghi bữa).
public struct MealWidgetData: Codable, Sendable, Hashable {
  /// Bữa quen của một loại bữa: tên các món + kcal cả bữa.
  public struct Usual: Codable, Sendable, Hashable {
    public var names: String
    public var kcal: Int
    public init(names: String, kcal: Int) {
      self.names = names
      self.kcal = kcal
    }
  }

  /// Bữa widget vừa ghi — để mời hoàn tác.
  public struct Logged: Codable, Sendable, Hashable {
    public var entryId: String
    public var mealType: String
    public var names: String
    public var kcal: Int
    /// Giây kể từ 1970.
    public var at: Double
    /// Hoàn tác không được (mất mạng / chưa gửi xong): mời mở nhật ký.
    public var undoFailed: Bool
    public init(entryId: String, mealType: String, names: String, kcal: Int, at: Double, undoFailed: Bool = false) {
      self.entryId = entryId
      self.mealType = mealType
      self.names = names
      self.kcal = kcal
      self.at = at
      self.undoFailed = undoFailed
    }
  }

  /// Ngày địa phương (`LocalDate.description`) của `loggedTypes`.
  public var day: String
  /// Bữa quen theo loại bữa — không theo ngày (bữa quen hôm qua vẫn là bữa quen).
  public var usual: [String: Usual]
  /// Loại bữa đã ghi trong `day` — widget không mời ghi đôi.
  public var loggedTypes: [String]
  public var logged: Logged?

  public init(day: String, usual: [String: Usual], loggedTypes: [String] = [], logged: Logged? = nil) {
    self.day = day
    self.usual = usual
    self.loggedTypes = loggedTypes
    self.logged = logged
  }
}

public enum MealWidget {
  public static let kind = "com.ascnd.fitnessos.widgets.meal"
  /// "Đã ghi · Hoàn tác" hiện chừng này sau khi chạm.
  public static let undoWindow: TimeInterval = 5 * 60
  /// Bốn loại bữa widget mời (bữa trước / sau tập chỉ ghi trong app).
  public static let types = ["breakfast", "lunch", "snack", "dinner"]
  /// Giờ đổi bữa của `MealLog.mealForHour` — mốc dòng thời gian của widget.
  public static let slotHours = [4, 11, 15, 17, 22]

  public enum State: Equatable, Sendable {
    /// Vừa ghi (trong `undoWindow`).
    case justLogged(MealWidgetData.Logged)
    /// Bữa của giờ này đã ghi hôm nay.
    case done(mealType: String)
    /// Mời ghi bữa quen.
    case suggest(mealType: String, MealWidgetData.Usual)
    /// Chưa có bữa quen cho giờ này (hay chưa có dữ liệu): mở màn ghi.
    case empty(mealType: String)
  }

  public static func state(_ data: MealWidgetData?, now: Date, calendar: Calendar = .current) -> State {
    let type = MealLog.mealForHour(calendar.component(.hour, from: now))
    guard let data else { return .empty(mealType: type) }
    if let l = data.logged, now.timeIntervalSince1970 - l.at < undoWindow, now.timeIntervalSince1970 >= l.at {
      return .justLogged(l)
    }
    let today = LocalDate(EpochMillis(now), in: calendar.timeZone).description
    if data.day == today, data.loggedTypes.contains(type) { return .done(mealType: type) }
    if let u = data.usual[type] { return .suggest(mealType: type, u) }
    return .empty(mealType: type)
  }

  /// Các lúc widget phải vẽ lại sau `now`: đổi bữa, hết lúc hoàn tác.
  public static func refreshDates(_ data: MealWidgetData?, now: Date, calendar: Calendar = .current) -> [Date] {
    var out: [Date] = []
    for day in 0...1 {
      guard let base = calendar.date(byAdding: .day, value: day, to: now) else { continue }
      for h in slotHours {
        if let at = calendar.date(bySettingHour: h, minute: 0, second: 0, of: base), at > now { out.append(at) }
      }
    }
    if let l = data?.logged {
      let end = Date(timeIntervalSince1970: l.at + undoWindow)
      if end > now { out.append(end) }
    }
    return out.sorted().prefix(6).map { $0 }
  }

  /// Bữa quen của bốn loại bữa từ các bữa đã đọc (mới trước, như `recentMeals`).
  public static func usuals(_ entries: [JSONValue]) -> [String: MealWidgetData.Usual] {
    var out: [String: MealWidgetData.Usual] = [:]
    for t in types {
      guard let m = MealLog.usualMeal(entries, mealType: t) else { continue }
      out[t] = MealWidgetData.Usual(names: m.foods.map(\.food.name).joined(separator: ", "), kcal: m.kcal.isFinite ? Int(m.kcal.rounded()) : 0)
    }
    return out
  }

  /// Loại bữa đã ghi trong ngày `today` (theo `date_time`, giờ địa phương).
  public static func loggedTypes(_ entries: [JSONValue], today: LocalDate, in tz: TimeZone) -> [String] {
    var out: [String] = []
    for e in entries {
      guard let t = e["meal_type"]?.stringValue, !out.contains(t),
        let at = e["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }), LocalDate(at, in: tz) == today
      else { continue }
      out.append(t)
    }
    return out
  }
}

extension WidgetDataStore {
  public static let mealKey = "ascnd.widget.meal"

  public func meal() -> MealWidgetData? {
    guard let data = defaults?.data(forKey: Self.mealKey) else { return nil }
    return try? JSONDecoder().decode(MealWidgetData.self, from: data)
  }

  public func writeMeal(_ data: MealWidgetData?) {
    guard let d = defaults else { return }
    if let data, let a = try? JSONEncoder().encode(data) { d.set(a, forKey: Self.mealKey) } else {
      d.removeObject(forKey: Self.mealKey)
    }
  }

  /// Một bữa vừa vào sổ (trong app, thông báo hay widget): bữa ấy hôm nay thôi mời.
  public func markMealLogged(_ mealType: String, today: LocalDate) {
    guard var d = meal() else { return }
    if d.day != today.description {
      d.day = today.description
      d.loggedTypes = []
    }
    if !d.loggedTypes.contains(mealType) { d.loggedTypes.append(mealType) }
    writeMeal(d)
  }
}
