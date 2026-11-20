@testable import ASCNDCore
import Testing

/// KOA-T14: mặt và câu của Koa ở Hôm nay không nói ngược nhau; Hôm nay gọn giữ mặt mệt / lo.
struct KoaTodayCoherenceTests {
  @Test func noPraiseWhileKoaLooksTiredOrWorried() {
    for e in [KoaEmotion.Emotion.tired, .worry, .sad, .oops] {
      #expect(MascotLine.coherent(.praise, with: e) == .silent, "\(e)")
    }
    for e in [KoaEmotion.Emotion.happy, .proud, .idle, .celebrate] {
      #expect(MascotLine.coherent(.praise, with: e) == .praise, "\(e)")
    }
  }

  @Test func askingTheNextThingFitsEveryFace() {
    for e in KoaEmotion.Emotion.allCases {
      #expect(MascotLine.coherent(.ask(.water), with: e) == .ask(.water))
      #expect(MascotLine.coherent(.silent, with: e) == .silent)
    }
  }
}
