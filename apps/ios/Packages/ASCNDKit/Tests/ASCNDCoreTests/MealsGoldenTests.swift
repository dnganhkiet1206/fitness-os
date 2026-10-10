@testable import ASCNDCore
import Foundation
import Testing

/// Golden THẬT từ mã RN @ fac9ac2 (`Fixtures/meals-golden.json`, `gen-meals.mjs`
/// trên `out/` của `build.sh` — không chép tay):
/// `plannedMealIsLoggedToday` → `MealPlans.isLoggedToday`,
/// `foldRecentMeals` / `mealSignature` → `MealLog.recentMeals` / `mealSignature`,
/// `macroTargetsFor` / `calorieTargetFor` → `MacroTargets.grams` / `calorieTarget`.
struct MealsGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "meals-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  @Test func plannedMealIsLoggedToday() throws {
    let cases = Self.array(try Self.golden()["planned"])
    #expect(cases.count == 300)
    #expect(cases.contains { $0["expected"] == .bool(true) })
    for c in cases {
      let mealType = try #require(c["mealType"]?.stringValue)
      let planned = Self.array(c["planned"]).enumerated().map { i, n in
        MealPlans.Item(id: "p\(i)", day: 0, mealType: mealType, name: n.stringValue ?? "", kcal: 0)
      }
      let today = Self.array(c["entries"]).enumerated().map { k, e in
        MealDiary.Meal(
          id: "e\(k)", type: e["meal_type"]?.stringValue ?? "", kcal: 0, protein: 0, carbs: 0, fat: 0,
          items: Self.array(e["items"]).enumerated().map { j, it in
            MealDiary.Item(
              id: "e\(k)-\(j)", entryId: "e\(k)", foodName: it["food_name"]?.stringValue ?? "", servings: 1, kcal: 0,
              protein: 0, carbs: 0, fat: 0)
          })
      }
      #expect(MealPlans.isLoggedToday(planned, mealType: mealType, today: today) == (c["expected"] == .bool(true)), "\(c)")
    }
  }

  @Test func foldRecentMeals() throws {
    let cases = Self.array(try Self.golden()["recent"])
    #expect(cases.count == 160)
    for c in cases {
      let entries = Self.array(c["entries"])
      for (e, sig) in zip(entries, Self.array(c["signatures"])) {
        let names = Self.array(e["meal_entry_items"]).map { $0["food_name"]?.stringValue }
        #expect(MealLog.mealSignature(e["meal_type"]?.stringValue ?? "", names) == sig.stringValue, "\(e)")
      }
      let limit = Int(try #require(Self.num(c["limit"])))
      let got = MealLog.recentMeals(entries, limit: limit)
      let want = Self.array(c["expected"])
      #expect(got.count == want.count, "\(c)")
      for (g, w) in zip(got, want) {
        #expect(g.id == w["id"]?.stringValue)
        #expect(g.mealType == w["meal_type"]?.stringValue)
        #expect(g.kcal == Self.num(w["kcal"]), "\(w)")
        let foods = Self.array(w["foods"])
        #expect(g.foods.count == foods.count)
        for (f, wf) in zip(g.foods, foods) {
          #expect(f.food.name == wf["food_name"]?.stringValue)
          #expect(f.food.foodItemId == wf["food_item_id"]?.stringValue)
          #expect(f.servings == Self.num(wf["servings"]), "\(wf)")
          #expect(f.food.kcal == Self.num(wf["kcal"]), "\(wf)")
          #expect(f.food.protein == Self.num(wf["protein_g"]), "\(wf)")
          #expect(f.food.carbs == Self.num(wf["carbs_g"]), "\(wf)")
          #expect(f.food.fat == Self.num(wf["fat_g"]), "\(wf)")
          #expect(f.food.fiber == Self.num(wf["fiber_g"]), "\(wf)")
        }
      }
    }
  }

  @Test func macroTargetsFor() throws {
    let cases = Self.array(try Self.golden()["macros"])
    #expect(cases.count == 240)
    for c in cases {
      let p = c["profile"]
      let kcal = Self.num(p?["tdee_target_kcal"])
      let g = MacroTargets.grams(
        tdeeKcal: kcal, protein: Self.num(p?["macro_protein_g"]), carbs: Self.num(p?["macro_carbs_g"]),
        fat: Self.num(p?["macro_fat_g"]), fiber: Self.num(p?["macro_fiber_g"]))
      let w = c["expected"]
      #expect(g.protein == Self.num(w?["protein"]), "\(c)")
      #expect(g.carbs == Self.num(w?["carbs"]), "\(c)")
      #expect(g.fat == Self.num(w?["fat"]), "\(c)")
      #expect(g.fiber == Self.num(w?["fiber"]), "\(c)")
      #expect(MacroTargets.calorieTarget(kcal.map { "\($0)" } ?? "") == Self.num(c["kcal"]), "\(c)")
    }
  }
}
