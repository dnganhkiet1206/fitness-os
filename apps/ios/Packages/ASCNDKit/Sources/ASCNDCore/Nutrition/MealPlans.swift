public import Foundation
public import Observation

/// Kế hoạch ăn (#527 Phase 3 · 3.4) — `app/meal-plans.tsx` + `app/meal-plan.tsx`
/// + `components/ascnd/meal-plan-wizard.tsx` + `lib/planned-meal.ts` + hook
/// `useMealPlans` / `useMealPlanFill` / `useCreateMealPlan` / `useDeleteMealPlan`
/// / `useMealPlanItems` / `useAddMealPlanItem` / `useDeleteMealPlanItem`
/// (`use-library.ts`) + `useLogPlannedMeal` (`use-nutrition.ts`).
///
/// RN behavior (giữ nguyên):
/// - danh sách kế hoạch của người, mới → cũ; mỗi hàng kèm số món từng ngày
///   (bảy chấm); đọc hỏng là lỗi, không phải "chưa có kế hoạch";
/// - tạo: tên (bắt buộc), mục tiêu bulk / cut / maintain, 3–6 bữa / ngày; một
///   kế hoạch có 7 ngày; bữa của ngày = `MEAL_ORDER` cắt theo số bữa;
/// - chi tiết: dải 7 ngày (chấm = ngày có món), kcal của ngày (mỗi món làm
///   tròn rồi cộng), % mục tiêu calo, tổng tuần; các bữa có món theo
///   `MEAL_ORDER`; xoá từng món; xoá cả kế hoạch (hỏi lại);
/// - "Ghi vào hôm nay": cả bữa thành MỘT bản ghi `meal` qua hàng đợi bền (như
///   `log-meal`), mỗi món một khẩu phần, số làm tròn; hôm nay đã có một bữa
///   cùng loại với ĐÚNG tập tên món ấy → hỏi "Ghi thêm?" (không chặn);
/// - thêm món: chọn ngày, bữa, rồi tìm `food_items` (≥ 2 ký tự, 15 kết quả, ẩn
///   món mẫu trùng tên món riêng) hoặc chọn từ "Của tôi"; khẩu phần 0 → 100 g;
/// - tạo / xoá / thêm CHỈ khi có mạng (`useOnlineMutation`); xoá không chạm
///   hàng nào → lỗi.
public enum MealPlans {
  public static let days = Array(0..<7)
  public static let mealsPerDayChoices = [3, 4, 5, 6]
  public static let goals = ["bulk", "cut", "maintain"]
  public static let searchLimit = 15

  public struct Plan: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let goal: String?
    public let mealsPerDay: Int?

    public init(id: String, name: String, goal: String?, mealsPerDay: Int?) {
      self.id = id
      self.name = name
      self.goal = goal
      self.mealsPerDay = mealsPerDay
    }

    public init?(row r: JSONValue) {
      guard let id = r["id"]?.stringValue else { return nil }
      let m = JS.number(r["meals_per_day"])
      self.init(
        id: id, name: r["name"]?.stringValue ?? "", goal: r["goal"]?.stringValue,
        mealsPerDay: JS.truthy(m) ? Int(m) : nil)
    }
  }

  /// Một món đã lên kế hoạch (`PlannedFood` + id / ngày / bữa).
  public struct Item: Sendable, Hashable, Identifiable {
    public let id: String
    public let day: Int
    public let mealType: String
    public let name: String
    public let foodItemId: String?
    public let servingG: Double
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double

    public init(
      id: String, day: Int, mealType: String, name: String, foodItemId: String? = nil, servingG: Double = 100,
      kcal: Double, protein: Double = 0, carbs: Double = 0, fat: Double = 0, fiber: Double = 0
    ) {
      self.id = id
      self.day = day
      self.mealType = mealType
      self.name = name
      self.foodItemId = foodItemId
      self.servingG = servingG
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.fiber = fiber
    }

    public init?(row r: JSONValue) {
      guard let id = r["id"]?.stringValue, let day = r["day_index"]?.intValue else { return nil }
      self.init(
        id: id, day: day, mealType: r["meal_type"]?.stringValue ?? "", name: r["food_name"]?.stringValue ?? "",
        foodItemId: r["food_item_id"]?.stringValue, servingG: MealDiary.num(r["serving_g"]),
        kcal: MealDiary.num(r["kcal"]), protein: MealDiary.num(r["protein_g"]), carbs: MealDiary.num(r["carbs_g"]),
        fat: MealDiary.num(r["fat_g"]), fiber: MealDiary.num(r["fiber_g"]))
    }
  }

  /// `useMealPlanFill`: số món mỗi (kế hoạch, ngày).
  public static func fill(_ rows: [JSONValue]) -> [String: [Int: Int]] {
    var out: [String: [Int: Int]] = [:]
    for r in rows {
      guard let plan = r["meal_plan_id"]?.stringValue, let day = r["day_index"]?.intValue else { continue }
      out[plan, default: [:]][day, default: 0] += 1
    }
    return out
  }

  /// Bữa của một ngày theo số bữa (`MEAL_ORDER.slice(0, clamp(n, 1, 6))`, mặc định 3).
  public static func slots(_ mealsPerDay: Int?) -> [String] {
    Array(MealDiary.order.prefix(Swift.max(1, Swift.min(MealDiary.order.count, mealsPerDay ?? 3))))
  }

  /// kcal một ngày: mỗi món làm tròn rồi cộng (`byDay`).
  public static func dayKcal(_ items: [Item], day: Int) -> Double {
    items.filter { $0.day == day }.reduce(0) { $0 + JS.round($1.kcal) }
  }

  public static func weekKcal(_ items: [Item]) -> Double {
    days.reduce(0) { $0 + dayKcal(items, day: $1) }
  }

  /// `Math.round(day / target × 100)`; mục tiêu 0 → 0.
  public static func percent(_ kcal: Double, target: Double) -> Int {
    target > 0 ? Int(JS.round(kcal / target * 100)) : 0
  }

  /// Các bữa có món trong ngày, theo `MEAL_ORDER` (bữa lạ không hiện — như RN).
  public static func meals(_ items: [Item], day: Int) -> [(meal: String, items: [Item])] {
    MealDiary.order.compactMap { m in
      let f = items.filter { $0.day == day && $0.mealType == m }
      return f.isEmpty ? nil : (m, f)
    }
  }

  /// `plannedMealIsLoggedToday`: hôm nay có bữa cùng loại với ĐÚNG tập tên món.
  public static func isLoggedToday(_ planned: [Item], mealType: String, today: [MealDiary.Meal]) -> Bool {
    let want = nameSet(planned.map(\.name))
    guard !want.isEmpty else { return false }
    return today.contains { $0.type == mealType && nameSet($0.items.map(\.foodName)) == want }
  }

  /// `foodNameSet`: bỏ khoảng trắng hai đầu, chữ thường, bỏ trống.
  static func nameSet(_ names: [String]) -> Set<String> {
    Set(names.compactMap { n in
      let c = RepEntry.trimJS(n).lowercased()
      return c.isEmpty ? nil : c
    })
  }

  /// Món của bữa thành món ghi nhật ký: một khẩu phần, số giữ nguyên (bản ghi
  /// `meal` tự làm tròn từng món và tổng trên tổng thô — như `useLogPlannedMeal`).
  public static func logItems(_ planned: [Item], makeId: () -> String) -> [MealLog.Item] {
    planned.map {
      MealLog.Item(
        id: makeId(), foodItemId: $0.foodItemId, name: $0.name, kcal: $0.kcal, protein: $0.protein,
        carbs: $0.carbs, fat: $0.fat, fiber: $0.fiber)
    }
  }

  /// Hàng `meal_plan_items` khi thêm một món (`addFood`): số làm tròn, khẩu phần 0 → 100.
  public static func itemRow(planId: String, day: Int, mealType: String, food: FoodLibrary.Food) -> [String: JSONValue] {
    [
      "meal_plan_id": .string(planId), "day_index": .number(Double(day)), "meal_type": .string(mealType),
      "food_name": .string(food.name), "serving_g": .number(food.servingG == 0 ? 100 : food.servingG),
      "kcal": .number(JS.round(food.kcal)), "protein_g": .number(JS.round(food.protein)),
      "carbs_g": .number(JS.round(food.carbs)), "fat_g": .number(JS.round(food.fat)),
      "fiber_g": .number(JS.round(food.fiber)), "food_item_id": .string(food.id),
    ]
  }

  /// Tên món đã có trong (ngày, bữa) đang chọn — để đánh dấu, không chặn.
  public static func alreadyHere(_ items: [Item], day: Int, mealType: String) -> Set<String> {
    Set(items.filter { $0.day == day && $0.mealType == mealType }.map { $0.name.trimmingCharacters(in: .whitespaces).lowercased() })
  }
}

/// Đọc / ghi `meal_plans` + `meal_plan_items` (`ASCNDBackend.SupabaseMealPlans`).
public protocol MealPlansSource: Sendable {
  func plans(userId: String) async throws -> [JSONValue]
  /// `meal_plan_id, day_index` của các kế hoạch.
  func fill(planIds: [String]) async throws -> [JSONValue]
  func items(planId: String) async throws -> [JSONValue]
  /// Tạo kế hoạch; trả id.
  func createPlan(userId: String, name: String, goal: String, mealsPerDay: Int) async throws -> String
  func deletePlan(id: String, userId: String) async throws -> Int
  func addItem(_ row: [String: JSONValue]) async throws
  func deleteItem(id: String) async throws -> Int
  /// `food_items` theo tên (`ilike`), `limit` hàng.
  func searchFoods(_ text: String, limit: Int) async throws -> [JSONValue]
  /// Món của tôi (trang đầu, theo tên).
  func myFoods(userId: String) async throws -> [JSONValue]
  /// Nhật ký hôm nay (để biết bữa đã ghi chưa): bữa trong `[start, end)` + món.
  func todayEntries(userId: String, start: String, end: String) async throws -> [JSONValue]
  func todayItems(entryIds: [String]) async throws -> [JSONValue]
}

/// Kết quả một lệnh ghi của sổ kế hoạch ăn.
public enum MealPlanWrite: Sendable, Hashable {
  case done
  case onlineOnly
  case invalid
  case nothingWritten
  case failed
}

/// Danh sách kế hoạch ăn của MỘT người.
@MainActor
@Observable
public final class MealPlansBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([MealPlans.Plan])
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Số món mỗi (kế hoạch, ngày); hỏng thì rỗng (chỉ là chấm).
  public private(set) var fill: [String: [Int: Int]] = [:]
  public private(set) var busy = false

  public var plans: [MealPlans.Plan] {
    if case .ready(let p) = phase { return p }
    return []
  }

  @ObservationIgnored let source: any MealPlansSource
  @ObservationIgnored private var closed = false

  public init(userId: String, source: any MealPlansSource) {
    self.userId = userId
    self.source = source
  }

  public func close() { closed = true }

  public func load() async {
    guard !closed else { return }
    let source = self.source, userId = self.userId
    do {
      let plans = try await source.plans(userId: userId).compactMap(MealPlans.Plan.init(row:))
      let rows = plans.isEmpty ? [] : ((try? await source.fill(planIds: plans.map(\.id))) ?? [])
      guard !closed else { return }
      phase = .ready(plans)
      fill = MealPlans.fill(rows)
    } catch {
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }

  /// Tạo kế hoạch (`useCreateMealPlan`); trả id khi xong.
  public func create(name: String, goal: String, mealsPerDay: Int, online: Bool) async -> (MealPlanWrite, String?) {
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !n.isEmpty, MealPlans.goals.contains(goal), MealPlans.mealsPerDayChoices.contains(mealsPerDay) else {
      return (.invalid, nil)
    }
    guard !closed, !busy else { return (.failed, nil) }
    guard online else { return (.onlineOnly, nil) }
    busy = true
    defer { if !closed { busy = false } }
    let id: String
    do {
      id = try await source.createPlan(userId: userId, name: n, goal: goal, mealsPerDay: mealsPerDay)
    } catch {
      return (NetworkFailure.isOffline(error) ? .onlineOnly : .failed, nil)
    }
    await load()
    return (.done, id)
  }
}

/// MỘT kế hoạch ăn đang mở.
@MainActor
@Observable
public final class MealPlanBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([MealPlans.Item])
  }

  public enum EatOutcome: Sendable, Hashable {
    /// Vào hàng đợi; `online` = gửi ngay.
    case queued(online: Bool)
    case nothing
    case failed
  }

  public let userId: String
  public let planId: String
  public private(set) var phase: Phase = .loading
  /// Bữa đã ghi hôm nay (để hỏi "ghi thêm?"). Đọc hỏng: coi như chưa ghi.
  public private(set) var today: [MealDiary.Meal] = []
  public private(set) var busy = false
  /// Kết quả tìm cho đúng chữ đang gõ (thêm món).
  public private(set) var results: [FoodLibrary.Food]?
  public private(set) var myFoods: [FoodLibrary.Food] = []

  public var items: [MealPlans.Item] {
    if case .ready(let i) = phase { return i }
    return []
  }

  @ObservationIgnored private let source: any MealPlansSource
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var searchGeneration = 0
  @ObservationIgnored private var closed = false

  public init(
    userId: String, planId: String, source: any MealPlansSource, store: (any PlanWriteStore)?,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.planId = planId
    self.source = source
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  public func close() {
    closed = true
    searchGeneration += 1
  }

  /// Món của kế hoạch + nhật ký hôm nay.
  public func load() async {
    guard !closed else { return }
    let source = self.source, planId = self.planId, userId = self.userId
    let range = DailyLog.dayRange(LocalDate(clock.nowMillis(), in: timeZone), in: timeZone)
    async let todayMeals = Self.readToday(source, store, userId: userId, range: range)
    do {
      let rows = try await source.items(planId: planId)
      let meals = await todayMeals
      guard !closed else { return }
      phase = .ready(rows.compactMap(MealPlans.Item.init(row:)))
      today = meals ?? []
    } catch {
      _ = await todayMeals
      guard !closed else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }

  /// Nhật ký hôm nay = server ⊕ bữa còn trong outbox (vừa "Ghi vào hôm nay"
  /// lúc mất mạng vẫn tính là đã ghi). Server hỏng: chỉ phần outbox; cả hai
  /// hỏng: `nil` (coi như chưa ghi bữa nào).
  nonisolated static func readToday(
    _ source: any MealPlansSource, _ store: (any PendingWrites)?, userId: String, range: DailyLog.Window
  ) async -> [MealDiary.Meal]? {
    var server: [MealDiary.Meal]?
    if let entries = try? await source.todayEntries(userId: userId, start: range.start, end: range.end) {
      let ids = entries.compactMap { $0["id"]?.stringValue }
      let items = ids.isEmpty ? [] : ((try? await source.todayItems(entryIds: ids)) ?? [])
      server = MealDiary.meals(entries: entries, items: items)
    }
    let queued = try? await store?.pending(userId: userId)
    guard server != nil || queued != nil else { return nil }
    return MealDiary.merge(
      server: server ?? [], pending: MealLog.pendingMeals(queued ?? [], userId: userId, window: range))
  }

  public func isLoggedToday(_ meal: String, day: Int) -> Bool {
    MealPlans.isLoggedToday(items.filter { $0.day == day && $0.mealType == meal }, mealType: meal, today: today)
  }

  /// "Ghi vào hôm nay": cả bữa thành một bản ghi `meal` qua hàng đợi bền.
  public func eat(meal: String, day: Int, online: Bool) async -> EatOutcome {
    let foods = items.filter { $0.day == day && $0.mealType == meal }
    guard !closed, !foods.isEmpty, let store else { return .nothing }
    let now = clock.nowMillis()
    let entry = MealLog.entry(
      id: makeId(), itemIds: foods.map { _ in makeId() }, userId: userId, mealType: meal,
      dateTime: WorkoutSessionRecord.iso8601(now), items: MealPlans.logItems(foods, makeId: makeId), createdAt: now)
    do {
      try await store.enqueue([entry])
    } catch {
      return .failed
    }
    onEnqueued(entry)
    // Bữa vừa vào hàng đợi đã là "có trong hôm nay" — không đợi gửi xong.
    today = MealDiary.merge(
      server: today,
      pending: MealLog.pendingMeals(
        [entry], userId: userId, window: DailyLog.dayRange(LocalDate(now, in: timeZone), in: timeZone)))
    return .queued(online: online)
  }

  public func deleteItem(_ id: String, online: Bool) async -> MealPlanWrite {
    await write(online: online) { s, _ in try await s.deleteItem(id: id) }
  }

  /// Xoá cả kế hoạch.
  public func deletePlan(online: Bool) async -> MealPlanWrite {
    let planId = self.planId
    return await write(online: online, reload: false) { s, u in try await s.deletePlan(id: planId, userId: u) }
  }

  /// Thêm một món vào (ngày, bữa).
  public func add(_ food: FoodLibrary.Food, day: Int, meal: String, online: Bool) async -> MealPlanWrite {
    guard MealPlans.days.contains(day), MealDiary.order.contains(meal) else { return .invalid }
    let row = MealPlans.itemRow(planId: planId, day: day, mealType: meal, food: food)
    return await write(online: online) { s, _ in try await s.addItem(row); return 1 }
  }

  /// Món của tôi (cho "Từ danh sách của bạn"). Hỏng: rỗng.
  public func loadMyFoods() async {
    guard !closed else { return }
    let rows = (try? await source.myFoods(userId: userId)) ?? []
    guard !closed else { return }
    myFoods = FoodLibrary.sorted(rows.compactMap(FoodLibrary.Food.init(row:)))
  }

  /// Tìm món (bên gọi lo trễ); dưới 2 ký tự thì không tìm.
  public func search(_ text: String) async {
    guard !closed else { return }
    searchGeneration += 1
    let gen = searchGeneration
    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
    results = nil
    guard q.count >= MealLog.searchMinLength else { return }
    let rows = (try? await source.searchFoods(q, limit: MealPlans.searchLimit)) ?? []
    guard !closed, gen == searchGeneration else { return }
    results = MealLog.dedupeSeedShadows(rows).compactMap(FoodLibrary.Food.init(row:))
  }

  private func write(
    online: Bool, reload: Bool = true, _ op: @Sendable (any MealPlansSource, String) async throws -> Int
  ) async -> MealPlanWrite {
    guard !closed, !busy else { return .failed }
    guard online else { return .onlineOnly }
    busy = true
    defer { if !closed { busy = false } }
    let touched: Int
    do {
      touched = try await op(source, userId)
    } catch {
      return NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    if reload, !closed { await load() }
    return touched > 0 ? .done : .nothingWritten
  }
}
