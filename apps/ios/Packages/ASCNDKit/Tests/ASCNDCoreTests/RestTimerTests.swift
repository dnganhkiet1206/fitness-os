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

/// Runner cho golden vectors của D (#230, #237). Định dạng của D: chọn hàm
/// theo tiền tố `rule`, `input` là tham số của hàm đó. Tệp chưa có thì không
/// có ca nào để chạy. Tiền tố lạ là lỗi — luật mới phải kèm runner, giống
/// `spec/vectors/run.mjs`.
struct WorkoutVectorTests {
  private func run(_ c: GoldenVector<JSONValue, JSONValue>) -> JSONValue? {
    let i = c.input
    let rule = c.rule
    func int(_ k: String) -> Int? { i[k]?.intValue }
    func set(_ v: JSONValue) -> LoggedSet {
      LoggedSet(reps: v["reps"]?.intValue ?? 0, weight: v["weight"]?.doubleValue,
                warmup: v["warmup"]?.boolValue ?? false, durationSec: v["durationSec"]?.intValue)
    }
    func sets() -> [LoggedSet] {
      if case .array(let a)? = i["sets"] { return a.map(set) }
      return []
    }
    if rule.hasPrefix("RT-7"), let base = int("base"), let delta = int("delta") {
      // Runner RN của D cố định total = 90 cho nhóm này.
      let r = RestTimer.adjust(base: base, delta: delta, total: 90)
      return .object(["left": .number(Double(r.left)), "total": .number(Double(r.total))])
    }
    if rule.hasPrefix("RT-15"), let s = int("seconds") {
      return .object(["label": .string(RestTimer.label(seconds: s))])
    }
    if rule.hasPrefix("RT-10"), let now = int("now") {
      return .object(["warn": .bool(RestTimer.warns(left: now, paused: i["paused"]?.boolValue ?? false))])
    }
    if rule.hasPrefix("RT-16"), let n = int("n") {
      return .object(["clamped": .number(Double(RestTimer.clampPlanned(n)))])
    }
    if rule.hasPrefix("WS-2") {
      let e = RepEntry.parse(i["reps"]?.stringValue)
      var o: [String: JSONValue] = ["counted": .bool(e.isEntered)]
      if e.reps > 0 { o["reps"] = .number(Double(e.reps)) }
      if let d = e.durationSec, d > 0 { o["durationSec"] = .number(Double(d)) }
      return .object(o)
    }
    if rule.hasPrefix("WS-5") {
      return .object(["volume": .number(WorkoutMath.volume(of: sets()))])
    }
    if rule.hasPrefix("WS-8"), let s = i["set"], let h = i["history"] {
      var repsAt: [String: Int] = [:]
      if case .object(let o)? = h["repsByWeight"] { for (k, v) in o { repsAt[k] = v.intValue } }
      let top = h["topWeight"]?.doubleValue ?? 0
      let best = top > 0 || !repsAt.isEmpty ? PersonalRecords.Best(topWeight: top, repsAt: repsAt) : nil
      guard let kind = PersonalRecords.check(set(s), best: best) else { return .object(["isRecord": .bool(false)]) }
      return .object(["isRecord": .bool(true), "kind": .string(kind.rawValue)])
    }
    if rule == "LT-6" {
      let n = WorkoutMath.performedSetCount(sets())
      return .object(["counted": .bool(n > 0), "setCount": .number(Double(n)),
                      "volume": .number(WorkoutMath.volume(of: sets()))])
    }
    return nil
  }

  @Test(arguments: ["rest-timer.json", "workout-state.json"])
  func goldenVectors(file: String) throws {
    let url = RepoPaths.specVectors.appendingPathComponent(file)
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    for c in try GoldenVectors.load(url, as: GoldenVector<JSONValue, JSONValue>.self) {
      guard let actual = run(c) else {
        Issue.record("\(file) \(c.rule): không có runner Swift cho luật này")
        continue
      }
      guard case .object(let expected) = c.expected else {
        Issue.record("\(c.rule): expected không phải object")
        continue
      }
      for (k, v) in expected {
        #expect(actual[k] == v, "\(c.rule).\(k): kỳ vọng \(v), ra \(String(describing: actual[k]))")
      }
    }
  }
}
