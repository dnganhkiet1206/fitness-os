@testable import ASCNDCore
import Testing

/// KOA-T15: mốc rung lấy từ kịch bản đã duyệt; một mốc mỗi thời điểm; không rung bù; tôn trọng
/// Giảm chuyển động.
struct KoaHapticsTests {
  @Test func restGoBeatHasASuccessHaptic() {
    let marks = KoaHaptics.marks(KoaPerformance.cues(.restGo))
    #expect(marks.contains { $0.haptic == .success }, "nhịp 'LƯỢT MÌNH!' phải rung")
  }

  @Test func everyScriptedHapticBecomesAMarkInOrder() {
    for scene in KoaReaction.Scene.allCases {
      let cues = KoaPerformance.cues(scene)
      let marks = KoaHaptics.marks(cues)
      #expect(marks.map(\.t) == marks.map(\.t).sorted(), "\(scene)")
      #expect(Set(marks.map(\.t)) == Set(cues.filter { $0.haptic != .none }.map(\.from)), "\(scene)")
    }
  }

  @Test func oneMarkPerMomentStrongestWins() {
    let cues = [
      KoaPerformance.Cue(100, 200, haptic: .soft), KoaPerformance.Cue(100, 300, haptic: .success),
      KoaPerformance.Cue(500, 600, haptic: .none),
    ]
    #expect(KoaHaptics.marks(cues) == [KoaHaptics.Mark(t: 100, haptic: .success)])
  }

  @Test func dueFiresOnceAndNeverCatchesUp() {
    let marks = [KoaHaptics.Mark(t: 1000, haptic: .soft), KoaHaptics.Mark(t: 3000, haptic: .success)]
    #expect(KoaHaptics.due(marks, at: 999, fired: []).isEmpty)
    #expect(KoaHaptics.due(marks, at: 1010, fired: []) == [marks[0]])
    #expect(KoaHaptics.due(marks, at: 1020, fired: [1000]).isEmpty, "đã phát thì thôi")
    #expect(KoaHaptics.due(marks, at: 3600, fired: [1000]).isEmpty, "mở lại giữa chừng: không rung bù mốc cũ")
  }

  @Test func reduceMotionSilencesBeats() {
    #expect(KoaHaptics.allowed(reduceMotion: false))
    #expect(!KoaHaptics.allowed(reduceMotion: true))
  }
}
