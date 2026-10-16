@testable import ASCNDCore
import Foundation
import Testing

/// Khối tổng quan của Koa Coach (16/10): tách khỏi chữ, không bao giờ lộ JSON.
struct CoachOverviewTests {
  @Test func splitsBlockAndKeepsTheText() {
    let msg = """
      ```ascnd
      {"items":[{"label":"Sẵn sàng","value":35,"goal":100,"tone":"readiness"},
                {"label":"Đạm","value":12,"goal":121,"unit":"g","tone":"protein"}]}
      ```
      **Hôm nay nên tập nhẹ.**
      - Đi bộ 20 phút
      """
    let (o, text) = CoachOverview.split(msg)
    #expect(o?.items.count == 2)
    #expect(o?.items[0].tone == .readiness)
    #expect(o?.items[1].unit == "g")
    #expect(o?.items[1].progress == 12.0 / 121.0)
    #expect(text == "**Hôm nay nên tập nhẹ.**\n- Đi bộ 20 phút")
  }

  @Test func noBlockIsPlainText() {
    let (o, text) = CoachOverview.split("Chào bạn")
    #expect(o == nil)
    #expect(text == "Chào bạn")
  }

  @Test func streamingHalfBlockShowsNothingRaw() {
    let (o, text) = CoachOverview.split("```ascnd\n{\"items\":[{\"label\":\"Ng")
    #expect(o == nil)
    #expect(text.isEmpty)
  }

  @Test func brokenJsonDropsTheBlockButNotTheAnswer() {
    let (o, text) = CoachOverview.split("```ascnd\n{oops}\n```\nCâu trả lời")
    #expect(o == nil)
    #expect(text == "Câu trả lời")
  }

  @Test func badItemsAreSkippedAndCapped() {
    let json = """
      {"items":[{"label":"","value":1},{"label":"A","value":-3},{"label":"B","value":true},
      {"label":"C","value":"7.5"},{"label":"D","value":1},{"label":"E","value":2},
      {"label":"F","value":3},{"label":"G","value":4,"goal":0,"tone":"nope"}]}
      """
    let o = CoachOverview.parse(json)
    #expect(o?.items.map(\.label) == ["C", "D", "E", "F"])
    #expect(o?.items[0].value == 7.5)
    #expect(CoachOverview.parse(#"{"items":[{"label":"G","value":4,"goal":0,"tone":"nope"}]}"#)?.items[0].goal == nil)
    #expect(CoachOverview.parse(#"{"items":[{"label":"G","value":4,"tone":"nope"}]}"#)?.items[0].tone == .other)
  }

  @Test func valueTextAndProgressClamp() {
    let item = CoachOverview.Item(label: "x", value: 2508.4, goal: 2000, unit: "", tone: .meal)
    #expect(item.valueText == "2508")
    #expect(item.progress == 1)
    #expect(CoachOverview.Item(label: "x", value: 7.26, goal: nil, unit: "", tone: .sleep).valueText == "7.3")
    #expect(CoachOverview.Item(label: "x", value: 8, goal: nil, unit: "", tone: .sleep).progress == nil)
  }

  @Test func trendNeedsTwoPointsAndKeepsTheLatest() {
    let json = """
      {"title":"Tuần này","trend":{"label":"Sẵn sàng","unit":"","points":[
      {"label":"T2","value":40},{"label":"T3","value":55},{"label":"","value":3},{"label":"T4","value":-1}]}}
      """
    let o = CoachOverview.parse(json)
    #expect(o?.title == "Tuần này")
    #expect(o?.items.isEmpty == true)
    #expect(o?.trend?.points.map(\.label) == ["T2", "T3"])
    #expect(CoachOverview.parse(#"{"trend":{"points":[{"label":"T2","value":4}]}}"#) == nil)
    let many = (1...20).map { #"{"label":"d\#($0)","value":\#($0)}"# }.joined(separator: ",")
    #expect(CoachOverview.parse(#"{"trend":{"points":["# + many + "]}}")?.trend?.points.first?.label == "d7")
  }

  @Test func jsonFenceCountsOnlyWhenItLooksLikeAnOverview() {
    let ok = CoachOverview.split("```json\n{\"items\":[{\"label\":\"A\",\"value\":1}]}\n```\nChữ")
    #expect(ok.overview?.items.count == 1)
    #expect(ok.text == "Chữ")
    let code = "```json\n{\"name\":\"x\"}\n```"
    #expect(CoachOverview.split(code).overview == nil)
    #expect(CoachOverview.split(code).text == code)
  }
}
