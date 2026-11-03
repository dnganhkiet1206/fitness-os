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

  @Test func koaCrouchesThenTrotsDownWithoutLoomingAtTheViewer() {
    let crouch = at(KoaPull.anticipate / 2)
    #expect(crouch.stretchY < 1 && crouch.stretchX > 1, "lấy đà")
    let running = at(KoaPull.anticipate + KoaPull.hopOff * 0.5)
    #expect(running.running && running.stretchY > 1, "giãn dài khi phóng lên")
    let near = at(KoaPull.runEnd)
    #expect(near.scale < 0.6 * 1.3, "không lao vào máy: vật to dần về phía mắt làm giật mình")
    #expect(running.expression != .tease && at(KoaPull.peekEnd).expression == .tease, "mặt thách đểu để dành lúc thò đầu")
    #expect(near.y > 912, "khuất dưới mép màn trước khi thò đầu lên")
  }

  @Test func eachBoundIsBiggerAndLandsSquashed() {
    let a = KoaPull.anticipate + KoaPull.hopOff
    let contact = at(a + 0.01)
    #expect(contact.stretchY < 1 && contact.stretchX > 1, "bẹp xuống lúc chạm đất")
    let scales = [a, a + KoaPull.strideOne, a + KoaPull.strideOne + KoaPull.strideTwo].map { at($0 + 0.001).scale }
    #expect(scales[0] < scales[1] && scales[1] < scales[2])
  }

  @Test func runStaysGentle() {
    #expect(at(KoaPull.runEnd - 0.01).stretchY < 1.1)
    #expect(KoaPull.runEnd > 1.5, "không vụt qua trong nháy mắt")
  }

  @Test func runHasFourKeyPosesEachStep() {
    #expect(KoaRun.bob(0.25) < KoaRun.bob(0) && KoaRun.bob(0) < KoaRun.bob(0.75), "khuỵu thấp nhất, bay cao nhất")
    let peak = KoaRun.pose(phase: 0.75, turn: 0.5)
    #expect(peak.left.lift > 0 && peak.right.lift > 0, "có quãng cả hai chân rời đất")
    let down = KoaRun.pose(phase: 0.1, turn: 0.5), next = KoaRun.pose(phase: 1.1, turn: 0.5)
    #expect(down.left.lift == 0 && next.right.lift == 0, "hai chân thay nhau chạm đất")
    #expect(down.armLeft * next.armLeft < 0, "tay đổi chiều theo từng bước")
  }

  @Test func earsAndHeadFollowTheBody() {
    let u = 0.75
    #expect(KoaRun.pose(phase: u, turn: 0).earLag != 0)
    #expect(abs(KoaRun.pose(phase: 0.35, turn: 0).earLag) < 0.01, "tai đi sau thân một nhịp")
  }

  @Test func runFollowsACurveNotAStraightLine() {
    let a = at(KoaPull.anticipate + KoaPull.hopOff + 0.01)
    let b = at(KoaPull.anticipate + KoaPull.hopOff + 0.5)
    #expect(b.x > 210 && a.x > 210, "lượn sang bên rồi mới vòng về giữa")
    #expect(at(KoaPull.runEnd).x == 210)
    #expect(a.walk != nil && at(KoaPull.peekEnd).walk == nil)
  }

  @Test func headFollowsTheCardEdge() {
    for t in stride(from: KoaPull.peekEnd, through: KoaPull.end, by: 0.02) {
      let edge = 912 - 560 * KoaPull.panel(at: t)
      #expect(abs(at(t).y - (edge - 44)) <= 10.5, "\(t)")
    }
  }

  @Test func teasingFaceKeepsItsEyesOpen() {
    let f = KoaFlags.flags(.tease, .idle)
    #expect(f["mouthTease"]?.truthy == true && f["eyesOpen"]?.truthy == true)
    #expect(f["lidsWink"]?.truthy == false, "nháy mắt làm mắt đóng mở liên tục")
  }
}
