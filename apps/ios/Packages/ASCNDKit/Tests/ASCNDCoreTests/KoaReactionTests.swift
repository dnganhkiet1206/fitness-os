@testable import ASCNDCore
import Foundation
import Testing

/// Koa phản ứng toàn màn hình (05/11): storyboard dữ liệu của ba cảnh.
struct KoaReactionTests {
  @Test func scenesHaveTheAgreedLengths() {
    #expect(KoaReaction.duration(.set) <= 2600, "ghi set lặp lại mỗi set: ngắn nhất")
    #expect((3500...4500).contains(KoaReaction.duration(.record)))
    #expect((5500...6500).contains(KoaReaction.duration(.done)))
  }

  @Test func timelineWalksShotsInOrderAndHoldsTheLast() {
    let s = KoaReaction.shots(.set)
    #expect(KoaReaction.at(.set, 0).index == 0)
    #expect(KoaReaction.at(.set, s[0].ms + 1).index == 1)
    let end = KoaReaction.at(.set, KoaReaction.duration(.set) + 500)
    #expect(end.index == s.count - 1 && end.progress == 1)
  }

  @Test func usesOnlyPosesAndFacesTheAppDraws() {
    for scene in KoaReaction.Scene.allCases {
      for shot in KoaReaction.shots(scene) {
        // cảnh dùng dáng đã vẽ (đứng, cầm tạ, ngồi) hoặc dáng biểu cảm có sẵn
        #expect([.idle, .lifting, .relaxing].contains(shot.pose), "\(scene) \(shot.label)")
        #expect(KoaFlags.expressionLabel[shot.expression] != nil)
      }
    }
    #expect(KoaReaction.shots(.set).last?.motion == .intoRing, "ghi set kết thúc trong vòng đồng hồ nghỉ")
  }

  @Test func jumpAnticipatesFliesAndLands() {
    #expect(KoaReaction.body(.jump, 0.1).sy < 1, "nhún lấy đà")
    #expect(KoaReaction.body(.jump, 0.35).dy < -0.15, "bay lên")
    #expect(KoaReaction.body(.jump, 0.62).sy < 1, "tiếp đất nén")
    #expect(KoaReaction.body(.jump, 0.9) == (0, 1, 1))
  }
}
