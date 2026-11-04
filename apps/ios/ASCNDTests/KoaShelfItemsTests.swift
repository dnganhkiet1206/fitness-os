import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Cúp và khung mốc của phòng Koa (#792): mỗi món một câu có ngày, có số thật khi tính lại được.
@MainActor
@Suite struct KoaShelfItemsTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  /// Buổi đầu 05/10, kỷ lục 20/10 và 29/10 (lịch T2 / T4 / T6).
  private var moments: [KoaJourney.Moment] {
    let week = KoaGains.Week(planned: [0, 2, 4], rest: [5, 6])
    let days = [
      KoaGains.Day(date: d("2026-10-05"), personalRecord: false),
      KoaGains.Day(date: d("2026-10-20"), personalRecord: true),
      KoaGains.Day(date: d("2026-10-29"), personalRecord: true),
    ]
    return KoaJourney.moments(days, week: week, today: d("2026-10-30"))
  }

  @Test func cupsTellTheRealRecordAndFramesTheirMilestone() {
    let bench = PersonalRecord(exercise: "Bench Press", kind: .weight, value: 80, previous: 75, atWeight: nil)
    let items = ShelfItem.items(
      moments: moments, records: [d("2026-10-29"): bench], unit: .kg, lang: .en, locale: Locale(identifier: "en_US"))
    #expect(Array(items.prefix(2)).map(\.place) == [.cup(0), .cup(1)], "kỷ lục mới nhất ở chỗ đầu")
    let newest = items[0].line
    #expect(newest.contains("Bench Press") && newest.contains("80") && newest.contains("75"), "\(newest)")
    #expect(newest.contains("Oct 29"), "\(newest)")
    #expect(!items[1].line.contains("Bench"), "không tính lại được số thì không đoán: \(items[1].line)")
    #expect(items.contains { $0.place == .frame(.first) && $0.line.contains("Oct 5") })
    #expect(Set(items.map(\.id)).count == items.count, "khoá không trùng")
    #expect(items.allSatisfy { !$0.label.isEmpty && !$0.line.isEmpty })
    let display = ShelfItem.display(items)
    #expect(display.cups == 2 && display.frames.contains(.first))
  }

  @Test func emptyJourneyMeansNothingOnTheShelf() {
    let items = ShelfItem.items(moments: [], records: [:], unit: .kg, lang: .vi, locale: Locale(identifier: "vi_VN"))
    #expect(items.isEmpty)
    #expect(ShelfItem.display(items).isEmpty)
  }
}
