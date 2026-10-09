public import ASCNDCore
import Foundation
import Supabase

/// `MealPlansSource` thật — đúng các truy vấn của `use-library.ts` trên
/// `meal_plans` / `meal_plan_items` (RLS: kế hoạch của chính người; món đi theo
/// kế hoạch), tìm `food_items` của thực đơn và nhật ký hôm nay.
public struct SupabaseMealPlans: MealPlansSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func plans(userId: String) async throws -> [JSONValue] {
    try await client.from("meal_plans")
      .select("id, name, goal, meals_per_day, start_date, end_date")
      .eq("user_id", value: userId)
      .order("created_at", ascending: false)
      .execute().value
  }

  public func fill(planIds: [String]) async throws -> [JSONValue] {
    try await client.from("meal_plan_items")
      .select("meal_plan_id, day_index")
      .in("meal_plan_id", values: planIds)
      .execute().value
  }

  public func items(planId: String) async throws -> [JSONValue] {
    try await client.from("meal_plan_items")
      .select("id, day_index, meal_type, food_name, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, food_item_id")
      .eq("meal_plan_id", value: planId)
      .order("day_index")
      .order("meal_type")
      .execute().value
  }

  public func createPlan(userId: String, name: String, goal: String, mealsPerDay: Int) async throws -> String {
    let row: JSONValue = .object([
      "user_id": .string(userId), "name": .string(name), "goal": .string(goal),
      "meals_per_day": .number(Double(mealsPerDay)),
    ])
    let made: [JSONValue] = try await client.from("meal_plans")
      .insert(row)
      .select("id")
      .execute().value
    guard let id = made.first?["id"]?.stringValue else { throw URLError(.badServerResponse) }
    return id
  }

  /// `confirmWrite(delete().eq('id').eq('user_id'))`.
  public func deletePlan(id: String, userId: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("meal_plans")
      .delete()
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return gone.count
  }

  public func addItem(_ row: [String: JSONValue]) async throws {
    try await client.from("meal_plan_items").insert(JSONValue.object(row)).execute()
  }

  /// `confirmWrite(delete().eq('id'))`.
  public func deleteItem(id: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("meal_plan_items")
      .delete()
      .eq("id", value: id)
      .select("id")
      .execute().value
    return gone.count
  }

  public func searchFoods(_ text: String, limit: Int) async throws -> [JSONValue] {
    try await client.from("food_items")
      .select("id, user_id, name, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g")
      .ilike("name", pattern: "%\(text)%")
      .order("name")
      .limit(limit)
      .execute().value
  }

  public func myFoods(userId: String) async throws -> [JSONValue] {
    try await SupabaseFoodLibrary(client: client).myFoods(userId: userId, from: 0, to: FoodLibrary.pageSize - 1)
  }

  public func todayEntries(userId: String, start: String, end: String) async throws -> [JSONValue] {
    try await SupabaseMealDiary(client: client).entries(userId: userId, start: start, end: end)
  }

  public func todayItems(entryIds: [String]) async throws -> [JSONValue] {
    try await SupabaseMealDiary(client: client).items(entryIds: entryIds)
  }
}
