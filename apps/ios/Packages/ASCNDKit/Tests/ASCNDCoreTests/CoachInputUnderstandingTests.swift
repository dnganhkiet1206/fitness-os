@testable import ASCNDCore
import Testing

/// KOA-T34 (audit Koa 17/11): hiểu lời nhắn trong chat — cảm ơn kèm câu hỏi, câu hỏi về con số,
/// chống lộ chỉ dẫn hẹp hơn, chọn số bằng lời, pound và giấc ngủ chỉ có phút.
struct CoachInputUnderstandingTests {
  typealias D = CoachLogPrompt.Detected

  @Test func thanksWithAQuestionGoesToTheCoach() {
    #expect(CoachQuickReply.intent(for: "cảm ơn nhé") == .thanks)
    #expect(CoachQuickReply.intent(for: "Thanks!") == .thanks)
    #expect(CoachQuickReply.intent(for: "cảm ơn, mai tập gì?") != .thanks)
    #expect(CoachQuickReply.intent(for: "thanks, why though") != .thanks)
    #expect(CoachQuickReply.intent(for: "gracias ¿y cuánta proteína?") != .thanks)
  }

  @Test func spanishCuantaIsALookupCue() {
    #expect(CoachQuickReply.intent(for: "¿cuánta proteína?") == .protein)
  }

  @Test func questionsAboutTheNumberAreNotReports() {
    #expect(CoachLogPrompt.detect("Did I sleep 7 hours?", hour: 9).isEmpty)
    #expect(CoachLogPrompt.detect("ngủ 7 tiếng có đủ không?", hour: 9).isEmpty)
    #expect(CoachLogPrompt.detect("is 2 liters of water enough", hour: 9).isEmpty)
    #expect(CoachLogPrompt.detect("Am I 70 kg?", hour: 9).isEmpty)
    // Lời kể + câu hỏi riêng vế sau: vẫn là lời kể.
    #expect(CoachLogPrompt.detect("Tôi ngủ 7 tiếng, vậy có đủ không?", hour: 9) == [D(kind: .sleep, value: 420)])
    #expect(CoachLogPrompt.detect("I slept 6.5 hours. What do I train today?", hour: 9).first?.value == 390)
    // Số thập phân kiểu Việt không bị tách vế.
    #expect(CoachLogPrompt.detect("ngủ 7,5 giờ", hour: 9).first?.value == 450)
    // "không" là phủ định trong lời kể.
    #expect(CoachLogPrompt.detect("ngủ 6 tiếng không ngon", hour: 9).first?.value == 360)
  }

  @Test func poundsAndMinutesOnlySleep() {
    let lb = CoachLogPrompt.detect("I weigh 150 lb", hour: 9).first
    #expect(lb?.kind == .weight)
    #expect(abs((lb?.value ?? 0) - 68.04) < 0.01)
    #expect(CoachLogPrompt.detect("peso 160 libras", hour: 9).first?.kind == .weight)
    #expect(CoachLogPrompt.detect("I slept 450 minutes", hour: 9) == [D(kind: .sleep, value: 450)])
    #expect(CoachLogPrompt.detect("ngủ 30 phút", hour: 9).isEmpty, "giấc trưa ngắn không phải giấc đêm")
    #expect(CoachLogPrompt.display(.weight, 68.04, lang: "en", weight: .lbs) == "150 lb")
    #expect(CoachLogPrompt.display(.weight, 68.04, lang: "en") == "68 kg")
    let w = CoachLogPrompt.Conflict(kind: .weight, logged: 68.04, stated: 70.31)
    #expect(CoachLogPrompt.question(w, lang: "en", weight: .lbs).contains("155 lb"))
    #expect(CoachLogPrompt.choice("155", for: w, weight: .lbs) == .stated)
  }

  @Test func numberlessChoices() {
    let c = CoachLogPrompt.Conflict(kind: .sleep, logged: 540, stated: 480)
    #expect(CoachLogPrompt.choice("số mới", for: c) == .stated)
    #expect(CoachLogPrompt.choice("what I said", for: c) == .stated)
    #expect(CoachLogPrompt.choice("cái app ghi đúng rồi", for: c) == .logged)
    #expect(CoachLogPrompt.choice("keep it", for: c) == .logged)
    #expect(CoachLogPrompt.choice("lo que dije", for: c) == .stated)
    #expect(CoachLogPrompt.choice("ừ", for: c) == .unclear)
  }

  @Test func leakGuardIsNarrowAndKeepsTheRest() {
    #expect(!CoachLogPrompt.leaksInstructions("Điều quan trọng là ngủ đủ giấc và ăn đủ đạm."))
    #expect(!CoachLogPrompt.leaksInstructions("It's important to follow the instructions on the label."))
    let mixed = "The user just said 8 hours. You logged 9 hours last night, which one is right? Either way, aim for a regular bedtime."
    #expect(CoachLogPrompt.leaksInstructions(mixed))
    let kept = CoachLogPrompt.strippingLeaks(mixed)
    #expect(kept?.hasPrefix("You logged 9 hours") == true)
    #expect(kept?.contains("user just said") == false)
    #expect(CoachLogPrompt.strippingLeaks("The user just said 8 hours.") == nil)
    #expect(CoachLogPrompt.strippingLeaks("Ngủ đủ giấc nhé.") == "Ngủ đủ giấc nhé.")
  }
}
