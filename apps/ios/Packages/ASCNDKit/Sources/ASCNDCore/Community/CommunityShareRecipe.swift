public import Foundation
public import Observation

/// Chia sẻ một công thức (#527, lát 13) — `app/community-share-recipe.tsx` +
/// `useShareableMeals` / `useShareRecipe` (`hooks/use-community-recipe.ts`) +
/// `payloadFromMeal` (`lib/recipe-post.ts`) @ fac9ac2.
///
/// Như RN:
/// - bữa của CHÍNH mình trong 30 ngày (mới trước), mỗi bữa kèm món + khẩu
///   phần gốc để dựng thẻ; bữa rỗng không được mời (server trả 22023);
/// - bữa đã chia sẻ có dấu và không chọn được; `?meal=` trỏ vào bữa lạ / đã
///   đăng thì rơi về danh sách;
/// - bản xem trước theo ĐÚNG luật của `share_recipe` (thứ tự, tên, khối
///   lượng, làm tròn từng dòng, tổng các số đã làm tròn); client không gửi số
///   nào — chỉ ID bữa và phần chữ;
/// - TÊN MÓN bắt buộc (1–80), hỏi đầu tiên; không tự đặt tên.
public enum CommunityShareRecipe {
  public static let days = 30
  public static let titleLimit = 80
  public static let maxIngredients = 50

  /// `btrim` của Postgres: CHỈ dấu cách.
  static func btrim(_ s: String) -> String {
    var t = Substring(s)
    while t.first == " " { t = t.dropFirst() }
    while t.last == " " { t = t.dropLast() }
    return String(t)
  }

  /// `payloadFromMeal`.
  public static func payload(title: String, mealType: String, rows: [JSONValue], servingG: [String: Double]) -> JSONValue {
    func r0(_ v: JSONValue?) -> Double {
      Double(FitnessCalc.jsRound(PersonalRecords.jsNumber(v ?? .null) ?? 0))
    }
    let sorted = rows.enumerated().sorted { x, y in
      let (a, b) = (x.element, y.element)
      let ac = a["created_at"]?.stringValue ?? "", bc = b["created_at"]?.stringValue ?? ""
      if ac != bc { return ac < bc }
      let ai = a["id"]?.stringValue ?? "", bi = b["id"]?.stringValue ?? ""
      if ai != bi { return ai < bi }
      return x.offset < y.offset
    }.map(\.element).prefix(maxIngredients)
    var totals = (kcal: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0)
    let ingredients: [JSONValue] = sorted.map { r in
      let g = r["food_item_id"]?.stringValue.flatMap { $0.isEmpty ? nil : servingG[$0] }
      let s = PersonalRecords.jsNumber(r["servings"]) ?? 0
      let grams: JSONValue =
        if let g, g > 0, s > 0 { .number(Double(FitnessCalc.jsRound(s * g))) } else { .null }
      let trimmed = btrim(r["food_name"]?.stringValue ?? "")
      let k = r0(r["kcal"]), p = r0(r["protein_g"]), c = r0(r["carbs_g"]), f = r0(r["fat_g"])
      totals.kcal += k
      totals.protein += p
      totals.carbs += c
      totals.fat += f
      return .object([
        "name": .string(trimmed.isEmpty ? "?" : trimmed), "grams": grams, "kcal": .number(k), "protein": .number(p),
        "carbs": .number(c), "fat": .number(f),
      ])
    }
    return .object([
      "title": .string(btrim(title)), "mealType": .string(mealType), "kcal": .number(totals.kcal),
      "protein": .number(totals.protein), "carbs": .number(totals.carbs), "fat": .number(totals.fat),
      "ingredientCount": .number(Double(ingredients.count)), "ingredients": .array(ingredients),
    ])
  }

  public struct Meal: Sendable, Hashable, Identifiable {
    public let id: String
    public let dateTime: String
    public let mealType: String
    public let rows: [JSONValue]
    public let servingG: [String: Double]
    /// Bản không tên — số kcal · số món ở hàng chọn bữa.
    public let preview: JSONValue

    public var kcal: Double { preview["kcal"]?.doubleValue ?? 0 }
    public var ingredientCount: Int { Int(preview["ingredientCount"]?.doubleValue ?? 0) }
  }

  /// Phần ghép của `useShareableMeals`: lọc lại theo đúng khoá, bỏ bữa rỗng.
  public static func meals(entries: [JSONValue], items: [JSONValue], foods: [JSONValue], me: String) -> [Meal] {
    let mine = entries.filter { $0["id"]?.stringValue != nil && $0["user_id"]?.stringValue == me }
    let ids = Set(mine.compactMap { $0["id"]?.stringValue })
    let rows = items.filter { $0["meal_entry_id"]?.stringValue.map(ids.contains) ?? false }
    var foodIds: Set<String> = []
    for r in rows { if let f = r["food_item_id"]?.stringValue, !f.isEmpty { foodIds.insert(f) } }
    var serving: [String: Double] = [:]
    for f in foods {
      guard let id = f["id"]?.stringValue, foodIds.contains(id) else { continue }
      serving[id] = PersonalRecords.jsNumber(f["serving_g"]) ?? 0
    }
    return mine.compactMap { e in
      let id = e["id"]?.stringValue ?? ""
      let own = rows.filter { $0["meal_entry_id"]?.stringValue == id }
      var sg: [String: Double] = [:]
      for r in own {
        if let f = r["food_item_id"]?.stringValue, !f.isEmpty, let v = serving[f] { sg[f] = v }
      }
      let mealType = e["meal_type"]?.stringValue ?? ""
      let preview = payload(title: "", mealType: mealType, rows: own, servingG: sg)
      guard (preview["ingredientCount"]?.doubleValue ?? 0) > 0 else { return nil }
      return Meal(
        id: id, dateTime: e["date_time"]?.stringValue ?? "", mealType: mealType, rows: own, servingG: sg,
        preview: preview)
    }
  }
}

public protocol CommunityShareRecipeRemote: Sendable {
  func myProfile(me: String) async throws -> JSONValue?
  func privacySettings(me: String) async throws -> JSONValue?
  func artLibrary() async throws -> [JSONValue]
  func sharedSessionIds(me: String) async throws -> [String]
  /// `meal_entries` của mình từ `sinceISO`, mới trước.
  func mealEntries(me: String, sinceISO: String) async throws -> [JSONValue]
  func mealItems(entryIds: [String]) async throws -> [JSONValue]
  /// `food_items` (`id, serving_g`).
  func foodServings(ids: [String]) async throws -> [JSONValue]
  /// RPC `share_recipe` / `share_recipe_with_art`; ném `CommunityShareFailure`.
  func shareRecipe(
    entryId: String, title: String, caption: String, visibility: CommunityShare.Visibility, artId: String?
  ) async throws
  func artURL(path: String) -> URL?
}

@MainActor @Observable
public final class CommunityShareRecipeBook {
  public let userId: String
  public private(set) var phase: CommunityShareWorkoutBook.Phase = .loading
  public private(set) var meals: [CommunityShareRecipe.Meal] = []
  public private(set) var shared: Set<String> = []
  public var picked: String?
  public var title = ""
  public var caption = ""
  public var visibilityPick: CommunityShare.Visibility?
  public var stylePick: String?
  public private(set) var posting = false

  @ObservationIgnored private let remote: any CommunityShareRecipeRemote
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var profileRow: JSONValue?
  @ObservationIgnored private var defaultVisibility: CommunityShare.Visibility = .public
  @ObservationIgnored private var library: [CommunityArtLibrary.Item] = []

  public init(
    userId: String, picked: String? = nil, remote: any CommunityShareRecipeRemote, clock: any WallClock = SystemWallClock()
  ) {
    self.userId = userId
    self.picked = picked
    self.remote = remote
    self.clock = clock
  }

  public var visibility: CommunityShare.Visibility { visibilityPick ?? defaultVisibility }
  /// Chỉ bữa của mình và chưa chia sẻ.
  public var meal: CommunityShareRecipe.Meal? { meals.first { $0.id == picked && !shared.contains($0.id) } }
  public var art: CommunityArtLibrary.Item? {
    CommunityArtLibrary.pick(library, kind: "recipe", tags: [], style: stylePick)
  }
  public var styles: [String] { CommunityArtLibrary.styles(library, kind: "recipe") }
  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  public var preview: CommunityFeed.Post? {
    guard let meal, let profileRow else { return nil }
    let payload = CommunityShareRecipe.payload(
      title: title, mealType: meal.mealType, rows: meal.rows, servingG: meal.servingG)
    let row: JSONValue = .object([
      "id": .string("preview"), "author_id": .string(userId), "kind": .string("recipe"), "payload": payload,
      "caption": .string(RepEntry.trimJS(caption)), "visibility": .string(visibility.rawValue),
      "like_count": .number(0), "comment_count": .number(0), "save_count": .number(0), "hidden": .bool(false),
      "created_at": .string(WorkoutSessionRecord.iso8601(clock.nowMillis())),
      "art_id": art.map { .string($0.id) } ?? .null, "comments_off": .bool(false),
    ])
    return CommunityFeed.hydrate(
      [row], me: userId, authors: [profileRow], liked: [], saved: [], arts: art.map { [$0.row] } ?? []
    ).first
  }

  public func load() async {
    let remote = self.remote, me = userId
    if phase != .ready { phase = .loading }
    do {
      let since = WorkoutSessionRecord.iso8601(
        EpochMillis(clock.nowMillis().millis - Int64(CommunityShareRecipe.days) * 24 * 3600 * 1000))
      async let prof = remote.myProfile(me: me)
      async let entries = remote.mealEntries(me: me, sinceISO: since)
      let (p, e) = try await (prof, entries)
      let ids = e.compactMap { $0["id"]?.stringValue }
      let items = ids.isEmpty ? [] : try await remote.mealItems(entryIds: ids)
      var foodIds: [String] = []
      for r in items {
        if let f = r["food_item_id"]?.stringValue, !f.isEmpty, !foodIds.contains(f) { foodIds.append(f) }
      }
      let foods = foodIds.isEmpty ? [] : try await remote.foodServings(ids: foodIds)
      // Phụ: hỏng thì để trống / mặc định.
      let sharedIds = (try? await remote.sharedSessionIds(me: me)) ?? []
      let settings = try? await remote.privacySettings(me: me)
      let art = (try? await remote.artLibrary()) ?? []
      profileRow = p
      meals = CommunityShareRecipe.meals(entries: e, items: items, foods: foods, me: me)
      shared = Set(sharedIds)
      defaultVisibility = CommunityPrivacy.settings(settings).defaultVisibility
      library = art.compactMap(CommunityArtLibrary.item)
      phase = p == nil ? .noProfile : .ready
    } catch {
      phase = .failed
    }
  }

  public func post() async -> CommunityShareWorkoutBook.PostResult {
    guard let meal, !posting else { return .ignored }
    guard !RepEntry.trimJS(title).isEmpty else { return .failed(.nameNeeded) }
    posting = true
    defer { posting = false }
    let remote = self.remote, title = self.title, caption = self.caption, vis = visibility, artId = art?.id
    do {
      try await remote.shareRecipe(entryId: meal.id, title: title, caption: caption, visibility: vis, artId: artId)
      shared.insert(meal.id)
      return .posted
    } catch let f as CommunityShareFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
