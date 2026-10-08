@testable import ASCNDCore
import Foundation
import Testing

/// Màn "Tiến bộ từng bài" (#527 Phase 2) so với RN @ fac9ac2
/// (`Fixtures/insight-screen-golden.json`, sinh bằng
/// `tools/insights-golden/gen-insight-screen.mjs`): `planKeys` biên dịch từ
/// `plan-exercises.ts`, `groupOf` / `headline` / `seriesText` chép nguyên văn
/// từ `exercise-insight.tsx`.
struct InsightScreenGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "insight-screen-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  @Test func planKeysMatchRN() throws {
    let cases = Self.array(try Self.golden()["scope"])
    #expect(cases.count == 60)
    for c in cases {
      let today = try #require(LocalDate(c["date"]?.stringValue ?? ""))
      let days = Self.array(c["days"]).map {
        RoutineDay(
          dayOfWeek: $0["day_of_week"]?.intValue ?? -1, isRest: $0["is_rest"]?.boolValue ?? false,
          templateId: $0["template_id"]?.stringValue)
      }
      let templates = Self.array(c["templates"]).map { t in
        WorkoutTemplate(
          id: t["id"]?.stringValue ?? "", name: "",
          exercises: Self.array(t["exercises"]).map {
            TemplateExercise(exerciseName: $0["exerciseName"]?.stringValue ?? "", sets: 1, reps: 1, weightKg: 0)
          })
      }
      for scope in InsightScreen.Scope.allCases {
        let got = InsightScreen.planKeys(scope, days: days, templates: templates, today: today).map { $0.sorted() }
        let want: [String]? = {
          guard case .array(let a)? = c["keys"]?[scope.rawValue] else { return nil }
          return a.compactMap(\.stringValue)
        }()
        #expect(got == want, "\(c["date"]?.stringValue ?? "") \(scope)")
      }
    }
  }

  static func bestSet(_ v: JSONValue) -> ExerciseTrend.Evidence.BestSet {
    .init(
      weightKg: v["weightKg"]?.doubleValue, reps: v["reps"]?.intValue, durationSec: v["durationSec"]?.intValue,
      bodyweightKg: v["bodyweightKg"]?.doubleValue)
  }

  static func insight(_ v: JSONValue) -> ExerciseInsight {
    var evidence: [ExerciseTrend.Evidence] = []
    for e in array(v["evidence"]) {
      switch e["kind"]?.stringValue {
      case "best-sets": evidence.append(.bestSets(array(e["values"]).map(bestSet)))
      case "volatile": evidence.append(.volatile(spread: e["spread"]?.doubleValue ?? 0))
      default: break
      }
    }
    return ExerciseInsight(
      exerciseKey: "x", exerciseName: "X", kind: .compound, lastTrainedDays: nil, stale: v["stale"]?.boolValue ?? false,
      trend: ExerciseTrend.Trend(rawValue: v["trend"]?.stringValue ?? "") ?? .stable, readiness: .maintain,
      confidence: .none, sessions: 0, current: nil, previous: nil, changePct: nil, unit: .kg,
      bestWeightKg: v["bestWeightKg"]?.doubleValue, bestReps: v["bestReps"]?.intValue, bestE1rmKg: nil,
      bestDurationSec: v["bestDurationSec"]?.intValue, evidence: evidence, generatedAt: EpochMillis(0))
  }

  @Test func groupHeadlineAndSeriesMatchRN() throws {
    let cases = Self.array(try Self.golden()["cards"])
    #expect(cases.count == 120)
    for (n, c) in cases.enumerated() {
      let i = Self.insight(try #require(c["insight"]))
      #expect(InsightScreen.group(i).rawValue == c["group"]?.stringValue, "#\(n)")
      let values = Self.array(Self.array(c["insight"]?["evidence"]).first?["values"]).map(Self.bestSet)
      for unit in [WeightUnit.kg, .lbs] {
        let key = unit == .kg ? "kg" : "lbs"
        #expect(InsightScreen.headline(i, load: unit.load) == c["headline"]?[key]?.stringValue, "#\(n) \(key)")
        let s = InsightScreen.seriesText(values, load: unit.load)
        #expect(s.prefix == c["series"]?[key]?["prefix"]?.stringValue, "#\(n) \(key)")
        #expect(s.parts == Self.array(c["series"]?[key]?["parts"]).compactMap(\.stringValue), "#\(n) \(key)")
      }
    }
  }
}

struct InsightScreenTests {
  /// Một bài (từ chip) thắng phạm vi; `nil` = không lọc.
  @Test func shownPrefersSingleThenScope() {
    let a = InsightScreenGoldenTests.insight(.object(["trend": .string("STABLE")]))
    let list = [a]
    #expect(InsightScreen.shown(list, keys: nil, single: nil).count == 1)
    #expect(InsightScreen.shown(list, keys: [], single: nil).isEmpty)
    #expect(InsightScreen.shown(list, keys: [], single: "x").count == 1)
    #expect(InsightScreen.shown(list, keys: ["x"], single: "y").isEmpty)
  }
}
