@testable import ASCNDCore
import Foundation
import Testing

/// Vận động = biểu thức của `steps.tsx` + `setStepsGoal` @ fac9ac2
/// (`Fixtures/steps-golden.json`, `gen-steps.mjs`).
struct StepsGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "steps-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  @Test func everyCaseMatchesRN() throws {
    let g = try Self.golden()
    let todayText = try #require(g["today"]?.stringValue)
    let today = try #require(LocalDate(todayText))
    let cases = Self.array(g["cases"])
    #expect(cases.count == 200)
    for c in cases {
      let h = Steps.history(Self.array(c["rows"]))
      let goal = Int(try #require(Self.num(c["goal"])))
      let s = Steps.stats(h, today: today)
      #expect(s.today == Self.num(c["today"]), "\(c)")
      #expect(s.avg == Self.num(c["avg"]), "\(c)")
      #expect(s.last7.map(\.date.description) == Self.array(c["last7"]).compactMap(\.stringValue))
      let trend = try #require(Self.num(c["trend"]))
      #expect(abs(s.trend - trend) < 1e-9, "\(c)")
      #expect(JS.round(s.trend) == Self.num(c["trendRounded"]))
      let pct = Steps.percent(today: s.today, goal: goal)
      let wantPct = try #require(Self.num(c["pct"]))
      #expect(abs(pct - wantPct) < 1e-9)
      #expect(JS.round(pct) == Self.num(c["pctRounded"]))
      #expect(Steps.maxWeek(s.last7, goal: goal) == Self.num(c["maxWeek"]))
    }
  }

  @Test func goalClampLikeSetStepsGoal() throws {
    let rows = Self.array(try Self.golden()["goals"])
    #expect(rows.count == 9)
    for r in rows {
      let v = try #require(Self.num(r["value"]))
      #expect(Double(Steps.clampGoal(v)) == Self.num(r["goal"]), "\(v)")
    }
  }
}

/// Mục tiêu bước theo tài khoản + sổ.
@MainActor
struct StepsBookTests {
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
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if fail { throw RowStoreError(code: nil, message: "down") }
      return rows
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  @Test func goalIsPerAccountAndClamped() {
    let d = Defaults()
    let a = StepsGoalStore(store: d, userId: "a")
    let b = StepsGoalStore(store: d, userId: "b")
    #expect(a.goal == 10_000)
    a.set(500)
    #expect(a.goal == 1000)
    #expect(b.goal == 10_000)  // người sau không thừa hưởng mục tiêu người trước
    d.set("0", forKey: "ascnd-steps-goal.b")
    #expect(b.goal == 10_000)  // 0 không phải mục tiêu
  }

  @Test func bookStepsTheGoalAndReadsHistory() async {
    let rows = Rows()
    rows.rows = [.object(["date": .string("2026-10-09"), "steps": .number(4200)])]
    let book = StepsBook(
      userId: "u", today: LocalDate("2026-10-09")!, store: rows, goals: StepsGoalStore(store: Defaults(), userId: "u"))
    await book.load()
    #expect(book.stats?.today == 4200)
    book.adjustGoal(by: 500)
    #expect(book.goal == 10_500)
    rows.fail = true
    await book.load()
    #expect(book.stats?.today == 4200)  // đọc lại hỏng: giữ số
  }

  @Test func queryLikeTheHook() {
    let q = Steps.query(userId: "u", today: LocalDate("2026-10-09")!)
    #expect(q.columns == "date, steps")
    #expect(q.filters.contains(.gte("date", .string("2026-09-25"))))
  }
}
