import Testing

@testable import ASCNDCore

@Suite struct FoodMatchTests {
  func food(_ name: String) -> MealLog.Food {
    MealLog.Food(id: name, foodItemId: name, name: name, kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 0)
  }

  @Test func exactIgnoresAccentsAndCase() {
    #expect(FoodMatch.best("pho bo", in: [food("Phở bò")])?.confidence == .exact)
    #expect(FoodMatch.best("Cơm trắng", in: [food("cơm trắng")])?.confidence == .exact)
  }

  @Test func pluralIsExact() {
    #expect(FoodMatch.best("eggs", in: [food("Egg")])?.confidence == .exact)
    #expect(FoodMatch.best("huevos", in: [food("huevo")])?.confidence == .exact)
  }

  @Test func oneDescriptiveWordIsStrong() {
    #expect(FoodMatch.best("trứng", in: [food("Trứng gà")])?.food.name == "Trứng gà")
    #expect(FoodMatch.best("toast", in: [food("White toast")])?.confidence == .strong)
  }

  /// Không bao giờ ghi nhầm món khác.
  @Test func differentDishIsNoMatch() {
    #expect(FoodMatch.best("phở bò", in: [food("Phở gà")]) == nil)
    #expect(FoodMatch.best("cơm gà", in: [food("Cơm trắng"), food("Gà rán")]) == nil)
    #expect(FoodMatch.best("chicken", in: [food("Chicken nuggets fried")]) == nil)
    #expect(FoodMatch.best("ga", in: [food("Gà rán")]) == nil)
  }

  @Test func exactBeatsStrongAndOrderBreaksTies() {
    let r = FoodMatch.best("trứng", in: [food("Trứng gà"), food("Trứng")])
    #expect(r?.food.name == "Trứng")
    let first = FoodMatch.best("trứng", in: [food("Trứng gà"), food("Trứng vịt")])
    #expect(first?.food.name == "Trứng gà")
  }

  @Test func emptyNameIsNoMatch() {
    #expect(FoodMatch.best("  ", in: [food("Trứng")]) == nil)
  }
}
