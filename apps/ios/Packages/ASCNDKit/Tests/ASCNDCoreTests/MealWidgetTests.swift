@testable import ASCNDCore
import Foundation
import Testing

/// Widget "Bữa quen" (Kiệt 01/11): chạm là ghi bữa quen của giờ này.
struct MealWidgetTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static var cal: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = tz
    return c
  }
  /// 2026-11-03 theo giờ Việt Nam.
  static func at(_ hour: Int, _ minute: Int = 0) -> Date {
    cal.date(from: DateComponents(year: 2026, month: 11, day: 3, hour: hour, minute: minute))!
  }
  static let lunch = MealWidgetData.Usual(names: "Cơm gà", kcal: 780)
  static let data = MealWidgetData(day: "2026-11-03", usual: ["lunch": lunch])

  /// Giờ chọn loại bữa như màn ghi bữa; có bữa quen thì mời, không thì mở màn ghi.
  @Test func suggestsTheUsualOfThisHour() {
    #expect(MealWidget.state(Self.data, now: Self.at(12), calendar: Self.cal) == .suggest(mealType: "lunch", Self.lunch))
    #expect(MealWidget.state(Self.data, now: Self.at(8), calendar: Self.cal) == .empty(mealType: "breakfast"))
    #expect(MealWidget.state(nil, now: Self.at(19), calendar: Self.cal) == .empty(mealType: "dinner"))
  }

  /// Bữa của giờ này đã ghi hôm nay: thôi mời (không ghi đôi). Danh sách của hôm
  /// qua thì không tính — bữa quen vẫn còn.
  @Test func alreadyLoggedTodayIsDoneButNotYesterday() {
    var d = Self.data
    d.loggedTypes = ["lunch"]
    #expect(MealWidget.state(d, now: Self.at(12), calendar: Self.cal) == .done(mealType: "lunch"))
    d.day = "2026-11-02"
    #expect(MealWidget.state(d, now: Self.at(12), calendar: Self.cal) == .suggest(mealType: "lunch", Self.lunch))
  }

  /// "Đã ghi · Hoàn tác" chỉ trong 5 phút sau khi chạm.
  @Test func justLoggedOnlyInsideTheUndoWindow() {
    var d = Self.data
    let logged = MealWidgetData.Logged(
      entryId: "e1", mealType: "lunch", names: "Cơm gà", kcal: 780, at: Self.at(12).timeIntervalSince1970)
    d.logged = logged
    d.loggedTypes = ["lunch"]
    #expect(MealWidget.state(d, now: Self.at(12, 4), calendar: Self.cal) == .justLogged(logged))
    #expect(MealWidget.state(d, now: Self.at(12, 5), calendar: Self.cal) == .done(mealType: "lunch"))
  }

  /// Dòng thời gian vẽ lại ở mốc đổi bữa và lúc hết hoàn tác.
  @Test func refreshesAtSlotChangesAndUndoEnd() {
    var d = Self.data
    d.logged = MealWidgetData.Logged(
      entryId: "e1", mealType: "lunch", names: "", kcal: 0, at: Self.at(12).timeIntervalSince1970)
    let dates = MealWidget.refreshDates(d, now: Self.at(12), calendar: Self.cal)
    #expect(dates.first == Self.at(12, 5))
    #expect(dates.dropFirst().first == Self.at(15))
    #expect(dates.contains(Self.at(22)))
  }

  /// Bữa quen của từng loại bữa và loại bữa đã ghi hôm nay, từ các bữa đã đọc.
  @Test func usualsAndLoggedTypesFromRows() {
    let rows = [
      UsualMealTests.meal("a", "lunch", ["Cơm gà"]),
      UsualMealTests.meal("b", "lunch", ["Cơm gà"]),
      UsualMealTests.meal("c", "breakfast", ["Phở bò"]),
    ]
    let u = MealWidget.usuals(rows)
    #expect(u["lunch"]?.names == "Cơm gà")
    #expect(u["breakfast"]?.names == "Phở bò")
    #expect(u["dinner"] == nil)
    // Mọi hàng mẫu ghi 2026-10-30 05:00Z = 12:00 giờ Việt Nam.
    #expect(MealWidget.loggedTypes(rows, today: LocalDate("2026-10-30")!, in: Self.tz) == ["lunch", "breakfast"])
    #expect(MealWidget.loggedTypes(rows, today: LocalDate("2026-10-31")!, in: Self.tz).isEmpty)
  }

  /// Ghi trong app cũng tắt lời mời; sang ngày mới thì danh sách đặt lại.
  @Test func markLoggedResetsOnANewDay() throws {
    let suite = "test.ascnd.widgets.\(UUID().uuidString)"
    let store = WidgetDataStore(suite: suite)
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    store.markMealLogged("lunch", today: LocalDate("2026-11-03")!)
    #expect(store.meal() == nil, "chưa có dữ liệu thì không tự dựng")
    store.writeMeal(MealWidgetData(day: "2026-11-02", usual: ["lunch": Self.lunch], loggedTypes: ["dinner"]))
    store.markMealLogged("lunch", today: LocalDate("2026-11-03")!)
    #expect(store.meal()?.loggedTypes == ["lunch"])
    #expect(store.meal()?.day == "2026-11-03")
    store.clear()
    #expect(store.meal() == nil, "đăng xuất xoá")
  }
}
