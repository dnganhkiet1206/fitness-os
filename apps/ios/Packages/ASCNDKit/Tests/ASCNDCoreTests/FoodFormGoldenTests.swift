@testable import ASCNDCore
import Foundation
import Testing

/// Golden THẬT cho form thêm / sửa thực phẩm — `app/food-editor.tsx` @ fac9ac2
/// (`Fixtures/food-form-golden.json`, `gen-food-form.mjs`): `digits`, ánh xạ
/// `useFormSeed`, `calcKcal`, ba tỉ lệ, `fieldErrors` (`outOfRangeMessage`
/// biên dịch từ `plausible.ts`), `canSave` và `FoodFormData`.
struct FoodFormGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "food-form-golden", withExtension: "json", subdirectory: "Fixtures"))
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

  @Test func digitsMatchRN() throws {
    let cases = Self.array(try Self.golden()["digits"])
    #expect(cases.count == 139)
    for c in cases {
      let input = try #require(c["input"]?.stringValue)
      #expect(FoodLibrary.digits(input) == c["expected"]?.stringValue, "\(input)")
    }
  }

  @Test func seedMatchesRN() throws {
    let cases = Self.array(try Self.golden()["seeds"])
    #expect(cases.count == 160)
    for c in cases {
      let food = try #require(FoodLibrary.Food(row: try #require(c["row"])))
      let f = FoodLibrary.Form(food)
      let w = c["expected"]
      #expect(f.name == w?["name"]?.stringValue, "\(c)")
      #expect(f.brand == w?["brand"]?.stringValue, "\(c)")
      #expect(f.serving == w?["serving"]?.stringValue, "\(c)")
      #expect(f.kcal == w?["kcal"]?.stringValue, "\(c)")
      #expect(f.protein == w?["protein"]?.stringValue, "\(c)")
      #expect(f.carbs == w?["carbs"]?.stringValue, "\(c)")
      #expect(f.fat == w?["fat"]?.stringValue, "\(c)")
      #expect(f.fiber == w?["fiber"]?.stringValue, "\(c)")
    }
  }

  @Test func formRulesMatchRN() throws {
    let cases = Self.array(try Self.golden()["forms"])
    #expect(cases.count == 400)
    #expect(cases.contains { $0["expected"]?["canSave"] == .bool(true) })
    for c in cases {
      let i = c["form"]
      var f = FoodLibrary.Form()
      f.name = i?["name"]?.stringValue ?? ""
      f.brand = i?["brand"]?.stringValue ?? ""
      f.serving = i?["serving"]?.stringValue ?? ""
      f.kcal = i?["kcal"]?.stringValue ?? ""
      f.protein = i?["protein"]?.stringValue ?? ""
      f.carbs = i?["carbs"]?.stringValue ?? ""
      f.fat = i?["fat"]?.stringValue ?? ""
      f.fiber = i?["fiber"]?.stringValue ?? ""
      let w = c["expected"]
      #expect(f.calcKcal == Self.num(w?["calcKcal"]), "\(c)")
      let p = f.macroPercents
      #expect(p.protein == Self.num(w?["proteinPct"]), "\(c)")
      #expect(p.carbs == Self.num(w?["carbsPct"]), "\(c)")
      #expect(p.fat == Self.num(w?["fatPct"]), "\(c)")
      #expect(f.hasFieldErrors == (w?["hasFieldErrors"] == .bool(true)), "\(c)")
      #expect(f.canSave == (w?["canSave"] == .bool(true)), "\(c)")
      let row = f.row
      let data = w?["data"]
      for k in ["name", "brand"] {
        #expect(row[k] == data?[k], "\(k) \(c)")
      }
      for k in ["serving_g", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] {
        #expect(Self.num(row[k]) == Self.num(data?[k]), "\(k) \(c)")
      }
    }
  }
}
