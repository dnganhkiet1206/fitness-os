@testable import ASCNDCore
import Testing

/// Insight hôm nay kiểu Apple Health (21/10).
struct InsightHighlightTests {
  private func n(_ type: String, _ p: SmartNudges.Priority) -> SmartNudges.Nudge {
    SmartNudges.Nudge(type: type, message: type, priority: p)
  }

  @Test func leadIsHighestPriorityAndKeepsOrder() {
    let r = InsightHighlight.lead([n("protein", .medium), n("calories", .high), n("sleep", .low), n("steps", .high)])
    #expect(r?.lead.type == "calories")
    #expect(r?.rest.map(\.type) == ["protein", "sleep", "steps"])
    #expect(InsightHighlight.lead([]) == nil)
  }

  @Test func topicsCoverServerAndFallbackTypes() {
    #expect(InsightHighlight.topic("nutrition") == .calories)
    #expect(InsightHighlight.topic("calories") == .calories)
    #expect(InsightHighlight.topic("recovery") == .readiness)
    #expect(InsightHighlight.topic("training") == .readiness)
    #expect(InsightHighlight.topic("hydration") == .water)
    #expect(InsightHighlight.topic("Sleep") == .sleep)
    #expect(InsightHighlight.topic("mystery") == nil)
  }

  @Test func weekAveragesOnlyLoggedDays() {
    let rows: [JSONValue] = [
      .object(["kcal": .number(2000), "sleep_duration_min": .number(420)]),
      .object(["kcal": .number(0), "sleep_duration_min": .number(480)]),
      .object(["kcal": .number(3000), "steps": .null]),
    ]
    let w = InsightHighlight.week(rows)
    #expect(w.kcal == .init(value: 2500, days: 2))
    #expect(w.sleepMin == .init(value: 450, days: 2))
    #expect(w.steps == nil)
  }

  @Test func progressClampsAndNeedsTarget() {
    let t = InsightHighlight.Today(kcal: 1308, kcalTarget: 2508, proteinG: 200, proteinTarget: 121, readiness: 42)
    #expect(abs(InsightHighlight.progress(.calories, t) - 1308.0 / 2508) < 0.0001)
    #expect(InsightHighlight.progress(.protein, t) == 1)
    #expect(InsightHighlight.progress(.readiness, t) == 0.42)
    #expect(InsightHighlight.progress(.steps, t) == 0)
    #expect(InsightHighlight.progress(.sleep, t) == 0)
  }

  @Test func onlySleepAndReadinessAreSettled() {
    #expect(InsightHighlight.isSettled(.sleep))
    #expect(InsightHighlight.isSettled(.readiness))
    for t in [InsightHighlight.Topic.calories, .protein, .water, .steps] { #expect(!InsightHighlight.isSettled(t)) }
  }

  @Test func loggingDropsNudgesItResolves() {
    let nudges = [n("hydration", .high), n("protein", .medium), n("sleep", .low)]
    var t = InsightHighlight.Today(proteinG: 40, proteinTarget: 121, waterMl: 600, waterTargetMl: 2500)
    #expect(InsightHighlight.live(nudges, t).map(\.type) == ["hydration", "protein", "sleep"])
    // Ghi đủ nước → câu nước cũ biến mất, câu đạm lên làm câu chính.
    t.waterMl = 2500
    let live = InsightHighlight.live(nudges, t)
    #expect(live.map(\.type) == ["protein", "sleep"])
    #expect(InsightHighlight.lead(live)?.lead.type == "protein")
    // Đạm gần đủ (≥ 95 %) cũng tính là xong; giấc ngủ không tự hết hạn.
    t.proteinG = 116
    #expect(InsightHighlight.live(nudges, t).map(\.type) == ["sleep"])
    // Không có mục tiêu → không coi là xong.
    #expect(!InsightHighlight.resolved(n("steps", .low), InsightHighlight.Today(steps: 99999)))
  }

  @Test func newLogMakesThatTopicStale() {
    let nudges = [n("hydration", .high), n("protein", .medium)]
    let base = InsightHighlight.Today(proteinG: 40, proteinTarget: 121, waterMl: 0, waterTargetMl: 2500)
    var now = base
    #expect(InsightHighlight.live(nudges, now, since: base).count == 2)
    // Uống 237 ml (chưa đủ mục tiêu) — câu "hãy uống nước" vẫn là cũ, ẩn đi.
    now.waterMl = 237
    #expect(InsightHighlight.live(nudges, now, since: base).map(\.type) == ["protein"])
    // Ăn thêm đạm — câu đạm cũng ẩn; không còn gì để hiện.
    now.proteinG = 70
    #expect(InsightHighlight.live(nudges, now, since: base).isEmpty)
    // Không biết số lúc insight về → chỉ bỏ câu đã chạm mục tiêu.
    #expect(InsightHighlight.live(nudges, now).count == 2)
  }
}
