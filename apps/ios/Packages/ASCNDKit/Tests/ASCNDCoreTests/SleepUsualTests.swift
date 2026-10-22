@testable import ASCNDCore
import Foundation
import Testing

/// Giờ ngủ quen cho nút ghi nhanh trên thẻ Giấc ngủ (Kiệt 22/10).
struct SleepUsualTests {
  static let hcm = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  /// Một đêm: ngủ `bed` (UTC ISO) dậy `wake`.
  static func night(_ bed: String, _ wake: String) -> JSONValue {
    .object(["bedtime": .string(bed), "waketime": .string(wake)])
  }

  @Test func medianAcrossMidnight() throws {
    // Giờ HCM: 23:30→6:30, 0:30→7:00, 23:45→6:45 → ngủ 23:45 (0:30 tính là 24:30, không kéo về 12:00), dậy 6:45.
    let rows = [
      Self.night("2026-10-18T16:30:00.000Z", "2026-10-18T23:30:00.000Z"),
      Self.night("2026-10-19T17:30:00.000Z", "2026-10-20T00:00:00.000Z"),
      Self.night("2026-10-20T16:45:00.000Z", "2026-10-20T23:45:00.000Z"),
    ]
    let u = try #require(SleepLog.usual(rows, in: Self.hcm))
    #expect(u.bed == SleepLog.Clock(hour: 23, minute: 45))
    #expect(u.wake == SleepLog.Clock(hour: 6, minute: 45))
  }

  @Test func needsTwoValidNights() {
    let one = [Self.night("2026-10-18T16:00:00.000Z", "2026-10-18T23:00:00.000Z")]
    #expect(SleepLog.usual(one, in: Self.hcm) == nil)
    // Hàng hỏng / quá dài bị bỏ: vẫn chỉ còn một đêm.
    let bad = one + [Self.night("x", "y"), Self.night("2026-10-10T00:00:00.000Z", "2026-10-12T00:00:00.000Z")]
    #expect(SleepLog.usual(bad, in: Self.hcm) == nil)
  }
}
