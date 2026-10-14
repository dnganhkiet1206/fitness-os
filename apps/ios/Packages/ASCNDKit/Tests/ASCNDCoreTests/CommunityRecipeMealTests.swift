@testable import ASCNDCore
import Testing

/// "Thêm vào bữa" từ bài công thức (14/10).
struct CommunityRecipeMealTests {
  @Test func recipeBecomesOneManualFoodWithItsTotals() throws {
    let r = CommunityPayloads.recipe(.object([
      "title": .string("  Bún gà  "),
      "ingredients": .array([
        .object(["name": .string("Bún"), "grams": .number(150), "kcal": .number(210.4), "protein": .number(3.33),
                 "carbs": .number(46), "fat": .number(0.4)]),
        .object(["name": .string("Gà"), "kcal": .number(165), "protein": .number(31), "fat": .number(3.6)]),
      ]),
    ]))
    let f = try #require(CommunityCard.mealFood(r, id: "x", fallbackName: "Công thức"))
    #expect(f.name == "Bún gà" && f.foodItemId == nil && f.id == "x")
    #expect(f.kcal == 375 && f.protein == 34.3 && f.carbs == 46 && f.fat == 4)
  }

  @Test func untitledUsesFallbackAndZeroKcalIsNothing() {
    let named = CommunityPayloads.recipe(.object([
      "ingredients": .array([.object(["name": .string("Trứng"), "kcal": .number(70)])]),
    ]))
    #expect(CommunityCard.mealFood(named, id: "x", fallbackName: "Công thức")?.name == "Công thức")
    #expect(CommunityCard.mealFood(CommunityPayloads.recipe(.object([:])), id: "x", fallbackName: "C") == nil)
  }
}
