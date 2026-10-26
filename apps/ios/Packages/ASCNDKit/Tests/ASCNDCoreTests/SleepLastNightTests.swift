@testable import ASCNDCore
import Foundation
import Testing

/// Không bao giờ lưu giấc ngủ kết thúc ở tương lai (audit 25/10).
struct SleepLastNightTests {
  static let hcm = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let bed = SleepLog.Clock(hour: 23, minute: 0)
  static let wake = SleepLog.Clock(hour: 7, minute: 0)

  /// 25/10 01:24 giờ HCM.
  static let early = EpochMillis(iso8601: "2026-10-24T18:24:00.000Z")!
  /// 25/10 09:00 giờ HCM.
  static let morning = EpochMillis(iso8601: "2026-10-25T02:00:00.000Z")!

  @Test func beforeWakeTimeUsesTheNightThatAlreadyEnded() {
    let s = SleepLog.lastNight(bed: Self.bed, wake: Self.wake, ref: Self.early, in: Self.hcm)
    #expect(s.wake.millis <= Self.early.millis)
    #expect(s.wake == EpochMillis(iso8601: "2026-10-24T00:00:00.000Z"))  // 24/10 07:00
    #expect(s.minutes == 480)
    // RN `span` đặt giờ dậy vào tương lai — lý do có hàm này.
    #expect(SleepLog.span(bed: Self.bed, wake: Self.wake, ref: Self.early, in: Self.hcm).wake.millis > Self.early.millis)
  }

  @Test func afterWakeTimeMatchesRN() {
    let a = SleepLog.lastNight(bed: Self.bed, wake: Self.wake, ref: Self.morning, in: Self.hcm)
    let b = SleepLog.span(bed: Self.bed, wake: Self.wake, ref: Self.morning, in: Self.hcm)
    #expect(a == b)
    #expect(a.wake == EpochMillis(iso8601: "2026-10-25T00:00:00.000Z"))  // 25/10 07:00
  }

  @Test func wakePassed() {
    #expect(!SleepLog.wakePassed(Self.wake, ref: Self.early, in: Self.hcm))
    #expect(SleepLog.wakePassed(Self.wake, ref: Self.morning, in: Self.hcm))
  }
}
