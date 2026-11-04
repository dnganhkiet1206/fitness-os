@testable import ASCNDCore
import Foundation
import Testing

/// Kho giả của `AssistantSignalBook`: hàng theo bảng, ném ở bảng trong `failing`, ghi lại mọi lượt đọc.
/// `daily_logs` có hai lượt đọc: dòng hôm nay (lọc `date` =) và bảy ngày trước (khoảng ngày) — khoá
/// `daily_logs.history` cho lượt sau.
private final class SignalRows: RowStore, @unchecked Sendable {
  private let lock = NSLock()
  private let tables: [String: [JSONValue]]
  private let failing: Set<String>
  private var _queries: [RowQuery] = []

  init(_ tables: [String: [JSONValue]], failing: Set<String> = []) {
    self.tables = tables
    self.failing = failing
  }

  var queries: [RowQuery] { lock.withLock { _queries } }

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    lock.withLock { _queries.append(q) }
    if failing.contains(q.table) { throw RowStoreError(code: "500", message: "boom") }
    let today = q.filters.contains { f in
      if case .eq(let column, _) = f { return column == "date" }
      return false
    }
    if q.table == "daily_logs", !today { return tables["daily_logs.history"] ?? [] }
    return tables[q.table] ?? []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
    -> Int
  { 0 }
}

/// `useAssistantSignal` gom bảy lượt đọc thành tín hiệu của Trợ lý, thẻ Insight và lời nhắc ghi của Koa.
/// Trước 04/11 chỉ phép dựng `Signal.from` có test; phần gom (ai đọc gì, đọc hỏng thì ra sao) thì chưa.
@MainActor
struct AssistantSignalBookTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let today = LocalDate("2026-10-09")!

  static func full() -> [String: [JSONValue]] {
    [
      "daily_logs": [
        .object([
          "readiness_score": .number(71.6), "readiness_status": .string("green"), "sleep_duration_min": .number(420),
          "water_ml": .number(1200), "workout_count": .number(1), "kcal": .number(1800), "protein_g": .number(90),
          "steps": .number(8000),
        ])
      ],
      "profiles": [
        .object([
          "name": .string("  An "), "tdee_target_kcal": .number(2400), "macro_protein_g": .number(150),
          "sleep_target_hours": .number(7.5), "water_target_ml": .number(3000),
        ])
      ],
      // 23:30 giờ VN ngày 07/10 = 16:30 UTC → hai ngày lịch trước 09/10.
      "workout_sessions": [.object(["date_time": .string("2026-10-07T16:30:00+00:00")])],
      "biometric_samples": [.object(["date_time": .string("2026-10-09T01:00:00+00:00"), "hr_bpm": .number(61.6)])],
      "meal_entries": [.object(["meal_type": .string("breakfast")]), .object(["meal_type": .string("lunch")])],
      "weight_logs": [.object(["date": .string("2026-10-09"), "weight_kg": .number(70.2)])],
    ]
  }

  fileprivate static func book(_ rows: SignalRows) -> AssistantSignalBook {
    AssistantSignalBook(userId: "u1", today: today, store: rows, in: tz)
  }

  @Test func readsTodayIntoOneSignal() async {
    let book = Self.book(SignalRows(Self.full()))
    await book.load()
    #expect(book.signal.readiness == 72)
    #expect(book.signal.status == "green")
    #expect(book.signal.name == "An")
    #expect(book.signal.kcalTarget == 2400)
    #expect(book.signal.proteinTarget == 150)
    #expect(book.signal.daysSinceWorkout == 2)
    #expect(book.heartRate == 62)
    #expect(book.waterMl == 1200)
    #expect(book.sleepTargetMin == 450)
    #expect(book.waterTargetMl == 3000)
    #expect(
      book.logged
        == CoachLogPrompt.LoggedToday(
          sleepMin: 420, workout: true, waterMl: 1200, weightKg: 70.2, meals: ["breakfast", "lunch"]))
    #expect(book.week != nil)
  }

  /// Chưa có dòng nào (người mới): mọi số 0, mục tiêu ngủ / nước mặc định, không nhịp tim (ô hiện "—").
  @Test func emptyDayUsesTheDefaults() async {
    let book = Self.book(SignalRows([:]))
    await book.load()
    #expect(book.signal.readiness == nil)
    #expect(book.signal.daysSinceWorkout == nil)
    #expect(book.heartRate == nil)
    #expect(book.waterMl == 0)
    #expect(book.sleepTargetMin == 480)
    #expect(book.waterTargetMl == 2500)
    #expect(book.logged == CoachLogPrompt.LoggedToday())
  }

  /// Đọc bữa hỏng: không biết hôm nay đã ghi gì, nên Koa không gợi ý ghi (`logged` nil) — các số khác vẫn có.
  @Test func failedMealReadMeansNoLogPrompt() async {
    let book = Self.book(SignalRows(Self.full(), failing: ["meal_entries"]))
    await book.load()
    #expect(book.logged == nil)
    #expect(book.signal.readiness == 72)
    #expect(book.heartRate == 62)
  }

  /// Đọc `daily_logs` hỏng: tín hiệu như chưa có dòng (RN: `undefined`), thẻ Insight không có tuần; hồ sơ vẫn đọc.
  @Test func failedDailyLogReadKeepsTheProfile() async {
    let book = Self.book(SignalRows(Self.full(), failing: ["daily_logs"]))
    await book.load()
    #expect(book.signal.readiness == nil)
    #expect(book.week == nil)
    #expect(book.signal.name == "An")
    #expect(book.waterTargetMl == 3000)
  }

  /// Màn đã đóng: lượt đọc về muộn không ghi gì.
  @Test func closedBookPublishesNothing() async {
    let book = Self.book(SignalRows(Self.full()))
    book.close()
    await book.load()
    #expect(book.signal == AssistantSuggestions.Signal())
    #expect(book.logged == nil)
    #expect(book.heartRate == nil)
  }

  /// Cô lập tài khoản: cả bảy lượt đọc đều lọc theo người đang dùng.
  @Test func everyReadIsScopedToTheAccount() async {
    let rows = SignalRows(Self.full())
    await Self.book(rows).load()
    #expect(rows.queries.count == 7)
    for q in rows.queries {
      #expect(q.filters.contains(.eq("user_id", .string("u1"))), "\(q.table) không lọc theo user_id")
    }
  }

  @Test func moveReadsTheNewDay() async {
    let rows = SignalRows(Self.full())
    let book = Self.book(rows)
    let next = Self.today.adding(days: 1)
    await book.move(to: next)
    #expect(book.today == next)
    #expect(rows.queries.contains { $0.table == "daily_logs" && $0.filters.contains(.eq("date", .string(next.description))) })
  }
}
