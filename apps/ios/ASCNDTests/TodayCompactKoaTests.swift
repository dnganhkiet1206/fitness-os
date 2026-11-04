import ASCNDCore
import Testing

@testable import ASCND

/// Koa nhỏ ở đầu Hôm nay không cau có (#802, 04/11).
@MainActor
@Suite struct TodayCompactKoaTests {
  @Test func compactKoaShowsNoFrown() {
    for e: KoaEmotion.Emotion in [.sad, .tired, .worry, .oops, .warmup] {
      #expect(TodayDayBlock.compactEmotion(e) == .idle, "\(e)")
    }
  }

  @Test func compactKoaKeepsHappyFaces() {
    for e: KoaEmotion.Emotion in [.idle, .happy, .celebrate, .proud, .rested, .sleep, .curl, .hat, .coat] {
      #expect(TodayDayBlock.compactEmotion(e) == e, "\(e)")
    }
  }
}
