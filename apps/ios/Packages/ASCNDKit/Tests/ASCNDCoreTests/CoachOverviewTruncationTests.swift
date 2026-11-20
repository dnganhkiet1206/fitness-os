@testable import ASCNDCore
import Testing

/// KOA-T35: khối tổng quan sống sót khi model bị cắt giữa rào, và khối thứ hai không bị bỏ.
struct CoachOverviewTruncationTests {
  let item = #"{"label":"Calo","value":640,"goal":2200,"unit":"kcal","tone":"meal"}"#

  @Test func wellFormedSingleBlockIsUnchanged() {
    let msg = "Mở đầu.\n```ascnd\n{\"items\":[\(item)]}\n```\nCâu trả lời."
    let a = CoachOverview.split(msg)
    let b = CoachOverview.split(msg, complete: true)
    #expect(a.text == b.text && a.overview == b.overview)
    #expect(a.overview?.items.count == 1)
    #expect(a.text.hasPrefix("Mở đầu.") && a.text.hasSuffix("Câu trả lời.") && !a.text.contains("```"))
  }

  @Test func unclosedFenceKeepsTheAnswerOnceComplete() {
    // Model quên đóng rào nhưng vẫn viết câu trả lời sau JSON.
    let msg = "```ascnd\n{\"items\":[\(item)]}\nBạn đã nạp 640 kcal."
    #expect(CoachOverview.split(msg).text.isEmpty, "đang stream: vẫn giấu phần dở")
    let done = CoachOverview.split(msg, complete: true)
    #expect(done.overview?.items.first?.value == 640)
    #expect(done.text == "Bạn đã nạp 640 kcal.")
  }

  @Test func cutMidBlockDoesNotInventData() {
    // Cắt giữa JSON ở trần token: không có đuôi; khối hỏng không vẽ số bịa.
    let msg = "Trước.\n```ascnd\n{\"items\":[{\"label\":\"Calo\",\"val"
    let done = CoachOverview.split(msg, complete: true)
    #expect(done.text == "Trước.")
    #expect(done.overview == nil || done.overview?.items.allSatisfy { $0.label != "Calo" || $0.value == 0 } == true)
  }

  @Test func aSecondBlockIsMergedNotStripped() {
    let other = #"{"label":"Đạm","value":38,"goal":140,"unit":"g","tone":"protein"}"#
    let msg = "```ascnd\n{\"items\":[\(item)]}\n```\nGiữa.\n```ascnd\n{\"items\":[\(other)]}\n```\nCuối."
    let r = CoachOverview.split(msg, complete: true)
    #expect(r.overview?.items.map(\.label) == ["Calo", "Đạm"])
    #expect(r.text.contains("Giữa.") && r.text.contains("Cuối."))
    #expect(!r.text.contains("```"))
  }

  @Test func balancedJSONIgnoresBracesInStrings() {
    let (json, tail) = CoachOverview.balancedJSON(#"{"title":"a } b","items":[]} rồi"#)
    #expect(json == #"{"title":"a } b","items":[]}"#)
    #expect(tail == " rồi")
  }
}
