import XCTest

@testable import ASCNDCore

/// Nhịp từng rep (C1, review #943): chọn pha hiện trên dải, rep, cỡ chấm thở. Dữ liệu = curl thật
/// (`dumbbell-curl/tempo.json`, 2 rep, bắt đầu từ đáy).
final class ExerciseTempoTests: XCTestCase {
  private let curl = ExerciseTempo(
    durationMs: 9800, reps: 2,
    phases: [
      .init(rep: 1, kind: "concentric", startMs: 600, endMs: 2200, breath: "exhale"),
      .init(rep: 1, kind: "top_hold", startMs: 2200, endMs: 2600, breath: "hold"),
      .init(rep: 1, kind: "eccentric", startMs: 2600, endMs: 4800, breath: "inhale"),
      .init(rep: 1, kind: "bottom_hold", startMs: 4800, endMs: 5200, breath: "hold"),
      .init(rep: 2, kind: "concentric", startMs: 5200, endMs: 6800, breath: "exhale"),
      .init(rep: 2, kind: "top_hold", startMs: 6800, endMs: 7200, breath: "hold"),
      .init(rep: 2, kind: "eccentric", startMs: 7200, endMs: 9400, breath: "inhale"),
    ])

  func testPhaseAtMs() {
    XCTAssertNil(curl.phase(at: 0), "đoạn chuẩn bị đầu clip")
    XCTAssertEqual(curl.phase(at: 600)?.kind, "concentric")
    XCTAssertEqual(curl.phase(at: 2300)?.kind, "top_hold")
    XCTAssertNil(curl.phase(at: 9500), "nghỉ cuối clip")
  }

  func testStartOfClipShowsUpcomingLongPhase() {
    XCTAssertEqual(curl.labelPhase(at: 0)?.kind, "concentric")
    XCTAssertEqual(curl.labelPhase(at: 0)?.rep, 1)
  }

  func testShortHoldKeepsPreviousLabel() {
    // Giữ đỉnh 0,4 s: chữ vẫn là Nâng, không nháy "Giữ".
    XCTAssertEqual(curl.labelPhase(at: 2300)?.kind, "concentric")
    XCTAssertEqual(curl.labelPhase(at: 2600)?.kind, "eccentric")
    // Giữ đáy giữa hai rep: vẫn là Hạ của rep 1.
    XCTAssertEqual(curl.labelPhase(at: 5000)?.kind, "eccentric")
    XCTAssertEqual(curl.labelPhase(at: 5000)?.rep, 1)
    XCTAssertEqual(curl.labelPhase(at: 5200)?.rep, 2)
  }

  func testLabelOnlyAlternatesLiftAndLower() {
    var kinds: [String] = []
    for ms in stride(from: 0.0, to: 9800, by: 50) {
      guard let k = curl.labelPhase(at: ms)?.kind else { continue }
      if kinds.last != k { kinds.append(k) }
    }
    XCTAssertEqual(kinds, ["concentric", "eccentric", "concentric", "eccentric"])
  }

  func testEndOfClipKeepsLastLongPhase() {
    XCTAssertEqual(curl.labelPhase(at: 9600)?.kind, "eccentric")
    XCTAssertEqual(curl.rep(at: 9600), 2)
  }

  func testRep() {
    XCTAssertEqual(curl.rep(at: 0), 1)
    XCTAssertEqual(curl.rep(at: 4000), 1)
    XCTAssertEqual(curl.rep(at: 6000), 2)
  }

  func testBreathScale() {
    XCTAssertEqual(curl.breathScale(at: 0), 1, accuracy: 1e-9, "chuẩn bị: giữ cỡ đầu pha thở ra (phồng)")
    XCTAssertEqual(curl.breathScale(at: 9600), 1, accuracy: 1e-9, "nghỉ cuối: giữ cỡ cuối pha hít vào")
    XCTAssertEqual(curl.breathScale(at: 600), 1, accuracy: 1e-9, "thở ra bắt đầu từ phồng")
    XCTAssertEqual(curl.breathScale(at: 2199.9), 0.55, accuracy: 1e-3, "thở ra xong: xẹp")
    XCTAssertEqual(curl.breathScale(at: 2600), 0.55, accuracy: 1e-9, "hít vào bắt đầu từ xẹp")
    XCTAssertEqual(curl.breathScale(at: 4799.9), 1, accuracy: 1e-3, "hít vào xong: phồng")
    XCTAssertEqual(curl.breathScale(at: 5000), 1, accuracy: 1e-9, "giữ đáy: phồng")
    XCTAssertEqual(curl.breathScale(at: 2400), 0.55, accuracy: 1e-9, "giữ đỉnh: xẹp")
    // Liền: không nhảy giữa hai mẫu gần nhau.
    for ms in stride(from: 0.0, to: 9800, by: 10) {
      XCTAssertLessThan(abs(curl.breathScale(at: ms + 10) - curl.breathScale(at: ms)), 0.05, "\(ms)")
    }
  }

  func testEmptyTempo() {
    let t = ExerciseTempo(durationMs: 1000, reps: 0, phases: [])
    XCTAssertNil(t.labelPhase(at: 500))
    XCTAssertEqual(t.rep(at: 500), 1)
    XCTAssertEqual(t.breathScale(at: 500), 0.55, accuracy: 1e-9)
  }
}
