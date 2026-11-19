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

  @Test func compactKeepsInformativeFaces() {
    #expect(KoaEmotion.compact(.tired) == .tired)
    #expect(KoaEmotion.compact(.worry) == .worry)
    #expect(KoaEmotion.compact(.sad) == .idle)
    #expect(KoaEmotion.compact(.oops) == .idle)
    #expect(KoaEmotion.compact(.warmup) == .idle)
    #expect(KoaEmotion.compact(.proud) == .proud)
  }
}
