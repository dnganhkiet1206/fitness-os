@testable import ASCNDCore
import Testing

/// Insight dự phòng từ số thật khi AI lỗi (16/10).
struct SmartNudgesFallbackTests {
  @Test func lowDayGetsThreeRealNudges() {
    let s = AssistantSuggestions.Signal(
      readiness: 35, sleepMin: 0, kcal: 100, kcalTarget: 2508, proteinG: 12, proteinTarget: 121, steps: 2000, hasRecovery: true)
    let n = SmartNudges.fallback(s, lang: "vi", hour: 16)
    #expect(n.count == 3)
    #expect(n[0].type == "readiness" && n[0].message.contains("35/100"))
    #expect(n[1].type == "protein" && n[1].message.contains("12/121"))
    #expect(n[2].type == "calories")
  }

  @Test func goodDaySaysLittleAndMorningSkipsCalories() {
    let s = AssistantSuggestions.Signal(
      readiness: 80, sleepMin: 480, kcal: 300, kcalTarget: 2500, proteinG: 110, proteinTarget: 120, steps: 9000)
    #expect(SmartNudges.fallback(s, lang: "en", hour: 9).isEmpty)
  }

  @Test func allThreeLanguages() {
    let s = AssistantSuggestions.Signal(readiness: 30, sleepMin: 300, proteinG: 0, proteinTarget: 100, hasRecovery: true)
    for lang in ["vi", "en", "es"] {
      let n = SmartNudges.fallback(s, lang: lang, hour: 10)
      #expect(n.count == 3, "\(lang)")
      #expect(!n.contains { $0.message.isEmpty })
    }
    #expect(SmartNudges.fallback(s, lang: "es", hour: 10)[0].message.hasPrefix("Preparación"))
  }

  /// 19/10: điểm chỉ dựa vào tải tập không được nói ra — không nhắc "sẵn sàng 35/100".
  @Test func provisionalScoreIsNotANudge() {
    let s = AssistantSuggestions.Signal(readiness: 35, sleepMin: 0, proteinG: 0, proteinTarget: 100, hasRecovery: false)
    #expect(!SmartNudges.fallback(s, lang: "vi", hour: 10).contains { $0.type == "readiness" })
  }
}
