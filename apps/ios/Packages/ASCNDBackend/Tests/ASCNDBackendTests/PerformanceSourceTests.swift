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
}
