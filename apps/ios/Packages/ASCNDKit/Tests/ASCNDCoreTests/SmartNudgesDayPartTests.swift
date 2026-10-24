import Testing
@testable import ASCNDCore

/// 0 giờ mà khuyên uống nước là sai (chủ dự án 24/10).
struct SmartNudgesDayPartTests {
  typealias N = SmartNudges.Nudge
  static let water = N(type: "hydration", message: "Uống thêm nước", priority: .high)
  static let protein = N(type: "protein", message: "Thêm đạm", priority: .medium)
  static let sleep = N(type: "sleep", message: "Ngủ sớm", priority: .low)

  @Test func hoursMapToParts() {
    #expect(SmartNudges.DayPart(hour: 0) == .night)
    #expect(SmartNudges.DayPart(hour: 4) == .night)
    #expect(SmartNudges.DayPart(hour: 5) == .morning)
    #expect(SmartNudges.DayPart(hour: 12) == .day)
    #expect(SmartNudges.DayPart(hour: 19) == .evening)
    #expect(SmartNudges.DayPart(hour: 22) == .night)
  }

  @Test func midnightDropsWaterAndKeepsSleep() {
    let out = SmartNudges.fitting([Self.water, Self.protein, Self.sleep], hour: 0, lang: "vi")
    #expect(out == [Self.sleep])
  }

  @Test func midnightWithoutSleepAddsGoToBed() {
    let out = SmartNudges.fitting([Self.water], hour: 0, lang: "vi")
    #expect(out.count == 1)
    #expect(out.first?.type == "sleep")
    #expect(out.first?.priority == .high)
    #expect(SmartNudges.fitting([], hour: 0, lang: "vi").isEmpty)
  }

  @Test func daytimeKeepsEverything() {
    let all = [Self.water, Self.protein, Self.sleep]
    #expect(SmartNudges.fitting(all, hour: 9, lang: "vi") == all)
    #expect(SmartNudges.fitting(all, hour: 14, lang: "vi") == all)
  }
}
