@testable import ASCNDCore
import Foundation
import Testing

/// Thẻ Cân nặng (phân đoạn Cơ thể, 14/10) — `body-panel.tsx` + `useWeightHistory`.
@MainActor
struct WeightTrendTests {
  final class Defaults: KeyValueStore, @unchecked Sendable {
    let lock = NSLock()
    var map: [String: String] = [:]
    func string(forKey key: String) -> String? { lock.withLock { map[key] } }
    func set(_ value: String, forKey key: String) { lock.withLock { map[key] = value } }
    func remove(_ key: String) { lock.withLock { _ = map.removeValue(forKey: key) } }
  }

  final class Rows: RowStore, @unchecked Sendable {
    var rows: [JSONValue] = []
    var fail = false
    var last: RowQuery?
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      last = q
      if fail { throw RowStoreError(code: nil, message: "down") }
      return rows
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  struct Clock: WallClock {
    func now() -> Date { EpochMillis(iso8601: "2026-10-14T05:00:00.000Z")!.date }
  }

  static func row(_ d: String, _ kg: Double) -> JSONValue {
    .object(["date": .string(d), "weight_kg": .number(kg)])
  }

  @Test func pointsSkipBrokenRows() {
    let p = WeightTrend.points([
      Self.row("2026-10-01", 73), .object(["date": .string("x"), "weight_kg": .number(70)]),
      .object(["date": .string("2026-10-02"), "weight_kg": .string("bad")]), Self.row("2026-10-03", 72.5),
    ])
    #expect(p.map(\.kg) == [73, 72.5])
  }

  @Test func rangesFilterFromToday() {
    let today = LocalDate("2026-10-14")!
    let p = WeightTrend.points([Self.row("2025-01-01", 80), Self.row("2026-09-01", 75), Self.row("2026-10-10", 74)])
    #expect(WeightTrend.filter(p, range: .week, today: today).count == 1)
    #expect(WeightTrend.filter(p, range: .month, today: today).count == 1)
    #expect(WeightTrend.filter(p, range: .year, today: today).count == 2)
    #expect(WeightTrend.filter(p, range: .all, today: today).count == 3)
  }

  @Test func deltaGoodFollowsTheGoal() {
    #expect(WeightTrend.deltaGood(-0.6, goal: "cut"))
    #expect(!WeightTrend.deltaGood(-0.6, goal: "bulk"))
    #expect(WeightTrend.deltaGood(0.4, goal: "bulk"))
    #expect(!WeightTrend.deltaGood(-0.6, goal: "maintain"))
  }

  @Test func bmiZones() {
    let b = WeightTrend.bmi(kg: 72, heightCm: 175)!
    #expect(abs(b - 23.51) < 0.01)
    #expect(WeightTrend.zone(18.4) == .under)
    #expect(WeightTrend.zone(18.5) == .healthy)
    #expect(WeightTrend.zone(25) == .over)
    #expect(WeightTrend.zone(30) == .obese)
    #expect(WeightTrend.bmi(kg: 72, heightCm: nil) == nil)
    #expect(WeightTrend.bmiPosition(10) == 0 && WeightTrend.bmiPosition(50) == 1)
  }

  @Test func goalIsClampedRoundedAndPerUser() {
    #expect(WeightTrend.clampGoal(12) == 30)
    #expect(WeightTrend.clampGoal(70.456) == 70.46)
    #expect(WeightTrend.parseGoal("500") == nil)
    #expect(WeightTrend.parseGoal("abc") == nil)
    let d = Defaults()
    let a = WeightTrendBook(userId: "a", store: Rows(), defaults: d, clock: Clock(), timeZone: .gmt)
    a.setGoal(68.123)
    #expect(a.goalKg == 68.12)
    #expect(WeightTrendBook(userId: "a", store: Rows(), defaults: d, clock: Clock(), timeZone: .gmt).goalKg == 68.12)
    #expect(WeightTrendBook(userId: "b", store: Rows(), defaults: d, clock: Clock(), timeZone: .gmt).goalKg == nil)
    a.setGoal(nil)
    #expect(d.map.isEmpty)
  }

  @Test func bookReadsAllHistoryAndSummarisesNinetyDays() async {
    let rows = Rows()
    rows.rows = [Self.row("2026-01-01", 80), Self.row("2026-08-01", 75), Self.row("2026-10-13", 73.4)]
    let book = WeightTrendBook(userId: "u", store: rows, defaults: Defaults(), clock: Clock(), timeZone: .gmt)
    await book.load()
    #expect(rows.last?.table == "weight_logs")
    #expect(book.all.count == 3)
    let s = book.summary!
    #expect(s.startKg == 75 && s.currentKg == 73.4)
    rows.fail = true
    await book.load()
    #expect(book.all.count == 3)
  }

  @Test func entriesAreNewestFirstWithChange() {
    let e = WeightTrend.entries(WeightTrend.points([Self.row("2026-10-01", 73), Self.row("2026-10-05", 72.4)]))
    #expect(e.map(\.date.description) == ["2026-10-05", "2026-10-01"])
    #expect(abs((e[0].changeKg ?? 0) + 0.6) < 1e-9)
    #expect(e[1].changeKg == nil)
  }

  @Test func intentAgainstCurrentWeight() {
    #expect(WeightTrend.intent(goalKg: 70, currentKg: 70.04) == .maintain)
    #expect(WeightTrend.intent(goalKg: 68, currentKg: 70) == .lose(2))
    #expect(WeightTrend.intent(goalKg: 72.5, currentKg: 70) == .gain(2.5))
  }

  @Test func nearestPointAndChangeForScrubbing() {
    let pts = [("2026-10-01", 60.0), ("2026-10-05", 59.5), ("2026-10-09", 59.0)].map {
      WeightTrend.Point(date: LocalDate($0.0)!, kg: $0.1)
    }
    #expect(WeightTrend.nearest(pts, to: LocalDate("2026-10-04")!)?.kg == 59.5)
    #expect(WeightTrend.nearest(pts, to: LocalDate("2026-10-03")!)?.kg == 60, "hoà thì lần sớm hơn")
    #expect(WeightTrend.nearest(pts, to: LocalDate("2026-12-01")!)?.kg == 59)
    #expect(WeightTrend.nearest([], to: LocalDate("2026-10-04")!) == nil)
    #expect(WeightTrend.change(of: pts[2], in: pts) == -0.5)
    #expect(WeightTrend.change(of: pts[0], in: pts) == nil)
  }
}
