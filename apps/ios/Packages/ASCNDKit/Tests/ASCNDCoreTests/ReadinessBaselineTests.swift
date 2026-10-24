@testable import ASCNDCore
import Foundation
import Testing

/// Điểm sẵn sàng sửa 24/10 (Kiệt: "check điểm readiness đã tính đúng chưa").
struct ReadinessBaselineTests {
  static func input(
    hrv: Double? = nil, rhr: Double? = nil, hrvHistory: [Double] = [], rhrHistory: [Double] = [],
    sleep: Double = 480, load7d: Double = 700, load28d: Double = 2800, soreness: Double? = nil
  ) -> ReadinessInput {
    ReadinessInput(
      hrvToday: hrv, rhrToday: rhr, sleepMinLastNight: sleep, sleepTargetMin: 480, sleepDebt7dMin: 0,
      trainingLoad7d: load7d, trainingLoad28d: load28d, trainingDays28d: 28, sorenessToday: soreness,
      illness: false, painFlagMax: nil, hrvHistory28d: hrvHistory, rhrHistory28d: rhrHistory)
  }

  static let hrvBase: [Double] = [52, 55, 50, 58, 54, 53, 56, 51, 57, 55]
  static let rhrBase: [Double] = [55, 56, 54, 57, 55, 56, 54, 55, 56, 55]

  /// Ngày bình thường (HRV, nhịp tim nghỉ đúng mức nền, ngủ đủ, tải ổn) là XANH,
  /// và đeo đồng hồ không làm điểm thấp hơn hẳn người không đeo.
  @Test func normalDayWithAWatchIsGreen() throws {
    let watch = try #require(ReadinessEngine.compute(
      Self.input(hrv: 54.5, rhr: 55, hrvHistory: Self.hrvBase, rhrHistory: Self.rhrBase)))
    let noWatch = try #require(ReadinessEngine.compute(Self.input()))
    #expect(watch.status == .green)
    #expect(watch.score >= 75)
    #expect(noWatch.score - watch.score <= 12)
  }

  /// HRV tụt mạnh, nhịp tim nghỉ tăng: điểm phải tụt rõ.
  @Test func suppressedHrvAndHighRhrDropTheScore() throws {
    let r = try #require(ReadinessEngine.compute(
      Self.input(hrv: 38, rhr: 63, hrvHistory: Self.hrvBase, rhrHistory: Self.rhrBase)))
    #expect(r.status != .green)
    #expect((r.subscores["hrv"] ?? 100) < 50)
    #expect((r.subscores["rhr"] ?? 100) < 50)
  }

  /// Dưới 7 NGÀY nền thì HRV / nhịp tim nghỉ chưa được chấm.
  @Test func needsSevenDaysOfBaseline() throws {
    let r = try #require(ReadinessEngine.compute(
      Self.input(hrv: 54, rhr: 55, hrvHistory: Array(Self.hrvBase.prefix(6)), rhrHistory: Array(Self.rhrBase.prefix(6)))))
    #expect(r.subscores["hrv"] == nil)
    #expect(r.subscores["rhr"] == nil)
  }

  /// Đau cơ 8/10 chỉ trừ vào điểm tải, không chặn trần 45 như chấn thương.
  @Test func sorenessIsNotAnInjuryCap() throws {
    let r = try #require(ReadinessEngine.compute(Self.input(soreness: 8)))
    #expect(r.score > 45)
    #expect(r.subscores["load"] == 72)
  }

  /// Nền theo ngày: nhiều mẫu một ngày = một ngày (trung bình).
  @Test func historyIsPerDay() {
    let utc = TimeZone(identifier: "UTC")!
    func row(_ t: String, _ v: JSONValue) -> JSONValue { .object(["date_time": .string(t), "hrv_sdnn_ms": v]) }
    let rows = [
      row("2026-10-20T07:00:00Z", .number(40)), row("2026-10-20T15:00:00Z", .number(60)),
      row("2026-10-21T07:00:00Z", .number(50)), row("2026-10-21T08:00:00Z", .null),
    ]
    let days = DailyLog.dailyMeans(rows, "hrv_sdnn_ms", in: utc)
    #expect(days.map(\.day) == ["2026-10-20", "2026-10-21"])
    #expect(days.map(\.mean) == [50, 50])
  }
}
