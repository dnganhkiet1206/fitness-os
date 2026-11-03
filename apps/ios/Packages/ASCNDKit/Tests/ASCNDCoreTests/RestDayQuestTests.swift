import Testing

@testable import ASCNDCore

@Suite struct RestDayQuestTests {
  /// Lỗi 03/11: đổi hôm nay thành ngày nghỉ thì có thêm "hồi phục" nhưng "tập luyện" vẫn còn (5 → 6).
  @Test func recoveryReplacesTheWorkoutOnARestDay() {
    func active(_ rest: Bool) -> [MascotRules.Quest] {
      MascotRules.dailyQuests.map(\.key).filter { MascotRules.counts($0, restDay: rest, stepsEverRecorded: true) }
    }
    #expect(active(false).contains(.workout) && !active(false).contains(.recovery))
    #expect(active(true).contains(.recovery) && !active(true).contains(.workout))
    #expect(active(true).count == active(false).count, "đổi một lấy một")
  }

  @Test func withoutStepsARestDayHasNoRecoveryQuest() {
    #expect(!MascotRules.counts(.recovery, restDay: true, stepsEverRecorded: false))
    #expect(!MascotRules.counts(.workout, restDay: true, stepsEverRecorded: false))
  }
}
