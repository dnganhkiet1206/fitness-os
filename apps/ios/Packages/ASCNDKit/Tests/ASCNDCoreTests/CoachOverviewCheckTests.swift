@testable import ASCNDCore
import Foundation
import Testing

/// Khối tổng quan của model đối chiếu với số thật (16/10).
struct CoachOverviewCheckTests {
  let s = AssistantSuggestions.Signal(
    readiness: 35, sleepMin: 440, kcal: 100, kcalTarget: 2508, proteinG: 12, proteinTarget: 121, steps: 4870)

  func overview(_ items: String) -> CoachOverview { CoachOverview.parse("{\"items\":[\(items)]}")! }

  @Test func correctNumbersStay() {
    let o = overview(#"{"label":"Calo","value":100,"goal":2508,"unit":"kcal","tone":"meal"},{"label":"Sẵn sàng","value":35,"goal":100,"tone":"readiness"}"#)
    #expect(o.checked(against: s)?.items.count == 2)
  }

  @Test func targetUsedAsValueIsDropped() {
    // Ảnh lỗi 16/10: "Kcal mục tiêu 2508", "Đạm mục tiêu 121 / 121".
    let o = overview(#"{"label":"Kcal mục tiêu","value":2508,"unit":"kcal","tone":"meal"},{"label":"Đạm","value":121,"goal":121,"unit":"g","tone":"protein"}"#)
    #expect(o.checked(against: s) == nil)
  }

  @Test func averageLosesItsDailyGoalBar() {
    // "Đạm 7 ngày 6.9 / 121 g": trung bình không so với mục tiêu một ngày.
    let o = overview(#"{"label":"Đạm 7 ngày","value":6.9,"goal":121,"unit":"g","tone":"protein"}"#)
    let c = o.checked(against: s)
    #expect(c?.items.first?.goal == nil)
    #expect(c?.items.first?.value == 6.9)
  }

  @Test func wrongGoalIsReplacedAndUnknownMetricsStay() {
    let o = overview(#"{"label":"Đạm","value":12,"goal":150,"unit":"g","tone":"protein"},{"label":"Nước","value":3,"goal":8,"tone":"water"}"#)
    let c = o.checked(against: s)!
    #expect(c.items[0].goal == 121)
    #expect(c.items[1].goal == 8)
  }

  @Test func sleepInHoursOrMinutesAndMissingData() {
    #expect(overview(#"{"label":"Ngủ","value":7.3,"unit":"h","tone":"sleep"}"#).checked(against: s) != nil)
    #expect(overview(#"{"label":"Ngủ","value":440,"unit":"min","tone":"sleep"}"#).checked(against: s) != nil)
    #expect(overview(#"{"label":"Ngủ","value":9,"unit":"h","tone":"sleep"}"#).checked(against: s) == nil)
    let noSleep = AssistantSuggestions.Signal()
    #expect(overview(#"{"label":"Ngủ","value":7,"unit":"h","tone":"sleep"}"#).checked(against: noSleep) == nil)
  }

  @Test func sanitizeRewritesOrRemovesTheBlock() {
    let bad = "```ascnd\n{\"items\":[{\"label\":\"Calo\",\"value\":2508,\"tone\":\"meal\"}]}\n```\n**Câu trả lời**"
    #expect(CoachOverview.sanitize(bad, against: s) == "**Câu trả lời**")
    let mixed = "```ascnd\n{\"items\":[{\"label\":\"Calo\",\"value\":100,\"goal\":2000,\"unit\":\"kcal\",\"tone\":\"meal\"},{\"label\":\"Bước\",\"value\":9000,\"tone\":\"steps\"}]}\n```\nChữ"
    let clean = CoachOverview.sanitize(mixed, against: s)
    let back = CoachOverview.split(clean)
    #expect(back.text == "Chữ")
    #expect(back.overview?.items.count == 1)
    #expect(back.overview?.items[0].goal == 2508)
    #expect(CoachOverview.sanitize("Không có khối", against: s) == "Không có khối")
  }

  @Test func jsonRoundTripsWithQuotesAndTrend() {
    let o = CoachOverview.parse(#"{"title":"Tuần \"này\"","items":[{"label":"A","value":1.5,"tone":"other"}],"trend":{"label":"T","unit":"","points":[{"label":"T2","value":1},{"label":"T3","value":2}]}}"#)!
    #expect(CoachOverview.parse(o.json) == o)
  }

  /// Hai khối ```ascnd trong một câu trả lời (18/10): khối đầu được vẽ, khối sau
  /// không bao giờ hiện thành chữ thô — kể cả khi đang stream (chưa đóng).
  @Test func extraAscndBlocksNeverShowAsText() {
    let msg = "```ascnd\n{\"items\":[{\"label\":\"A\",\"value\":1}]}\n```\nĐầu.\nBuổi tập.```ascnd\n{\"items\":[{\"label\":\"B\",\"value\":2}]}\n```\nCuối."
    let (o, text) = CoachOverview.split(msg)
    #expect(o?.items.first?.label == "A")
    #expect(!text.contains("```") && !text.contains("items"))
    #expect(text.contains("Đầu.") && text.contains("Cuối."))
    let streaming = "```ascnd\n{\"items\":[]}\n```\nĐầu.```ascnd\n{\"ite"
    #expect(!CoachOverview.split(streaming).text.contains("```"))
  }
}
