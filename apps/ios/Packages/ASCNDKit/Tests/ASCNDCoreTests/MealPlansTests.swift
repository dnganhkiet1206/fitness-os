@testable import ASCNDCore
import Foundation
import Testing

/// Kế hoạch ăn (#527 Phase 3 · 3.4) — luật của `meal-plans.tsx` / `meal-plan.tsx`
/// / `meal-plan-wizard.tsx` / `planned-meal.ts` / `use-library.ts`, viết tay theo mã RN.
struct MealPlansRuleTests {
  static func item(_ id: String, day: Int, meal: String, name: String, kcal: Double) -> MealPlans.Item {
    MealPlans.Item(id: id, day: day, mealType: meal, name: name, kcal: kcal, protein: 10.4, fiber: 3)
  }

  /// Hàng `meal_plans`: số bữa 0 / thiếu → nil; không id → bỏ.
  @Test func planRows() {
    let p = MealPlans.Plan(row: .object([
      "id": .string("p1"), "name": .string("Tuần 1"), "goal": .string("cut"), "meals_per_day": .number(4),
    ]))
    #expect(p?.mealsPerDay == 4)
    #expect(p?.goal == "cut")
    #expect(MealPlans.Plan(row: .object(["id": .string("p2"), "meals_per_day": .number(0)]))?.mealsPerDay == nil)
    #expect(MealPlans.Plan(row: .object(["name": .string("x")])) == nil)
  }

  /// `useMealPlanFill`: đếm món theo (kế hoạch, ngày).
  @Test func fillCountsPerDay() {
    let rows: [JSONValue] = [
      .object(["meal_plan_id": .string("a"), "day_index": .number(0)]),
      .object(["meal_plan_id": .string("a"), "day_index": .number(0)]),
      .object(["meal_plan_id": .string("a"), "day_index": .number(3)]),
      .object(["meal_plan_id": .string("b"), "day_index": .number(6)]),
      .object(["day_index": .number(1)]),
    ]
    let f = MealPlans.fill(rows)
    #expect(f["a"] == [0: 2, 3: 1])
    #expect(f["b"] == [6: 1])
  }

  /// Bữa của ngày = `MEAL_ORDER` cắt theo số bữa (1…6, mặc định 3).
  @Test func slotsFollowMealOrder() {
    #expect(MealPlans.slots(nil).count == 3)
    #expect(MealPlans.slots(3) == Array(MealDiary.order.prefix(3)))
    #expect(MealPlans.slots(6) == MealDiary.order)
    #expect(MealPlans.slots(99) == MealDiary.order)
    #expect(MealPlans.slots(0).count == 1)
  }

  /// kcal ngày: mỗi món làm tròn rồi cộng; tuần = tổng bảy ngày; % mục tiêu.
  @Test func dayAndWeekTotals() {
    let items = [
      Self.item("1", day: 0, meal: "breakfast", name: "Yến mạch", kcal: 150.5),
      Self.item("2", day: 0, meal: "lunch", name: "Cơm", kcal: 200.4),
      Self.item("3", day: 2, meal: "dinner", name: "Cá", kcal: 99.5),
    ]
    #expect(MealPlans.dayKcal(items, day: 0) == 351)
    #expect(MealPlans.weekKcal(items) == 451)
    #expect(MealPlans.percent(351, target: 2200) == 16)
    #expect(MealPlans.percent(351, target: 0) == 0)
  }

  /// Các bữa có món, theo `MEAL_ORDER`; bữa lạ không hiện.
  @Test func mealsOfADay() {
    let items = [
      Self.item("1", day: 1, meal: "dinner", name: "Cá", kcal: 100),
      Self.item("2", day: 1, meal: "breakfast", name: "Trứng", kcal: 80),
      Self.item("3", day: 1, meal: "brunch", name: "Bánh", kcal: 80),
      Self.item("4", day: 2, meal: "lunch", name: "Cơm", kcal: 80),
    ]
    #expect(MealPlans.meals(items, day: 1).map { $0.meal } == ["breakfast", "dinner"])
    #expect(MealPlans.meals(items, day: 5).isEmpty)
  }

  /// `plannedMealIsLoggedToday`: cùng loại bữa + đúng tập tên (bỏ khoảng trắng, chữ thường).
  @Test func loggedTodayNeedsTheSameNameSet() {
    let planned = [
      Self.item("1", day: 0, meal: "lunch", name: "Cơm gà ", kcal: 500),
      Self.item("2", day: 0, meal: "lunch", name: "Canh", kcal: 50),
    ]
    func meal(_ type: String, _ names: [String]) -> MealDiary.Meal {
      MealDiary.Meal(
        id: "e", type: type, kcal: 0, protein: 0, carbs: 0, fat: 0,
        items: names.map {
          MealDiary.Item(id: $0, entryId: "e", foodName: $0, servings: 1, kcal: 0, protein: 0, carbs: 0, fat: 0)
        })
    }
    #expect(MealPlans.isLoggedToday(planned, mealType: "lunch", today: [meal("lunch", ["canh", "CƠM GÀ"])]))
    #expect(!MealPlans.isLoggedToday(planned, mealType: "lunch", today: [meal("dinner", ["Canh", "Cơm gà"])]))
    #expect(!MealPlans.isLoggedToday(planned, mealType: "lunch", today: [meal("lunch", ["Canh"])]))
    #expect(!MealPlans.isLoggedToday(planned, mealType: "lunch", today: [meal("lunch", ["Canh", "Cơm gà", "Trà"])]))
    #expect(!MealPlans.isLoggedToday([], mealType: "lunch", today: [meal("lunch", [])]))
  }

  /// Hàng thêm món: số làm tròn, khẩu phần 0 → 100, mang `food_item_id` và chất xơ.
  @Test func itemRowRoundsAndDefaultsServing() {
    let food = FoodLibrary.Food(
      id: "f1", userId: nil, name: "Ức gà", brand: nil, kcal: 165.5, protein: 31.2, carbs: 0, fat: 3.6, fiber: 0.4,
      servingG: 0, isFavorite: false)
    let r = MealPlans.itemRow(planId: "p1", day: 2, mealType: "dinner", food: food)
    #expect(r["serving_g"] == .number(100))
    #expect(r["kcal"] == .number(166))
    #expect(r["protein_g"] == .number(31))
    #expect(r["fat_g"] == .number(4))
    #expect(r["fiber_g"] == .number(0))
    #expect(r["day_index"] == .number(2))
    #expect(r["food_item_id"] == .string("f1"))
  }

  /// Món đã có trong (ngày, bữa) — để đánh dấu.
  @Test func alreadyHereMarksNames() {
    let items = [
      Self.item("1", day: 0, meal: "lunch", name: " Cơm ", kcal: 1),
      Self.item("2", day: 1, meal: "lunch", name: "Cá", kcal: 1),
    ]
    #expect(MealPlans.alreadyHere(items, day: 0, mealType: "lunch") == ["cơm"])
  }
}

@MainActor
struct MealPlansBookTests {
  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_514_800) }
  }

  final class FakeSource: MealPlansSource, @unchecked Sendable {
    let lock = NSLock()
    var calls: [String] = []
    var planRows: [JSONValue] = [.object(["id": .string("p1"), "name": .string("Tuần 1"), "meals_per_day": .number(3)])]
    var itemRows: [JSONValue] = [
      .object([
        "id": .string("i1"), "day_index": .number(0), "meal_type": .string("lunch"), "food_name": .string("Cơm gà"),
        "kcal": .number(500.4), "protein_g": .number(30), "carbs_g": .number(60), "fat_g": .number(12),
        "fiber_g": .number(2.6), "food_item_id": .string("f1"),
      ]),
      .object([
        "id": .string("i2"), "day_index": .number(0), "meal_type": .string("lunch"), "food_name": .string("Canh"),
        "kcal": .number(40),
      ]),
    ]
    var todayEntryRows: [JSONValue] = []
    var todayItemRows: [JSONValue] = []
    var failPlans = false
    var failFill = false
    var failToday = false
    var writeError: Error?
    var touched = 1
    func log(_ s: String) { lock.withLock { calls.append(s) } }

    func plans(userId: String) async throws -> [JSONValue] {
      log("plans")
      if failPlans { throw URLError(.badServerResponse) }
      return planRows
    }
    func fill(planIds: [String]) async throws -> [JSONValue] {
      if failFill { throw URLError(.badServerResponse) }
      return [.object(["meal_plan_id": .string("p1"), "day_index": .number(0)])]
    }
    func items(planId: String) async throws -> [JSONValue] { itemRows }
    func createPlan(userId: String, name: String, goal: String, mealsPerDay: Int) async throws -> String {
      log("create|\(name)|\(goal)|\(mealsPerDay)")
      if let writeError { throw writeError }
      return "p9"
    }
    func deletePlan(id: String, userId: String) async throws -> Int {
      log("deletePlan|\(id)")
      if let writeError { throw writeError }
      return touched
    }
    func addItem(_ row: [String: JSONValue]) async throws {
      log("add|\(row["food_name"]?.stringValue ?? "")")
      if let writeError { throw writeError }
    }
    func deleteItem(id: String) async throws -> Int {
      log("deleteItem|\(id)")
      if let writeError { throw writeError }
      return touched
    }
    func searchFoods(_ text: String, limit: Int) async throws -> [JSONValue] {
      log("search|\(text)|\(limit)")
      return [
        .object(["id": .string("s1"), "user_id": .null, "name": .string("Ức gà"), "kcal": .number(165)]),
        .object(["id": .string("s2"), "user_id": .string("u1"), "name": .string("ức gà"), "kcal": .number(160)]),
      ]
    }
    func myFoods(userId: String) async throws -> [JSONValue] {
      [
        .object(["id": .string("m2"), "user_id": .string("u1"), "name": .string("Táo"), "kcal": .number(50)]),
        .object(["id": .string("m1"), "user_id": .string("u1"), "name": .string("Bánh"), "kcal": .number(90)]),
      ]
    }
    func todayEntries(userId: String, start: String, end: String) async throws -> [JSONValue] {
      log("today|\(start)|\(end)")
      if failToday { throw URLError(.badServerResponse) }
      return todayEntryRows
    }
    func todayItems(entryIds: [String]) async throws -> [JSONValue] { todayItemRows }
  }

  actor Outbox: PlanWriteStore {
    var entries: [OutboxEntry] = []
    func enqueue(_ es: [OutboxEntry]) async throws { entries.append(contentsOf: es) }
    func pending(userId: String) async throws -> [OutboxEntry] { entries }
  }

  final class Ids: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func next() -> String { lock.withLock { n += 1; return "id-\(n)" } }
  }

  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func book(_ s: FakeSource, _ o: Outbox?) -> MealPlanBook {
    let ids = Ids()
    return MealPlanBook(
      userId: "u1", planId: "p1", source: s, store: o, clock: Clock(), timeZone: hanoi, makeId: { ids.next() })
  }

  /// Danh sách + chấm; chấm hỏng không làm hỏng danh sách; danh sách hỏng → lỗi.
  @Test func listLoadsWithFill() async {
    let s = FakeSource()
    s.failFill = true
    let b = MealPlansBook(userId: "u1", source: s)
    await b.load()
    #expect(b.plans.map(\.id) == ["p1"])
    #expect(b.fill.isEmpty)
    s.failFill = false
    await b.load()
    #expect(b.fill["p1"] == [0: 1])
    let broken = FakeSource()
    broken.failPlans = true
    let b2 = MealPlansBook(userId: "u1", source: broken)
    await b2.load()
    #expect(b2.phase == .failed(.unavailable))
  }

  /// Tạo: tên bắt buộc, mục tiêu / số bữa trong danh sách, chỉ khi có mạng.
  @Test func createValidatesAndNeedsNetwork() async {
    let s = FakeSource()
    let b = MealPlansBook(userId: "u1", source: s)
    #expect(await b.create(name: "  ", goal: "cut", mealsPerDay: 3, online: true).0 == .invalid)
    #expect(await b.create(name: "A", goal: "keto", mealsPerDay: 3, online: true).0 == .invalid)
    #expect(await b.create(name: "A", goal: "cut", mealsPerDay: 7, online: true).0 == .invalid)
    #expect(await b.create(name: "A", goal: "cut", mealsPerDay: 3, online: false).0 == .onlineOnly)
    let made = await b.create(name: "  Tuần 2 ", goal: "bulk", mealsPerDay: 5, online: true)
    #expect(made.0 == .done)
    #expect(made.1 == "p9")
    #expect(s.calls.contains("create|Tuần 2|bulk|5"))
    s.writeError = URLError(.notConnectedToInternet)
    #expect(await b.create(name: "B", goal: "cut", mealsPerDay: 3, online: true).0 == .onlineOnly)
  }

  /// Ghi bữa vào hôm nay: một bản ghi `meal` qua hàng đợi, mỗi món một khẩu phần.
  @Test func eatEnqueuesOneMealEntry() async throws {
    let s = FakeSource(), o = Outbox()
    let b = Self.book(s, o)
    await b.load()
    #expect(b.items.count == 2)
    #expect(s.calls.contains("today|2026-10-08T17:00:00.000Z|2026-10-09T17:00:00.000Z"))
    #expect(!b.isLoggedToday("lunch", day: 0))
    #expect(await b.eat(meal: "dinner", day: 0, online: true) == .nothing)
    #expect(await b.eat(meal: "lunch", day: 0, online: false) == .queued(online: false))
    let e = try #require(await o.entries.first)
    #expect(e.kind == MealLog.kind)
    #expect(e.payload["meal_type"] == .string("lunch"))
    #expect(e.payload["date_time"] == .string(WorkoutSessionRecord.iso8601(Clock().nowMillis())))
    #expect(e.payload["total_kcal"] == .number(540))
    #expect(e.payload["total_fiber_g"] == .number(3))
    #expect(MealLog.isRow(e))
    #expect(await Self.book(s, nil).eat(meal: "lunch", day: 0, online: true) == .nothing)
  }

  /// Hôm nay đã có đúng bữa ấy → biết để hỏi lại; đọc hỏng → coi như chưa ghi.
  @Test func loggedTodayFromDiary() async {
    let s = FakeSource()
    s.todayEntryRows = [.object([
      "id": .string("e1"), "meal_type": .string("lunch"), "date_time": .string("2026-10-09T05:00:00.000Z"),
    ])]
    s.todayItemRows = [
      .object(["id": .string("a"), "meal_entry_id": .string("e1"), "food_name": .string("canh")]),
      .object(["id": .string("b"), "meal_entry_id": .string("e1"), "food_name": .string("Cơm gà")]),
    ]
    let b = Self.book(s, Outbox())
    await b.load()
    #expect(b.isLoggedToday("lunch", day: 0))
    s.failToday = true
    await b.load()
    #expect(!b.isLoggedToday("lunch", day: 0))
    #expect(b.items.count == 2)
  }

  /// Xoá / thêm chỉ khi có mạng; xoá không chạm hàng nào → `nothingWritten`.
  @Test func writesAreOnlineOnlyAndConfirmed() async {
    let s = FakeSource()
    let b = Self.book(s, Outbox())
    await b.load()
    #expect(await b.deleteItem("i1", online: false) == .onlineOnly)
    #expect(await b.deleteItem("i1", online: true) == .done)
    s.touched = 0
    #expect(await b.deleteItem("i1", online: true) == .nothingWritten)
    #expect(await b.deletePlan(online: true) == .nothingWritten)
    s.writeError = URLError(.badServerResponse)
    #expect(await b.deleteItem("i1", online: true) == .failed)
    s.writeError = nil
    let food = FoodLibrary.Food(
      id: "f", userId: "u1", name: "Táo", brand: nil, kcal: 50, protein: 0, carbs: 12, fat: 0, fiber: 2,
      servingG: 100, isFavorite: false)
    #expect(await b.add(food, day: 7, meal: "lunch", online: true) == .invalid)
    #expect(await b.add(food, day: 0, meal: "brunch", online: true) == .invalid)
    #expect(await b.add(food, day: 0, meal: "lunch", online: true) == .done)
    #expect(s.calls.contains("add|Táo"))
  }

  /// Tìm: dưới 2 ký tự không gọi; bỏ món mẫu trùng tên món riêng; món của tôi xếp tên.
  @Test func searchAndMyFoods() async {
    let s = FakeSource()
    let b = Self.book(s, nil)
    await b.search(" g ")
    #expect(b.results == nil)
    #expect(!s.calls.contains { $0.hasPrefix("search") })
    await b.search("gà")
    #expect(s.calls.contains("search|gà|15"))
    #expect(b.results?.map(\.id) == ["s2"])
    await b.loadMyFoods()
    #expect(b.myFoods.map(\.name) == ["Bánh", "Táo"])
  }
}
