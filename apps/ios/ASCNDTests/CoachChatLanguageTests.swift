import Testing

@testable import ASCND

/// KOA-T36: câu trả lời và lời nhắc y tế cùng một tiếng — tiếng người dùng đang chat khi nhận ra
/// chắc, không thì tiếng app. Không đổi tiếng vì tin ngắn / tiếng Việt không dấu.
@Suite struct CoachChatLanguageTests {
  @Test func confidentSentencesSwitchLanguage() {
    #expect(CoachChatView.chatLanguage(["how much protein should I eat"], fallback: "vi") == "en")
    #expect(CoachChatView.chatLanguage(["cuánta proteína necesito hoy"], fallback: "vi") == "es")
    #expect(CoachChatView.chatLanguage(["tôi ngủ 7 tiếng thôi"], fallback: "en") == "vi")
  }

  @Test func shortOrAmbiguousKeepsTheAppLanguage() {
    #expect(CoachChatView.chatLanguage(["ok"], fallback: "vi") == "vi")
    #expect(CoachChatView.chatLanguage(["thanks"], fallback: "vi") == "vi")
    #expect(CoachChatView.chatLanguage(["tap nguc 45 phut"], fallback: "vi") == "vi")
    // Tin ngắn sau một câu rõ: theo câu rõ.
    #expect(CoachChatView.chatLanguage(["how much protein should I eat", "ok"], fallback: "vi") == "en")
  }
}
