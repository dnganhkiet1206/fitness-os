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

  @Test func shownPrefersTodayThenLatest() {
    let d1 = LocalDate("2026-10-13")!, d2 = LocalDate("2026-10-14")!
    let today = AssistantSummary.shown(today: 80, status: "yellow", recent: [(d1, 40)])
    #expect(today == .init(score: 80, level: .pace, asOf: nil))
    let latest = AssistantSummary.shown(today: nil, status: nil, recent: [(d1, 40), (d2, 66)])
    #expect(latest == .init(score: 66, level: .pace, asOf: d2))
    #expect(AssistantSummary.shown(today: nil, status: nil, recent: [])?.score == nil)
    #expect(AssistantSummary.shown(today: nil, status: "green", recent: [(d2, 76)])?.level == .go)
  }

  @Test func readinessLabelPrefersStatus() {
    #expect(AssistantSummary.readiness(status: "green", score: 40) == .go)
    #expect(AssistantSummary.readiness(status: "yellow", score: 90) == .pace)
    #expect(AssistantSummary.readiness(status: "red", score: 90) == .recover)
    #expect(AssistantSummary.readiness(status: nil, score: 80) == .go)
    #expect(AssistantSummary.readiness(status: nil, score: 74) == .pace)
    #expect(AssistantSummary.readiness(status: nil, score: 49) == .recover)
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

  @Test func latestSkipsTodayAndMissing() {
    let b = Self.bars([50, 74, nil], todayValue: nil)
    #expect(AssistantSummary.latest(b)?.value == 74)
    #expect(AssistantSummary.latest(Self.bars([nil, nil])) == nil)
  }

  @Test func orderPutsNoteworthyFirstAndEmptyLast() {
    #expect(
      AssistantSummary.order(sleepMin: 0, heartRate: nil, kcal: 0, hasTrend: true)
        == [.trend, .sleep, .heart, .nutrition])
    #expect(
      AssistantSummary.order(sleepMin: 300, heartRate: 90, kcal: 1200, hasTrend: true)
        == [.sleep, .heart, .trend, .nutrition])
    #expect(
      AssistantSummary.order(sleepMin: 480, heartRate: nil, kcal: 800, hasTrend: false)
        == [.sleep, .nutrition, .trend, .heart])
  }

  @Test func forYouRaisesToolsWithReasons() {
    let all = AssistantSummary.Tool.allCases
    // Thứ Năm 15, 13h, chưa ngủ, sẵn sàng vừa
    let thu = AssistantSummary.Context(weekday: 5, dayOfMonth: 15, hour: 13, sleepMin: 0, steps: 0, readiness: .pace)
    let a = AssistantSummary.forYou(all, context: thu)
    #expect(a.prefix(2).map(\.tool) == [.sleep, .biometrics])
    #expect(a.first?.reason == .noSleep)
    #expect(a.last?.tool == .memory)
    #expect(a.first(where: { $0.tool == .steps })?.reason == nil, "13h: chưa nhắc bước")
    // Chủ nhật 1, 18h, ngủ đủ, ít bước, sẵn sàng tốt
    let sun = AssistantSummary.Context(weekday: 1, dayOfMonth: 1, hour: 18, sleepMin: 480, steps: 1200, readiness: .go)
    let b = AssistantSummary.forYou(all, context: sun)
    #expect(b.prefix(3).map(\.tool) == [.steps, .weekly, .goals])
    #expect(b.first(where: { $0.tool == .sleep })?.reason == nil)
    #expect(b.count == all.count)
  }

  @Test func unitsDisplayFollowsLocale() {
    #expect(Units.display(3.3, locale: Locale(identifier: "vi_VN")) == "3,3")
    #expect(Units.display(3.3, locale: Locale(identifier: "en_US")) == "3.3")
    #expect(Units.display(2508, locale: Locale(identifier: "vi_VN")) == "2508")
    #expect(Units.text(3.3) == "3.3", "ô nhập giữ dạng JS")
  }

  @Test func fixed1DisplayFollowsLocale() {
    #expect(OnboardingRuler.fixed1(121.7, locale: Locale(identifier: "vi_VN")) == "121,7")
    #expect(OnboardingRuler.fixed1(121.7, locale: Locale(identifier: "en_US")) == "121.7")
  }

  /// Điểm chỉ dựa vào tải tập (không HRV / RHR / giấc ngủ) không hiện như lời
  /// khuyên; chưa có điểm thì không phải "tạm".
  @Test func loadOnlyScoreIsProvisional() {
    #expect(AssistantSummary.provisional(score: 80, hasRecovery: false))
    #expect(!AssistantSummary.provisional(score: 80, hasRecovery: true))
    #expect(!AssistantSummary.provisional(score: nil, hasRecovery: false))
  }
}
