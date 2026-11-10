@testable import ASCNDCore
import Foundation
import Testing

/// Gợi ý calo chỉ khi ăn thật (Kiệt 09/11, mock bản 2).
struct CalorieAdviceTests {
  final class Defaults: KeyValueStore, @unchecked Sendable {
    var map: [String: String] = [:]
    func string(forKey key: String) -> String? { map[key] }
    func set(_ value: String, forKey key: String) { map[key] = value }
    func remove(_ key: String) { map[key] = nil }
  }

  static let today = LocalDate("2026-11-09")!

  /// 28 ngày cân, giảm `kgPerWeek` mỗi tuần (tăng cơ mà sụt cân = lệch dải).
  static func weights(kgPerWeek: Double = -0.6) -> [JSONValue] {
    (0..<28).map { i in
      let d = today.adding(days: -27 + i)
      return .object(["date": .string(d.description), "weight_kg": .number(70 + kgPerWeek / 7 * Double(i))])
    }
  }

  /// `days` ngày gần nhất có ghi bữa, mỗi ngày `kcal`.
  static func daily(kcal: Double, days: Int = 14) -> [JSONValue] {
    (0..<days).map { i in
      .object(["date": .string(today.adding(days: -i).description), "kcal": .number(kcal), "protein_g": .number(140)])
    }
  }

  static let profile: JSONValue = .object([
    "goal": .string("bulk"), "sex": .string("male"), "tdee_target_kcal": .number(2200),
    "macro_protein_g": .number(150), "units_weight": .string("kg"),
  ])

  static func advice(kcal: Double, days: Int = 14, applied: LocalDate? = nil) throws -> CalorieAdvice {
    let d = daily(kcal: kcal, days: days)
    let a = try #require(SmartGoals.analyse(weights: weights(), daily: d, profile: profile, today: today))
    return CalorieAdvice.advise(a, daily: d, today: today, applied: applied)
  }

  @Test func eatingAtTargetGetsAChange() throws {
    let a = try Self.advice(kcal: 2250)
    guard case .change(let from, let to, let avg, let days) = a else {
      Issue.record("muốn .change, có \(a)")
      return
    }
    #expect(from == 2200)
    #expect(to > from, "tăng cơ mà sụt cân → ăn thêm")
    #expect(avg == 2250)
    #expect(days == 14)
    #expect(a.canApply)
  }

  @Test func eatingFarBelowTargetMustEatFirst() throws {
    let a = try Self.advice(kcal: 1800)
    #expect(a == .eatToTarget(avgKcal: 1800, target: 2200, loggedDays: 14))
    #expect(!a.canApply, "không ăn tới mục tiêu cũ thì đổi số vô nghĩa")
  }

  @Test func eatingFarAboveTargetMustEatFirstToo() throws {
    #expect(try Self.advice(kcal: 2600) == .eatToTarget(avgKcal: 2600, target: 2200, loggedDays: 14))
  }

  @Test func fewLoggedDaysNeverGuessFromWeightAlone() throws {
    // Luật cũ (RN) gợi ý ±250 chỉ từ cân khi không đo được — bỏ.
    let a = try Self.advice(kcal: 2200, days: 5)
    #expect(a == .needIntake(loggedDays: 5))
    #expect(!a.canApply)
  }

  @Test func onTrackSaysNothing() throws {
    let d = Self.daily(kcal: 2200)
    let a = try #require(
      SmartGoals.analyse(weights: Self.weights(kgPerWeek: 0.35), daily: d, profile: Self.profile, today: Self.today))
    #expect(CalorieAdvice.advise(a, daily: d, today: Self.today, applied: nil) == .none)
  }

  @Test func justAppliedIsATrialForTwoWeeks() throws {
    let since = Self.today.adding(days: -3)
    #expect(try Self.advice(kcal: 1800, applied: since) == .trial(since: since, until: since.adding(days: 14)))
    // Hết 14 ngày: xét lại như thường — chưa ăn tới mục tiêu mới thì nói thế.
    #expect(try Self.advice(kcal: 1800, applied: Self.today.adding(days: -14)) == .eatToTarget(avgKcal: 1800, target: 2200, loggedDays: 14))
  }

  @Test func blankDaysAreNotZeroCalorieDays() {
    let rows: [JSONValue] = [
      .object(["kcal": .number(2000)]), .object(["kcal": .null]), .object(["kcal": .number(0)]), .object(["kcal": .number(2400)]),
    ]
    #expect(CalorieAdvice.intake(rows) == (2200, 2))
  }

  @Test func snoozeHidesTheHintForAWeekUnlessTheSuggestionMoves() {
    let store = Defaults()
    let m = CalorieAdviceMemory(userId: "u1", store: store)
    let change = CalorieAdvice.change(from: 2200, to: 2350, avgKcal: 2250, measuredDays: 14)
    #expect(m.showsHint(change, today: Self.today))
    m.snooze(Self.today, to: 2350)
    #expect(!m.showsHint(change, today: Self.today.adding(days: 6)))
    #expect(m.showsHint(change, today: Self.today.adding(days: 7)))
    #expect(m.showsHint(.change(from: 2200, to: 2450, avgKcal: 2250, measuredDays: 14), today: Self.today.adding(days: 1)))
    #expect(!m.showsHint(.eatToTarget(avgKcal: 1800, target: 2200, loggedDays: 14), today: Self.today))
    m.markApplied(Self.today)
    #expect(m.applied == Self.today)
    #expect(store.map[m.snoozeKey] == nil, "áp dụng xong thì bỏ để sau")
    m.clearApplied()
    #expect(m.applied == nil)
    #expect(CalorieAdviceMemory(userId: "u2", store: store).applied == nil, "theo từng tài khoản")
  }
}
