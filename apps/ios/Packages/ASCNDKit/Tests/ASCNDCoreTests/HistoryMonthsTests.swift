import ASCNDCore
import Foundation
import Testing

/// Nhóm tháng của màn lịch sử (#375) — golden sinh bằng node chạy NGUYÊN công
/// thức `months` + `change` của RN `sessions.tsx` (TZ qua biến môi trường).
struct HistoryMonthsTests {
  private func entry(_ id: String, _ iso: String, _ volume: Int) -> HistoryEntry {
    let f = ISO8601DateFormatter()
    let at = EpochMillis(f.date(from: iso)!)
    return HistoryEntry(
      id: id, at: at, templateName: "W", sessionRpe: 7, volumeKg: volume, prDetected: false,
      completedSets: 1, exerciseCount: 1)
  }

  private var scenarioA: [HistoryEntry] {
    [
      entry("a", "2026-10-05T03:00:00Z", 5000), entry("b", "2026-09-30T17:30:00Z", 3000),
      entry("c", "2026-09-20T10:00:00Z", 4000), entry("d", "2026-09-02T10:00:00Z", 2001),
      entry("e", "2026-08-15T10:00:00Z", 4000), entry("f", "2026-07-20T10:00:00Z", 1000),
    ]
  }

  private let now = EpochMillis(ISO8601DateFormatter().date(from: "2026-10-07T05:00:00Z")!)

  /// TZ=Asia/Ho_Chi_Minh: buổi 2026-09-30T17:30Z là 00:30 ngày 1/10 ở Sài Gòn
  /// → thuộc tháng 10. Tháng 10 đang chạy, tháng 7 cũ nhất (bị cửa sổ cắt):
  /// chỉ tháng 9 so được với tháng 8 — (6001 − 4000) / 4000 = 50,025 % → 50.
  @Test func saigonMatchesBaseline() {
    let m = HistoryMonths.group(scenarioA, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!, now: now)
    #expect(m.map(\.key) == ["2026-10", "2026-09", "2026-08", "2026-07"])
    #expect(m.map { $0.entries.map(\.id) } == [["a", "b"], ["c", "d"], ["e"], ["f"]])
    #expect(m.map(\.volumeKg) == [8000, 6001, 4000, 1000])
    #expect(m.map(\.peakKg) == [5000, 4000, 4000, 1000])
    #expect(m.map(\.changePercent) == [nil, 50, nil, nil])
  }

  /// Cùng dữ liệu, TZ=UTC: buổi "b" về tháng 9 → 9001 so với 4000 = 125 %.
  @Test func utcMatchesBaseline() {
    let m = HistoryMonths.group(scenarioA, timeZone: TimeZone(identifier: "UTC")!, now: now)
    #expect(m.map { $0.entries.map(\.id) } == [["a"], ["b", "c", "d"], ["e"], ["f"]])
    #expect(m.map(\.volumeKg) == [5000, 9001, 4000, 1000])
    #expect(m.map(\.changePercent) == [nil, 125, nil, nil])
  }

  /// Làm tròn như `Math.round`: −2,5 → −2 (không phải −3). Tháng trước có
  /// khối lượng 0 thì không so.
  @Test func roundingAndZeroVolumeMatchBaseline() {
    let b = [
      entry("a", "2026-09-20T10:00:00Z", 3900), entry("b", "2026-08-15T10:00:00Z", 4000),
      entry("c", "2026-07-15T10:00:00Z", 0), entry("d", "2026-06-20T10:00:00Z", 500),
    ]
    let m = HistoryMonths.group(b, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!, now: now)
    #expect(m.map(\.volumeKg) == [3900, 4000, 0, 500])
    #expect(m.map(\.changePercent) == [-2, nil, nil, nil])
  }

  @Test func emptyHistoryHasNoMonths() {
    #expect(HistoryMonths.group([], timeZone: TimeZone(identifier: "UTC")!, now: now).isEmpty)
  }
}
