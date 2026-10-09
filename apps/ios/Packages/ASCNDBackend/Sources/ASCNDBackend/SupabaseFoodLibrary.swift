public import ASCNDCore
import Foundation
import Supabase

/// `FoodLibrarySource` thật — `useMyFoods` / `useCreateFoodItem` /
/// `useUpdateFoodItem` / `useDeleteFoodItem` (`use-nutrition.ts`) trên
/// `food_items` (RLS: món mẫu chung `user_id IS NULL` + món của chính người).
public struct SupabaseFoodLibrary: FoodLibrarySource {
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
}
