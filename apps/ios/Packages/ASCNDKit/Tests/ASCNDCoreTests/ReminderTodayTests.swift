@testable import ASCNDCore
import Foundation
import Testing

/// Bốn tín hiệu "hôm nay" của kế hoạch nhắc nhở (#527 A-NEXT-4).
///
/// Golden THẬT: `mealDone` / `sleepDone` biên dịch từ `lib/todo.ts` @ fac9ac2,
/// `!!todayWeight` / `todayBio != null` chép nguyên văn từ `use-reminders.ts`
/// (`Fixtures/reminder-today-golden.json`, `gen-reminder-today.mjs`).
struct ReminderTodayGoldenTests {
  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  @Test func everyCaseMatchesRN() throws {
    let url = try #require(Bundle.module.url(forResource: "reminder-today-golden", withExtension: "json", subdirectory: "Fixtures"))
    let g = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    let cases = Self.array(g["cases"])
    #expect(cases.count == 240)
    for c in cases {
      let w = c["expected"]
      let daily = Self.array(c["dailyLogRows"])
      #expect(ReminderToday.weighed(Self.array(c["weightRows"])) == (w?["weighedToday"] == .bool(true)), "\(c)")
      #expect(ReminderToday.mealLogged(daily) == (w?["mealLoggedToday"] == .bool(true)), "\(c)")
      #expect(
        ReminderToday.sleepLogged(sleep: Self.array(c["sleepRows"]), dailyLog: daily)
          == (w?["sleepLoggedToday"] == .bool(true)), "\(c)")
      #expect(!Self.array(c["bioRows"]).isEmpty == (w?["bioLoggedToday"] == .bool(true)), "\(c)")
    }
  }
}

@MainActor
struct ReminderTodayBookTests {
  struct Clock: WallClock {
    let date: Date
    func now() -> Date { date }
  }

  /// Kho giả: hàng theo bảng; bảng trong `failing` ném lỗi; ghi lại truy vấn.
  final class FakeStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [String: [JSONValue]] = [:]
    var failing: Set<String> = []
    var queries: [RowQuery] = []
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      let (fail, out) = lock.withLock { () -> (Bool, [JSONValue]) in
        queries.append(q)
        return (failing.contains(q.table), rows[q.table] ?? [])
      }
      if fail { throw RowStoreError(code: nil, message: "offline") }
      return out
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
  }

  static let hcm = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  /// 09/10/2026 08:00 giờ Việt Nam = 01:00Z.
  static let morning = Date(timeIntervalSince1970: 1_791_507_600)

  /// Đúng bốn truy vấn RN: đúng bảng, đúng ngày địa phương, đúng cửa sổ.
  @Test func readsTheFourQueriesOfTheLocalDay() async {
    let s = FakeStore()
    let b = ReminderTodayBook(userId: "u1", store: s, clock: Clock(date: Self.morning), timeZone: Self.hcm)
    await b.refresh()
    let byTable = Dictionary(uniqueKeysWithValues: s.queries.map { ($0.table, $0) })
    #expect(Set(byTable.keys) == ["weight_logs", "daily_logs", "sleep_logs", "biometric_samples"])
    #expect(byTable["weight_logs"]?.filters.contains(.eq("date", .string("2026-10-09"))) == true)
    #expect(byTable["daily_logs"]?.filters.contains(.eq("date", .string("2026-10-09"))) == true)
    #expect(byTable["sleep_logs"]?.filters.contains(.gte("waketime", .string("2026-10-08T17:00:00.000Z"))) == true)
    #expect(byTable["biometric_samples"]?.filters.contains(.lt("date_time", .string("2026-10-09T17:00:00.000Z"))) == true)
    #expect(s.queries.allSatisfy { $0.filters.contains(.eq("user_id", .string("u1"))) })
  }

  /// Chưa đọc → `nil` → ngữ cảnh `false` (lời nhắc vẫn đặt); đọc được thì theo dữ liệu.
  @Test func unreadIsNotDone() async {
    let s = FakeStore()
    s.failing = ["weight_logs", "daily_logs", "sleep_logs", "biometric_samples"]
    let b = ReminderTodayBook(userId: "u1", store: s, clock: Clock(date: Self.morning), timeZone: Self.hcm)
    await b.refresh()
    #expect(b.signals == .unread)
    let ctx = ReminderContext().with(b.signals)
    #expect(!ctx.weighedToday && !ctx.mealLoggedToday && !ctx.sleepLoggedToday && !ctx.bioLoggedToday)

    s.failing = []
    s.rows = [
      "weight_logs": [.object(["weight_kg": .number(70.5)])],
      "daily_logs": [.object(["kcal": .number(1800), "sleep_duration_min": .null])],
      "sleep_logs": [],
      "biometric_samples": [.object(["id": .string("b")])],
    ]
    await b.refresh()
    #expect(b.signals == ReminderToday.Signals(weighed: true, mealLogged: true, sleepLogged: false, bioLogged: true))
  }

  /// Một truy vấn hỏng thì tín hiệu ấy giữ giá trị đã đọc của cùng ngày; các tín hiệu khác vẫn cập nhật.
  @Test func oneFailureKeepsThatSignal() async {
    let s = FakeStore()
    s.rows = ["weight_logs": [.object(["weight_kg": .number(70)])], "sleep_logs": [.object(["id": .string("s")])]]
    let b = ReminderTodayBook(userId: "u1", store: s, clock: Clock(date: Self.morning), timeZone: Self.hcm)
    await b.refresh()
    #expect(b.signals.weighed == true)
    #expect(b.signals.sleepLogged == true)
    s.failing = ["weight_logs", "sleep_logs"]
    s.rows["biometric_samples"] = [.object(["id": .string("b")])]
    await b.refresh()
    #expect(b.signals.weighed == true, "lỗi mạng không hạ 'đã cân'")
    #expect(b.signals.sleepLogged == true, "chỉ còn vế nhật ký ngày: không hạ 'đã ghi ngủ'")
    #expect(b.signals.bioLogged == true)
  }

  /// Sổ đã đóng (đổi tài khoản): không đọc, không ghi.
  @Test func closedBookDoesNothing() async {
    let s = FakeStore()
    s.rows = ["weight_logs": [.object(["weight_kg": .number(70)])]]
    let b = ReminderTodayBook(userId: "u1", store: s, clock: Clock(date: Self.morning), timeZone: Self.hcm)
    b.close()
    await b.refresh()
    #expect(s.queries.isEmpty)
    #expect(b.signals == .unread)
  }
}

/// Tín hiệu đi tới lịch hệ điều hành: lời nhắc hôm nay của việc đã làm biến
/// mất, của việc chưa đọc thì còn; đồng bộ lại cùng tín hiệu không đặt lại.
@MainActor
struct ReminderTodayScheduleTests {
  final class Store: KeyValueStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]
    func string(forKey key: String) -> String? { lock.withLock { values[key] } }
    func set(_ value: String, forKey key: String) { lock.withLock { values[key] = value } }
    func remove(_ key: String) { lock.withLock { _ = values.removeValue(forKey: key) } }
  }

  actor OS: ReminderScheduler {
    nonisolated let isAvailable = true
    var pending: [ScheduledReminder] = []
    var writes = 0
    func hasPermission() async -> Bool { true }
    func requestPermission() async -> Bool { true }
    func replaceAll(_ items: [ScheduledReminder]) async -> ScheduleOutcome {
      writes += 1
      pending = items
      return ScheduleOutcome(requested: items.count, scheduled: items.count, supported: true)
    }
    func cancelAll() async { pending = [] }
  }

  struct Clock: WallClock {
    let date: Date
    func now() -> Date { date }
  }

  static let calendar: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    return c
  }()

  /// Thứ Hai 05/10/2026 06:00 — trước giờ mặc định của cả bốn lời nhắc.
  static let monday6am = calendar.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 6))!

  func todays(_ items: [ScheduledReminder], _ key: ReminderKey) -> Int {
    items.filter { $0.key == key && Self.calendar.isDate($0.at, inSameDayAs: Self.monday6am) }.count
  }

  @Test func doneTodayDropsTodaysNudgeOnly() async {
    let os = OS()
    let copy: ReminderCopy = Dictionary(
      uniqueKeysWithValues: ReminderKey.allCases.map { ($0, ReminderText(title: "t", body: "b")) })
    let c = ReminderCenter(store: Store(), scheduler: os, copy: copy, clock: Clock(date: Self.monday6am), calendar: Self.calendar)
    await c.refreshPermission()
    for k in [ReminderKey.weighIn, .meal, .biometrics, .sleepLog] { await c.setEnabled(k, true) }

    await c.sync(ReminderContext().with(.unread))
    let unread = await os.pending
    for k in [ReminderKey.weighIn, .meal, .biometrics, .sleepLog] {
      #expect(todays(unread, k) == 1, "\(k): chưa đọc → vẫn nhắc hôm nay")
    }

    let done = ReminderToday.Signals(weighed: true, mealLogged: true, sleepLogged: true, bioLogged: true)
    await c.sync(ReminderContext().with(done))
    let after = await os.pending
    for k in [ReminderKey.weighIn, .meal, .biometrics, .sleepLog] {
      #expect(todays(after, k) == 0, "\(k): đã làm → bỏ lời nhắc hôm nay")
      #expect(after.contains { $0.key == k }, "\(k): các ngày sau vẫn còn")
    }
    let writes = await os.writes
    await c.sync(ReminderContext().with(done))
    #expect(await os.writes == writes, "cùng tín hiệu → không huỷ-đặt lại")
  }
}

/// A-NEXT-5: cân online được server nhận → kế hoạch đọc lại `weight_logs` ngay;
/// xếp hàng / lỗi / ngoài dải không báo "đã lưu".
@MainActor
struct ReminderWeightSavedTests {
  actor Server: WeightLogSource {
    var saved: [String: Double] = [:]
    var error: (any Error)?
    func set(error: (any Error)?) { self.error = error }
    func weight(userId: String, date: LocalDate) async throws -> Double? { saved["\(userId)|\(date)"] }
    func log(userId: String, kg: Double, date: LocalDate) async throws {
      if let error { throw error }
      saved["\(userId)|\(date)"] = kg
    }
  }

  actor Queue: PlanWriteStore {
    var entries: [OutboxEntry] = []
    func enqueue(_ es: [OutboxEntry]) async throws { entries.append(contentsOf: es) }
    func pending(userId: String) async throws -> [OutboxEntry] { entries }
  }

  final class Calls: @unchecked Sendable {
    private let lock = NSLock()
    private var _saved: [LocalDate] = []
    private var _enqueued = 0
    var saved: [LocalDate] { lock.withLock { _saved } }
    var enqueued: Int { lock.withLock { _enqueued } }
    func save(_ d: LocalDate) { lock.withLock { _saved.append(d) } }
    func enqueue() { lock.withLock { _enqueued += 1 } }
  }

  static func logger(_ server: Server, _ queue: Queue, _ calls: Calls) -> WeightLogger {
    WeightLogger(
      userId: "u1", source: server, store: queue,
      clock: ReminderTodayBookTests.Clock(date: ReminderTodayBookTests.morning), timeZone: ReminderTodayBookTests.hcm,
      onEnqueued: { _ in calls.enqueue() }, onSaved: { calls.save($0) })
  }

  /// Chỉ nhánh online THÀNH CÔNG báo "đã lưu", đúng một lần, mang ngày địa phương.
  @Test func onlySuccessfulOnlineWriteReportsSaved() async {
    let server = Server(), queue = Queue(), calls = Calls()
    let l = Self.logger(server, queue, calls)
    #expect(await l.submit(kg: 5, online: true) == .outOfRange)
    await server.set(error: URLError(.badServerResponse))
    #expect(await l.submit(kg: 70, online: true) == .failed)
    await server.set(error: URLError(.notConnectedToInternet))
    #expect(await l.submit(kg: 70, online: true) == .offline)
    #expect(calls.saved.isEmpty, "lỗi / ngoài dải không phải 'đã lưu'")
    await server.set(error: nil)
    #expect(await l.submit(kg: 70.5, online: true) == .saved)
    #expect(calls.saved == [LocalDate("2026-10-09")!])
    #expect(calls.enqueued == 0)
  }

  /// Mất mạng: xếp hàng, KHÔNG báo "đã lưu" — kế hoạch chờ outbox gửi xong.
  @Test func queuedWriteIsNotSaved() async {
    let server = Server(), queue = Queue(), calls = Calls()
    let l = Self.logger(server, queue, calls)
    #expect(await l.submit(kg: 70, online: false) == .queued)
    #expect(calls.saved.isEmpty)
    #expect(calls.enqueued == 1)
    #expect(await queue.entries.count == 1)
  }

  /// "Đã lưu" → đọc lại CHỈ `weight_logs`; ba tín hiệu kia giữ nguyên; lời nhắc
  /// cân hôm nay biến mất ngay; đồng bộ lại cùng tín hiệu không đặt lại.
  @Test func savedRefreshesOnlyWeightThenPlanDrops() async {
    let store = ReminderTodayBookTests.FakeStore()
    store.rows = [
      "daily_logs": [.object(["kcal": .number(1500), "sleep_duration_min": .number(0)])],
      "biometric_samples": [.object(["id": .string("b")])],
    ]
    let book = ReminderTodayBook(
      userId: "u1", store: store, clock: ReminderTodayBookTests.Clock(date: ReminderTodayBookTests.morning),
      timeZone: ReminderTodayBookTests.hcm)
    await book.refresh()
    #expect(book.signals == ReminderToday.Signals(weighed: false, mealLogged: true, sleepLogged: false, bioLogged: true))

    store.queries = []
    store.rows["weight_logs"] = [.object(["weight_kg": .number(70.5)])]
    store.rows["daily_logs"] = []  // nếu bị hỏi lại thì bữa sẽ thành false — không được hỏi
    await book.refresh([.weighed])
    #expect(store.queries.map { $0.table } == ["weight_logs"], "chỉ một truy vấn")
    #expect(book.signals == ReminderToday.Signals(weighed: true, mealLogged: true, sleepLogged: false, bioLogged: true))
  }

  /// Lưu cân online → lời nhắc cân hôm nay rời lịch; đồng bộ lại cùng tín hiệu không đặt lại.
  @Test func savedWeightDropsTodaysWeighInOnce() async {
    let os = ReminderTodayScheduleTests.OS()
    let copy: ReminderCopy = Dictionary(
      uniqueKeysWithValues: ReminderKey.allCases.map { ($0, ReminderText(title: "t", body: "b")) })
    let cal = ReminderTodayScheduleTests.calendar
    let at = ReminderTodayScheduleTests.monday6am
    let c = ReminderCenter(
      store: ReminderTodayScheduleTests.Store(), scheduler: os, copy: copy,
      clock: ReminderTodayScheduleTests.Clock(date: at), calendar: cal)
    await c.refreshPermission()
    await c.setEnabled(.weighIn, true)
    await c.sync(ReminderContext().with(.unread))
    #expect(await os.pending.contains { $0.key == .weighIn && cal.isDate($0.at, inSameDayAs: at) })
    let before = await os.writes
    await c.sync(ReminderContext().with(ReminderToday.Signals(weighed: true)))
    #expect(await os.writes == before + 1)
    #expect(!(await os.pending.contains { $0.key == .weighIn && cal.isDate($0.at, inSameDayAs: at) }))
    await c.sync(ReminderContext().with(ReminderToday.Signals(weighed: true)))
    #expect(await os.writes == before + 1, "kế hoạch không đổi → không huỷ-đặt lại")
  }
}

/// A-NEXT-6: sửa / xoá / hoàn tác món ở Nhật ký → chỉ khi server ĐÃ nhận và
/// `daily_logs` ĐÃ dựng lại thì kế hoạch nhắc nhở đọc lại `.meal` của hôm nay.
@MainActor
struct ReminderDiaryEditTests {
  final class Rebuilt: @unchecked Sendable {
    private let lock = NSLock()
    private var _days: [LocalDate] = []
    var days: [LocalDate] { lock.withLock { _days } }
    func add(_ d: LocalDate) { lock.withLock { _days.append(d) } }
  }

  static func book(_ s: MealDiaryBookTests.FakeSource, _ store: MealDiaryBookTests.FakeStore, _ r: Rebuilt) -> MealDiaryBook {
    MealDiaryBook(
      userId: "u1", source: s, store: store, clock: MealDiaryBookTests.Clock(at: MealDiaryBookTests.noon),
      timeZone: MealDiaryBookTests.utc, onRebuilt: { r.add($0) })
  }

  static let today = LocalDate("2026-10-09")!

  @Test func deleteSuccessReportsOnceAfterRebuild() async {
    let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore(), r = Rebuilt()
    let b = Self.book(s, store, r)
    let outcome = await b.delete([MealDiaryBookTests.item("i1")], online: true)
    guard case .done = outcome else { Issue.record("\(outcome)"); return }
    #expect(r.days == [Self.today])
    #expect(store.dates == ["2026-10-09"], "daily_logs đã dựng lại TRƯỚC khi báo")
  }

  @Test func servingsEditSuccessReportsOnce() async {
    let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore(), r = Rebuilt()
    let b = Self.book(s, store, r)
    let outcome = await b.setServings(MealDiaryBookTests.item("i1"), to: 2, online: true)
    guard case .done = outcome else { Issue.record("\(outcome)"); return }
    #expect(r.days == [Self.today])
  }

  /// Lỗi ghi / không chạm hàng nào / mất mạng / món còn trong outbox / dựng lại hỏng: không báo.
  @Test func nothingConfirmedReportsNothing() async {
    let r = Rebuilt()
    do {
      let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
      s.writeError = URLError(.badServerResponse)
      #expect(await Self.book(s, store, r).delete([MealDiaryBookTests.item("i1")], online: true) == .failed)
    }
    do {
      let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
      s.deleteTouched = 0
      #expect(await Self.book(s, store, r).delete([MealDiaryBookTests.item("i1")], online: true) == .nothingWritten)
    }
    do {
      let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
      #expect(await Self.book(s, store, r).setServings(MealDiaryBookTests.item("i1"), to: 2, online: false) == .onlineOnly)
    }
    do {
      let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
      var queued = MealDiaryBookTests.item("q1")
      queued.pending = true
      #expect(await Self.book(s, store, r).delete([queued], online: true) == .pendingSync)
      #expect(s.calls.isEmpty)
    }
    do {
      let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
      store.failRebuild = true
      #expect(await Self.book(s, store, r).delete([MealDiaryBookTests.item("i1")], online: true) == .rebuildFailed)
    }
    #expect(r.days.isEmpty)
  }

  /// Ngày ấy là hôm nay → đọc lại CHỈ `daily_logs`; ngày đã qua → không truy vấn.
  @Test func onlyTodayIsReread() async {
    let store = ReminderTodayBookTests.FakeStore()
    store.rows = ["daily_logs": [.object(["kcal": .number(0)])], "weight_logs": [.object(["weight_kg": .number(70)])]]
    let book = ReminderTodayBook(
      userId: "u1", store: store, clock: ReminderTodayBookTests.Clock(date: ReminderTodayBookTests.morning),
      timeZone: ReminderTodayBookTests.hcm)
    await book.refresh()
    #expect(book.signals.mealLogged == false)
    #expect(book.signals.weighed == true)
    store.queries = []
    store.rows["daily_logs"] = [.object(["kcal": .number(650)])]
    await book.changed(on: LocalDate("2026-10-08")!, [.meal])
    #expect(store.queries.isEmpty, "sửa ngày đã qua: không truy vấn")
    await book.changed(on: LocalDate("2026-10-09")!, [.meal])
    #expect(store.queries.map { $0.table } == ["daily_logs"])
    #expect(book.signals.mealLogged == true)
    #expect(book.signals.weighed == true, "tín hiệu khác giữ nguyên")
  }

  /// Bữa đổi trạng thái → lời nhắc bữa hôm nay đổi một lần; cùng trạng thái → không đặt lại.
  @Test func mealSignalReschedulesOnlyOnChange() async {
    let os = ReminderTodayScheduleTests.OS()
    let copy: ReminderCopy = Dictionary(
      uniqueKeysWithValues: ReminderKey.allCases.map { ($0, ReminderText(title: "t", body: "b")) })
    let cal = ReminderTodayScheduleTests.calendar
    let at = ReminderTodayScheduleTests.monday6am
    let c = ReminderCenter(
      store: ReminderTodayScheduleTests.Store(), scheduler: os, copy: copy,
      clock: ReminderTodayScheduleTests.Clock(date: at), calendar: cal)
    await c.refreshPermission()
    await c.setEnabled(.meal, true)
    let logged = ReminderContext().with(ReminderToday.Signals(mealLogged: true))
    await c.sync(logged)
    let writes = await os.writes
    #expect(!(await os.pending.contains { $0.key == .meal && cal.isDate($0.at, inSameDayAs: at) }))
    await c.sync(logged)
    #expect(await os.writes == writes, "xoá một món mà bữa vẫn > 0 kcal: không đặt lại")
    await c.sync(ReminderContext().with(ReminderToday.Signals(mealLogged: false)))
    #expect(await os.writes == writes + 1)
    #expect(await os.pending.contains { $0.key == .meal && cal.isDate($0.at, inSameDayAs: at) })
  }
}
