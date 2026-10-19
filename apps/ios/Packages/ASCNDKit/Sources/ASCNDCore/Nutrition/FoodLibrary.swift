public import Foundation
public import Observation

/// Thư viện thực phẩm (#527 Phase 3 · 3.3) — `app/food-list.tsx` +
/// `app/food-editor.tsx` + `components/ascnd/food-cards.tsx` + `useMyFoods` /
/// `useMyFoodsSorted` / `useFoodItem` / `useCreateFoodItem` /
/// `useUpdateFoodItem` / `useDeleteFoodItem` (`hooks/use-nutrition.ts`).
///
/// RN behavior (giữ nguyên):
/// - "Của tôi" = `food_items` của người, đọc theo trang 500 tới HẾT (#180),
///   yêu thích trước rồi theo tên; "Gần đây" = `useRecentFoods`;
/// - lọc trong danh sách: tên (hay thương hiệu, với "Của tôi") chứa chữ gõ,
///   không phân biệt hoa thường; đọc hỏng là lỗi, không phải danh sách rỗng;
/// - món gần đây chưa có trong "Của tôi" (theo tên, không phân biệt hoa
///   thường) có nút "+" lưu vào thư viện — khẩu phần 0 → 100 g;
/// - form: ô số chỉ nhận chữ số (bỏ số 0 đầu); khẩu phần trống → 100; kcal có
///   nút "Tự tính" = round(P×4 + C×4 + F×9); dải kcal 0–10000, macro / chất xơ
///   0–2000 g (`meal_kcal` / `macro_g`); tên bắt buộc;
/// - thêm / sửa / xoá CHỈ khi có mạng (`useOnlineMutation`); sửa / xoá không
///   chạm hàng nào → lỗi "có thể đã xoá ở thiết bị khác".
/// - nút sao (`useToggleFavoriteFood`, #527 N2): lớp Trạng thái #161 — xem
///   `FoodFavorite`.
public enum FoodLibrary {
  /// `MY_FOODS_PAGE`.
  public static let pageSize = 500
  public static let columns =
    "id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite, " + FoodNames.columns

  /// Một hàng `food_items`.
  public struct Food: Sendable, Hashable, Identifiable {
    public let id: String
    public let userId: String?
    public let name: String
    public let brand: String?
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double
    public let servingG: Double
    public let isFavorite: Bool

    public init(
      id: String, userId: String?, name: String, brand: String?, kcal: Double, protein: Double, carbs: Double,
      fat: Double, fiber: Double, servingG: Double, isFavorite: Bool
    ) {
      self.id = id
      self.userId = userId
      self.name = name
      self.brand = brand
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.fiber = fiber
      self.servingG = servingG
      self.isFavorite = isFavorite
    }

    public init?(row r: JSONValue) {
      guard let id = r["id"]?.stringValue, let name = FoodNames.pick(r) else { return nil }
      self.init(
        id: id, userId: r["user_id"]?.stringValue, name: name, brand: r["brand"]?.stringValue,
        kcal: MealDiary.num(r["kcal"]), protein: MealDiary.num(r["protein_g"]), carbs: MealDiary.num(r["carbs_g"]),
        fat: MealDiary.num(r["fat_g"]), fiber: MealDiary.num(r["fiber_g"]), servingG: MealDiary.num(r["serving_g"]),
        isFavorite: r["is_favorite"] == .bool(true))
    }
  }

  /// `useMyFoodsSorted`: yêu thích trước, rồi theo tên (`localeCompare`).
  public static func sorted(_ foods: [Food]) -> [Food] {
    foods.sorted { a, b in
      if a.isFavorite != b.isFavorite { return a.isFavorite }
      return a.name.localizedStandardCompare(b.name) == .orderedAscending
    }
  }

  /// "Lọc trong danh sách" của "Của tôi": tên hoặc thương hiệu.
  public static func filter(_ foods: [Food], _ query: String) -> [Food] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !q.isEmpty else { return foods }
    return foods.filter { $0.name.lowercased().contains(q) || ($0.brand ?? "").lowercased().contains(q) }
  }

  /// Của "Gần đây": chỉ tên.
  public static func filter(_ recents: [MealLog.Food], _ query: String) -> [MealLog.Food] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !q.isEmpty else { return recents }
    return recents.filter { $0.name.lowercased().contains(q) }
  }

  /// Tên đã có trong "Của tôi" (chữ thường) — món gần đây ấy không có nút "+".
  public static func savedNames(_ foods: [Food]) -> Set<String> { Set(foods.map { $0.name.lowercased() }) }

  /// `quickAdd` của `RecentFoodCard`: lưu món gần đây vào thư viện.
  public static func row(fromRecent r: MealLog.Food) -> [String: JSONValue] {
    [
      "name": .string(r.name), "brand": .string(""), "serving_g": .number(100), "kcal": .number(r.kcal),
      "protein_g": .number(r.protein), "carbs_g": .number(r.carbs), "fat_g": .number(r.fat),
      "fiber_g": .number(r.fiber),
    ]
  }

  /// `digits`: chỉ chữ số, bỏ số 0 ở đầu (giữ một số 0).
  public static func digits(_ text: String) -> String {
    let only = String(text.unicodeScalars.filter { $0.value >= 48 && $0.value <= 57 }.map(Character.init))
    var t = Substring(only)
    while t.count > 1, t.first == "0" { t = t.dropFirst() }
    return String(t)
  }

  /// Form thêm / sửa (`food-editor.tsx`).
  public struct Form: Sendable, Hashable {
    public var name = ""
    public var brand = ""
    public var serving = "100"
    public var kcal = ""
    public var protein = ""
    public var carbs = ""
    public var fat = ""
    public var fiber = ""

    public init() {}

    /// `useFormSeed`: số làm tròn, 0 → trống; khẩu phần 0 / trống → 100.
    public init(_ f: Food) {
      func t(_ v: Double) -> String {
        let n = JS.round(v)
        return n == 0 || n.isNaN ? "" : MealDiary.jsNumber(n)
      }
      name = f.name
      brand = f.brand ?? ""
      serving = MealDiary.jsNumber(f.servingG == 0 || f.servingG.isNaN ? 100 : f.servingG)
      kcal = t(f.kcal)
      protein = t(f.protein)
      carbs = t(f.carbs)
      fat = t(f.fat)
      fiber = t(f.fiber)
    }

    static func n(_ s: String) -> Double { MealDiary.num(.string(s)) }

    /// "Tự tính": round(P×4 + C×4 + F×9).
    public var calcKcal: Double { JS.round(Self.n(protein) * 4 + Self.n(carbs) * 4 + Self.n(fat) * 9) }

    /// Tỉ lệ gam của ba chất (`proteinPct` / `carbsPct` / `fatPct = 100 − hai cái kia`).
    public var macroPercents: (protein: Double, carbs: Double, fat: Double) {
      let total = Self.n(protein) + Self.n(carbs) + Self.n(fat)
      guard total > 0 else { return (0, 0, 0) }
      let p = JS.round(Self.n(protein) / total * 100), c = JS.round(Self.n(carbs) / total * 100)
      return (p, c, 100 - p - c)
    }

    /// Ô nào ngoài dải (`fieldErrors`).
    public var hasFieldErrors: Bool {
      MealLog.field(kcal, MealLog.kcalBounds) == .bad
        || [protein, carbs, fat, fiber].contains { MealLog.field($0, MealLog.macroBounds) == .bad }
    }

    public var canSave: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !hasFieldErrors }

    /// Hàng ghi (`FoodFormData`): tên / thương hiệu bỏ khoảng trắng; khẩu phần 0 → 100.
    public var row: [String: JSONValue] {
      let s = Self.n(serving)
      return [
        "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
        "brand": .string(brand.trimmingCharacters(in: .whitespacesAndNewlines)),
        "serving_g": .number(s == 0 ? 100 : s), "kcal": .number(Self.n(kcal)), "protein_g": .number(Self.n(protein)),
        "carbs_g": .number(Self.n(carbs)), "fat_g": .number(Self.n(fat)), "fiber_g": .number(Self.n(fiber)),
      ]
    }
  }
}

/// Ngôi sao "yêu thích" (`useToggleFavoriteFood`, #527 N2) — một cờ TUYỆT ĐỐI
/// qua lớp Trạng thái #161: chạm là sao đổi ngay, mất mạng thì ý đợi mạng về,
/// chạm hai lần lúc mất mạng là không gửi gì.
public enum FoodFavorite {
  /// `favoriteKey(id)`.
  public static func key(_ id: String) -> String { "food:favorite:\(id)" }

  /// `send` của RN — gửi lại bao nhiêu lần cũng ra một kết quả:
  /// - món không còn → `.gone`;
  /// - món của mình: `update is_favorite = v`; 0 dòng → `.gone`;
  /// - món dùng chung (seed): RLS không cho sửa, nên yêu thích là CHÉP nó vào
  ///   danh sách của mình theo tên — đã có bản chép thì đánh dấu bản ấy (bản
  ///   ấy vừa bị xoá thì rơi xuống chèn); bỏ yêu thích seed: không có gì để làm.
  public static func send(
    id: String, value: Bool, userId: String, source: any FoodFavoriteSource
  ) async throws -> StateWriter.SendResult {
    guard let row = try await source.food(id: id) else { return .gone }
    if row["user_id"]?.stringValue == userId {
      return try await source.setFavorite(id: id, userId: nil, value: value) > 0 ? .ok : .gone
    }
    guard value else { return .ok }
    // Món chung có tên 3 thứ tiếng: bản chép mang tên theo ngôn ngữ đang dùng.
    let name = FoodNames.pick(row) ?? ""
    if let mine = try await source.myFoodId(userId: userId, name: name),
      try await source.setFavorite(id: mine, userId: userId, value: true) > 0
    {
      return .ok
    }
    var copy: [String: JSONValue] = ["name": .string(name), "is_favorite": .bool(true)]
    for k in ["brand", "serving_g", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] { copy[k] = row[k] ?? .null }
    try await source.insert(userId: userId, copy)
    return .ok
  }
}

/// Đọc / ghi cho ngôi sao (`ASCNDBackend.SupabaseFoodLibrary`).
public protocol FoodFavoriteSource: Sendable {
  /// `select('user_id, name, brand, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g').eq('id').maybeSingle()`.
  func food(id: String) async throws -> JSONValue?
  /// `update({ is_favorite }).eq('id')` (+ `.eq('user_id')` khi có); số hàng đã chạm.
  func setFavorite(id: String, userId: String?, value: Bool) async throws -> Int
  /// Bản chép của người theo tên (`.eq('name').limit(1)`).
  func myFoodId(userId: String, name: String) async throws -> String?
  /// Chèn món của người (`user_id` thêm ở đây).
  func insert(userId: String, _ row: [String: JSONValue]) async throws
}

/// Đọc / ghi `food_items` (`ASCNDBackend.SupabaseFoodLibrary`).
public protocol FoodLibrarySource: Sendable {
  /// Một trang `[from, to]` món của người, theo tên rồi id.
  func myFoods(userId: String, from: Int, to: Int) async throws -> [JSONValue]
  /// `meal_entry_items` mới nhất (`useRecentFoods`).
  func recentItems(userId: String, limit: Int) async throws -> [JSONValue]
  /// Chèn món của người (`user_id` thêm ở đây).
  func insert(userId: String, _ row: [String: JSONValue]) async throws
  /// Sửa / xoá; trả số hàng đã chạm.
  func update(id: String, _ row: [String: JSONValue]) async throws -> Int
  func delete(id: String, userId: String) async throws -> Int
}

/// Thư viện thực phẩm của MỘT người.
@MainActor
@Observable
public final class FoodLibraryBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([FoodLibrary.Food])
  }

  public enum WriteOutcome: Sendable, Hashable {
    case done
    /// Mất mạng — không gì được ghi (`useOnlineMutation`).
    case onlineOnly
    /// Form chưa hợp lệ.
    case invalid
    /// Không hàng nào bị chạm — đã xoá / đổi ở máy khác.
    case nothingWritten
    case failed
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var recents: [MealLog.Food] = []
  public private(set) var busy = false
  /// Tăng sau mỗi lượt đọc xong — ô tìm đọc lại theo nó (`refresh:
  /// FOOD_QUERY_KEYS` của RN gồm cả kết quả tìm).
  public private(set) var revision = 0
  /// Cờ sao server đã xác nhận mà bản đọc chưa mang (ý chờ đã gỡ, không được
  /// nháy về bản cũ). Lượt đọc mới có món ấy thì bỏ.
  public private(set) var settledFavorites: [String: Bool] = [:]

  /// "Của tôi", đã xếp.
  public var mine: [FoodLibrary.Food] {
    if case .ready(let f) = phase { return FoodLibrary.sorted(f) }
    return []
  }

  @ObservationIgnored private let source: any FoodLibrarySource
  @ObservationIgnored private let favorites: (any FoodFavoriteSource)?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  /// - Parameter favorites: `nil` → không có ngôi sao (màn chỉ vẽ sao tĩnh).
  public init(userId: String, source: any FoodLibrarySource, favorites: (any FoodFavoriteSource)? = nil) {
    self.userId = userId
    self.source = source
    self.favorites = favorites
  }

  public var canFavorite: Bool { favorites != nil }

  // MARK: - Ngôi sao (#161)

  /// `toggleFav.set(f, value)`; `server` = cờ đang hiện của bản đọc.
  @discardableResult
  public func setFavorite(_ f: FoodLibrary.Food, value: Bool, writer: StateWriter) -> StateWriter.Outcome? {
    guard let favorites else { return nil }
    let userId = self.userId, id = f.id
    return writer.set(key: FoodFavorite.key(id), value: value, server: settledFavorites[id] ?? f.isFavorite) {
      [weak self] v in
      let result = try await FoodFavorite.send(id: id, value: v, userId: userId, source: favorites)
      if result == .ok, let self, !self.closed {
        self.settledFavorites[id] = v
        Task { await self.load() }
      }
      return result
    }
  }

  /// `toggleFav.is(f)`: ý chờ gửi, rồi cờ đã xác nhận, rồi bản đọc.
  public func shownFavorite(_ f: FoodLibrary.Food, writer: StateWriter?) -> Bool {
    writer?.pending(FoodFavorite.key(f.id)) ?? settledFavorites[f.id] ?? f.isFavorite
  }

  /// `toggleFav.pending(f)`.
  public func favoritePending(_ f: FoodLibrary.Food, writer: StateWriter?) -> Bool {
    writer?.pending(FoodFavorite.key(f.id)) != nil
  }

  public func close() {
    closed = true
    generation += 1
  }

  /// Đọc "Của tôi" (mọi trang) và "Gần đây". Lỗi khi đã có danh sách thì giữ.
  public func load() async {
    guard !closed else { return }
    generation += 1
    let gen = generation
    let source = self.source, userId = self.userId
    async let recentRows = try? source.recentItems(userId: userId, limit: MealLog.recentReadLimit)
    do {
      var all: [JSONValue] = []
      var from = 0
      while true {
        let page = try await source.myFoods(userId: userId, from: from, to: from + FoodLibrary.pageSize - 1)
        all += page
        if page.count < FoodLibrary.pageSize { break }
        from += FoodLibrary.pageSize
      }
      let rows = await recentRows
      guard !closed, gen == generation else { return }
      let foods = all.compactMap(FoodLibrary.Food.init(row:))
      for f in foods { settledFavorites[f.id] = nil }
      phase = .ready(foods)
      recents = MealLog.recentFoods(rows ?? [])
      revision += 1
    } catch {
      _ = await recentRows
      guard !closed, gen == generation else { return }
      if case .ready = phase { return }
      phase = .failed(TodayController.failure([error]) ?? .unavailable)
    }
  }

  /// Một món theo id (sửa).
  public func food(_ id: String) -> FoodLibrary.Food? {
    if case .ready(let f) = phase { return f.first { $0.id == id } }
    return nil
  }

  /// Thêm món từ form.
  public func create(_ form: FoodLibrary.Form, online: Bool) async -> WriteOutcome {
    guard form.canSave else { return .invalid }
    return await write(online: online) { s, u in try await s.insert(userId: u, form.row); return 1 }
  }

  /// Sửa món.
  public func update(id: String, _ form: FoodLibrary.Form, online: Bool) async -> WriteOutcome {
    guard form.canSave else { return .invalid }
    return await write(online: online) { s, _ in try await s.update(id: id, form.row) }
  }

  /// Xoá món (lọc cả `user_id` như RN).
  public func delete(id: String, online: Bool) async -> WriteOutcome {
    await write(online: online) { s, u in try await s.delete(id: id, userId: u) }
  }

  /// "+" trên món gần đây: lưu vào thư viện.
  public func save(recent r: MealLog.Food, online: Bool) async -> WriteOutcome {
    await write(online: online) { s, u in try await s.insert(userId: u, FoodLibrary.row(fromRecent: r)); return 1 }
  }

  private func write(
    online: Bool, _ op: @Sendable (any FoodLibrarySource, String) async throws -> Int
  ) async -> WriteOutcome {
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
    guard !closed else { return touched > 0 ? .done : .nothingWritten }
    await load()
    return touched > 0 ? .done : .nothingWritten
  }
}
