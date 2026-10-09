@testable import ASCNDCore
import Foundation
import Testing

/// Ghi bữa ăn (#527 Phase 3 · 3.2) — luật của `log-meal.tsx` /
/// `offline-write.ts` `case 'meal'` / `useRecentFoods` @ fac9ac2, viết tay theo mã RN.
struct MealLogRuleTests {
  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  @Test func mealTypeFromRouteOrLunch() {
    #expect(MealLog.mealType("dinner") == "dinner")
    #expect(MealLog.mealType("brunch") == "lunch")
    #expect(MealLog.mealType(nil) == "lunch")
  }

  /// `diaryStampAt`: hôm nay đúng giờ; ngày đã qua 12:00 ĐỊA PHƯƠNG.
  @Test func stampIsNowTodayAndLocalNoonInThePast() throws {
    // 2026-10-09T03:00:00Z = 10:00 ở Hà Nội.
    let now = EpochMillis(1_791_514_800_000)
    let today = try #require(LocalDate("2026-10-09"))
    #expect(MealLog.stamp(today, now: now, in: Self.hanoi) == "2026-10-09T03:00:00.000Z")
    #expect(MealLog.stamp(today.adding(days: -1), now: now, in: Self.hanoi) == "2026-10-08T05:00:00.000Z")
  }

  /// Món mẫu chung bị ẩn khi người đã có món riêng cùng tên (không phân biệt hoa thường).
  @Test func seedShadowsAreHidden() {
    let rows: [JSONValue] = [
      .object(["id": .string("s1"), "user_id": .null, "name": .string("Phở bò")]),
      .object(["id": .string("m1"), "user_id": .string("u1"), "name": .string("phở BÒ")]),
      .object(["id": .string("s2"), "user_id": .null, "name": .string("Cơm tấm")]),
    ]
    #expect(MealLog.dedupeSeedShadows(rows).compactMap { $0["id"]?.stringValue } == ["m1", "s2"])
  }

  /// `useRecentFoods`: bỏ tên trùng, chia về một khẩu phần, khẩu phần 0 → 1.
  @Test func recentFoodsDedupeAndDivide() {
    let rows: [JSONValue] = [
      .object(["food_name": .string("Phở"), "servings": .number(2), "kcal": .number(901), "protein_g": .number(41),
               "carbs_g": .number(120), "fat_g": .number(20), "fiber_g": .null]),
      .object(["food_name": .string("Phở"), "servings": .number(1), "kcal": .number(450)]),
      .object(["food_name": .string("Trứng"), "servings": .number(0), "kcal": .number(78), "food_item_id": .string("f9")]),
    ]
    let r = MealLog.recentFoods(rows)
    #expect(r.map(\.name) == ["Phở", "Trứng"])
    #expect(r[0].kcal == 451)
    #expect(r[0].protein == 21)
    #expect(r[0].fiber == 0)
    #expect(r[1].kcal == 78)
    #expect(r[1].foodItemId == "f9")
  }

  /// Món nhập tay: trống là 0; sai dạng / ngoài dải khoá; kcal trống thì tính từ macro.
  @Test func customItemRules() throws {
    #expect(MealLog.customItem(id: "a", name: " ", kcal: "200", protein: "", carbs: "", fat: "") == nil)
    #expect(MealLog.customItem(id: "a", name: "Cơm", kcal: "", protein: "", carbs: "", fat: "") == nil)
    #expect(MealLog.customItem(id: "a", name: "Cơm", kcal: "50000", protein: "", carbs: "", fat: "") == nil)
    #expect(MealLog.customItem(id: "a", name: "Cơm", kcal: "0x10", protein: "", carbs: "", fat: "") == nil)
    #expect(MealLog.customBad(kcal: "", protein: "2001", carbs: "", fat: ""))
    let it = try #require(MealLog.customItem(id: "a", name: " Cơm gà ", kcal: "", protein: "10", carbs: "20.5", fat: "5"))
    #expect(it.name == "Cơm gà")
    #expect(it.kcal == 167)
    #expect(it.carbs == 20.5)
    let k = try #require(MealLog.customItem(id: "b", name: "Bún", kcal: "350", protein: "", carbs: "", fat: ""))
    #expect(k.kcal == 350)
  }

  /// Bản ghi `meal`: số mỗi món đã nhân khẩu phần và làm tròn; tổng làm tròn trên tổng thô.
  @Test func entryRoundsPerItemAndOnTheTotal() throws {
    let items = [
      MealLog.Item(id: "x", foodItemId: "f1", name: "Phở", servings: 1.5, kcal: 301, protein: 10.3, carbs: 0, fat: 0),
      MealLog.Item(id: "y", foodItemId: nil, name: "Trà", servings: 1, kcal: 0.4, protein: 0.4, carbs: 0, fat: 0),
    ]
    let e = MealLog.entry(
      id: "M1", itemIds: ["I1", "I2"], userId: "u1", mealType: "dinner", dateTime: "2026-10-09T05:00:00.000Z",
      items: items, createdAt: EpochMillis(0))
    #expect(e.id == "m1")
    #expect(e.kind == MealLog.kind)
    #expect(e.payload["total_kcal"] == .number(452))
    #expect(e.payload["total_protein_g"] == .number(16))
    let rows = MealLog.itemRows(e.payload)
    #expect(rows.count == 2)
    #expect(rows[0]["id"] == .string("i1"))
    #expect(rows[0]["meal_entry_id"] == .string("m1"))
    #expect(rows[0]["kcal"] == .number(452))
    #expect(rows[0]["protein_g"] == .number(15))
    #expect(rows[1]["food_item_id"] == .null)
    #expect(MealLog.entryRow(e.payload)["items"] == nil)
    #expect(MealLog.entryRow(e.payload)["meal_type"] == .string("dinner"))
    #expect(MealLog.isRow(e))
  }

  /// `foldRecentMeals`: bỏ bữa rỗng, bỏ bữa trùng chữ ký (tập tên, không phân
  /// biệt thứ tự / hoa thường / khoảng trắng / trùng lặp), về 1 khẩu phần, tối đa 6.
  @Test func recentMealsFoldLikeRN() throws {
    func item(_ n: String, _ s: Double, _ k: Double) -> JSONValue {
      .object(["food_name": .string(n), "servings": .number(s), "kcal": .number(k), "protein_g": .number(10)])
    }
    let entries: [JSONValue] = [
      .object(["id": .string("e1"), "meal_type": .string("breakfast"), "date_time": .string("2026-10-09T01:00:00.000Z"),
               "meal_entry_items": .array([item("Trứng", 2, 156), item("Bánh mì", 1, 250)])]),
      .object(["id": .string("e2"), "meal_type": .string("breakfast"), "date_time": .string("2026-10-08T01:00:00.000Z"),
               "meal_entry_items": .array([item(" bánh MÌ ", 1, 240), item("trứng", 1, 78), item("Trứng", 1, 78)])]),
      .object(["id": .string("e3"), "meal_type": .string("lunch"), "meal_entry_items": .array([])]),
      .object(["id": .string("e4"), "meal_type": .string("lunch"), "date_time": .string("2026-10-07T05:00:00.000Z"),
               "meal_entry_items": .array([item("Phở", 0, 450)])]),
    ]
    let m = MealLog.recentMeals(entries)
    #expect(m.map(\.id) == ["e1", "e4"])
    let first = try #require(m.first)
    #expect(first.foods.map { $0.food.kcal } == [78, 250])
    #expect(first.foods.map { $0.servings } == [2, 1])
    #expect(first.kcal == 406)
    #expect(m[1].foods.first?.servings == 1)
    #expect(MealLog.mealSignature("lunch", ["B", " a ", "b", nil, ""]) == "lunch|a,b")
    let many = (0..<10).map { i in
      JSONValue.object(["id": .string("m\(i)"), "meal_type": .string("dinner"),
                        "meal_entry_items": .array([item("Món \(i)", 1, 100)])])
    }
    #expect(MealLog.recentMeals(many).count == 6)
  }

  /// "Thêm nhanh": yêu thích trước rồi gần đây, tối đa 14.
  @Test func quickAddsFavoritesFirstCappedAt14() {
    func food(_ i: Int) -> MealLog.Food {
      MealLog.Food(id: "f\(i)", foodItemId: "f\(i)", name: "Món \(i)", kcal: 1, protein: 0, carbs: 0, fat: 0, fiber: 0)
    }
    let q = MealLog.quickAdds(favorites: (0..<3).map(food), recents: (10..<30).map(food))
    #expect(q.count == 14)
    #expect(q.prefix(3).allSatisfy(\.favorite))
    #expect(q[0].id == "fav-f0")
    #expect(q[3].id == "rec-0")
  }

  /// `applyEdit`: ô trống = 0; ngoài dải thì không sửa; giữ khẩu phần + chất xơ.
  @Test func editKeepsServingsAndChecksBounds() throws {
    let it = MealLog.Item(id: "a", foodItemId: "f", name: "Cơm", servings: 2, kcal: 200, protein: 4, carbs: 45, fat: 1, fiber: 3)
    #expect(MealLog.edited(it, kcal: "50000", protein: "", carbs: "", fat: "") == nil)
    let e = try #require(MealLog.edited(it, kcal: "180", protein: "", carbs: "40", fat: "0.5"))
    #expect(e.kcal == 180)
    #expect(e.protein == 0)
    #expect(e.fat == 0.5)
    #expect(e.servings == 2)
    #expect(e.fiber == 3)
    #expect(MealLog.draftText(0) == "")
    #expect(MealLog.draftText(12.5) == "12.5")
    #expect(MealLog.draftText(200) == "200")
  }

  @Test func daysAgoByLocalCalendar() throws {
    let today = try #require(LocalDate("2026-10-09"))
    // 2026-10-08T18:00Z = 01:00 ngày 09 ở Hà Nội → hôm nay.
    #expect(MealLog.daysAgo(EpochMillis(iso8601: "2026-10-08T18:00:00.000Z"), today: today, in: Self.hanoi) == 0)
    #expect(MealLog.daysAgo(EpochMillis(iso8601: "2026-10-08T05:00:00.000Z"), today: today, in: Self.hanoi) == 1)
    #expect(MealLog.daysAgo(nil, today: today, in: Self.hanoi) == 0)
  }

  /// Sau khi server nhận: dựng lại CHỈ ngày ăn (không phải hôm nay).
  @Test func rebuildsTheDayEatenOnly() throws {
    let e = MealLog.entry(
      id: "m1", itemIds: ["i1"], userId: "u1", mealType: "lunch", dateTime: "2026-10-07T05:00:00.000Z",
      items: [MealLog.Item(id: "x", foodItemId: nil, name: "Phở", kcal: 450, protein: 0, carbs: 0, fat: 0)],
      createdAt: EpochMillis(0))
    let today = try #require(LocalDate("2026-10-09"))
    #expect(DailyLog.rebuildDays(after: e, today: today, in: Self.hanoi) == [LocalDate("2026-10-07")!])
  }
}

@MainActor
struct MealLoggerTests {
  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_514_800) }
  }

  final class FakeFoods: MealFoodSource, @unchecked Sendable {
    let lock = NSLock()
    var queries: [String] = []
    var rows: [JSONValue] = [.object(["id": .string("f1"), "user_id": .null, "name": .string("Phở bò"),
                                      "kcal": .number(450.4), "protein_g": .number(20), "carbs_g": .number(60),
                                      "fat_g": .number(12)])]
    var fail = false
    func search(_ text: String, limit: Int) async throws -> [JSONValue] {
      lock.withLock { queries.append("\(text)|\(limit)") }
      if fail { throw URLError(.notConnectedToInternet) }
      return rows
    }
    func recentItems(userId: String, limit: Int) async throws -> [JSONValue] { [] }
    var favoriteRows: [JSONValue] = []
    var mealRows: [JSONValue] = []
    func favorites(userId: String, limit: Int) async throws -> [JSONValue] {
      lock.withLock { queries.append("fav|\(limit)") }
      return favoriteRows
    }
    func recentMeals(userId: String, limit: Int) async throws -> [JSONValue] {
      lock.withLock { queries.append("meals|\(limit)") }
      return mealRows
    }
  }

  actor MealOutbox: PlanWriteStore {
    var entries: [OutboxEntry] = []
    func enqueue(_ es: [OutboxEntry]) async throws {
      for e in es where !entries.contains(where: { $0.id == e.id }) { entries.append(e) }
    }
    func pending(userId: String) async throws -> [OutboxEntry] { entries.filter { $0.userId == userId } }
  }

  final class Ids: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func next() -> String { lock.withLock { n += 1; return "id-\(n)" } }
  }

  static func logger(_ foods: FakeFoods, _ outbox: MealOutbox, date: LocalDate? = nil, meal: String? = nil) -> MealLogger {
    let ids = Ids()
    return MealLogger(
      userId: "u1", source: foods, store: outbox, date: date, mealType: meal, clock: Clock(),
      timeZone: MealLogRuleTests.hanoi, makeId: { ids.next() })
  }

  /// Dưới 2 ký tự không tìm; tìm thì 8 kết quả, số làm tròn.
  @Test func searchNeedsTwoCharacters() async throws {
    let f = FakeFoods()
    let l = Self.logger(f, MealOutbox())
    await l.search(" p ")
    #expect(f.queries.isEmpty)
    #expect(l.results == nil)
    await l.search("phở")
    #expect(f.queries == ["phở|8"])
    let food = try #require(l.results?.first)
    #expect(food.kcal == 450)
    f.fail = true
    await l.search("bún")
    #expect(l.searchFailed)
    #expect(l.results == [])
  }

  /// Tương lai kẹp về hôm nay; bữa lạ → "lunch".
  @Test func dateAndMealAreClamped() {
    let l = Self.logger(FakeFoods(), MealOutbox(), date: LocalDate("2026-12-01"), meal: "brunch")
    #expect(l.date.description == "2026-10-09")
    #expect(l.mealType == "lunch")
  }

  /// Lưu đúng một lần, vào hàng đợi, đóng dấu giữa trưa cho ngày đã qua.
  @Test func saveEnqueuesOnce() async throws {
    let f = FakeFoods(), o = MealOutbox()
    let l = Self.logger(f, o, date: LocalDate("2026-10-08"), meal: "dinner")
    #expect(await l.save(online: true) == .unavailable)
    await l.search("phở")
    l.add(try #require(l.results?.first))
    l.setServings("id-1", 2)
    l.setServings("id-1", 50)
    #expect(l.items.first?.servings == 2)
    #expect(await l.save(online: false) == .queued(online: false))
    #expect(await l.save(online: true) == .unavailable)
    let entries = await o.entries
    #expect(entries.count == 1)
    let e = try #require(entries.first)
    #expect(e.payload["date_time"] == .string("2026-10-08T05:00:00.000Z"))
    #expect(e.payload["meal_type"] == .string("dinner"))
    #expect(e.payload["total_kcal"] == .number(900))
    #expect(MealLog.isRow(e))
  }

  /// "Ăn lại": chỉ khi chưa có món; điền loại bữa + món + khẩu phần.
  @Test func repeatFillsAnEmptyMealOnly() async throws {
    let f = FakeFoods()
    f.mealRows = [.object([
      "id": .string("e1"), "meal_type": .string("dinner"), "date_time": .string("2026-10-08T12:00:00.000Z"),
      "meal_entry_items": .array([.object(["food_name": .string("Cá kho"), "servings": .number(1.5), "kcal": .number(300)])]),
    ])]
    f.favoriteRows = [.object(["id": .string("fv"), "user_id": .string("u1"), "name": .string("Sữa chua"), "kcal": .number(100)])]
    let l = Self.logger(f, MealOutbox())
    await l.loadRecents()
    #expect(l.favorites.map(\.name) == ["Sữa chua"])
    #expect(l.quickAdds.first?.favorite == true)
    #expect(f.queries.contains("fav|50"))
    #expect(f.queries.contains("meals|40"))
    let meal = try #require(l.recentMeals.first)
    #expect(l.showsRepeat)
    l.repeatMeal(meal)
    #expect(l.mealType == "dinner")
    #expect(l.items.count == 1)
    #expect(l.items[0].servings == 1.5)
    #expect(l.items[0].kcal == 200)
    #expect(!l.showsRepeat)
    l.repeatMeal(meal)
    #expect(l.items.count == 1)
    #expect(l.edit(l.items[0].id, kcal: "250", protein: "", carbs: "", fat: ""))
    #expect(l.totals.kcal == 375)
    #expect(!l.edit(l.items[0].id, kcal: "-1", protein: "", carbs: "", fat: ""))
  }

  @Test func removeAndCustom() {
    let l = Self.logger(FakeFoods(), MealOutbox())
    #expect(!l.addCustom(name: "", kcal: "100", protein: "", carbs: "", fat: ""))
    #expect(l.addCustom(name: "Bánh mì", kcal: "300", protein: "", carbs: "", fat: ""))
    #expect(l.items.count == 1)
    l.remove(l.items[0].id)
    #expect(l.items.isEmpty)
    #expect(!l.canSave)
  }
}
