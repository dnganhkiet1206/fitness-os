@testable import ASCNDCore
import Testing

/// Nhịp hiện chữ (16/10): đều, trọn từ, đuổi kịp khi tụt xa.
struct CoachRevealTests {
  @Test func advancesByWholeWords() {
    let text = "Hôm nay bạn nên tập nhẹ"
    let n = CoachReveal.step(shown: 0, total: text)
    #expect(CoachReveal.prefix(text, n) == "Hôm")
    let m = CoachReveal.step(shown: n, total: text)
    #expect(CoachReveal.prefix(text, m) == "Hôm nay")
  }

  @Test func catchesUpWhenFarBehind() {
    let long = String(repeating: "ab ", count: 400)
    #expect(CoachReveal.step(shown: 0, total: long) >= 12)
    #expect(CoachReveal.step(shown: 0, total: "ab cd") <= 5)
  }

  @Test func stopsAtTheEnd() {
    #expect(CoachReveal.step(shown: 5, total: "abcde") == 5)
    #expect(CoachReveal.step(shown: 9, total: "abcde") == 5)
    #expect(CoachReveal.step(shown: 3, total: "abcde") == 5)
  }

  @Test func halfBoldIsClosedWhileRevealing() {
    let text = "**Ăn đủ đạm** mỗi bữa"
    #expect(CoachReveal.prefix(text, 6) == "**Ăn đ**")
    #expect(CoachReveal.prefix(text, 2) == "")
    #expect(CoachReveal.prefix(text, 13) == "**Ăn đủ đạm**")
    #expect(CoachReveal.prefix(text, text.count) == text)
  }
}
