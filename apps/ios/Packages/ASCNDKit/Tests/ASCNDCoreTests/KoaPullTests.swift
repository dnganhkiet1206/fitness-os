import Testing

@testable import ASCNDCore

@Suite struct KoaPullTests {
  private func at(_ t: Double) -> KoaPull.Shot {
    KoaPull.shot(at: t, start: (x: 210, y: 380, scale: 0.6), width: 420, height: 912, panelHeight: 560)
  }

  @Test func headComesUpBeforeTheCardMoves() {
    #expect(KoaPull.panel(at: KoaPull.duckEnd + KoaPull.peek - 0.01) == 0)
    #expect(at(KoaPull.peekEnd).y < 912, "Koa đã thò đầu lên")
    #expect(at(KoaPull.peekEnd).hands)
    #expect(KoaPull.panel(at: KoaPull.peekEnd + 0.1) > 0)
  }

  @Test func cardRisesInTwoTugsOvershootsThenSettles() {
    #expect(abs(KoaPull.panel(at: KoaPull.tugOneEnd) - 0.5) < 0.01)
    #expect(KoaPull.panel(at: KoaPull.tugOneEnd + KoaPull.breath / 2) < 0.5, "thả lỏng giữa hai nhịp")
    #expect(KoaPull.panel(at: KoaPull.tugTwoEnd) > 1)
    #expect(abs(KoaPull.panel(at: KoaPull.end) - 1) < 0.001)
  }

  @Test func koaCrouchesThenRunsTowardTheCameraAndLeavesTheFrame() {
    let crouch = at(KoaPull.anticipate / 2)
    #expect(crouch.stretchY < 1 && crouch.stretchX > 1, "lấy đà")
    let running = at(KoaPull.anticipate + KoaPull.run * 0.5)
    #expect(running.running && running.stretchY > 1, "giãn dài khi lao đi")
    let near = at(KoaPull.runEnd)
    #expect(near.scale > 1.2, "to dần về phía máy")
    #expect(near.y > 912, "khuất dưới mép màn trước khi thò đầu lên")
  }

  @Test func headFollowsTheCardEdge() {
    for t in stride(from: KoaPull.peekEnd, through: KoaPull.end, by: 0.02) {
      let edge = 912 - 560 * KoaPull.panel(at: t)
      #expect(abs(at(t).y - (edge - 44)) <= 10.5, "\(t)")
    }
  }

  @Test func teasingFaceWinks() {
    let f = KoaFlags.flags(.tease, .idle)
    #expect(f["mouthTease"]?.truthy == true && f["lidsWink"]?.truthy == true)
  }
}
