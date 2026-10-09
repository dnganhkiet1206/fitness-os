@testable import ASCNDCore
import Foundation
import Testing

/// Xu hướng sẵn sàng 7 ngày (#527) — `ReadinessTrendCard` + `useReadinessHistory(7)` @ fac9ac2.
struct ReadinessTrendTests {
  static func row(_ date: String, _ score: JSONValue) -> JSONValue {
    .object(["date": .string(date), "readiness_score": score, "readiness_status": .string("green")])
  }

  @Test func zonesAreTheCardsThree() {
    #expect(ReadinessTrend.zone(100) == .train)
    #expect(ReadinessTrend.zone(75) == .train)
    #expect(ReadinessTrend.zone(74.9) == .moderate)
    #expect(ReadinessTrend.zone(50) == .moderate)
    #expect(ReadinessTrend.zone(49) == .recover)
    #expect(ReadinessTrend.zone(0) == .recover)
  }

  @Test func statsNeedTwoDaysAndRoundTheMeanLikeJS() {
    let one = [ReadinessTrend.Point(date: LocalDate("2026-10-08")!, value: 80)]
    #expect(ReadinessTrend.stats(one) == nil)
    let pts = [70.0, 81, 64.5].enumerated().map {
      ReadinessTrend.Point(date: LocalDate("2026-10-0\($0.offset + 1)")!, value: $0.element)
    }
    let s = ReadinessTrend.stats(pts)
    // (70 + 81 + 64.5) / 3 = 71.83… → 72
    #expect(s?.average == 72)
    #expect(s?.max == 81)
    #expect(s?.min == 64.5)
    // Math.round(x.5) lên: (70 + 71) / 2 = 70.5 → 71
    let half = [70.0, 71].enumerated().map {
      ReadinessTrend.Point(date: LocalDate("2026-10-0\($0.offset + 1)")!, value: $0.element)
    }
    #expect(ReadinessTrend.stats(half)?.average == 71)
  }

  @Test func pointsReadNumbersStringsAndSkipBrokenRows() {
    let pts = ReadinessTrend.points([
      Self.row("2026-10-01", .number(72)),
      Self.row("2026-10-02", .string("64")),
      Self.row("2026-10-03", .null),
      Self.row("not-a-date", .number(50)),
      Self.row("2026-10-04", .string("x")),
    ])
    #expect(pts.map(\.date.description) == ["2026-10-01", "2026-10-02", "2026-10-04"])
    #expect(pts.map(\.value) == [72, 64, 0])  // `Number("x") || 0`
  }

  @Test func queryIsSevenDaysBackWithAScore() {
    let q = ReadinessTrend.query(userId: "u", today: LocalDate("2026-10-08")!)
    #expect(q.table == "daily_logs")
    #expect(q.filters.contains(.eq("user_id", .string("u"))))
    #expect(q.filters.contains(.gte("date", .string("2026-10-01"))))
    #expect(q.filters.contains(.or("readiness_score.not.is.null")))
    #expect(q.order == RowQuery.Order(column: "date", ascending: true))
  }
}

@MainActor
struct ReadinessTrendBookTests {
  final class Store: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [JSONValue] = []
    var fail = false
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if lock.withLock({ fail }) { throw RowStoreError(code: nil, message: "down") }
      return lock.withLock { rows }
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
  }

  @Test func failedReloadKeepsTheLastPoints() async {
    let s = Store()
    s.rows = [ReadinessTrendTests.row("2026-10-07", .number(60)), ReadinessTrendTests.row("2026-10-08", .number(80))]
    let book = ReadinessTrendBook(userId: "u", today: LocalDate("2026-10-08")!, store: s)
    await book.load()
    #expect(book.stats?.average == 70)
    s.fail = true
    await book.load()
    #expect(book.points?.count == 2)
  }

  @Test func closedBookIgnoresResults() async {
    let s = Store()
    s.rows = [ReadinessTrendTests.row("2026-10-08", .number(80))]
    let book = ReadinessTrendBook(userId: "u", today: LocalDate("2026-10-08")!, store: s)
    book.close()
    await book.load()
    #expect(book.points == nil)
  }
}
