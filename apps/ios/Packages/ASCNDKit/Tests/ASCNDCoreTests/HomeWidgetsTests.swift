@testable import ASCNDCore
import Foundation
import Testing

/// Widget màn hình chính (#66): chuỗi ngày so với CHÍNH `streakFrom` của RN
/// (`streak-golden.json`), payload như `usePushWidgetData`, và kho App Group
/// đọc được đúng JSON bản RN đã ghi.
struct HomeWidgetsTests {
  static let copy = HomeWidgets.Copy(done: "Done", restDay: "Rest day", noWorkout: "No workout yet", untitled: "Workout")

  @Test func streakMatchesRN() throws {
    let url = try #require(Bundle.module.url(forResource: "streak-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let cases)? = root["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count > 400)
    func strings(_ v: JSONValue?) -> [String] {
      if case .array(let a)? = v { return a.compactMap(\.stringValue) }
      return []
    }
    for c in cases {
      let today = try #require(c["today"]?.stringValue)
      let got = Streak.from(strings(c["datesDesc"]), today: today, frozen: strings(c["frozen"]))
      #expect(Double(got.count) == c["expected"]?["count"]?.doubleValue, "\(today) \(strings(c["datesDesc"]).prefix(4))")
      #expect(got.loggedToday == c["expected"]?["loggedToday"]?.boolValue, "\(today)")
    }
  }

  @Test func noSessionTodayIsARestDay() {
    let p = HomeWidgets.todayWorkout(sessions: [], copy: Self.copy)
    #expect(p == TodayWorkoutWidgetData(workoutName: "Rest day", statusText: "No workout yet", completedExercises: 0, totalExercises: 0))
  }

  /// Buổi mới nhất; đếm BÀI khác nhau (tên cắt khoảng trắng, không phân biệt
  /// hoa thường), không đếm hàng set; tên trống → "Workout".
  @Test func latestSessionCountsDistinctExercises() {
    let sets: JSONValue = .array([
      .object(["exerciseName": .string("Bench Press")]), .object(["exerciseName": .string(" bench press ")]),
      .object(["exerciseName": .string("Squat")]), .object(["exerciseName": .string("")]), .object([:]),
    ])
    let latest: JSONValue = .object(["template_name": .string(""), "sets": sets])
    let older: JSONValue = .object(["template_name": .string("Pull"), "sets": .array([])])
    let p = HomeWidgets.todayWorkout(sessions: [latest, older], copy: Self.copy)
    #expect(p.workoutName == "Workout" && p.statusText == "Done")
    #expect(p.completedExercises == 2 && p.totalExercises == 2)
  }

  @Test func readinessIsRoundedAndOptional() {
    let a = HomeWidgets.streakReadiness(streak: 5, readinessScore: .number(72.5), copy: Self.copy)
    #expect(a == StreakReadinessWidgetData(streakDays: 5, readinessScore: 73, statusText: "73/100"))
    let b = HomeWidgets.streakReadiness(streak: 0, readinessScore: .null, copy: Self.copy)
    #expect(b == StreakReadinessWidgetData(streakDays: 0, readinessScore: nil, statusText: "No workout yet"))
  }

  /// JSON đúng hình RN ghi (`JSON.stringify(payload)`): app native đọc được
  /// dữ liệu bản RN để lại, và ngược lại — trường vắng thì bỏ, không ghi null.
  @Test func storeSpeaksRNsJSON() throws {
    let suite = "test.ascnd.widgets.\(UUID().uuidString)"
    let store = WidgetDataStore(suite: suite)
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }

    defaults.set(
      Data(#"{"workoutName":"Push","statusText":"Hoàn thành","completedExercises":3,"totalExercises":3}"#.utf8),
      forKey: WidgetDataStore.todayWorkoutKey)
    defaults.set(Data(#"{"streakDays":4,"statusText":"Chưa có buổi tập"}"#.utf8), forKey: WidgetDataStore.streakReadinessKey)
    #expect(store.todayWorkout()?.workoutName == "Push")
    #expect(store.streakReadiness() == StreakReadinessWidgetData(streakDays: 4, readinessScore: nil, statusText: "Chưa có buổi tập"))

    store.write(
      TodayWorkoutWidgetData(workoutName: "Legs", statusText: "Done", completedExercises: 1, totalExercises: 1),
      StreakReadinessWidgetData(streakDays: 2, readinessScore: nil, statusText: "x"))
    let raw = try #require(defaults.data(forKey: WidgetDataStore.streakReadinessKey))
    let obj = try JSONDecoder().decode(JSONValue.self, from: raw)
    #expect(obj["readinessScore"] == nil, "trường vắng thì bỏ như JSON.stringify")
    let today = try #require(defaults.data(forKey: WidgetDataStore.todayWorkoutKey))
    #expect(try JSONDecoder().decode(JSONValue.self, from: today)["nextExerciseName"] == nil)

    store.clear()
    #expect(store.todayWorkout() == nil && store.streakReadiness() == nil)
  }

  /// Truy vấn đúng RN: buổi hôm nay mới trước; `daily_logs` của hôm nay; chuỗi
  /// từ ngày "có ghi" (`LOGGED_DAY_FILTER`), 400 hàng; đóng băng.
  @Test func queriesMatchRN() {
    let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let r = WidgetSync.queries(userId: "u1", today: LocalDate("2026-10-05")!, in: tz)
    #expect(r.todaySessions.filters.contains(.gte("date_time", .string("2026-10-04T17:00:00.000Z"))))
    #expect(r.todaySessions.order == RowQuery.Order(column: "date_time", ascending: false))
    #expect(r.todayLog.filters.contains(.eq("date", .string("2026-10-05"))))
    #expect(r.streakDays.filters.contains(.or(Streak.loggedDayFilter)) && r.streakDays.limit == 400)
    #expect(r.freezes.table == "streak_freezes" && r.freezes.columns == "used_on")
  }

  /// Đọc hỏng một nguồn bắt buộc: KHÔNG có payload — widget giữ số cũ, không
  /// hiện "chuỗi 0 ngày" sai; bảng đóng băng hỏng thì vẫn được.
  @Test func failedReadKeepsTheLastWidget() async {
    final class Store: RowStore, @unchecked Sendable {
      let fail: String
      init(fail: String) { self.fail = fail }
      func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
        if q.table == fail { throw RowStoreError(code: nil, message: "x") }
        if q.table == "daily_logs" && q.columns == "date" { return [.object(["date": .string("2026-10-05")])] }
        return []
      }
      func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
      func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
    }
    let now = EpochMillis(iso8601: "2026-10-05T05:00:00.000Z")!
    let utc = TimeZone(identifier: "UTC")!
    #expect(await WidgetSync.payloads(userId: "u1", store: Store(fail: "workout_sessions"), copy: Self.copy, now: now, in: utc) == nil)
    let ok = await WidgetSync.payloads(userId: "u1", store: Store(fail: "streak_freezes"), copy: Self.copy, now: now, in: utc)
    #expect(ok?.streak.streakDays == 1)
  }
}
