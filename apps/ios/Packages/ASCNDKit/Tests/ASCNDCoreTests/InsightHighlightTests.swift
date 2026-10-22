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
}
