@testable import ASCNDCore
import Testing

/// Bảy nét mặt vẽ thêm cho cảnh sửa đồ / dọn bụi (Kiệt duyệt 06/11): mỗi mặt bật đúng mảnh của nó, chỉ có mặt khi
/// bật (bộ cờ của các mặt cũ không đổi), và vẽ ra được thật trong cảnh app.
struct KoaRepairFacesTests {
  static let faces: [(KoaFlags.Expression, [String])] = [
    (.yikes, ["eyesWide", "browRaised", "mouthYikes", "showSweat"]),
    (.focus, ["eyesOpen", "mouthTongue", "browFocus"]),
    (.pant, ["eyesArc", "browArc", "mouthPant", "showSweat"]),
    (.oof, ["eyesSqueeze", "mouthWince"]),
    (.oops, ["eyesWide", "browSad", "mouthWavy", "showSweat"]),
    (.dizzy, ["eyesSpiral", "mouthWavy"]),
  ]
  static let newFlags = ["mouthYikes", "mouthTongue", "browFocus", "mouthPant", "eyesSqueeze", "mouthWince", "mouthWavy",
    "eyesSpiral", "showSweat"]

  @Test func eachFaceTurnsOnItsParts() {
    for (e, on) in Self.faces {
      let f = KoaFlags.flags(e, .idle)
      for k in on { #expect(f[k]?.truthy == true, "\(e) phải bật \(k)") }
    }
  }

  @Test func oldFacesDoNotCarryTheNewFlags() {
    let added: Set<KoaFlags.Expression> = [.yikes, .focus, .pant, .oof, .oops, .dizzy]
    for e in KoaFlags.Expression.allCases where !added.contains(e) {
      let f = KoaFlags.flags(e, .idle)
      for k in Self.newFlags { #expect(f[k] == nil, "\(e) không được có cờ \(k)") }
    }
  }

  @Test func closedEyeFacesAreNotForcedToBlink() {
    #expect(KoaFlags.eyesClosed(.pant) && KoaFlags.eyesClosed(.oof) && KoaFlags.eyesClosed(.dizzy))
    #expect(!KoaFlags.eyesClosed(.focus) && !KoaFlags.eyesClosed(.yikes))
  }

  @Test func everyFaceHasADesignLabel() {
    for e in KoaFlags.Expression.allCases { #expect(KoaFlags.expressionLabel[e] != nil, "\(e) thiếu nhãn") }
  }

  /// Vẽ thật: mảnh mới có trong cây hình (màu lưỡi của mặt tập trung, nền trắng mắt xoắn ốc).
  @Test func facesDrawInTheAppScene() {
    func draws(_ e: KoaFlags.Expression, _ colour: String) -> Bool {
      var o = KoaRender.Options()
      o.expression = e; o.size = 240; o.live = true; o.flat = true; o.paper = true; o.t = 300
      func walk(_ el: KoaRender.Element) -> Bool {
        if case .string(let c)? = el.props["fill"], c == colour { return true }
        return el.kids.contains(where: walk)
      }
      return walk(KoaRender.figure(o))
    }
    #expect(draws(.focus, "#F08A9A"))
    #expect(draws(.yikes, "#9ED8FF"))
    #expect(!draws(.happy, "#F08A9A"))
  }
}
