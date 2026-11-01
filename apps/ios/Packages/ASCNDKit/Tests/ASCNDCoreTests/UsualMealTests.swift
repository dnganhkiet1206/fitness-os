@testable import ASCNDCore
import Foundation
import Testing

/// "Ghi như mọi khi" trên thông báo nhắc bữa (Kiệt 01/11).
struct UsualMealTests {
  static func meal(_ id: String, _ type: String, _ foods: [String]) -> JSONValue {
    .object([
      "id": .string(id), "meal_type": .string(type), "date_time": .string("2026-10-30T05:00:00Z"),
      "meal_entry_items": .array(foods.map { .object(["food_name": .string($0), "calories": .number(300), "servings": .number(1)]) }),
    ])
  }

  /// Món ăn nhiều lần nhất của đúng loại bữa thắng bữa gần nhất.
  @Test func mostFrequentOfThatMealWins() {
    let rows = [
      Self.meal("a", "lunch", ["Phở bò"]),
      Self.meal("b", "lunch", ["Cơm gà"]),
      Self.meal("c", "dinner", ["Phở bò"]),
      Self.meal("d", "lunch", ["Cơm gà"]),
    ]
    #expect(MealLog.usualMeal(rows, mealType: "lunch")?.foods.map(\.food.name) == ["Cơm gà"])
  }

  /// Hoà thì bữa gần nhất (danh sách xếp mới trước); chưa từng ghi loại ấy thì nil.
  @Test func tieGoesToMostRecentAndNoneIsNil() {
    let rows = [Self.meal("a", "breakfast", ["Yến mạch"]), Self.meal("b", "breakfast", ["Bánh mì"])]
    #expect(MealLog.usualMeal(rows, mealType: "breakfast")?.foods.map(\.food.name) == ["Yến mạch"])
    #expect(MealLog.usualMeal(rows, mealType: "snack") == nil)
  }
}
