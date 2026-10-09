@testable import ASCNDCore
import Foundation
import Testing

/// Số đo cơ thể = biểu thức của `measurements-trend.tsx` @ fac9ac2
/// (`Fixtures/measurements-golden.json`, `gen-measurements.mjs`). So với bản
/// `fixed` (CHÍNH mã RN, trục ngày đọc `date`); số / chữ trùng bản `rn`.
struct MeasurementsGoldenTests {
  static func cases() throws -> [JSONValue] {
    let url = try #require(
      Bundle.module.url(forResource: "measurements-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let a) = root else { return [] }
    return a
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  @Test func everyCaseMatchesRN() throws {
    let all = try Self.cases()
    #expect(all.count == 150)
    var lines = 0
    for c in all {
      let got = Measurements.series(Self.array(c["rows"]))
      let want = Self.array(c["fixed"])
      let rn = Self.array(c["rn"])
      #expect(got.count == want.count, "\(c)")
      #expect(rn.count == want.count)
      for (i, (g, w)) in zip(got, want).enumerated() {
        lines += 1
        #expect(g.field.key == w["key"]?.stringValue)
        #expect(g.field.unit == w["unit"]?.stringValue)
        #expect(g.points.map { JSONValue.number($0.value) } == Self.array(w["values"]))
        #expect(g.points.map { $0.date?.description ?? "" } == Self.array(w["dates"]).compactMap(\.stringValue))
        #expect(JSONValue.number(g.last) == w["last"])
        #expect(JSONValue.number(g.delta) == w["delta"], "\(w)")
        #expect(g.direction.rawValue == w["dir"]?.stringValue, "\(w)")
        #expect(g.lastText == w["lastText"]?.stringValue)
        #expect(g.deltaText == w["deltaText"]?.stringValue, "\(w)")
        // RN: cùng số, cùng chữ — chỉ trục ngày hỏng.
        #expect(rn[i]["deltaText"] == w["deltaText"])
        #expect(Self.array(rn[i]["dates"]).allSatisfy { $0 == .string("NaN-NaN-NaN") })
      }
    }
    #expect(lines > 500)
  }

  @Test func readsTheNewestTwentyFour() {
    let q = Measurements.query(userId: "u")
    #expect(q.table == "body_measurements")
    #expect(q.order == RowQuery.Order(column: "date", ascending: false))
    #expect(q.limit == 24)
    #expect(Measurements.fields.count == 12)
  }
}

@MainActor
struct MeasurementsBookTests {
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

  @Test func newestFirstFromServerBecomesOldestFirstOnScreen() async {
    let rows = Rows()
    // Server trả mới → cũ.
    rows.rows = [
      .object(["date": .string("2026-10-01"), "waist_cm": .number(80)]),
      .object(["date": .string("2026-09-01"), "waist_cm": .number(82.5)]),
    ]
    let book = MeasurementsBook(userId: "u", store: rows)
    await book.load()
    guard case .ready(let s) = book.phase, let waist = s.first else {
      Issue.record("\(book.phase)")
      return
    }
    #expect(waist.field.key == "waist_cm")
    #expect(waist.points.first?.date == LocalDate("2026-09-01"))
    #expect(waist.last == 80)
    #expect(waist.deltaText == "-2.5cm")
    #expect(waist.direction == .down)
    rows.fail = true
    await book.load()
    #expect(book.phase == .ready(s))
  }

  @Test func firstReadFailingIsAnError() async {
    let rows = Rows()
    rows.fail = true
    let book = MeasurementsBook(userId: "u", store: rows)
    await book.load()
    #expect(book.phase == .failed)
  }
}
