import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Test fuzz RestTimer (D-7, #282) — bổ sung cho RestTimerInvariantTests của A: chuỗi ±15 ngẫu nhiên với seed cố
/// định (`SplitMix64`) — tất định, không flaky. Bất biến sau mọi lần chỉnh:
///
/// 1. `ringFraction` của app == của Island (vòng là phép chiếu của cùng một
///    nguồn sự thật — #251);
/// 2. `1 <= left <= 600` và `left <= total`;
/// 3. `ringStart + total*1000 == endsAt` (vòng không bao giờ vượt quá cái
///    nó đang đếm).
///
/// Đảo ngược (chứng minh test bắt lỗi): đổi `ringStart` thành
/// `endsAt - left*1000` (dùng phần còn lại thay vì tổng) → bất biến 1 đỏ
/// ngay ở ca đầu tiên.
struct RestTimerFuzzTests {
  @Test func randomAdjustKeepsAppAndIslandInAgreement() throws {
    var rng = SplitMix64(seed: 0xD282_F007)
    for _ in 0..<150 {
      var now = EpochMillis(Int64(rng.next(below: 2_000_000)))
      var timer = try #require(RestTimer.start(
        seconds: 15 + Int(rng.next(below: 400)), at: now))
      // Xen kẽ chỉnh ±15 và cho thời gian trôi.
      for _ in 0..<(4 + Int(rng.next(below: 8))) {
        now = now + Int64(rng.next(below: 30_000))
        guard timer.phase(at: now) != .over else { break }
        timer = timer.adjusted(by: rng.next(below: 2) == 0 ? 15 : -15, at: now)

        let left = timer.remaining(at: now)
        #expect((1...RestTimer.maxSeconds).contains(left), "left trong 1...600")
        #expect(left <= timer.total, "left <= total")
        #expect(timer.ringStart + Int64(timer.total) * 1000 == timer.endsAt,
                "vòng là phần của tổng, không phải của phần còn lại")

        // Mọi thời điểm từ lúc chỉnh tới khi hết: app == Island (phần CÒN LẠI),
        // vòng đơn điệu giảm. Công thức Island viết độc lập với ringFraction.
        var previous = 1.0
        var t = now
        while t <= now + Int64(left) * 1000 {
          let app = timer.ringFraction(at: t)
          let span = Double(timer.endsAt.millis - timer.ringStart.millis)
          let island = min(1, max(0, Double(timer.endsAt.millis - t.millis) / span))
          #expect(abs(app - island) < 1e-12, "app == Island sau chuỗi ±15 ngẫu nhiên")
          #expect(app <= previous + 1e-12, "vòng không tăng")
          previous = app
          t = t + 2000
        }
      }
    }
  }

  /// Biên: trừ khi chỉ còn 1 giây thì vẫn còn 1 giây (không âm, không 0);
  /// cộng khi đã đầy 600 thì không vượt trần.
  @Test func adjustClampsAtBothEdges() throws {
    var rng = SplitMix64(seed: 0xED9E_0001)
    for _ in 0..<200 {
      let now = EpochMillis(Int64(rng.next(below: 1_000_000)))
      var timer = try #require(RestTimer.start(seconds: 90, at: now))
      for _ in 0..<40 {
        timer = timer.adjusted(by: -15, at: now)
        #expect(timer.remaining(at: now) >= 1, "không bao giờ về 0 hay âm")
      }
      #expect(timer.remaining(at: now) == 1)
      for _ in 0..<60 {
        timer = timer.adjusted(by: 15, at: now)
        #expect(timer.remaining(at: now) <= RestTimer.maxSeconds, "không vượt 600")
      }
    }
  }
}
