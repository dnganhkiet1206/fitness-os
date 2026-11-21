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

  /// KOA-T48: chỉ đổi nét mặt (vui → mừng khi xu về, lịch "bơm" → tự hào) thì GIỮ hình — mặt có tween;
  /// đổi dáng / đồ thì đổi hình (mờ chéo), vì dáng chưa có tween.
  @Test func faceOnlyChangesKeepTheFigure() {
    #expect(TodayDayBlock.look(.idle) == TodayDayBlock.look(.celebrate))
    #expect(TodayDayBlock.look(.happy) == TodayDayBlock.look(.proud))
    #expect(TodayDayBlock.look(.idle) == TodayDayBlock.look(.worry))
  }

  @Test func poseOrOutfitChangesSwapTheFigure() {
    #expect(TodayDayBlock.look(.idle) != TodayDayBlock.look(.warmup))
    #expect(TodayDayBlock.look(.idle) != TodayDayBlock.look(.tired))
    #expect(TodayDayBlock.look(.idle) != TodayDayBlock.look(.rested))
    #expect(TodayDayBlock.look(.warmup) == TodayDayBlock.look(.curl))
  }
}
