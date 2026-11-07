@testable import ASCNDCore
import Testing

struct KoaBreakageTests {
  typealias B = KoaBreakage
  static let today = LocalDate("2026-11-06")!
  static let all: Set<B.Habit> = [.water, .meal, .sleep]

  /// Lịch sử n ngày qua, mỗi ngày các thói quen `f(k)` (k = 1 là hôm qua).
  static func history(_ days: Int, from day: LocalDate = today, _ f: (Int) -> Set<B.Habit>) -> [LocalDate: Set<B.Habit>] {
    var h: [LocalDate: Set<B.Habit>] = [:]
    for k in 1...days { h[day.adding(days: -k)] = f(k) }
    return h
  }
  static let noTraining: @Sendable (LocalDate) -> Bool = { _ in false }

  @Test func ratioCountsOnlyPastDaysAndExpectedHabits() throws {
    let full = Self.history(7) { _ in Self.all }
    #expect(B.ratio(history: full, trainingDay: Self.noTraining, today: Self.today) == 1)
    let half = Self.history(7) { $0 % 2 == 0 ? Self.all : [] }
    let r = try #require(B.ratio(history: half, trainingDay: Self.noTraining, today: Self.today))
    // ghi ngày 2, 4, 6 trước; ngày 7 trước lần ghi đầu tiên nên không tính → 3 / 6
    #expect(abs(r - 0.5) < 1e-9)
    // hôm nay chưa hết: không tính
    var h = half; h[Self.today] = Self.all
    #expect(B.ratio(history: h, trainingDay: Self.noTraining, today: Self.today) == r)
    // ngày tập theo lịch thì buổi tập cũng là một việc
    let noWorkout = B.ratio(history: full, trainingDay: { _ in true }, today: Self.today)
    #expect(noWorkout == 0.75)
  }

  @Test func newAccountsNeverBreak() {
    #expect(B.ratio(history: [:], trainingDay: Self.noTraining, today: Self.today) == nil)
    let o = B.decide(userId: "u", today: Self.today, history: [:], trainingDay: Self.noTraining, current: nil, lastEvent: nil,
      lastItem: nil, asleep: false)
    #expect(o == .fine)
  }

  @Test func tiersFollowTheAgreedRule() {
    #expect(B.tier(ratio: 0.9) == B.steady)
    #expect(B.tier(ratio: 0.8) == B.steady)
    #expect(B.tier(ratio: 0.6) == B.wobbly)
    #expect(B.tier(ratio: 0.3) == B.lapsed)
  }

  /// Mô phỏng một năm cho nhiều người dùng: tần suất trung bình khớp lời hứa với Kiệt.
  @Test func frequencyMatchesThePromise() {
    func breaksPerWeek(_ pattern: Set<B.Habit>, everyOther: Bool) -> Double {
      var total = 0
      for u in 0..<40 {
        var last: LocalDate?
        var day = Self.today
        for _ in 0..<365 {
          day = day.adding(days: 1)
          let h = Self.history(7, from: day) { k in everyOther && k % 2 == 1 ? [] : pattern }
          let o = B.decide(userId: "user\(u)", today: day, history: h, trainingDay: Self.noTraining, current: nil,
            lastEvent: last, lastItem: nil, asleep: false)
          if case .broken = o { total += 1; last = day }
        }
      }
      return Double(total) / 40 / 52
    }
    #expect(breaksPerWeek(Self.all, everyOther: false) < 0.2)          // ≥ 80 %: gần như không
    let mid = breaksPerWeek([.water, .meal], everyOther: false)         // 67 %
    #expect(mid > 0.6 && mid < 1.4)                                      // ~ một lần / tuần
    let low = breaksPerWeek([.water], everyOther: true)                  // ~ 17 %
    #expect(low > 1.8 && low <= 3.5)                                     // hai–ba ngày một lần
  }

  @Test func onlyOneThingBreaksAtATimeAndItStaysBrokenUntilFixed() {
    let h = Self.history(7) { _ in [.water] }
    let b = B.Broken(item: .neon, day: Self.today.adding(days: -2), habit: .sleep)
    let o = B.decide(userId: "u", today: Self.today, history: h, trainingDay: Self.noTraining, current: b, lastEvent: b.day,
      lastItem: .neon, asleep: false)
    #expect(o == .broken(b))
  }

  @Test func fixingNeedsTheMissingHabitAfterTheBreak() {
    // hỏng hôm qua lúc đã uống nước rồi → nước hôm qua không tính
    let b = B.Broken(item: .board, day: Self.today.adding(days: -1), habit: .water, already: [.water])
    var h: [LocalDate: Set<B.Habit>] = [b.day: [.water]]
    #expect(!B.isFixed(b, history: h, today: Self.today))
    // ghi việc khác không sửa được
    h[Self.today] = [.meal, .sleep]
    #expect(!B.isFixed(b, history: h, today: Self.today))
    // ghi đúng nước hôm nay → sửa
    h[Self.today] = [.water]
    #expect(B.isFixed(b, history: h, today: Self.today))
    let o = B.decide(userId: "u", today: Self.today, history: h, trainingDay: Self.noTraining, current: b, lastEvent: b.day,
      lastItem: .board, asleep: false)
    #expect(o == .fixed(b))
  }

  /// Koa nhờ uống nước, người dùng uống ngay trong ngày → sửa liền, không phải chờ hôm sau.
  @Test func sameDayFixWorks() {
    let b = B.Broken(item: .neon, day: Self.today, habit: .water, already: [.meal])
    #expect(!B.isFixed(b, history: [Self.today: [.meal]], today: Self.today))
    #expect(B.isFixed(b, history: [Self.today: [.meal, .water]], today: Self.today))
  }

  @Test func neverBreaksWhileKoaSleeps() {
    let h = Self.history(7) { _ in [] }.merging([Self.today.adding(days: -7): [.water]]) { $1 }
    for u in 0..<30 {
      let o = B.decide(userId: "u\(u)", today: Self.today, history: h, trainingDay: Self.noTraining, current: nil,
        lastEvent: nil, lastItem: nil, asleep: true)
      #expect(o == .fine)
    }
  }

  @Test func keepsTheGapAndChangesTheItem() {
    let h = Self.history(7) { _ in [] }.merging([Self.today.adding(days: -7): [.water]]) { $1 }
    for u in 0..<50 {
      let o = B.decide(userId: "u\(u)", today: Self.today, history: h, trainingDay: Self.noTraining, current: nil,
        lastEvent: Self.today.adding(days: -1), lastItem: nil, asleep: false)
      #expect(o == .fine, "dưới khoảng cách tối thiểu thì không hỏng")
      if case .broken(let b) = B.decide(userId: "u\(u)", today: Self.today, history: h, trainingDay: Self.noTraining,
        current: nil, lastEvent: nil, lastItem: .neon, asleep: false) {
        #expect(b.item != .neon, "lần sau đổi món")
      }
    }
  }

  @Test func asksForTheHabitMissedMost() {
    let h = Self.history(7) { k in k <= 2 ? [.water, .meal] : [.water, .meal, .sleep] }   // ngủ thiếu 2 ngày
    #expect(B.missing(history: h, trainingDay: Self.noTraining, today: Self.today) == .sleep)
    let tie = Self.history(7) { _ in [] }
    #expect(B.missing(history: tie, trainingDay: Self.noTraining, today: Self.today) == .water)  // hoà → việc nhỏ trước
    // tuần có lịch tập mà không tập lần nào → nhờ đi tập
    let lazy = Self.history(7) { _ in Self.all }
    #expect(B.missing(history: lazy, trainingDay: { _ in true }, today: Self.today) == .workout)
  }

  @Test func deterministicPerUserAndDay() {
    #expect(B.roll("a", Self.today) == B.roll("a", Self.today))
    #expect(B.roll("a", Self.today) != B.roll("b", Self.today))
    let r = B.roll("a", Self.today)
    #expect(r >= 0 && r < 1)
  }
}
