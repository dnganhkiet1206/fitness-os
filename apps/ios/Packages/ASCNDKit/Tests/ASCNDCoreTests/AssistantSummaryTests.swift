@testable import ASCNDCore
import Foundation
import Testing

struct AssistantSummaryTests {
  static func bars(_ values: [Double?], todayValue: Double? = nil) -> [MetricAnalysis.Bar] {
    let base = LocalDate("2026-10-08")!
    let w = MetricAnalysis.Text3(vi: "T", en: "T", es: "T")
    var out = values.enumerated().map { i, v in
      MetricAnalysis.Bar(date: base.adding(days: i), value: v ?? 0, missing: v == nil, weekday: w, today: false)
    }
    out.append(
      MetricAnalysis.Bar(
        date: base.adding(days: values.count), value: todayValue ?? 0, missing: todayValue == nil, weekday: w,
        today: true))
    return out
  }

  @Test func score10RoundsAndClamps() {
    #expect(AssistantSummary.score10(nil) == nil)
    #expect(AssistantSummary.score10(55) == 6)
    #expect(AssistantSummary.score10(54) == 5)
    #expect(AssistantSummary.score10(100) == 10)
    #expect(AssistantSummary.score10(0) == 0)
  }

  @Test func readinessLabelPrefersStatus() {
    #expect(AssistantSummary.readiness(status: "green", score: 40) == .go)
    #expect(AssistantSummary.readiness(status: "yellow", score: 90) == .pace)
    #expect(AssistantSummary.readiness(status: "red", score: 90) == .recover)
    #expect(AssistantSummary.readiness(status: nil, score: 70) == .go)
    #expect(AssistantSummary.readiness(status: nil, score: 50) == .pace)
    #expect(AssistantSummary.readiness(status: nil, score: 20) == .recover)
    #expect(AssistantSummary.readiness(status: "green", score: nil) == nil)
  }

  @Test func versusNeedsThreePastDaysAndUsesBand() {
    #expect(AssistantSummary.versus(today: 60, bars: Self.bars([50, nil, 50])) == nil)
    let b = Self.bars([50, 50, 50, nil])
    #expect(AssistantSummary.versus(today: 60, bars: b) == .above)
    #expect(AssistantSummary.versus(today: 55, bars: b) == .typical)
    #expect(AssistantSummary.versus(today: 41, bars: b) == .below)
    #expect(AssistantSummary.versus(today: nil, bars: b) == nil)
  }
}
