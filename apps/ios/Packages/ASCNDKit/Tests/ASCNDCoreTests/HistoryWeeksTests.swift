@testable import ASCNDCore
import Foundation
import Testing

/// Biểu đồ khối lượng theo tuần của Lịch sử (14/10).
struct HistoryWeeksTests {
  let utc = TimeZone(identifier: "UTC")!
  /// 2026-10-14 (Thứ Tư) 12:00 UTC.
  let now = EpochMillis(1_791_979_200_000)

  func entry(_ day: String, _ kg: Int, _ name: String = "Push") -> HistoryEntry {
    let d = LocalDate(day)!
    return HistoryEntry(
      id: day + name, at: EpochMillis(Int64(d.daysSinceEpoch) * 86_400_000 + 43_200_000), templateName: name,
      sessionRpe: 7, volumeKg: kg, prDetected: false, completedSets: 3, exerciseCount: 1)
  }

  @Test func eightWeeksEndingThisWeekWithGaps() {
    let w = HistoryWeeks.weeks(
      [entry("2026-10-13", 1000), entry("2026-10-12", 500), entry("2026-10-01", 800)], timeZone: utc, now: now)
    #expect(w.count == 8)
    #expect(w.last?.start.description == "2026-10-12")
    #expect(w.last?.volumeKg == 1500 && w.last?.sessions == 2)
    #expect(w[6].volumeKg == 0, "tuần 5–11/10 không tập vẫn có cột")
    #expect(w[5].start.description == "2026-09-28" && w[5].volumeKg == 800)
    #expect(w.first?.start.description == "2026-08-24")
  }

  @Test func namesNewestFirstUnique() {
    let n = HistoryWeeks.names([entry("2026-10-01", 1, "Pull"), entry("2026-10-13", 1, "Push"), entry("2026-10-05", 1, "Pull")])
    #expect(n == ["Push", "Pull"])
  }
}
