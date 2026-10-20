@testable import ASCNDCore
import Foundation
import Testing

/// Tủ đồ vẽ lại (#527, Kiệt duyệt mock 19/10): cảnh app = cảnh RN + bản vẽ mới của
/// từng món đã vẽ lại (`tools/koa-wardrobe/build.py`).
struct KoaWardrobeTests {
  static func flagsUsed(_ nodes: [KoaScene.Node]) -> [String: Int] {
    var m: [String: Int] = [:]
    func walk(_ ns: [KoaScene.Node]) {
      for n in ns {
        if let c = n.cond { m[c, default: 0] += 1 }
        walk(n.kids ?? [])
      }
    }
    walk(nodes)
    return m
  }

  /// Mọi món của tủ đồ vẫn có hình trong cảnh app — không món nào mất khi vẽ lại.
  @Test func everyItemStillDraws() {
    let used = Self.flagsUsed(KoaScene.wardrobePayload.nodes)
    for (slot, ids) in KoaFlags.items {
      for id in ids { #expect(used["it_\(slot.rawValue)_\(id)", default: 0] > 0, "\(slot) \(id)") }
    }
  }

  /// Kính nằm TRONG nhóm mặt (theo đầu nghiêng / quay), không còn ở ngoài như RN.
  @Test func shadesFollowTheFace() {
    func find(_ ns: [KoaScene.Node], _ inFace: Bool) -> Bool? {
      for n in ns {
        let face = inFace || n.id == "FACE"
        if n.cond == "it_face_shades" { return face }
        if let r = find(n.kids ?? [], face) { return r }
      }
      return nil
    }
    #expect(find(KoaScene.wardrobePayload.nodes, false) == true)
    #expect(find(KoaScene.rnPayload.nodes, false) == false)
  }

  /// Tập tạ: hai tay đang cầm tạ — đồ cầm tay không vẽ.
  @Test func handItemsHideWhileLifting() {
    var o = KoaRender.Options()
    o.worn = [.hand: "bottle"]
    o.flat = true  // màu gốc, để tìm được màu thân bình
    o.pose = .lifting
    #expect(KoaRender.flags(o)["handFree"]?.truthy == false)
    let lifting = String(describing: KoaRender.figure(o))
    o.pose = .idle
    #expect(KoaRender.flags(o)["handFree"]?.truthy == true)
    let idle = String(describing: KoaRender.figure(o))
    #expect(idle.contains("#3FA9E5") && !lifting.contains("#3FA9E5"))
  }

  /// Bật `rn` thì đọc đúng cảnh RN; mặc định là cảnh app.
  @Test func rnSwitchSelectsTheRNScene() {
    #expect(KoaScene.nodes.count == KoaScene.wardrobePayload.nodes.count)
    let rn = KoaScene.$rn.withValue(true) { KoaScene.nodes.count }
    #expect(rn == KoaScene.rnPayload.nodes.count)
  }
}
