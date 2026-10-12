public import ASCNDCore
import Foundation
import Supabase

/// `GrocerySource` thật — đúng các truy vấn của `useGroceryItems` /
/// `useGroceryMutations` (`hooks/use-extras.ts`) và `grocery_meal_plan`
/// (`app/grocery.tsx`) @ fac9ac2. RLS `auth.uid() = user_id`.
public struct SupabaseGrocerySource: GrocerySource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func items(userId: String) async throws -> [GroceryItem] {
    let rows: [Row] = try await client.from("grocery_items")
      .select("id, name, quantity, checked, category")
      .eq("user_id", value: userId)
      .order("checked")
      .order("created_at", ascending: false)
      .execute().value
    return rows.map { GroceryItem(id: $0.id, name: $0.name, quantity: $0.quantity, checked: $0.checked ?? false, category: $0.category) }
  }

  public func insert(userId: String, name: String, quantity: String?) async throws {
    let row: JSONValue = .object([
      "user_id": .string(userId), "name": .string(name),
      "quantity": quantity.map { .string($0) } ?? .null, "checked": .bool(false),
    ])
    try await client.from("grocery_items").insert(row).execute()
  }

  public func setChecked(id: String, userId: String, checked: Bool) async throws -> Int {
    let touched: [JSONValue] = try await client.from("grocery_items")
      .update(["checked": checked])
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return touched.count
  }

  public func delete(id: String, userId: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("grocery_items")
      .delete()
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return gone.count
  }

  public func latestPlanRows(userId: String) async throws -> [(name: String?, grams: Double?)] {
    let plans: [PlanId] = try await client.from("meal_plans")
      .select("id")
      .eq("user_id", value: userId)
      .order("created_at", ascending: false)
      .limit(1)
      .execute().value
    guard let plan = plans.first else { return [] }
    let rows: [PlanRow] = try await client.from("meal_plan_items")
      .select("food_name, serving_g")
      .eq("meal_plan_id", value: plan.id)
      .execute().value
    return rows.map { (name: $0.food_name, grams: $0.serving_g) }
  }

  struct Row: Decodable, Sendable {
    let id: String
    let name: String
    let quantity: String?
    let checked: Bool?
    let category: String?
  }

  struct PlanId: Decodable, Sendable {
    let id: String
  }

  struct PlanRow: Decodable, Sendable {
    let food_name: String?
    let serving_g: Double?
  }
}
