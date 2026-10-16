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

  @Test func gaugeSplitAndStepsParseAndRoundTrip() {
    let json = """
      {"gauge":{"label":"ACWR","value":3.43,"min":0,"max":4,"unit":"","zones":[{"from":0.8,"to":1.3,"label":"An toàn"},{"from":1.5,"to":9,"label":"Rủi ro"},{"from":2,"to":1,"label":"x"}]},
       "split":{"label":"Macro","unit":"g","parts":[{"label":"Đạm","value":120},{"label":"Carb","value":250},{"label":"Béo","value":0}]},
       "steps":[{"title":"Giảm 20% khối lượng","detail":"Tuần này"},{"title":""},{"title":"Ngủ đủ 8 giờ"}]}
      """
    let o = CoachOverview.parse(json)!
    #expect(o.gauge?.value == 3.43)
    #expect(o.gauge?.zones.count == 2)
    #expect(o.gauge?.zones[1].to == 4)
    #expect(o.split?.parts.map(\.label) == ["Đạm", "Carb"])
    #expect(o.steps.map(\.title) == ["Giảm 20% khối lượng", "Ngủ đủ 8 giờ"])
    #expect(CoachOverview.parse(o.json) == o)
    // Một phần không thành biểu đồ chia; gauge min ≥ max bị bỏ.
    #expect(CoachOverview.parse(#"{"split":{"parts":[{"label":"A","value":1}]}}"#) == nil)
    #expect(CoachOverview.parse(#"{"gauge":{"value":1,"min":2,"max":1}}"#) == nil)
  }

  @Test func gaugeZonesGetMeaningAndGapsAreFilled() {
    let o = CoachOverview.parse("""
      {"gauge":{"label":"ACWR","value":3.43,"min":0,"max":4,"note":"Tải 7 ngày so với 4 tuần",
       "zones":[{"from":0.8,"to":1.3,"label":"An toàn"},{"from":1.5,"to":4,"label":"Rủi ro cao"}]}}
      """)!
    let g = o.gauge!
    #expect(g.note == "Tải 7 ngày so với 4 tuần")
    #expect(g.zones.map(\.tone) == [.good, .risk])
    let seg = g.segments
    #expect(seg.map(\.from) == [0, 0.8, 1.3, 1.5])
    #expect(seg.map(\.tone) == [.neutral, .good, .caution, .risk])
    #expect(seg.map(\.gap) == [true, false, true, false])
    #expect(g.current?.label == "Rủi ro cao")
    // Tone model đưa thắng đoán theo tên; vòng qua json giữ tone + note.
    #expect(CoachOverview.Gauge.tone("caution", label: "Safe") == .caution)
    #expect(CoachOverview.Gauge.tone(nil, label: "Zona segura") == .good)
    #expect(CoachOverview.parse(o.json) == o)
  }
}
