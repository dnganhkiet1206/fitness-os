@testable import ASCNDCore
import Foundation
import Testing

/// Chip gợi ý = CHÍNH `suggestionsFor` của RN (`Fixtures/suggestions-golden.json`,
/// `gen-suggestions.mjs`; số bước nhóm en-US như golden).
struct AssistantSuggestionsGoldenTests {
  /// `toLocaleString('en-US')` cho số nguyên dương: dấu phẩy mỗi ba chữ số.
  static let enUS: AssistantSuggestions.Grouping = { n, _ in
    var digits = Array(String(n))
    var i = digits.count - 3
    while i > 0 {
      digits.insert(",", at: i)
      i -= 3
    }
    return String(digits)
  }

  static func cases() throws -> [JSONValue] {
    let url = try #require(
      Bundle.module.url(forResource: "suggestions-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let a) = root else { return [] }
    return a
  }

  static func optNumber(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  static func signal(_ s: JSONValue) -> AssistantSuggestions.Signal {
    AssistantSuggestions.Signal(
      readiness: optNumber(s["readiness"]).map { Int($0) }, status: s["status"]?.stringValue,
      acwr: optNumber(s["acwr"]), sleepMin: optNumber(s["sleepMin"]) ?? 0, kcal: optNumber(s["kcal"]) ?? 0,
      kcalTarget: optNumber(s["kcalTarget"]) ?? 0, proteinG: optNumber(s["proteinG"]) ?? 0,
      proteinTarget: optNumber(s["proteinTarget"]) ?? 0, steps: optNumber(s["steps"]) ?? 0,
      daysSinceWorkout: optNumber(s["daysSinceWorkout"]).map { Int($0) })
  }

  @Test func everyCaseMatchesRN() throws {
    let all = try Self.cases()
    #expect(all.count == 404)
    var checked = 0
    for c in all {
      guard let s = c["signal"], case .array(let want)? = c["chips"] else {
        Issue.record("ca hỏng")
        continue
      }
      let got = AssistantSuggestions.suggestions(for: Self.signal(s), grouping: Self.enUS)
      #expect(got.map(\.key) == want.compactMap { $0["key"]?.stringValue }, "\(s)")
      for (g, w) in zip(got, want) {
        #expect(g.topic.rawValue == w["topic"]?.stringValue)
        #expect(g.glyph.rawValue == w["glyph"]?.stringValue)
        #expect(g.label.vi == w["label"]?["vi"]?.stringValue)
        #expect(g.label.en == w["label"]?["en"]?.stringValue)
        #expect(g.question.vi == w["question"]?["vi"]?.stringValue)
        #expect(g.question.en == w["question"]?["en"]?.stringValue)
        #expect(!g.label.es.isEmpty && !g.question.es.isEmpty)
        checked += 1
      }
    }
    #expect(checked == 404 * 4)
  }

  @Test func hhmmPadsMinutes() {
    #expect(AssistantSuggestions.hhmm(320) == "5h20")
    #expect(AssistantSuggestions.hhmm(245) == "4h05")
    #expect(AssistantSuggestions.hhmm(60) == "1h00")
  }
}

/// `useAssistantSignal` → tín hiệu.
struct AssistantSignalTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let today = LocalDate("2026-10-09")!

  @Test func nothingLoggedIsTheEmptyDay() {
    let s = AssistantSuggestions.Signal.from(log: nil, profile: nil, lastWorkoutAt: nil, today: Self.today, in: Self.tz)
    #expect(s.readiness == nil)
    #expect(s.status == nil)
    #expect(s.acwr == nil)
    #expect(s.sleepMin == 0)
    #expect(s.kcal == 0)
    #expect(s.kcalTarget == 2200)
    #expect(s.proteinTarget == 149)  // round(2200 × 0.27 / 4)
    #expect(s.daysSinceWorkout == nil)
  }

  @Test func readsTheRowLikeTheHook() {
    let log: JSONValue = .object([
      "readiness_score": .number(61.6), "readiness_status": .string("yellow"), "acwr": .string("1.42"),
      "sleep_duration_min": .number(395), "kcal": .number(1234.6), "protein_g": .string("88.5"),
      "steps": .null,
    ])
    let profile: JSONValue = .object(["tdee_target_kcal": .string("2500"), "macro_protein_g": .number(160)])
    // 23:30 giờ VN hôm qua = 16:30 UTC → hôm qua theo giờ máy: 1 ngày.
    let s = AssistantSuggestions.Signal.from(
      log: log, profile: profile, lastWorkoutAt: .string("2026-10-08T16:30:00+00:00"), today: Self.today, in: Self.tz)
    #expect(s.readiness == 62)
    #expect(s.status == "yellow")
    #expect(s.acwr == 1.42)
    #expect(s.sleepMin == 395)
    #expect(s.kcal == 1235)
    #expect(s.kcalTarget == 2500)
    #expect(s.proteinG == 88.5)
    #expect(s.proteinTarget == 160)
    #expect(s.steps == 0)
    #expect(s.daysSinceWorkout == 1)
  }

  @Test func calendarDaysInTheDeviceZone() {
    // 17:30 UTC ngày 8 = 00:30 ngày 9 ở VN → hôm nay: 0.
    let s = AssistantSuggestions.Signal.from(
      log: nil, profile: nil, lastWorkoutAt: .string("2026-10-08T17:30:00Z"), today: Self.today, in: Self.tz)
    #expect(s.daysSinceWorkout == 0)
    let bad = AssistantSuggestions.Signal.from(
      log: nil, profile: nil, lastWorkoutAt: .string("không phải ngày"), today: Self.today, in: Self.tz)
    #expect(bad.daysSinceWorkout == nil)
  }

  @Test func nameAndRecoveryForTheBrief() {
    var seen: String?
    let s = AssistantSuggestions.Signal.from(
      log: .object(["readiness_explain": .string("sleep:80|load:45")]),
      profile: .object(["name": .string("  Nguyễn Anh Kiệt ")]), lastWorkoutAt: nil, today: Self.today, in: Self.tz,
      hasRecovery: { explain in
        seen = explain
        return true
      })
    #expect(s.name == "Nguyễn Anh Kiệt")
    #expect(s.hasRecovery)
    #expect(seen == "sleep:80|load:45")
    let none = AssistantSuggestions.Signal.from(
      log: nil, profile: .object(["name": .number(3)]), lastWorkoutAt: nil, today: Self.today, in: Self.tz)
    #expect(none.name == "")
    #expect(!none.hasRecovery)
  }

  @Test func zeroCalorieTargetIsNoPlan() {
    let s = AssistantSuggestions.Signal.from(
      log: nil, profile: .object(["tdee_target_kcal": .number(0), "macro_protein_g": .null]), lastWorkoutAt: nil,
      today: Self.today, in: Self.tz)
    #expect(s.kcalTarget == 2200)
    #expect(s.proteinTarget == 149)
  }
}

/// Nhóm số theo ngôn ngữ của câu (khác RN: RN theo locale của máy).
struct AssistantSuggestionsGroupingTests {
  @Test func stepsGroupedPerLanguage() {
    let s = AssistantSuggestions.Signal(kcal: 2100, proteinG: 130, steps: 3250)
    let chip = AssistantSuggestions.suggestions(for: s, grouping: { n, lang in "\(lang.rawValue):\(n)" })
      .first { $0.key == "steps-low" }
    #expect(chip?.question.vi.contains("vi:3250") == true)
    #expect(chip?.question.en.contains("en:3250") == true)
    #expect(chip?.question.es.contains("es:3250") == true)
  }
}
