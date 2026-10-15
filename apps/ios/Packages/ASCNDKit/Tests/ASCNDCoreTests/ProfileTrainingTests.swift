@testable import ASCNDCore
import Foundation
import Testing

struct ProfileTrainingTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  /// 15/10/2026 10:00 giờ VN.
  static let now = EpochMillis(iso8601: "2026-10-15T03:00:00Z")!

  static func entry(_ id: String, _ iso: String, pr: Bool = false) -> HistoryEntry {
    HistoryEntry(
      id: id, at: EpochMillis(iso8601: iso)!, templateName: "T", sessionRpe: 7, volumeKg: 100, prDetected: pr,
      completedSets: 5, exerciseCount: 2)
  }

  @Test func countsMonthPrsAndRhythmInLocalDays() {
    let entries = [
      Self.entry("a", "2026-10-15T01:00:00Z", pr: true),  // hôm nay
      Self.entry("b", "2026-10-14T18:30:00Z"),  // 15/10 01:30 giờ VN → cũng hôm nay
      Self.entry("c", "2026-10-01T02:00:00Z"),  // đầu tháng
      Self.entry("d", "2026-09-30T16:30:00Z"),  // 30/9 23:30 VN → tháng trước
      Self.entry("e", "2026-09-10T02:00:00Z", pr: true),  // ngoài 28 ngày
    ]
    let s = ProfileTraining.summary(entries, now: Self.now, timeZone: Self.tz)
    #expect(s.sessionsThisMonth == 3)
    #expect(s.prSessions == 2)
    #expect(s.rhythm.count == 28)
    #expect(s.rhythm.last == true)
    #expect(s.rhythm[27 - 14] == true)  // 1/10
    #expect(s.rhythm[27 - 15] == true)  // 30/9
    #expect(s.activeDays == 3)
  }

  @Test func emptyHistoryIsAllZero() {
    let s = ProfileTraining.summary([], now: Self.now, timeZone: Self.tz)
    #expect(s.sessionsThisMonth == 0 && s.prSessions == 0 && s.activeDays == 0)
  }
}
