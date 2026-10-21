@testable import ASCNDCore
import Testing

/// Tín hiệu phục hồi của Daily Plan (#527 GĐ1, điều kiện 02): chỉ từ số đo thật,
/// đủ nền mới so; không đo được thì không có tín hiệu.
struct DailyPlanRecoveryTests {
  static func input(
    sleep: Double = 480, target: Double = 480, hrv: Double? = 50, hrvHistory: [Double] = Array(repeating: 60, count: 10),
    rhr: Double? = 55, rhrHistory: [Double] = Array(repeating: 55, count: 10)
  ) -> ReadinessInput {
    ReadinessInput(
      hrvToday: hrv, rhrToday: rhr, sleepMinLastNight: sleep, sleepTargetMin: target, sleepDebt7dMin: 0,
      trainingLoad7d: 0, trainingLoad28d: 0, trainingDays28d: nil, sorenessToday: nil, illness: false,
      painFlagMax: nil, hrvHistory28d: hrvHistory, rhrHistory28d: rhrHistory)
  }

  @Test func shortSleepLowHRVAndHighRestingHRCarryRealNumbers() {
    let s = DailyPlan.Recovery.signals(Self.input(sleep: 310, hrv: 49, rhr: 62))
    #expect(s == [.shortSleep(minutes: 310, target: 480), .lowHRV(percentBelow: 18), .highRestingHR(bpmAbove: 7)])
  }

  @Test func withinNormalRangeGivesNoSignal() {
    #expect(DailyPlan.Recovery.signals(Self.input(sleep: 400, hrv: 52, rhr: 59)).isEmpty, "83% giấc, HRV −13%, +4 nhịp")
  }

  @Test func missingOrThinDataGivesNoSignal() {
    #expect(DailyPlan.Recovery.signals(Self.input(sleep: 0, hrv: nil, rhr: nil)).isEmpty, "chưa ghi ngủ / không có số đo")
    let thin = Self.input(hrv: 30, hrvHistory: [60, 60, 60], rhr: 80, rhrHistory: [55])
    #expect(DailyPlan.Recovery.signals(thin).isEmpty, "nền dưới 7 mẫu thì không so")
  }

  @Test func levelAndConfidenceComeFromTheScore() {
    let r = ReadinessResult(
      score: 30, status: .red, explainToken: "", recommendationKey: "", subscores: [:], acwr: nil, confidence: .low)
    let day = LocalDate("2026-10-21")!
    let rec = DailyPlan.Recovery.from(input: Self.input(sleep: 310, hrv: 49), result: r, date: day)
    #expect(rec.level == .low && !rec.confident && rec.signals.count == 2)
    #expect(!rec.suggestsLighter(today: day), "độ tin thấp → không gợi ý")
  }
}
