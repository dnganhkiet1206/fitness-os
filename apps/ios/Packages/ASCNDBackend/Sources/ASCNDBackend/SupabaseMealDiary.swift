public import ASCNDCore
import Foundation
import Supabase

/// `MealDiarySource` thật — đúng các truy vấn của `use-nutrition.ts` trên
/// `meal_entries` / `meal_entry_items` (RLS `auth.uid() = user_id`; món đi theo
/// bữa của chính người).
public struct SupabaseMealDiary: MealDiarySource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  init(client: SupabaseClient) {
    self.client = client
  }

  /// `useTodayLog`, lượt 1.
  public func entries(userId: String, start: String, end: String) async throws -> [JSONValue] {
    try await client.from("meal_entries")
      .select("id, meal_type, date_time, total_kcal, total_protein_g, total_carbs_g, total_fat_g")
      .eq("user_id", value: userId)
      .gte("date_time", value: start)
      .lt("date_time", value: end)
      .order("date_time", ascending: true)
      .execute().value
  }

  /// `useTodayLog`, lượt 2 — lỗi cũng ném.
  public func items(entryIds: [String]) async throws -> [JSONValue] {
    try await client.from("meal_entry_items")
      .select("id, meal_entry_id, food_name, servings, kcal, protein_g, carbs_g, fat_g")
      .in("meal_entry_id", values: entryIds)
      .execute().value
  }

  public func item(id: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("meal_entry_items")
      .select(MealDiary.itemColumns)
      .eq("id", value: id)
      .limit(1)
      .execute().value
    return rows.first
  }

  public func entry(id: String, userId: String) async throws -> JSONValue? {
    let rows: [JSONValue] = try await client.from("meal_entries")
      .select(MealDiary.entryColumns)
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .limit(1)
      .execute().value
    return rows.first
  }

  /// `confirmWrite(delete().eq('id'))`.
  public func deleteItem(id: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("meal_entry_items")
      .delete()
      .eq("id", value: id)
      .select("id")
      .execute().value
    return gone.count
  }

  public func updateItem(id: String, _ row: [String: JSONValue]) async throws -> Int {
    let hit: [JSONValue] = try await client.from("meal_entry_items")
      .update(JSONValue.object(row))
      .eq("id", value: id)
      .select("id")
      .execute().value
    return hit.count
  }

  /// `resyncMealEntry`: các món còn lại.
  public func remainingItems(entryId: String) async throws -> [JSONValue] {
    try await client.from("meal_entry_items")
      .select("kcal, protein_g, carbs_g, fat_g, fiber_g")
      .eq("meal_entry_id", value: entryId)
      .execute().value
  }

  public func deleteEntry(id: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("meal_entries")
      .delete()
      .eq("id", value: id)
      .select("id")
      .execute().value
    return gone.count
  }

  public func updateEntry(id: String, _ row: [String: JSONValue]) async throws -> Int {
    let hit: [JSONValue] = try await client.from("meal_entries")
      .update(JSONValue.object(row))
      .eq("id", value: id)
      .select("id")
      .execute().value
    return hit.count
  }

  /// `useRestoreMealItem`: bữa trước (món mang khoá ngoại tới nó).
  public func restore(entry: JSONValue) async throws {
    try await client.from("meal_entries")
      .upsert(entry, onConflict: "id", ignoreDuplicates: true)
      .execute()
  }

  public func restore(item: JSONValue) async throws {
    try await client.from("meal_entry_items")
      .upsert(item, onConflict: "id", ignoreDuplicates: true)
      .execute()
  }
}
