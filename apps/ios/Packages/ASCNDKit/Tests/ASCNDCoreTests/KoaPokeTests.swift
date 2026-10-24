@testable import ASCNDCore
import Foundation
import Testing

/// Koa phản ứng khi chạm / nhìn theo ngón tay (23/10): chỉ thêm ma trận quanh các
/// lớp, không đổi bản vẽ; hết phản ứng thì cây y như trước.
struct KoaPokeTests {
  static func apply(_ m: KoaMath.Mat, _ x: Double, _ y: Double) -> (Double, Double) {
    (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
  }

  @Test func hopRisesAndLandsOnItsFeet() throws {
    #expect(KoaMath.hopMat(-1) == nil)
    #expect(KoaMath.hopMat(KoaMath.hopDur) == nil)
    let start = try #require(KoaMath.hopMat(0))
    #expect(start == KoaMath.identity)
    // đỉnh: lên 18, chân vẫn ở giữa
    let top = try #require(KoaMath.hopMat(0.45 * KoaMath.hopDur))
    let (fx, fy) = Self.apply(top, 120, 294)
    #expect(abs(fx - 120) < 1e-9 && abs(fy - (294 - 18)) < 1e-9)
    #expect(abs(KoaMath.hopRise(0.45 * KoaMath.hopDur) - 1) < 1e-9)
    // nén: rộng ra, thấp xuống, chân không trượt
    let squash = try #require(KoaMath.hopMat(0.18 * KoaMath.hopDur))
    #expect(squash[0] > 1 && squash[3] < 1)
    let (sx, sy) = Self.apply(squash, 120, 294)
    #expect(abs(sx - 120) < 1e-9 && abs(sy - 294) < 1e-9)
    #expect(KoaMath.hopRise(0.18 * KoaMath.hopDur) == 0)
  }

  @Test func earsFlickMirrored() throws {
    #expect(KoaMath.earMat(left: true, 0) == nil)
    let ms = KoaMath.earDelay + 0.35 * KoaMath.earDur
    let l = try #require(KoaMath.earMat(left: true, ms))
    let r = try #require(KoaMath.earMat(left: false, ms))
    // góc ngược dấu, cùng độ lớn (14°)
    #expect(abs(atan2(l[1], l[0]) * 180 / .pi + 14) < 1e-9)
    #expect(abs(atan2(r[1], r[0]) * 180 / .pi - 14) < 1e-9)
    #expect(KoaMath.earMat(left: false, KoaMath.earDelay + KoaMath.earDur) == nil)
  }

  @Test func browsRiseByCondOnly() {
    let held = KoaMath.Poke(lift: 1)
    for cond in KoaMath.browConds {
      #expect(KoaMath.pokeMat(id: nil, cond: cond, held) == [1, 0, 0, 1, 0, -KoaMath.browRise])
    }
    #expect(KoaMath.pokeMat(id: nil, cond: "mouthSmile", held) == nil)
    #expect(KoaMath.pokeMat(id: nil, cond: "browArc", KoaMath.Poke()) == nil)
    #expect(KoaMath.browLift(0.2 * KoaMath.hopDur) == 1)
    #expect(KoaMath.browLift(KoaMath.hopDur) == 0)
  }

  @Test func idlePokeKeepsTheFigure() {
    var o = KoaRender.Options()
    let base = KoaRender.figure(o)
    o.poke = KoaMath.Poke()
    #expect(KoaRender.figure(o) == base)
    o.poke = KoaMath.Poke(ms: KoaMath.hopDur + 1)
    #expect(KoaRender.figure(o) == base)
    // đứng yên (`live: false`) thì không phản ứng
    o.poke = KoaMath.Poke(ms: 400, lift: 1)
    o.live = false
    var still = KoaRender.Options()
    still.live = false
    #expect(KoaRender.figure(o) == KoaRender.figure(still))
  }

  @Test func pokeWrapsTheRigs() {
    var o = KoaRender.Options()
    o.poke = KoaMath.Poke(ms: 0.45 * KoaMath.hopDur)
    let tree = String(describing: KoaRender.figure(o))
    let hop = KoaMath.hopMat(0.45 * KoaMath.hopDur)!
    #expect(tree.contains(String(describing: hop)))
    #expect(KoaRender.figure(o) != KoaRender.figure(KoaRender.Options()))
  }

  /// Nhìn theo ngón tay: đầu và mắt như cái liếc, nhưng miệng giữ nguyên.
  @Test func lookTurnsHeadWithoutSwappingTheMouth() {
    let g = KoaMath.Gaze(x: 0.8, y: -0.3, k: 1)
    var looked = KoaRender.Options()
    looked.look = g
    var glanced = KoaRender.Options()
    glanced.gaze = g
    let a = String(describing: KoaRender.figure(looked))
    let b = String(describing: KoaRender.figure(glanced))
    let head = String(describing: KoaMath.headMat(g))
    #expect(a.contains(head) && b.contains(head))
    #expect(!a.contains(KoaMath.smilePath))
    #expect(b.contains(KoaMath.smilePath))
  }
}

/// Tai và mi của Koa lớn (23/10, Kiệt: tai cử động được, chớp mắt đẹp như bản web).
struct KoaEarLashTests {
  @Test func earsTwitchOneAtATime() {
    let mid = KoaMath.twitchAt + 0.3 * KoaMath.twitchDur
    #expect(abs(KoaMath.twitch(left: true, mid) - 9) < 1e-9)
    #expect(KoaMath.twitch(left: false, mid) == 0)
    // vòng sau đến tai phải
    #expect(abs(KoaMath.twitch(left: false, mid + KoaMath.twitchPeriod) - 9) < 1e-9)
    #expect(KoaMath.twitch(left: true, mid + KoaMath.twitchPeriod) == 0)
    #expect(KoaMath.twitch(left: true, 0) == 0)
  }

  @Test func innerEarFollowsOuterIdle() throws {
    let p = KoaMath.Poke()
    let t = 0.45 * 3600
    let inner = try #require(KoaMath.earMat(left: true, inner: true, p, t: t))
    let track = try #require(KoaScene.keyframes["koaEarL"]?.tf)
    #expect(inner == KoaMath.sampleMat(track, 0.45, "io", 62, 92))
    #expect(KoaMath.earMat(left: true, inner: false, p, t: t) == nil)
  }

  @Test func earsLeanTowardTheLook() throws {
    let p = KoaMath.Poke(lean: 1)
    let l = try #require(KoaMath.earMat(left: true, inner: false, p, t: 0))
    let r = try #require(KoaMath.earMat(left: false, inner: false, p, t: 0))
    #expect(abs(atan2(l[1], l[0]) * 180 / .pi - KoaMath.earLean) < 1e-9)
    #expect(abs(atan2(r[1], r[0]) * 180 / .pi - KoaMath.earLean) < 1e-9)
  }

  @Test func lashShowsOnlyWhenTheLidIsDown() {
    #expect(KoaMath.lashOpacity(0) == 0)
    #expect(KoaMath.lashOpacity(1) == 1)
    var o = KoaRender.Options()
    o.poke = KoaMath.Poke()
    // koaBlink khép hẳn ở 93,5–95,5% của 5,2 s
    o.t = 0.95 * 5200
    let closed = String(describing: KoaRender.figure(o))
    #expect(closed.contains(KoaMath.lashPaths[0]))
    o.t = 0.5 * 5200
    #expect(!String(describing: KoaRender.figure(o)).contains(KoaMath.lashPaths[0]))
    // Koa nhỏ (không `poke`) giữ cú chớp gốc
    o.poke = nil
    o.t = 0.95 * 5200
    #expect(!String(describing: KoaRender.figure(o)).contains(KoaMath.lashPaths[0]))
  }
}
