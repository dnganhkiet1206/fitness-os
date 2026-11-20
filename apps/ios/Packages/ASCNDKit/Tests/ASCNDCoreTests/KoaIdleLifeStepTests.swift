@testable import ASCNDCore
import Testing

/// KOA-T12: dựng lại view ở cùng thời điểm không được tiến ánh nhìn / chớp mắt.
struct KoaIdleLifeStepTests {
  @Test func sameTimestampTwiceGivesTheSameStateAndOneStep() {
    var a = KoaIdleLife(seed: 7)
    var b = KoaIdleLife(seed: 7)
    var outs: [KoaGaze.Output] = []
    for f in 0..<600 {
      let ms = Double(f) * 1000 / 60
      let x = a.step(at: ms)
      // view dựng lại 3 lần cùng một khung
      #expect(a.step(at: ms) == x)
      #expect(a.step(at: ms) == x)
      outs.append(b.step(at: ms))
      #expect(x == outs.last)
    }
    #expect(a.steps == 600, "đúng một bước mỗi mốc khác nhau")
    #expect(a.steps == b.steps)
  }

  @Test func pauseForgetsTheCachedFrame() {
    var a = KoaIdleLife(seed: 3)
    _ = a.step(at: 1000)
    a.pause()
    _ = a.step(at: 1000)
    #expect(a.steps == 2, "sau pause, cùng mốc là một lượt chạy mới")
  }
}
