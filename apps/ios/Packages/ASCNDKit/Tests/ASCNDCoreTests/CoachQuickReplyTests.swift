@testable import ASCNDCore
import Foundation
import Testing

/// Câu không cần AI (16/10): nhận đúng, KHÔNG nhận nhầm câu cần suy luận, và
/// hỏi lại không ra cùng một mẫu.
struct CoachQuickReplyTests {
  typealias I = CoachQuickReply.Intent

  @Test func recognisesTheEasyOnes() {
    let cases: [(String, I)] = [
      ("Hi", .greeting), ("xin chào", .greeting), ("Hola", .greeting), ("chao koa", .greeting),
      ("cảm ơn nhé", .thanks), ("Thanks!", .thanks), ("muchas gracias", .thanks),
      ("ok", .ack), ("vâng", .ack), ("vale", .ack),
      ("test", .vague), ("thees", .vague), ("?", .vague), ("asdf", .vague),
      ("Hôm nay tôi ăn bao nhiêu calo?", .calories), ("hom nay an bao nhieu kcal", .calories),
      ("How many calories have I had?", .calories), ("¿Cuántas calorías llevo?", .calories),
      ("Đạm hôm nay được bao nhiêu?", .protein), ("how much protein today", .protein),
      ("Hôm nay đi được mấy bước?", .steps), ("how many steps", .steps), ("¿cuántos pasos llevo?", .steps),
      ("Đêm qua ngủ bao lâu?", .sleep), ("how long did I sleep", .sleep),
      ("Điểm sẵn sàng hôm nay bao nhiêu?", .readiness), ("what's my readiness score", .readiness),
      ("Hôm nay tôi thế nào?", .today), ("how am I doing", .today), ("¿cómo voy?", .today),
    ]
    for (text, want) in cases { #expect(CoachQuickReply.intent(for: text) == want, "\(text)") }
  }

  @Test func reasoningAndOtherDaysGoToAI() {
    let ai = [
      "Vì sao điểm sẵn sàng của tôi thấp?", "Tôi nên ăn bao nhiêu đạm?", "Ăn bao nhiêu calo là đủ để tăng cơ?",
      "Tuần này tôi ngủ bao nhiêu?", "Hôm qua tôi đi bao nhiêu bước?", "Calo và đạm hôm nay bao nhiêu?",
      "May I have protein after a workout?", "How much protein should I eat?", "Is 7 hours of sleep enough?",
      "What's my average sleep this week?", "¿Por qué mi preparación está baja?", "¿Cuánta proteína debo comer?",
      "Gợi ý thực đơn cho hôm nay", "Buổi chiều tôi hay tụt năng lượng, sửa thế nào?", "protein?",
      "Hôm nay nên tập gì?",
    ]
    for text in ai { #expect(CoachQuickReply.intent(for: text) == nil, "\(text)") }
  }

  @Test func repliesUseRealNumbersAndNeverRepeatBackToBack() {
    let s = AssistantSuggestions.Signal(readiness: 35, kcal: 100, kcalTarget: 2508, proteinG: 12, proteinTarget: 121)
    var memory = CoachQuickReply.Memory()
    var seen: [String] = []
    for _ in 0..<12 {
      let a = CoachQuickReply.answer("hôm nay ăn bao nhiêu calo", signal: s, lang: "vi", memory: &memory)!
      #expect(a.contains("100"))
      #expect(a.contains("```ascnd"))
      if let last = seen.last { #expect(a != last) }
      seen.append(a)
    }
    // Đủ số mẫu khác nhau xuất hiện (không kẹt ở hai mẫu).
    #expect(Set(seen).count >= 3)
  }

  @Test func missingDataSaysSoAndNoSignalGoesToAI() {
    var m = CoachQuickReply.Memory()
    let empty = AssistantSuggestions.Signal()
    let sleep = CoachQuickReply.answer("how long did I sleep", signal: empty, lang: "en", memory: &m)!
    #expect(!sleep.contains("```ascnd"))
    #expect(sleep.lowercased().contains("sleep"))
    #expect(CoachQuickReply.answer("how many steps", signal: nil, lang: "en", memory: &m) == nil)
    // Lời chào không cần số liệu.
    #expect(CoachQuickReply.answer("hola", signal: nil, lang: "es", memory: &m) != nil)
  }

  @Test func memoryIsCodable() throws {
    var m = CoachQuickReply.Memory()
    _ = CoachQuickReply.answer("hi", signal: nil, lang: "en", memory: &m)
    let back = try JSONDecoder().decode(CoachQuickReply.Memory.self, from: JSONEncoder().encode(m))
    #expect(back == m)
  }
}
