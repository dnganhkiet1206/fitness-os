public import ASCNDCore
import Foundation
import Supabase

/// `MealFoodSource` thật — tìm `food_items` của `log-meal.tsx` và
/// `useRecentFoods` (`use-nutrition.ts`). RLS: `food_items` trả món mẫu chung
/// (`user_id IS NULL`) + món của chính người; `meal_entry_items` chỉ của người.
public struct SupabaseMealLog: MealFoodSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  init(client: SupabaseClient) {
    self.client = client
  }

  public func search(_ text: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("food_items")
      .select("id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, " + FoodNames.columns)
      .or(SupabaseFoodLibrary.searchFilter(text))
      .order("name")
      .limit(limit)
      .execute().value
  }

  /// Hai lượt, lọc theo người trước (AUD-53): lượt 1 lấy id `limit` bữa mới
  /// nhất của người (theo `created_at`); lượt 2 lấy món của các bữa ấy, mới
  /// trước. `limit` món mới nhất nằm trong `limit` bữa mới nhất — mỗi món thuộc
  /// một bữa — trừ món gắn thêm vào bữa cũ sau này. Không còn quét
  /// `meal_entry_items` rồi trông vào RLS; cột trả về như cũ.
  public func recentItems(userId: String, limit: Int) async throws -> [JSONValue] {
    let entries: [JSONValue] = try await client.from("meal_entries")
      .select("id")
      .eq("user_id", value: userId)
      .order("created_at", ascending: false)
      .limit(limit)
      .execute().value
    let entryIds = entries.compactMap { $0["id"]?.stringValue }
    guard !entryIds.isEmpty else { return [] }
    return try await client.from("meal_entry_items")
      .select("food_name, food_item_id, kcal, protein_g, carbs_g, fat_g, fiber_g, servings, created_at")
      .in("meal_entry_id", values: entryIds)
      .order("created_at", ascending: false)
      .limit(limit)
      .execute().value
  }

  public func favorites(userId: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("food_items")
      .select("id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite")
      .eq("user_id", value: userId)
      .eq("is_favorite", value: true)
      .order("name")
      .limit(limit)
      .execute().value
  }

  public func recentMeals(userId: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("meal_entries")
      .select("id, meal_type, date_time, meal_entry_items(food_name, food_item_id, servings, kcal, protein_g, carbs_g, fat_g, fiber_g)")
      .eq("user_id", value: userId)
      .order("date_time", ascending: false)
      .limit(limit)
      .execute().value
  }
}
