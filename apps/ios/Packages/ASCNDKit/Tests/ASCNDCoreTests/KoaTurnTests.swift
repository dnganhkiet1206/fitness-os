@testable import ASCNDCore
import Foundation
import Testing

/// Koa V2, quay mặt 2.5D (05/11): mảng nhỏ trượt theo độ sâu, dáng đầu / thân giữ nguyên, RN không đổi.
struct KoaTurnTests {
  static func options(turn: Double?) -> KoaRender.Options {
    var o = KoaRender.Options()
    o.t = 1234
    o.turn = turn
    return o
  }

  /// Vị trí thật (khung 240 × 300) của các mốc chạm ở một góc quay.
  static func anchors(_ turn: Double) -> [String: (x: Double, y: Double)] {
    KoaRender.anchors(options(turn: turn))
  }

  @Test func centreOfPathBoxes() {
    let foot = KoaTurn.bboxCentre(
      "M104 252 C 114 254 117 268 117 279 C 117 288 111 293 100 293 C 88 293 78 292 74 287 C 70 281 71 268 77 260 Z")
    #expect(foot.map { abs($0.x - 93.5) < 0.01 && abs($0.y - 272.5) < 0.01 } == true)
    // cung: chỉ lấy điểm cuối, không lấy bán kính / cờ
    let lid = KoaTurn.bboxCentre("M64 88 A18 23.5 0 0 1 100 88 Z")
    #expect(lid.map { $0.x == 82 && $0.y == 88 } == true)
    #expect(KoaTurn.bboxCentre("M10-5L20-15").map { $0.x == 15 && $0.y == -10 } == true, "dấu trừ dính số")
    #expect(KoaTurn.bboxCentre("") == nil)
    #expect(KoaTurn.isBox("M99 38 L141 38 L141 66 L99 66 Z"), "miếng che dưới chỏm lông")
    #expect(KoaTurn.anchor("path", ["d": .string("M99 38 L141 38 L141 66 L99 66 Z")]) == nil, "miếng che đứng yên")
    #expect(!KoaTurn.isBox("M120 126 L120 130"))
  }

  @Test func noTurnDrawsExactlyAsBefore() {
    #expect(KoaRender.figure(Self.options(turn: 0)) == KoaRender.figure(Self.options(turn: nil)))
  }

  @Test func faceSlidesTheWayOfTheTurnAndEarsDriftBack() {
    let move = KoaTurn.move(.face, x: 120, y: 105, u: 1)
    guard case .mat(let nose) = move else { Issue.record("mũi phải trượt"); return }
    #expect(nose[4] > 30, "mũi (nhô ra) trượt sang phải nhiều")
    guard case .mat(let farEye) = KoaTurn.move(.face, x: 158, y: 96, u: 1),
      case .mat(let nearEye) = KoaTurn.move(.face, x: 82, y: 96, u: 1)
    else { Issue.record("hai mắt phải trượt"); return }
    #expect(farEye[0] < 1 && nearEye[0] > farEye[0], "mắt phía xa hẹp lại")
    guard case .mat(let ear) = KoaTurn.move(.ears, x: 54, y: 60, u: 1) else { Issue.record("tai phải dời"); return }
    #expect(ear[0] * 54 + ear[4] < 54, "tai lùi về phía ngược hướng quay")
    #expect(KoaTurn.move(.arms, x: 78, y: 200, u: 0) == .keep)
  }

  @Test func touchPointsFollowTheTurn() {
    let straight = Self.anchors(0), turned = Self.anchors(1), back = Self.anchors(-1)
    let nose0 = straight["nose"]?.x ?? 0
    #expect((turned["nose"]?.x ?? 0) > nose0 + 20)
    #expect((back["nose"]?.x ?? 0) < nose0 - 20)
    let headMove = (turned["head_front"]?.x ?? 0) - (straight["head_front"]?.x ?? 0)
    #expect(headMove > 0 && headMove < 6, "đầu chỉ ngoảnh nhẹ theo, mặt trượt nhiều hơn")
  }

  @Test func walkingTurnsTheFaceNativelyAndRNKeepsItsShift() {
    var o = Self.options(turn: nil)
    var p = KoaWalk.Pose()
    p.turn = 0.5
    o.walk = p
    #expect((KoaRender.flags(o)["faceShift"]?.text ?? "") == "", "native: không dời cả mặt, `KoaTurn` lo")
    #expect(KoaRender.context(o, KoaRender.flags(o)).turn == 0.5)
    #expect(KoaScene.$rn.withValue(true) { KoaRender.flags(o)["faceShift"]?.text } == "translate(7.000,0)")
  }

  @Test func rnIgnoresTheTurn() {
    let a = KoaScene.$rn.withValue(true) { KoaRender.figure(Self.options(turn: 1)) }
    let b = KoaScene.$rn.withValue(true) { KoaRender.figure(Self.options(turn: nil)) }
    #expect(a == b)
  }

  @Test func lookingAtAFingerTurnsTheHeadALittle() {
    var o = Self.options(turn: nil)
    o.look = KoaMath.Gaze(x: 1, y: 0, k: 1)
    #expect(abs(KoaRender.context(o, KoaRender.flags(o)).turn - KoaTurn.gazeGain) < 1e-9)
    o.dress = true
    #expect(KoaRender.context(o, KoaRender.flags(o)).turn == 0, "thử đồ: không quay")
  }
}

extension KoaTurnTests {
  static func count(_ e: KoaRender.Element, _ pred: (KoaRender.Element) -> Bool) -> Int {
    (pred(e) ? 1 : 0) + e.kids.reduce(0) { $0 + count($1, pred) }
  }

  @Test func translateMovesOnlyXCoordinates() {
    #expect(KoaTurn.translate("M10 20 L30 40 Z", dx: 5) == "M15.00 20.00 L35.00 40.00 Z")
    #expect(KoaTurn.translate("M0 0 A18 23.5 0 0 1 100 88", dx: 2)?.contains("102.00 88.00") == true, "cung: chỉ dời điểm cuối")
    #expect(KoaTurn.translate("M0 0 X1", dx: 1) == nil)
  }

  @Test func turningAddsFarSideShadeAndLeansTheHead() {
    let flat = KoaRender.figure(Self.options(turn: 0)), turned = KoaRender.figure(Self.options(turn: 0.8))
    let clips = { (e: KoaRender.Element) in Self.count(e) { $0.tag == "ClipPath" && $0.props["id"]?.text.hasPrefix("koaTurn_") == true } }
    #expect(clips(flat) == 0)
    #expect(clips(turned) == 2, "bóng phía khuất cho đầu và thân")
    let lean = KoaTurn.headMat(1)
    #expect(lean[2] > 0 && lean[0] == 1, "nghiêng ngang: hàm đi theo nhiều hơn đỉnh đầu")
  }

  @Test func farArmDrawsBehindTheBody() {
    // mỗi tay vẽ đúng một lần khi quay, dù tách ra hai chỗ
    let turned = KoaRender.figure(Self.options(turn: 0.8))
    let arms = Self.count(turned) { $0.tag == "Path" && $0.props["d"]?.text.hasPrefix("M68 171") == true }
    let armsStraight = Self.count(KoaRender.figure(Self.options(turn: 0))) { $0.tag == "Path" && $0.props["d"]?.text.hasPrefix("M68 171") == true }
    #expect(arms == armsStraight)
  }
}
