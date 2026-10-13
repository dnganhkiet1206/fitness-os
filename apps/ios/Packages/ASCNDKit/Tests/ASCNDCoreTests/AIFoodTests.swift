@testable import ASCNDCore
import Foundation
import Testing

/// Chụp món / gợi ý món (#527): thân yêu cầu đúng hợp đồng của hai edge
/// function, trả lời đọc như `normalize` của RN.
struct AIFoodTests {
  @Test func scanBodyIsTheFunctionsContract() {
    let b = AIFood.scanBody(imageBase64: "abc", lang: "vi", mode: .label)
    #expect(b["image_base64"] == .string("abc"))
    #expect(b["lang"] == .string("vi"))
    #expect(b["mode"] == .string("label"))
  }

  @Test func scannedItemsRoundAndDropEmptyOrZero() {
    let body: JSONValue = .object([
      "items": .array([
        .object([
          "food_name": .string(" Phở bò "), "kcal": .number(449.6), "protein_g": .number(23.5), "carbs_g": .string("55.2"),
          "fat_g": .number(11.4), "serving_g": .number(500),
        ]),
        .object(["food_name": .string("Nước"), "kcal": .number(0)]),
        .object(["food_name": .string(""), "kcal": .number(120)]),
        .object(["food_name": .string("Quẩy"), "kcal": .number(180), "fat_g": .number(-3)]),
      ])
    ])
    var n = 0
    let items = AIFood.scannedItems(body) {
      n += 1
      return "i\(n)"
    }
    #expect(items.map(\.name) == ["Phở bò", "Quẩy"])
    #expect(items[0].kcal == 450 && items[0].protein == 24 && items[0].carbs == 55 && items[0].fat == 11)
    #expect(items[0].servingG == 500)
    #expect(items[1].fat == 0)
    #expect(AIFood.scannedItems(nil).isEmpty)
    #expect(AIFood.scannedItems(.object(["items": .string("x")])).isEmpty)
  }

  @Test func suggestBodyClampsTheMealType() {
    let d = LocalDate("2026-10-13")!
    let b = AIFood.suggestBody(mealType: "dinner", lang: "en", date: d, tzOffsetMinutes: 300)
    #expect(b["meal_type"] == .string("dinner"))
    #expect(b["date"] == .string("2026-10-13"))
    #expect(b["tzOffset"] == .number(300))
    #expect(AIFood.suggestBody(mealType: "brunch", lang: "en", date: d, tzOffsetMinutes: 0)["meal_type"] == .string("any"))
    #expect(AIFood.suggestBody(mealType: nil, lang: "en", date: d, tzOffsetMinutes: 0)["meal_type"] == .string("any"))
  }

  @Test func suggestionsKeepIngredientsAndPrepTime() {
    let body: JSONValue = .object([
      "suggestions": .array([
        .object([
          "name": .string("Cá hồi áp chảo"), "description": .string("Nhanh"), "kcal": .number(520.4),
          "protein_g": .number(38), "carbs_g": .number(30), "fat_g": .number(24),
          "ingredients": .array([.string("cá hồi"), .string(" "), .string("chanh")]), "prep_time_min": .number(20),
        ]),
        .object(["name": .string("Không calo"), "kcal": .number(0)]),
      ])
    ])
    let s = AIFood.suggestions(body)
    #expect(s.count == 1)
    #expect(s[0].kcal == 520 && s[0].ingredients == ["cá hồi", "chanh"] && s[0].prepMinutes == 20)
    let f = s[0].mealFood(id: "x")
    #expect(f.foodItemId == nil && f.kcal == 520 && f.protein == 38)
  }
}
