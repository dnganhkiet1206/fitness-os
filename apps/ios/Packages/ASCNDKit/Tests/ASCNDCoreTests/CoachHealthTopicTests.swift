@testable import ASCNDCore
import Testing

/// Lời nhắc y tế chỉ cho câu hỏi về sức khoẻ (16/10).
struct CoachHealthTopicTests {
  @Test func healthQuestions() {
    for t in [
      "Tôi bị đau gối khi squat", "toi bi dau dau", "Tối qua tôi ngủ 7 tiếng", "Nhịp tim nghỉ của tôi cao",
      "Có nên uống creatine không?", "Làm sao giảm cân nhanh?", "My knee hurts", "I feel dizzy after training",
      "How do I sleep better?", "Me duele la espalda", "¿Cómo dormir mejor?", "Tôi bị sốt có nên tập không",
    ] { #expect(Coach.isHealthTopic(t), "\(t)") }
  }

  @Test func notHealth() {
    for t in [
      "Hi", "cảm ơn", "Hôm nay ăn bao nhiêu calo", "Gợi ý thực đơn cho hôm nay", "Hôm nay nên tập gì?",
      "Bài tập ngực cho người mới", "What should I eat for lunch?", "¿Qué entreno hoy?", "Tập lưng xô thế nào",
    ] { #expect(!Coach.isHealthTopic(t), "\(t)") }
  }
}
