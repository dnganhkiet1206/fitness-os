@testable import ASCNDCore
import Foundation
import Testing

/// Kế hoạch dinh dưỡng của onboarding (#424) so với CHÍNH `fitness-calc.ts`
/// @ fac9ac2 (`Fixtures/plan-golden.json`, hôm nay = 2026-10-05).
struct FitnessCalcGoldenTests {
  static let today = LocalDate("2026-10-05")!

  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "plan-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func json(_ a: FitnessCalc.Attempt) -> JSONValue {
    switch a {
    case .missing(let m):
      return .object(["ok": .bool(false), "missing": .array(m.map { .string($0.rawValue) })])
    case .ok(let p, let h, let w, let age):
      return .object([
        "ok": .bool(true), "height_cm": .number(h), "weight_kg": .number(w), "age": .number(Double(age)),
        "plan": .object([
          "bmr": .number(Double(p.bmr)), "tdee": .number(Double(p.tdee)), "tdee_target_kcal": .number(Double(p.targetKcal)),
          "macro_protein_g": .number(Double(p.proteinG)), "macro_carbs_g": .number(Double(p.carbsG)),
          "macro_fat_g": .number(Double(p.fatG)), "macro_fiber_g": .number(Double(p.fiberG)),
          "water_target_ml": .number(Double(p.waterMl)),
        ]),
      ])
    }
  }

  @Test func planFromEntryMatchesRN() throws {
    guard case .array(let cases)? = try Self.golden()["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 1041)
    var mismatches = 0
    for c in cases {
      let i = c["input"]
      let got = FitnessCalc.planFromEntry(
        heightText: i?["heightText"]?.stringValue ?? "", weightText: i?["weightText"]?.stringValue ?? "",
        dob: i?["dob"]?.stringValue.flatMap(LocalDate.init),
        sex: FitnessCalc.Sex(rawValue: i?["sex"]?.stringValue ?? "") ?? .other,
        goal: i?["goal"]?.stringValue ?? "", activityLevel: i?["activity_level"]?.stringValue ?? "", today: Self.today)
      if Self.json(got) != c["out"] {
        mismatches += 1
        if mismatches <= 5 { Issue.record("\(i.map { "\($0)" } ?? "?") → \(Self.json(got)) ≠ \(c["out"].map { "\($0)" } ?? "?")") }
      }
    }
    #expect(mismatches == 0)
  }

  @Test func ageMatchesRN() throws {
    guard case .array(let ages)? = try Self.golden()["ages"] else { throw CocoaError(.fileReadCorruptFile) }
    for a in ages {
      let dob = try #require(a["dob"]?.stringValue.flatMap(LocalDate.init))
      #expect(FitnessCalc.age(dob: dob, today: Self.today) == a["age"]?.intValue, "\(dob)")
    }
  }
}
