public import ASCNDCore
import Foundation
import Supabase

/// `FoodLibrarySource` thật — `useMyFoods` / `useCreateFoodItem` /
/// `useUpdateFoodItem` / `useDeleteFoodItem` (`use-nutrition.ts`) trên
/// `food_items` (RLS: món mẫu chung `user_id IS NULL` + món của chính người).
public struct SupabaseFoodLibrary: FoodLibrarySource, FoodFavoriteSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  init(client: SupabaseClient) {
    self.client = client
  }

  /// Một trang, xếp theo tên rồi id để các trang không chồng / sót hàng.
  public func myFoods(userId: String, from: Int, to: Int) async throws -> [JSONValue] {
    try await client.from("food_items")
      .select(FoodLibrary.columns)
      .eq("user_id", value: userId)
      .order("name")
      .order("id")
      .range(from: from, to: to)
      .execute().value
  }

  /// Ô tìm của tab Dinh dưỡng (`nutrition_food_search`): món của người lẫn món
  /// mẫu chung theo tên, yêu thích trước rồi theo tên.
  public func search(_ text: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("food_items")
      .select(FoodLibrary.columns)
      .ilike("name", pattern: "%\(text)%")
      .order("is_favorite", ascending: false)
      .order("name")
      .limit(limit)
      .execute().value
  }

  public func recentItems(userId: String, limit: Int) async throws -> [JSONValue] {
    try await SupabaseMealLog(client: client).recentItems(userId: userId, limit: limit)
  }

  public func insert(userId: String, _ row: [String: JSONValue]) async throws {
    var r = row
    r["user_id"] = .string(userId)
    try await client.from("food_items").insert(JSONValue.object(r)).execute()
  }

  /// `confirmWrite(update().eq('id'))`.
  public func update(id: String, _ row: [String: JSONValue]) async throws -> Int {
    let hit: [JSONValue] = try await client.from("food_items")
      .update(JSONValue.object(row))
      .eq("id", value: id)
      .select("id")
      .execute().value
    return hit.count
  }

  /// `confirmWrite(delete().eq('id').eq('user_id'))`.
  public func delete(id: String, userId: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("food_items")
      .delete()
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return gone.count
  }

  // MARK: - Ngôi sao (`useToggleFavoriteFood`, #527 N2)

  public func food(id: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("food_items")
      .select("user_id, name, brand, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g")
      .eq("id", value: id)
      .limit(1)
      .execute().value
    return rows.first
  }

  public func setFavorite(id: String, userId: String?, value: Bool) async throws -> Int {
    var q = try client.from("food_items").update(["is_favorite": value]).eq("id", value: id)
    if let userId { q = q.eq("user_id", value: userId) }
    let hit: [JSONValue] = try await q.select("id").execute().value
    return hit.count
  }

  public func myFoodId(userId: String, name: String) async throws -> String? {
    let rows: [JSONValue] = try await client.from("food_items")
      .select("id")
      .eq("user_id", value: userId)
      .eq("name", value: name)
      .limit(1)
      .execute().value
    return rows.first?["id"]?.stringValue
  }
}
