import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// KOA-T48: chạm dồn ra một câu, chờ cảnh Koa có hạn và dừng khi bị huỷ.
@MainActor
@Suite struct KoaAnimationLifecycleTests {
  /// Hai cú chạm cách nhau ~0 ms (dưới 110 ms của nhịp chớp mắt): chỉ cú sau được nói.
  @Test func rapidTapsYieldOneSpeech() async throws {
    let d = KoaDirectorDriver()
    d.lineOf = { _ in "Koa says hi" }
    d.tapped(.belly)
    d.tapped(.nose)
    try await Task.sleep(for: .milliseconds(400))
    #expect(d.tapTalks == 1)
    #expect(d.speech != nil)
  }

  /// Hai cú chạm cách nhau quá nhịp: hai câu (không gộp nhầm chạm thật).
  @Test func spacedTapsEachSpeak() async throws {
    let d = KoaDirectorDriver()
    d.lineOf = { _ in "Koa says hi" }
    d.tapped(.belly)
    try await Task.sleep(for: .milliseconds(300))
    d.tapped(.nose)
    try await Task.sleep(for: .milliseconds(300))
    #expect(d.tapTalks == 2)
  }

  @Test func waitIdleReturnsWhenTheSceneEnds() async {
    var left = 3
    let idle = await KoaReactionGate.waitIdle(lead: .zero, poll: .milliseconds(5), timeout: .seconds(5)) {
      left -= 1
      return left > 0
    }
    #expect(idle)
  }

  /// Cảnh kẹt `playing`: không giữ hộp xin quyền mãi.
  @Test func waitIdleTimesOut() async {
    let start = ContinuousClock.now
    let idle = await KoaReactionGate.waitIdle(lead: .zero, poll: .milliseconds(10), timeout: .milliseconds(100)) { true }
    #expect(!idle)
    #expect(ContinuousClock.now - start < .seconds(2))
  }

  @Test func waitIdleStopsWhenCancelled() async {
    let task = Task { @MainActor in
      await KoaReactionGate.waitIdle(lead: .zero, poll: .milliseconds(10), timeout: .seconds(60)) { true }
    }
    try? await Task.sleep(for: .milliseconds(50))
    task.cancel()
    let idle = await task.value
    #expect(!idle)
  }
}
