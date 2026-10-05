import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private func at(_ ms: Int64) -> EpochMillis { EpochMillis(ms) }

/// Luật baseline (`fac9ac2`, day-plan.tsx) — cùng bảng đã ghi ở #230. Golden
/// vectors của D là hợp đồng; các ca ở đây giữ cho từng luật có tên riêng khi
/// đỏ.
struct RestTimerBaselineTests {
  @Test func startSetsAbsoluteEnd() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0)))
    #expect(t.endsAt == at(90_000))
    #expect(t.total == 90)
    #expect(t.phase(at: at(0)) == .running(left: 90))
  }

  @Test func noRestWhenSecondsNotPositive() {
    #expect(RestTimer.start(seconds: 0, at: at(0)) == nil)
    #expect(RestTimer.start(seconds: -5, at: at(0)) == nil)
  }

  @Test func remainingRoundsUp() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0)))
    #expect(t.remaining(at: at(500)) == 90)
    #expect(t.remaining(at: at(1000)) == 89)
    #expect(t.remaining(at: at(89_001)) == 1)
  }

  @Test func plusFifteenGrowsLeftKeepsTotal() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0))).adjusted(by: 15, at: at(60_000))
    #expect(t.phase(at: at(60_000)) == .running(left: 45))
    #expect(t.total == 90)
    #expect(t.endsAt == at(105_000))
  }

  @Test func minusFifteen() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0))).adjusted(by: -15, at: at(60_000))
    #expect(t.remaining(at: at(60_000)) == 15)
    #expect(t.total == 90)
  }

  /// −15 khi còn 10 giây: còn 1 giây, không kết thúc (baseline; chờ #235).
  @Test func minusFifteenClampsToOneSecond() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0))).adjusted(by: -15, at: at(80_000))
    #expect(t.phase(at: at(80_000)) == .running(left: 1))
  }

  @Test func plusFifteenCapsAtSixHundred() throws {
    let t = try #require(RestTimer.start(seconds: 590, at: at(0))).adjusted(by: 15, at: at(0))
    #expect(t.remaining(at: at(0)) == 600)
    #expect(t.total == 600)
  }

  /// Chỉnh từ `endsAt` thật, không từ con số đang vẽ: 29,5 giây đọc là 30.
  @Test func adjustReadsTrueRemainingNotRenderedTick() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0))).adjusted(by: 15, at: at(60_500))
    #expect(t.endsAt == at(60_500 + 45_000))
  }

  @Test func doneForOneSecondThenOver() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0)))
    #expect(t.phase(at: at(89_999)) == .running(left: 1))
    #expect(t.phase(at: at(90_000)) == .done)
    #expect(t.phase(at: at(90_999)) == .done)
    #expect(t.phase(at: at(91_000)) == .over)
  }

  /// Còn thấy thẻ "xong" thì +15 cho nghỉ tiếp; đã qua thì không hồi sinh.
  @Test func adjustRevivesOnlyWhileDone() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0)))
    let revived = try #require(RestTimer.reduce(t, .adjust(delta: 15), at: at(90_500)))
    #expect(revived.remaining(at: at(90_500)) == 15)
    #expect(revived.total == 90)
    #expect(RestTimer.reduce(t, .adjust(delta: 15), at: at(91_000)) == nil)
  }

  @Test func cancelAndRestart() throws {
    let t = try #require(RestTimer.start(seconds: 90, at: at(0)))
    #expect(RestTimer.reduce(t, .cancel, at: at(10_000)) == nil)
    let next = try #require(RestTimer.reduce(t, .start(seconds: 120), at: at(10_000)))
    #expect(next.total == 120)
    #expect(next.endsAt == at(130_000))
  }

  /// Bẫy số thực: với `Double` giây, 105.1 − 60.1 ra 45.000…01 và ceil ra 46.
  @Test func integerMillisAvoidFloatCeilTrap() throws {
    let t = try #require(RestTimer.start(seconds: 45, at: at(60_100)))
    #expect(t.remaining(at: at(60_100)) == 45)
    let viaDate = EpochMillis(Date(timeIntervalSince1970: 60.1))
    #expect(viaDate == at(60_100))
  }
}

/// H4 của #227: vòng trong app và vòng trên Island phải là CÙNG một hàm của
/// thời gian, ở mọi thời điểm, sau mọi chuỗi ±15.
struct RestTimerInvariantTests {
  /// Cách `ProgressView(timerInterval: lower...upper, countsDown: true)` đọc
  /// phần còn lại — viết độc lập với `RestTimer.ringFraction`.
  private func islandFraction(lower: EpochMillis, upper: EpochMillis, now: EpochMillis) -> Double {
    let span = Double(upper.millis - lower.millis)
    return min(1, max(0, Double(upper.millis - now.millis) / span))
  }

  /// Công thức vòng của Island bản RN: neo `startDate` lúc bắt đầu, không dời.
  private func baselineIslandFraction(startedAt: EpochMillis, endsAt: EpochMillis, now: EpochMillis) -> Double {
    islandFraction(lower: startedAt, upper: endsAt, now: now)
  }

  @Test func appAndIslandRingAgreeAfterAnyAdjustSequence() throws {
    var rng = SplitMix64(seed: 0xA5C_D227)
    for _ in 0..<200 {
      var now = at(Int64(rng.next(below: 1_000_000)))
      var timer = try #require(RestTimer.start(seconds: 15 + Int(rng.next(below: 300)), at: now))
      for _ in 0..<8 {
        now = now + Int64(rng.next(below: 20_000))
        guard timer.phase(at: now) != .over else { break }
        timer = timer.adjusted(by: rng.next(below: 2) == 0 ? 15 : -15, at: now)

        // Ngay lúc chỉnh: vòng = phần còn lại thật / mẫu số.
        let left = timer.remaining(at: now)
        #expect((1...RestTimer.maxSeconds).contains(left))
        #expect(left <= timer.total)
        #expect(timer.ringStart + Int64(timer.total) * 1000 == timer.endsAt)

        // Mọi thời điểm sau đó tới khi hết: app == Island, và vòng không tăng.
        var previous = 1.0
        for step in stride(from: Int64(0), through: Int64(left) * 1000, by: 500) {
          let t = now + step
          let app = timer.ringFraction(at: t)
          let island = islandFraction(lower: timer.ringStart, upper: timer.endsAt, now: t)
          #expect(abs(app - island) < 1e-12)
          #expect(app <= previous + 1e-12)
          previous = app
        }
      }
    }
  }

  /// Ca cụ thể của #227 H4: nghỉ 90 giây, còn 30 thì +15. App đọc 45/90 = 50%;
  /// Island bản RN đọc 45/105 ≈ 43%. Bản native: cả hai 50%.
  @Test func baselineIslandDivergedThisIsFixed() throws {
    let started = at(0)
    let t = try #require(RestTimer.start(seconds: 90, at: started)).adjusted(by: 15, at: at(60_000))
    #expect(t.ringFraction(at: at(60_000)) == 0.5)
    let old = baselineIslandFraction(startedAt: started, endsAt: t.endsAt, now: at(60_000))
    #expect(abs(old - 45.0 / 105.0) < 1e-12)
    #expect(abs(t.ringFraction(at: at(60_000)) - old) > 0.05)
  }
}

/// Runner cho `spec/vectors/rest-timer.json` (D, #230). Tệp chưa có thì không
/// có ca nào để chạy — test vẫn xanh, và `everySpecVectorFileIsWellFormed`
/// soát định dạng khi tệp tới.
struct RestTimerVectorTests {
  struct Input: Decodable, Sendable {
    struct Event: Decodable, Sendable {
      let at: Int64
      let op: String
      let seconds: Int?
      let delta: Int?
    }
    let events: [Event]
    let at: Int64
  }

  struct Expected: Decodable, Sendable {
    let phase: String
    let left: Int?
    let total: Int?
    let endsAt: Int64?
  }

  @Test func goldenVectors() throws {
    let url = RepoPaths.specVectors.appendingPathComponent("rest-timer.json")
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    let cases = try GoldenVectors.load(url, as: GoldenVector<Input, Expected>.self)
    for c in cases {
      var state: RestTimer?
      for e in c.input.events {
        let event: RestEvent
        switch e.op {
        case "start": event = .start(seconds: try #require(e.seconds, "\(c.rule): start thiếu seconds"))
        case "adjust": event = .adjust(delta: try #require(e.delta, "\(c.rule): adjust thiếu delta"))
        case "cancel": event = .cancel
        default:
          Issue.record("\(c.rule): op lạ '\(e.op)'")
          continue
        }
        state = RestTimer.reduce(state, event, at: at(e.at))
      }
      let now = at(c.input.at)
      let phase: String
      switch state?.phase(at: now) {
      case .running?: phase = "running"
      case .done?: phase = "done"
      case .over?, nil: phase = "idle"
      }
      #expect(phase == c.expected.phase, "\(c.rule)")
      if let left = c.expected.left { #expect(state?.remaining(at: now) == left, "\(c.rule): left") }
      if let total = c.expected.total { #expect(state?.total == total, "\(c.rule): total") }
      if let endsAt = c.expected.endsAt { #expect(state?.endsAt.millis == endsAt, "\(c.rule): endsAt") }
    }
  }
}
