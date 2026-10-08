@testable import ASCNDCore
import Foundation
import Testing

/// Thước chiều cao / cân nặng của onboarding (#527 1.3) so với CHÍNH
/// `units.ts` + `BOUNDS` @ fac9ac2 (`Fixtures/ruler-golden.json`).
struct OnboardingRulerGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "ruler-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func quantity(_ s: String?) -> OnboardingRuler.Quantity { s == "height" ? .height : .weight }

  @Test func scaleSeedAndCommitMatchRN() throws {
    guard case .array(let cases)? = try Self.golden()["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 54)
    for c in cases {
      let q = Self.quantity(c["q"]?.stringValue), unit = c["unit"]?.stringValue ?? "", text = c["text"]?.stringValue ?? ""
      let scale = OnboardingRuler.scale(q, unit: unit)
      let label = "\(q) \(unit) '\(text)'"
      #expect(Double(scale.min10) == c["min10"]?.doubleValue, "\(label): min10")
      #expect(Double(scale.count) == c["count"]?.doubleValue, "\(label): count")
      #expect(Double(scale.seed(text)) == c["seed"]?.doubleValue, "\(label): seed")
      guard case .array(let commits)? = c["commits"] else { continue }
      for k in commits {
        let i = Int(k["index"]?.doubleValue ?? -1)
        #expect(scale.value(at: i) == k["value"]?.doubleValue, "\(label) #\(i): value")
        #expect(scale.text(at: i) == k["text"]?.stringValue, "\(label) #\(i): text")
        #expect(OnboardingRuler.fixed1(scale.value(at: i)) == k["valueFixed"]?.stringValue, "\(label) #\(i): toFixed")
        if let f = k["formatted"]?.stringValue {
          let got = OnboardingRuler.formatHeight(Units.heightToCm(scale.value(at: i), unit: unit), unit: unit)
          #expect(got == f, "\(label) #\(i): formatHeight")
        }
      }
    }
  }

  /// Mọi vạch của bốn thang: câu ghi, rồi vạch đọc lại từ câu ghi ấy — kể cả
  /// chỗ không khép vòng của lbs.
  @Test func everyTickCommitsAndReseedsLikeRN() throws {
    guard case .array(let sweeps)? = try Self.golden()["sweeps"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(sweeps.count == 4)
    for s in sweeps {
      let q = Self.quantity(s["q"]?.stringValue), unit = s["unit"]?.stringValue ?? ""
      guard case .array(let texts)? = s["texts"], case .array(let seeds)? = s["seeds"] else { continue }
      let scale = OnboardingRuler.scale(q, unit: unit)
      #expect(scale.count == texts.count)
      var bad = 0
      for i in 0..<min(scale.count, texts.count) {
        let t = scale.text(at: i)
        if t != texts[i].stringValue || Double(scale.seed(t)) != seeds[i].doubleValue { bad += 1 }
      }
      #expect(bad == 0, "\(q) \(unit): \(bad) vạch lệch RN")
    }
  }

  @Test func waterAndFeetMatchRN() throws {
    let g = try Self.golden()
    guard case .array(let water)? = g["water"], case .array(let feet)? = g["feet"] else { throw CocoaError(.fileReadCorruptFile) }
    for w in water {
      let ml = Int(w["ml"]?.doubleValue ?? 0)
      #expect(OnboardingRuler.displayVolume(ml, unit: .ml) == w["ml_display"]?.doubleValue)
      #expect(OnboardingRuler.fixed1(OnboardingRuler.displayVolume(ml, unit: .oz)) == w["oz_fixed"]?.stringValue)
    }
    for f in feet {
      let cm = f["cm"]?.doubleValue ?? 0
      #expect(OnboardingRuler.formatHeight(cm, unit: "in") == f["in"]?.stringValue, "\(cm) cm → in")
      #expect(OnboardingRuler.formatHeight(cm, unit: "cm") == f["cm_label"]?.stringValue, "\(cm) cm → cm")
    }
  }
}
