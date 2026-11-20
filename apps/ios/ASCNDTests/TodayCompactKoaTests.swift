import ASCNDCore
import Testing

@testable import ASCND

/// Koa nhỏ ở đầu Hôm nay không cau có (#802, 04/11) — trừ mệt / lo, Kiệt chọn hiện (20/11, KOA-T14).
@MainActor
@Suite struct TodayCompactKoaTests {
  @Test func compactKoaShowsNoFrown() {
    for e: KoaEmotion.Emotion in [.sad, .oops, .warmup] {
      #expect(TodayDayBlock.compactEmotion(e) == .idle, "\(e)")
    }
  }

  @Test func compactKoaKeepsHappyFaces() {
    for e: KoaEmotion.Emotion in [.idle, .happy, .celebrate, .proud, .rested, .sleep, .curl, .hat, .coat, .tired, .worry] {
      #expect(TodayDayBlock.compactEmotion(e) == e, "\(e)")
    }
  }
}
