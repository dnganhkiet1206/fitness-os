@testable import ASCNDCore
import Foundation
import Testing

/// Màn sửa hồ sơ (#527 Phase 8) so với CHÍNH `units.ts` / `macro-targets.ts`
/// và các biểu thức của `edit-profile.tsx` @ fac9ac2
/// (`Fixtures/profile-entry-golden.json`, `gen-profile-entry.mjs`).
struct ProfileEntryGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "profile-entry-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func field(_ s: String?) throws -> ProfileEntry.Field {
    try #require(s.flatMap(ProfileEntry.Field.init(rawValue:)))
  }

  /// Gõ vào ô hiển thị → cột hệ mét của form.
  @Test func typedDisplayBecomesTheMetricColumn() throws {
    guard case .array(let cases)? = try Self.golden()["entries"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 114)
    for c in cases {
      let f = try Self.field(c["field"]?.stringValue), unit = c["unit"]?.stringValue ?? "", text = c["text"]?.stringValue ?? ""
      #expect(ProfileEntry.metric(f, display: text, unit: unit) == c["out"]?.stringValue, "\(f) \(unit) '\(text)'")
    }
  }

  /// Mở form (cột trống là ô trống, 0 vẫn là "0") và đổi đơn vị (0 thành trống).
  @Test func seedAndUnitFlipMatchRN() throws {
    guard case .array(let cases)? = try Self.golden()["displays"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 84)
    for c in cases {
      let f = try Self.field(c["field"]?.stringValue), unit = c["unit"]?.stringValue ?? "", metric = c["metric"]?.stringValue ?? ""
      #expect(ProfileEntry.seed(f, metric: metric, unit: unit) == c["seed"]?.stringValue, "seed \(f) \(unit) '\(metric)'")
      #expect(ProfileEntry.flip(f, metric: metric, unit: unit) == c["flip"]?.stringValue, "flip \(f) \(unit) '\(metric)'")
    }
  }

  /// `macroDriftFor`: gồm đúng ca của chú thích RN (1.399 kcal + 250 g carb → +508).
  @Test func macroDriftMatchesRN() throws {
    let g = try Self.golden()
    #expect(g["tolerance"]?.doubleValue == MacroTargets.driftToleranceKcal)
    guard case .array(let cases)? = g["drifts"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 14)
    for c in cases {
      var form = ProfileForm()
      form.tdeeTargetKcal = c["kcal"]?.stringValue ?? ""
      form.macroProteinG = c["protein"]?.stringValue ?? ""
      form.macroCarbsG = c["carbs"]?.stringValue ?? ""
      form.macroFatG = c["fat"]?.stringValue ?? ""
      form.macroFiberG = c["fiber"]?.stringValue ?? ""
      let label = "\(form.tdeeTargetKcal)/\(form.macroProteinG)/\(form.macroCarbsG)/\(form.macroFatG)/\(form.macroFiberG)"
      #expect(MacroTargets.calorieTarget(form.tdeeTargetKcal) == c["calorieTarget"]?.doubleValue, "\(label): target")
      let got = form.macroDrift
      if case .object(let want)? = c["drift"] {
        #expect(got?.sum == want["sum"]?.doubleValue, "\(label): sum")
        #expect(got?.drift == want["drift"]?.doubleValue, "\(label): drift")
        #expect(got?.kcalTarget == want["kcalTarget"]?.doubleValue, "\(label): kcalTarget")
      } else {
        #expect(got == nil, "\(label): không có gì để nói")
      }
    }
  }

  /// Nhãn dị ứng theo ngôn ngữ; giá trị lạ hiện nguyên văn (`allergyLabel`).
  @Test func allergyLabels() {
    #expect(FoodPreferences.commonAllergies.count == 8)
    #expect(FoodPreferences.commonAllergies.first == "Dairy")
    #expect(FoodPreferences.allergyLabel("Shellfish", lang: .vi) == "Hải sản")
    #expect(FoodPreferences.allergyLabel("Shellfish", lang: .es) == "Mariscos")
    #expect(FoodPreferences.allergyLabel("Shellfish", lang: .en) == "Shellfish")
    #expect(FoodPreferences.allergyLabel("Kiwi", lang: .vi) == "Kiwi")
  }
}
