public import Foundation
public import Observation

/// Ghi bữa ăn (#527 Phase 3 · 3.2) — `app/log-meal.tsx` + `case 'meal'` của
/// `offline-write.ts` + `useRecentFoods` / tìm `food_items` (`use-nutrition.ts`).
///
/// RN behavior (giữ nguyên):
/// - bữa từ `?meal=` khi là một trong sáu loại, không thì "lunch";
/// - ngày từ `?date=` khi đúng dạng và không sau hôm nay; hôm nay đóng dấu
///   ĐÚNG GIỜ, ngày đã qua đóng dấu GIỮA TRƯA địa phương (`diaryStampAt`);
/// - món nhập tay: tên + kcal / đạm / tinh bột / béo; ô trống là 0, ô sai dạng
///   hay ngoài dải (kcal 0–10000, macro 0–2000 g) khoá nút; kcal trống thì tính
///   `round(P×4 + C×4 + F×9)`;
/// - LƯU LUÔN đi qua hàng đợi bền (`RECORD`): id bữa và id từng món sinh lúc
///   chạm; phát lại upsert bữa rồi các món, cả hai bỏ trùng; xong thì dựng lại
///   `daily_logs` của NGÀY ĂN (không phải ngày hàng đợi chạy);
/// - số mỗi món ghi đã nhân theo khẩu phần và làm tròn; tổng bữa làm tròn trên
///   tổng thô.
public enum MealLog {
  /// `kind` của outbox (`OfflineWrite` `kind: 'meal'`).
  public static let kind = "meal"
  public static let defaultMeal = "lunch"
  /// `BOUNDS.meal_kcal` / `BOUNDS.macro_g`.
  public static let kcalBounds = 0.0...10_000.0
  public static let macroBounds = 0.0...2_000.0
  /// Ít nhất 2 ký tự mới tìm (`debounced.length >= 2`); 8 kết quả.
  public static let searchMinLength = 2
  public static let searchLimit = 8
  /// Món gần đây: đọc 30 dòng, giữ 12 tên khác nhau.
  public static let recentReadLimit = 30
  public static let recentKeep = 12

  /// Một món trong bữa đang soạn — số của MỘT khẩu phần.
  public struct Item: Sendable, Hashable, Identifiable {
    public let id: String
    public let foodItemId: String?
    public let name: String
    public var servings: Double
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double

    public init(
      id: String, foodItemId: String?, name: String, servings: Double = 1, kcal: Double, protein: Double,
      carbs: Double, fat: Double, fiber: Double = 0
    ) {
      self.id = id
      self.foodItemId = foodItemId
      self.name = name
      self.servings = servings
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.fiber = fiber
    }
  }

  /// Một món tìm được trong `food_items` / món gần đây.
  public struct Food: Sendable, Hashable, Identifiable {
    public let id: String
    public let foodItemId: String?
    public let name: String
    public let brand: String?
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double

    public init(
      id: String, foodItemId: String?, name: String, brand: String? = nil, kcal: Double, protein: Double,
      carbs: Double, fat: Double, fiber: Double
    ) {
      self.id = id
      self.foodItemId = foodItemId
      self.name = name
      self.brand = brand
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.fiber = fiber
    }

    /// `pickFood`: hàng `food_items`, số làm tròn.
    public init?(foodRow r: JSONValue) {
      guard let id = r["id"]?.stringValue, let name = r["name"]?.stringValue else { return nil }
      self.init(
        id: id, foodItemId: id, name: name, brand: r["brand"]?.stringValue, kcal: JS.round(JS.number(r["kcal"])),
        protein: JS.round(JS.number(r["protein_g"])), carbs: JS.round(JS.number(r["carbs_g"])),
        fat: JS.round(JS.number(r["fat_g"])), fiber: JS.round(MealDiary.num(r["fiber_g"])))
    }

    /// Thành một món mới trong bữa, một khẩu phần.
    public func item(id: String) -> Item {
      Item(id: id, foodItemId: foodItemId, name: name, kcal: kcal, protein: protein, carbs: carbs, fat: fat, fiber: fiber)
    }
  }

  /// Bữa từ route: chỉ một trong sáu loại.
  public static func mealType(_ requested: String?) -> String {
    guard let requested, MealDiary.order.contains(requested) else { return defaultMeal }
    return requested
  }

  /// `diaryStampAt`: hôm nay → đúng lúc này; ngày đã qua → 12:00 địa phương.
  public static func stamp(_ date: LocalDate, now: EpochMillis, in tz: TimeZone) -> String {
    if date == LocalDate(now, in: tz) { return WorkoutSessionRecord.iso8601(now) }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let noon = cal.date(from: DateComponents(year: date.year, month: date.month, day: date.day, hour: 12)) ?? Date()
    return WorkoutSessionRecord.iso8601(EpochMillis(Int64((noon.timeIntervalSince1970 * 1000).rounded())))
  }

  /// `dedupeSeedShadows`: bỏ món mẫu chung khi người đã có món riêng cùng tên.
  public static func dedupeSeedShadows(_ rows: [JSONValue]) -> [JSONValue] {
    let own = Set(rows.filter { JS.present($0["user_id"]) }.compactMap { $0["name"]?.stringValue?.lowercased() })
    return rows.filter { JS.present($0["user_id"]) || !own.contains($0["name"]?.stringValue?.lowercased() ?? "") }
  }

  /// `useRecentFoods`: mới → cũ, bỏ tên trùng, chia về MỘT khẩu phần, tối đa 12.
  public static func recentFoods(_ rows: [JSONValue]) -> [Food] {
    var seen = Set<String>()
    var out: [Food] = []
    for r in rows {
      guard let name = r["food_name"]?.stringValue, !seen.contains(name) else { continue }
      seen.insert(name)
      let s = JS.number(r["servings"])
      let per = JS.truthy(s) ? s : 1
      func one(_ k: String) -> Double { JS.round(JS.number(r[k]) / per) }
      let fiber = JS.round(MealDiary.num(r["fiber_g"]) / per)
      out.append(
        Food(
          id: "rec-\(out.count)", foodItemId: r["food_item_id"]?.stringValue, name: name, kcal: one("kcal"),
          protein: one("protein_g"), carbs: one("carbs_g"), fat: one("fat_g"), fiber: fiber))
      if out.count >= recentKeep { break }
    }
    return out
  }

  // MARK: - Món nhập tay

  /// Một ô số của form: trống / số trong dải / sai.
  public enum Field: Sendable, Hashable {
    case blank
    case value(Double)
    case bad
  }

  public static func field(_ text: String, _ bounds: ClosedRange<Double>) -> Field {
    if RepEntry.trimJS(text).isEmpty { return .blank }
    return FitnessCalc.readStat(text, bounds).map(Field.value) ?? .bad
  }

  /// `Number(v) || 0`.
  static func number(_ text: String) -> Double { MealDiary.num(.string(text)) }

  /// Bốn ô số có ô nào ngoài dải không (`customBad`).
  public static func customBad(kcal: String, protein: String, carbs: String, fat: String) -> Bool {
    field(kcal, kcalBounds) == .bad || [protein, carbs, fat].contains { field($0, macroBounds) == .bad }
  }

  /// `addCustom`: món nhập tay, hay `nil` khi chưa thêm được (`canAddCustom`).
  public static func customItem(
    id: String, name: String, kcal: String, protein: String, carbs: String, fat: String
  ) -> Item? {
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !n.isEmpty, !customBad(kcal: kcal, protein: protein, carbs: carbs, fat: fat) else { return nil }
    let k = number(kcal), p = number(protein), c = number(carbs), f = number(fat)
    guard k > 0 || p + c + f > 0 else { return nil }
    let energy = k > 0 ? k : JS.round(p * 4 + c * 4 + f * 9)
    return Item(id: id, foodItemId: nil, name: n, kcal: energy, protein: p, carbs: c, fat: f)
  }

  // MARK: - Tổng và bản ghi

  public struct Totals: Sendable, Hashable {
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double
  }

  /// Tổng thô (chưa làm tròn) — số × khẩu phần.
  public static func totals(_ items: [Item]) -> Totals {
    items.reduce(Totals(kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0)) { a, it in
      Totals(
        kcal: a.kcal + it.kcal * it.servings, protein: a.protein + it.protein * it.servings,
        carbs: a.carbs + it.carbs * it.servings, fat: a.fat + it.fat * it.servings,
        fiber: a.fiber + it.fiber * it.servings)
    }
  }

  /// Bản ghi outbox `meal` — cùng hình `OfflineWrite` của RN, phẳng thành một
  /// hàng `meal_entries` (+ `items`). Id bữa và id món sinh lúc chạm.
  public static func entry(
    id: String, itemIds: [String], userId: String, mealType: String, dateTime: String, items: [Item],
    createdAt: EpochMillis
  ) -> OutboxEntry {
    let id = id.lowercased()
    let t = totals(items)
    let rows: [JSONValue] = zip(itemIds, items).map { iid, it in
      .object([
        "id": .string(iid.lowercased()), "food_item_id": it.foodItemId.map(JSONValue.string) ?? .null,
        "food_name": .string(it.name), "servings": .number(it.servings),
        "kcal": .number(JS.round(it.kcal * it.servings)), "protein_g": .number(JS.round(it.protein * it.servings)),
        "carbs_g": .number(JS.round(it.carbs * it.servings)), "fat_g": .number(JS.round(it.fat * it.servings)),
        "fiber_g": .number(JS.round(it.fiber * it.servings)),
      ])
    }
    return OutboxEntry(
      id: id, userId: userId, kind: kind,
      payload: .object([
        "id": .string(id), "user_id": .string(userId), "date_time": .string(dateTime), "meal_type": .string(mealType),
        "total_kcal": .number(JS.round(t.kcal)), "total_protein_g": .number(JS.round(t.protein)),
        "total_carbs_g": .number(JS.round(t.carbs)), "total_fat_g": .number(JS.round(t.fat)),
        "total_fiber_g": .number(JS.round(t.fiber)), "items": .array(rows),
      ]),
      createdAt: createdAt)
  }

  /// Hàng `meal_entries` (bỏ `items`).
  public static func entryRow(_ payload: JSONValue) -> JSONValue {
    guard case .object(var o) = payload else { return payload }
    o["items"] = nil
    return .object(o)
  }

  /// Các hàng `meal_entry_items`, mang `meal_entry_id`.
  public static func itemRows(_ payload: JSONValue) -> [JSONValue] {
    guard case .array(let rows)? = payload["items"], let entryId = payload["id"] else { return [] }
    return rows.map { r in
      guard case .object(var o) = r else { return r }
      o["meal_entry_id"] = entryId
      return .object(o)
    }
  }

  /// Hàng outbox `meal` dùng được: của chính chủ, id khớp, loại bữa hợp lệ,
  /// dấu thời gian đọc được, có ít nhất một món và món nào cũng có id.
  public static func isRow(_ e: OutboxEntry) -> Bool {
    guard e.kind == kind, e.payload["id"]?.stringValue == e.id,
      e.payload["user_id"]?.stringValue?.lowercased() == e.userId.lowercased(),
      let meal = e.payload["meal_type"]?.stringValue, MealDiary.order.contains(meal),
      e.payload["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }) != nil,
      case .array(let rows)? = e.payload["items"], !rows.isEmpty,
      rows.allSatisfy({ ($0["id"]?.stringValue ?? "").isEmpty == false })
    else { return false }
    return true
  }

  /// Ngày phải dựng lại sau khi server nhận: NGÀY ĂN (`rebuildAfterReplay`).
  public static func day(_ e: OutboxEntry, in tz: TimeZone) -> LocalDate? {
    e.payload["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) }.map { LocalDate($0, in: tz) }
  }
}

/// Đọc món để thêm vào bữa (`ASCNDBackend.SupabaseMealLog`).
public protocol MealFoodSource: Sendable {
  /// `food_items` theo tên (`ilike %q%`), xếp theo tên, `limit` hàng.
  func search(_ text: String, limit: Int) async throws -> [JSONValue]
  /// `meal_entry_items` mới nhất của người (`useRecentFoods`).
  func recentItems(userId: String, limit: Int) async throws -> [JSONValue]
}

/// Màn ghi bữa của MỘT người cho MỘT ngày.
@MainActor
@Observable
public final class MealLogger {
  public enum Outcome: Sendable, Hashable {
    /// Đã vào hàng đợi; `online` = sẽ gửi ngay.
    case queued(online: Bool)
    /// Chưa có món / sổ đã đóng / đã lưu rồi.
    case unavailable
    /// Không ghi được hàng đợi trên máy.
    case failed
  }

  public let userId: String
  public let date: LocalDate
  public var mealType: String
  public private(set) var items: [MealLog.Item] = []
  /// Kết quả tìm cho đúng chữ đang gõ; `nil` khi chưa tìm / đang tìm.
  public private(set) var results: [MealLog.Food]?
  public private(set) var searchFailed = false
  public private(set) var recents: [MealLog.Food] = []
  public private(set) var saving = false
  public private(set) var saved = false

  public var totals: MealLog.Totals { MealLog.totals(items) }
  public var canSave: Bool { !items.isEmpty && !saving && !saved }

  @ObservationIgnored private let source: any MealFoodSource
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var searchGeneration = 0
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any MealFoodSource, store: (any PlanWriteStore)?, date: LocalDate? = nil,
    mealType: String? = nil, clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
    self.date = MealDiary.startDate(date, today: LocalDate(clock.nowMillis(), in: timeZone))
    self.mealType = MealLog.mealType(mealType)
  }

  public func close() {
    closed = true
    searchGeneration += 1
  }

  /// Món gần đây. Đọc hỏng: không có hàng gợi ý (như RN — `data` rỗng).
  public func loadRecents() async {
    guard !closed else { return }
    let rows = (try? await source.recentItems(userId: userId, limit: MealLog.recentReadLimit)) ?? []
    guard !closed else { return }
    recents = MealLog.recentFoods(rows)
  }

  /// Tìm theo chữ đang gõ (bên gọi lo trễ 250 ms). Dưới 2 ký tự thì không tìm.
  public func search(_ text: String) async {
    guard !closed else { return }
    searchGeneration += 1
    let gen = searchGeneration
    let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
    results = nil
    searchFailed = false
    guard q.count >= MealLog.searchMinLength else { return }
    do {
      let rows = try await source.search(q, limit: MealLog.searchLimit)
      guard !closed, gen == searchGeneration else { return }
      results = MealLog.dedupeSeedShadows(rows).compactMap(MealLog.Food.init(foodRow:))
    } catch {
      guard !closed, gen == searchGeneration else { return }
      results = []
      searchFailed = true
    }
  }

  public func add(_ food: MealLog.Food) {
    guard !saved else { return }
    items.append(food.item(id: makeId()))
  }

  /// Món nhập tay; `false` khi form chưa hợp lệ.
  @discardableResult
  public func addCustom(name: String, kcal: String, protein: String, carbs: String, fat: String) -> Bool {
    guard !saved,
      let it = MealLog.customItem(id: makeId(), name: name, kcal: kcal, protein: protein, carbs: carbs, fat: fat)
    else { return false }
    items.append(it)
    return true
  }

  public func setServings(_ id: String, _ servings: Double) {
    guard let i = items.firstIndex(where: { $0.id == id }), MealDiary.servingsRange.contains(servings) else { return }
    items[i].servings = servings
  }

  public func remove(_ id: String) { items.removeAll { $0.id == id } }

  /// Lưu: luôn qua hàng đợi bền; một lần cho mỗi màn.
  public func save(online: Bool) async -> Outcome {
    guard !closed, canSave, let store else { return .unavailable }
    saving = true
    defer { if !closed { saving = false } }
    let now = clock.nowMillis()
    let entry = MealLog.entry(
      id: makeId(), itemIds: items.map { _ in makeId() }, userId: userId, mealType: mealType,
      dateTime: MealLog.stamp(date, now: now, in: timeZone), items: items, createdAt: now)
    do {
      try await store.enqueue([entry])
    } catch {
      return .failed
    }
    saved = true
    onEnqueued(entry)
    return .queued(online: online)
  }
}
