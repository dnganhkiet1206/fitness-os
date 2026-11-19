@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T10: đệm kế hoạch vẽ của hình Koa theo `Options` đầy đủ.
@Suite(.serialized)
struct KoaFigurePlansTests {
  @Test func sameOptionsHitAndGiveTheIdenticalPlan() {
    KoaFigurePlans.reset()
    var o = KoaRender.Options()
    o.t = 1234
    let direct = KoaPaint.plan(KoaRender.figure(o))
    let first = KoaFigurePlans.plan(o)
    let second = KoaFigurePlans.plan(o)
    #expect(first == direct, "đệm không được đổi hình")
    #expect(second == direct)
    #expect(KoaFigurePlans.misses == 1 && KoaFigurePlans.hits == 1)
  }

  @Test func anyChangedOptionMisses() {
    KoaFigurePlans.reset()
    var o = KoaRender.Options()
    _ = KoaFigurePlans.plan(o)
    o.t += 16
    _ = KoaFigurePlans.plan(o)
    o.expression = .sad
    let p = KoaFigurePlans.plan(o)
    #expect(KoaFigurePlans.misses == 3 && KoaFigurePlans.hits == 0)
    #expect(p == KoaPaint.plan(KoaRender.figure(o)))
  }

  @Test func boundedOldestOut() {
    KoaFigurePlans.reset()
    var o = KoaRender.Options()
    for f in 0..<(KoaFigurePlans.capacity + 20) {
      o.t = Double(f) * 16
      _ = KoaFigurePlans.plan(o)
    }
    #expect(KoaFigurePlans.count == KoaFigurePlans.capacity)
    o.t = Double(KoaFigurePlans.capacity + 19) * 16
    _ = KoaFigurePlans.plan(o)
    #expect(KoaFigurePlans.hits == 1, "mục mới nhất còn")
    o.t = 0
    _ = KoaFigurePlans.plan(o)
    #expect(KoaFigurePlans.hits == 1, "mục cũ nhất đã bị bỏ")
  }

  /// Số đo (in ra): 120 lần dựng cùng một khung — trực tiếp vs qua đệm.
  @Test func measureStaticFrame() {
    KoaFigurePlans.reset()
    var o = KoaRender.Options()
    o.t = 500
    let n = 120
    let c = ContinuousClock()
    let direct = c.measure { for _ in 0..<n { _ = KoaPaint.plan(KoaRender.figure(o)) } }
    let cached = c.measure { for _ in 0..<n { _ = KoaFigurePlans.plan(o) } }
    print("[KOA-T10] \(n) lần cùng khung: trực tiếp \(direct) (\(direct / n)/lần), đệm \(cached) (\(cached / n)/lần)")
    #expect(cached < direct)
  }
}
