import ASCNDCore
@testable import ASCNDBackend
import Foundation
import Testing

/// #417: `weight_logs` → `WeighIn`, khoan dung như `Number(...)` của baseline.
struct PerformanceSourceTests {
  @Test func weighInsParseNumbersAndNumericStrings() {
    let rows: [SupabasePerformanceSource.WeightRow] = [
      .init(date: "2026-10-01", weight_kg: .number(72.4)),
      .init(date: "2026-10-02T00:00:00", weight_kg: .string("72.6")),
      .init(date: "garbage", weight_kg: .number(70)),
      .init(date: "2026-10-03", weight_kg: .null),
      .init(date: "2026-10-04", weight_kg: .string("abc")),
    ]
    #expect(SupabasePerformanceSource.weighIns(rows) == [
      WeighIn(date: LocalDate("2026-10-01")!, kg: 72.4), WeighIn(date: LocalDate("2026-10-02")!, kg: 72.6),
    ])
  }

  /// `historyRows`: id về chữ thường, hàng thiếu id hay không đọc được thời
  /// điểm thì bỏ, `sets` đi theo (R2-OPS-08: ánh xạ từ hàng JSON của lượt đọc chung).
  @Test func historyRowsMapIdTimeAndSets() {
    let rows: [JSONValue] = [
      .object(["id": .string("AAAA"), "date_time": .string("2026-10-05T07:00:00Z"), "sets": .array([])]),
      .object(["id": .string("b"), "date_time": .string("bad"), "sets": .array([])]),
      .object(["date_time": .string("2026-10-04T07:00:00Z"), "sets": .array([])]),
    ]
    let mapped = SupabasePerformanceSource.historyRows(rows)
    #expect(mapped.count == 1)
    #expect(mapped.first?.id == "aaaa")
    #expect(mapped.first?.at == EpochMillis(iso8601: "2026-10-05T07:00:00Z"))
    #expect(mapped.first?.sets == .array([]))
  }
}
