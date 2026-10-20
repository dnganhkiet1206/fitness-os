import Testing

@testable import ASCNDCore

@Suite struct FoodNamesTests {
  let row: JSONValue = .object([
    "id": .string("1"), "name": .string("Phở bò"), "name_vi": .string("Phở bò"), "name_en": .string("Beef pho"),
    "name_es": .string("Pho de res"), "portion_vi": .string("1 tô"), "portion_en": .string("1 bowl"),
    "kcal": .number(393), "protein_g": .number(30), "carbs_g": .number(54), "fat_g": .number(5.3), "fiber_g": .number(2),
    "is_estimate": .bool(true),
  ])

  @Test func picksAppLanguageName() {
    #expect(FoodNames.pick(row, lang: "en") == "Beef pho")
    #expect(FoodNames.pick(row, lang: "es") == "Pho de res")
    #expect(FoodNames.pick(row, lang: "vi") == "Phở bò")
    #expect(FoodNames.portion(row, lang: "en") == "1 bowl")
    #expect(FoodNames.portion(row, lang: "es") == nil)
  }

  /// Hàng của người dùng không có tên 3 thứ tiếng: vẫn là `name`.
  @Test func userRowFallsBackToName() {
    let mine: JSONValue = .object(["id": .string("2"), "name": .string("Bánh của mẹ"), "name_en": .null])
    #expect(FoodNames.pick(mine, lang: "en") == "Bánh của mẹ")
  }

  @Test func estimateFlagReachesMealFood() throws {
    let f = try #require(MealLog.Food(foodRow: row))
    #expect(f.isEstimate)
    #expect(f.kcal == 393)
  }

  /// Ký tự cú pháp của bộ lọc PostgREST không lọt vào chữ tìm.
  @Test func searchKeysAreFilterSafe() {
    #expect(FoodNames.searchKey("Phở  Bò") == "pho bo")
    #expect(FoodNames.searchKey("cơm, (gà)*%") == "com ga")
    #expect(FoodNames.nameKey("trứng, gà") == "trứng gà")
    #expect(FoodNames.searchKey("Đậu phụ") == "dau phu")
  }

  @Test func exerciseSearchMatchesTranslations() {
    let e = LibraryExercise(
      id: "x", userId: nil, name: "Barbell Bench Press - Medium Grip", muscleGroup: "chest", equipment: "barbell",
      kind: "compound", localNames: ["vi": "Đẩy ngực tạ đòn nắm vừa", "es": "Press de banca con barra agarre medio"],
      searchText: "barbell bench press - medium grip day nguc ta don nam vua press de banca con barra agarre medio")
    #expect(ExerciseCatalog.matches(e, "day nguc"))
    #expect(ExerciseCatalog.matches(e, "đẩy ngực"))
    #expect(ExerciseCatalog.matches(e, "press de banca"))
    #expect(ExerciseCatalog.matches(e, "bench"))
    #expect(!ExerciseCatalog.matches(e, "squat"))
  }
}
