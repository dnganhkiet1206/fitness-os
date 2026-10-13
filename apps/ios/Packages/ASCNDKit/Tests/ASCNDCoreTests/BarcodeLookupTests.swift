@testable import ASCNDCore
import Foundation
import Testing

/// Tra mã vạch (#527, `scan-barcode`). Golden: `lookupBarcode` của
/// `app/scan-barcode.tsx` @ fac9ac2 biên dịch, `fetch` giả (`gen-barcode.mjs`).
struct BarcodeLookupGoldenTests {
  static func golden() throws -> [JSONValue] {
    let url = try #require(
      Bundle.module.url(forResource: "barcode-golden", withExtension: "json", subdirectory: "Fixtures"))
    let g = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    if case .array(let a)? = g["cases"] { return a }
    return []
  }

  /// Ô số của golden: `null` (NaN qua `JSON.stringify`) là NaN.
  static func same(_ a: Double, _ e: JSONValue?) -> Bool {
    if case .null? = e { return a.isNaN }
    return a == e?.doubleValue
  }

  @Test func matchesRN() throws {
    let cases = try Self.golden()
    #expect(cases.count == 37)
    for c in cases {
      let code = try #require(c["code"]?.stringValue)
      let lang = try #require(c["lang"]?.stringValue)
      let ok = c["ok"] == .bool(true)
      #expect(BarcodeLookup.url(code)?.absoluteString == c["url"]?.stringValue, "\(code) url")
      let food = BarcodeLookup.parse(c["body"], ok: ok, code: code, lang: lang)
      guard let r = c["result"], r != .null else {
        #expect(food == nil, "\(code) \(lang) phải là không tìm thấy")
        continue
      }
      let f = try #require(food, "\(code) \(lang) phải tìm thấy")
      #expect(f.foodName == r["food_name"]?.stringValue, "\(code) \(lang) tên")
      #expect(Self.same(f.kcal, r["kcal"]), "\(code) kcal")
      #expect(Self.same(f.proteinG, r["protein_g"]), "\(code) đạm")
      #expect(Self.same(f.carbsG, r["carbs_g"]), "\(code) tinh bột")
      #expect(Self.same(f.fatG, r["fat_g"]), "\(code) béo")
      #expect(Self.same(f.fiberG, r["fiber_g"]), "\(code) xơ")
      #expect(Self.same(f.servingG, r["serving_g"]), "\(code) khẩu phần")
    }
  }

  @Test func statusMustBeTheNumberOne() {
    let body: JSONValue = .object(["status": .string("1"), "product": .object(["product_name": .string("x")])])
    #expect(BarcodeLookup.parse(body, ok: true, code: "1", lang: "en") == nil)
  }

  /// Luật native (khác RN, có chủ ý): thiếu `serving_quantity` thì 100 g chứ
  /// không phải cả gói; có `serving_quantity` thì như RN.
  @Test func nativeDefaultsToHundredGramsNotThePackage() throws {
    let jar: JSONValue = .object([
      "status": .number(1),
      "product": .object([
        "product_name": .string("Nutella"), "product_quantity": .number(400),
        "nutriments": .object(["energy-kcal_100g": .number(539), "fat_100g": .number(30.9)]),
      ]),
    ])
    let rn = try #require(BarcodeLookup.parse(jar, ok: true, code: "3017620422003", lang: "en"))
    #expect(rn.servingG == 400 && rn.kcal == 2156, "luật RN giữ nguyên")
    let native = try #require(
      BarcodeLookup.parse(jar, ok: true, code: "3017620422003", lang: "en", packageAsServing: false))
    #expect(native.servingG == 100)
    #expect(native.kcal == 539)
    #expect(native.fatG == 31)

    let withServing: JSONValue = .object([
      "status": .number(1),
      "product": .object([
        "product_name": .string("Bar"), "serving_quantity": .number(40), "product_quantity": .number(400),
        "nutriments": .object(["energy-kcal_100g": .number(400)]),
      ]),
    ])
    let n2 = try #require(BarcodeLookup.parse(withServing, ok: true, code: "1", lang: "en", packageAsServing: false))
    #expect(n2.servingG == 40 && n2.kcal == 160)
  }
}
