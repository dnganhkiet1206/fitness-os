@testable import ASCNDCore
import Foundation
import Testing

/// Nhật ký bữa ăn (#527 Phase 3 · 3.10) — luật của `use-nutrition.ts` /
/// `today-meals.tsx` / `diary.tsx` @ fac9ac2, viết tay theo mã RN.
struct MealDiaryRuleTests {
  static func item(_ id: String, entry: String, kcal: Double, servings: Double = 1) -> JSONValue {
    .object([
      "id": .string(id), "meal_entry_id": .string(entry), "food_name": .string("Món \(id)"),
      "servings": .number(servings), "kcal": .number(kcal), "protein_g": .number(10.5), "carbs_g": .string("20.4"),
      "fat_g": .null,
    ])
  }

  static func entry(_ id: String, type: String, kcal: Double) -> JSONValue {
    .object([
      "id": .string(id), "meal_type": .string(type), "date_time": .string("2026-10-09T01:00:00.000Z"),
      "total_kcal": .number(kcal), "total_protein_g": .number(10.5), "total_carbs_g": .number(0),
      "total_fat_g": .string(""),
    ])
  }

  /// `useTodayLog`: số làm tròn nửa LÊN, chuỗi số đọc như `Number`, `null` / "" → 0,
  /// khẩu phần 0 → 1; món của bữa khác không lọt vào.
  @Test func joinsTwoReadsLikeRN() throws {
    let meals = MealDiary.meals(
      entries: [Self.entry("e1", type: "lunch", kcal: 520.5)],
      items: [Self.item("i1", entry: "e1", kcal: 200.5, servings: 0), Self.item("x", entry: "other", kcal: 9)])
    let m = try #require(meals.first)
    #expect(meals.count == 1)
    #expect(m.kcal == 521)
    #expect(m.protein == 11)
    #expect(m.fat == 0)
    #expect(m.items.count == 1)
    let it = try #require(m.items.first)
    #expect(it.kcal == 201)
    #expect(it.carbs == 20)
    #expect(it.fat == 0)
    #expect(it.servings == 1)
  }

  /// `groupByType`: thứ tự một ngày, loại lạ đứng trước (`indexOf` = -1), đếm bữa.
  @Test func groupsInDayOrder() {
    func meal(_ id: String, _ type: String, _ kcal: Double) -> MealDiary.Meal {
      MealDiary.Meal(id: id, type: type, kcal: kcal, protein: 1, carbs: 1, fat: 1, items: [])
    }
    let groups = MealDiary.groups([
      meal("a", "dinner", 300), meal("b", "breakfast", 100), meal("c", "lunch", 200), meal("d", "brunch", 50),
      meal("e", "breakfast", 150),
    ])
    #expect(groups.map(\.type) == ["brunch", "breakfast", "lunch", "dinner"])
    #expect(groups[1].entries == 2)
    #expect(groups[1].kcal == 250)
    #expect(groups[1].protein == 2)
  }

  /// `?date=` tương lai kẹp về hôm nay; ngày đã qua giữ nguyên.
  @Test func startDateNeverFuture() throws {
    let today = try #require(LocalDate("2026-10-09"))
    #expect(MealDiary.startDate(LocalDate("2026-10-10"), today: today) == today)
    #expect(MealDiary.startDate(LocalDate("2026-10-01"), today: today) == LocalDate("2026-10-01"))
    #expect(MealDiary.startDate(nil, today: today) == today)
  }

  /// Sửa khẩu phần lưu số CHÍNH XÁC: 10 kcal ×0.4 → 4 → ×0.4 → 1.6 → về 1
  /// khẩu phần ra lại 10 (RN cũ làm tròn thì ra 13).
  @Test func servingsScaleIsReversible() {
    var row: JSONValue = .object([
      "servings": .number(1), "kcal": .number(10), "protein_g": .number(0), "carbs_g": .number(0),
      "fat_g": .number(0), "fiber_g": .number(5),
    ])
    for s in [0.4, 0.16, 1.0] {
      let upd = MealDiary.servingsUpdate(row: row, servings: s)
      var o: [String: JSONValue] = [:]
      if case .object(let cur) = row { o = cur }
      for (k, v) in upd { o[k] = v }
      row = .object(o)
    }
    #expect(abs((row["kcal"]?.doubleValue ?? 0) - 10) < 1e-9)
    #expect(abs((row["fiber_g"]?.doubleValue ?? 0) - 5) < 1e-9)
    #expect(row["servings"]?.doubleValue == 1)
  }

  /// `resyncMealEntry`: tổng làm tròn từ món còn lại; hết món → xoá bữa.
  @Test func entryTotalsFromRemainingItems() throws {
    #expect(MealDiary.entryTotals([]) == nil)
    let t = try #require(
      MealDiary.entryTotals([
        .object(["kcal": .number(100.4), "protein_g": .number(1), "fiber_g": .null]),
        .object(["kcal": .number(0.2), "protein_g": .string("2.5")]),
      ]))
    #expect(t["total_kcal"] == .number(101))
    #expect(t["total_protein_g"] == .number(4))
    #expect(t["total_fiber_g"] == .number(0))
    #expect(t.count == 5)
  }

  /// "×1.5" chỉ khi khác 1; stepper 0,5…20 bước 0,5; số nguyên in trần.
  @Test func servingsDisplayAndStepper() {
    #expect(MealDiary.servingsBadge(1) == nil)
    #expect(MealDiary.servingsBadge(1.5) == "1.5")
    #expect(MealDiary.servingsBadge(0.30000000000000004) == "0.3")
    #expect(MealDiary.servingsBadge(2) == "2")
    #expect(MealDiary.servingsText(2) == "2")
    #expect(MealDiary.servingsText(2.5) == "2.5")
    #expect(MealDiary.step(0.5, by: -1) == 0.5)
    #expect(MealDiary.step(20, by: 1) == 20)
    #expect(MealDiary.step(1, by: 1) == 1.5)
  }
}

@MainActor
struct MealDiaryBookTests {
  struct Clock: WallClock {
    let at: Date
    func now() -> Date { at }
  }

  static let utc = TimeZone(identifier: "UTC")!
  /// 2026-10-09T12:00:00Z.
  static let noon = Date(timeIntervalSince1970: 1_791_547_200)

  final class FakeSource: MealDiarySource, @unchecked Sendable {
    let lock = NSLock()
    var entryRows: [JSONValue] = []
    var itemRows: [JSONValue] = []
    var itemsError: (any Error)?
    var snapshotFails = false
    var deleteTouched = 1
    var remaining: [JSONValue] = [.object(["kcal": .number(50)])]
    var writeError: (any Error)?
    var calls: [String] = []
    var ranges: [(String, String)] = []

    func log(_ s: String) { lock.withLock { calls.append(s) } }

    func entries(userId: String, start: String, end: String) async throws -> [JSONValue] {
      lock.withLock { ranges.append((start, end)) }
      return entryRows
    }
    func items(entryIds: [String]) async throws -> [JSONValue] {
      if let itemsError { throw itemsError }
      return itemRows
    }
    func item(id: String) async throws -> JSONValue? {
      if snapshotFails { throw URLError(.badServerResponse) }
      return .object(["id": .string(id), "meal_entry_id": .string("e1"), "servings": .number(1), "kcal": .number(100)])
    }
    func entry(id: String, userId: String) async throws -> JSONValue? {
      if snapshotFails { throw URLError(.badServerResponse) }
      return .object(["id": .string(id), "user_id": .string(userId)])
    }
    func deleteItem(id: String) async throws -> Int {
      log("deleteItem \(id)")
      if let writeError { throw writeError }
      return deleteTouched
    }
    func updateItem(id: String, _ row: [String: JSONValue]) async throws -> Int {
      log("updateItem \(id) \(row["servings"]?.doubleValue ?? -1) \(row["kcal"]?.doubleValue ?? -1)")
      if let writeError { throw writeError }
      return 1
    }
    func remainingItems(entryId: String) async throws -> [JSONValue] { remaining }
    func deleteEntry(id: String) async throws -> Int {
      log("deleteEntry \(id)")
      return 1
    }
    func updateEntry(id: String, _ row: [String: JSONValue]) async throws -> Int {
      log("updateEntry \(id) \(row["total_kcal"]?.doubleValue ?? -1)")
      return 1
    }
    func restore(entry: JSONValue) async throws { log("restoreEntry") }
    func restore(item: JSONValue) async throws { log("restoreItem") }
  }

  /// Lượt dựng `daily_logs`: đọc nguồn rỗng rồi chèn — hỏng khi được bảo.
  final class FakeStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var failRebuild = false
    var dates: [String] = []
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if failRebuild { throw RowStoreError(code: nil, message: "offline") }
      return []
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
      lock.withLock { dates.append(row["date"]?.stringValue ?? "") }
    }
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 1 }
  }

  static func item(_ id: String = "i1", entry: String = "e1", servings: Double = 1) -> MealDiary.Item {
    MealDiary.Item(id: id, entryId: entry, foodName: "Phở", servings: servings, kcal: 100, protein: 1, carbs: 1, fat: 1)
  }

  static func book(_ s: FakeSource, _ store: FakeStore, date: LocalDate? = nil) -> MealDiaryBook {
    MealDiaryBook(userId: "u1", source: s, store: store, date: date, clock: Clock(at: noon), timeZone: utc)
  }

  /// Đọc đúng cửa sổ ngày địa phương; lượt đọc món hỏng = cả ngày hỏng.
  @Test func secondReadFailureIsAFailure() async {
    let s = FakeSource(), store = FakeStore()
    s.entryRows = [MealDiaryRuleTests.entry("e1", type: "lunch", kcal: 100)]
    s.itemsError = URLError(.badServerResponse)
    let b = Self.book(s, store)
    await b.load()
    #expect(b.phase == .failed(.unavailable))
    #expect(s.ranges.first?.0 == "2026-10-09T00:00:00.000Z")
    #expect(s.ranges.first?.1 == "2026-10-10T00:00:00.000Z")
  }

  /// Không bao giờ qua hôm nay; đổi ngày là đang tải.
  @Test func navigationStopsAtToday() async {
    let s = FakeSource(), store = FakeStore()
    let b = Self.book(s, store)
    await b.load()
    #expect(b.go(1) == false)
    #expect(b.go(-1) == true)
    #expect(b.phase == .loading)
    #expect(b.date.description == "2026-10-08")
    b.goToday()
    #expect(b.isToday)
  }

  /// Xoá: chụp → xoá → tính lại tổng bữa → dựng lại NGÀY ĐANG XEM → mời hoàn tác.
  @Test func deleteResyncsRebuildsAndOffersUndo() async {
    let s = FakeSource(), store = FakeStore()
    let b = Self.book(s, store, date: LocalDate("2026-10-07"))
    let out = await b.delete([Self.item()], online: true)
    guard case .done(let undo) = out else {
      Issue.record("\(out)")
      return
    }
    #expect(undo.count == 1)
    #expect(s.calls == ["deleteItem i1", "updateEntry e1 50.0"])
    #expect(store.dates == ["2026-10-07"])
  }

  /// Món cuối: bữa rỗng thì xoá bữa.
  @Test func lastItemDeletesTheEntry() async {
    let s = FakeSource(), store = FakeStore()
    s.remaining = []
    let out = await Self.book(s, store).delete([Self.item()], online: true)
    #expect(s.calls == ["deleteItem i1", "deleteEntry e1"])
    if case .done = out {} else { Issue.record("\(out)") }
  }

  /// Chụp hỏng vẫn xoá — chỉ không mời hoàn tác.
  @Test func snapshotFailureStillDeletes() async {
    let s = FakeSource(), store = FakeStore()
    s.snapshotFails = true
    let out = await Self.book(s, store).delete([Self.item()], online: true)
    #expect(out == .done(undo: []))
    #expect(s.calls.first == "deleteItem i1")
  }

  /// Không hàng nào bị xoá: nói thật, không dựng lại.
  @Test func nothingWrittenIsReported() async {
    let s = FakeSource(), store = FakeStore()
    s.deleteTouched = 0
    let out = await Self.book(s, store).delete([Self.item()], online: true)
    #expect(out == .nothingWritten)
    #expect(store.dates.isEmpty)
  }

  /// Mất mạng: không gửi gì.
  @Test func offlineWritesNothing() async {
    let s = FakeSource(), store = FakeStore()
    let b = Self.book(s, store)
    #expect(await b.delete([Self.item()], online: false) == .onlineOnly)
    #expect(await b.setServings(Self.item(), to: 2, online: false) == .onlineOnly)
    #expect(s.calls.isEmpty)
  }

  /// Ghi xong mà dựng lại hỏng: KHÔNG được trông như đã xong.
  @Test func rebuildFailureIsNotDone() async {
    let s = FakeSource(), store = FakeStore()
    store.failRebuild = true
    let out = await Self.book(s, store).delete([Self.item()], online: true)
    #expect(out == .rebuildFailed)
    #expect(s.calls.contains("deleteItem i1"))
  }

  /// Hoàn tác: bữa trước, món sau (khoá ngoại), rồi tính lại tổng và dựng lại.
  @Test func restoreEntryThenItem() async {
    let s = FakeSource(), store = FakeStore()
    let snap = DeletedMealItem(
      item: .object(["id": .string("i1"), "meal_entry_id": .string("e1")]), entry: .object(["id": .string("e1")]))
    let out = await Self.book(s, store).restore([snap], online: true)
    #expect(out == .done(undo: []))
    #expect(s.calls == ["restoreEntry", "restoreItem", "updateEntry e1 50.0"])
    #expect(store.dates == ["2026-10-09"])
  }

  /// Sửa khẩu phần nhân theo tỉ lệ từ hàng đọc ngay trước; không đổi thì không ghi.
  @Test func setServingsScalesFromServerRow() async {
    let s = FakeSource(), store = FakeStore()
    let b = Self.book(s, store)
    #expect(await b.setServings(Self.item(), to: 1, online: true) == .done(undo: []))
    #expect(s.calls.isEmpty)
    #expect(await b.setServings(Self.item(), to: 2.5, online: true) == .done(undo: []))
    #expect(s.calls == ["updateItem i1 2.5 250.0", "updateEntry e1 50.0"])
    #expect(await b.setServings(Self.item(), to: 25, online: true) == .failed)
  }

  /// Đóng sổ: lượt đọc về muộn không đổi màn.
  @Test func closedBookIgnoresLateReads() async {
    let s = FakeSource(), store = FakeStore()
    let b = Self.book(s, store)
    b.close()
    await b.load()
    #expect(b.phase == .loading)
    #expect(await b.delete([Self.item()], online: true) == .failed)
  }
}
