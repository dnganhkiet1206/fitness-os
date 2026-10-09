@testable import ASCNDCore
import Foundation
import Testing

/// Lời chào + tóm tắt = CHÍNH `briefFor` / `givenName` của RN
/// (`Fixtures/brief-golden.json`, `gen-brief.mjs`).
struct AssistantBriefGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "brief-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func signal(_ s: JSONValue) -> AssistantSuggestions.Signal {
    var sig = AssistantSuggestionsGoldenTests.signal(s)
    sig.name = s["name"]?.stringValue ?? ""
    if case .bool(let b)? = s["hasRecovery"] { sig.hasRecovery = b }
    return sig
  }

  @Test func everyCaseMatchesRN() throws {
    guard case .array(let cases)? = try Self.golden()["cases"] else {
      Issue.record("không có ca")
      return
    }
    #expect(cases.count == 400)
    var onTargetSeen = 0
    for c in cases {
      guard let s = c["signal"], case .number(let hour)? = c["hour"], case .array(let want)? = c["lines"] else {
        Issue.record("ca hỏng")
        continue
      }
      let sig = Self.signal(s)
      let b = AssistantBrief.brief(for: sig, hour: Int(hour))
      #expect(b.greeting.vi == c["greeting"]?["vi"]?.stringValue, "\(s)")
      #expect(b.greeting.en == c["greeting"]?["en"]?.stringValue, "\(s)")
      var keys = want.compactMap { $0["key"]?.stringValue }
      // Lệch có chủ ý: ăn đúng mục tiêu → `kcal-on` (RN: "vượt -0 kcal").
      let onTarget = sig.kcal > 0 && sig.kcal == sig.kcalTarget
      if onTarget, let i = keys.firstIndex(of: "kcal-over") {
        keys[i] = "kcal-on"
        onTargetSeen += 1
      }
      #expect(b.lines.map(\.key) == keys, "\(s)")
      for (g, w) in zip(b.lines, want) where g.key != "kcal-on" {
        #expect(g.text.vi == w["text"]?["vi"]?.stringValue)
        #expect(g.text.en == w["text"]?["en"]?.stringValue)
        #expect(!g.text.es.isEmpty)
      }
    }
    #expect(onTargetSeen > 0)  // golden có ca ăn đúng mục tiêu
  }

  @Test func givenNamesLikeRN() throws {
    guard case .array(let names)? = try Self.golden()["names"] else {
      Issue.record("không có tên")
      return
    }
    #expect(names.count == 8)
    for n in names {
      let full = n["name"]?.stringValue ?? ""
      #expect(AssistantBrief.givenName(full, vi: true) == n["vi"]?.stringValue, "\(full)")
      #expect(AssistantBrief.givenName(full, vi: false) == n["en"]?.stringValue, "\(full)")
    }
  }

  @Test func spanishGroupsFromFiveDigits() {
    #expect(AssistantBrief.group(1234, .es) == "1234")
    #expect(AssistantBrief.group(12500, .es) == "12.500")
    #expect(AssistantBrief.group(1234, .vi) == "1.234")
    #expect(AssistantBrief.group(1234567, .en) == "1,234,567")
  }

  @Test func neverEmpty() {
    let b = AssistantBrief.brief(for: AssistantSuggestions.Signal(kcalTarget: 0, daysSinceWorkout: 0), hour: 9)
    #expect(b.lines.map(\.key) == ["no-data"])
    #expect(b.greeting.vi == "Chào buổi sáng.")
  }
}
