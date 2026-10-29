@testable import ASCNDCore
import Foundation
import Testing

/// Phòng Koa bám bụi (#527 phần 5, Kiệt duyệt 29/10).
struct KoaDustTests {
  static let today = LocalDate("2026-10-29")!
  static func ago(_ n: Int) -> LocalDate { today.adding(days: -n) }
  static func never(_: LocalDate) -> Bool { false }

  @Test func idleDaysRaiseTheLevel() {
    for (gap, want) in [(1, 0), (3, 0), (4, 1), (6, 2), (9, 3), (20, 3)] {
      // buổi cuối cách hôm nay `gap` ngày → `gap - 1` ngày đã qua không tập
      let s = KoaDust.compute(sessions: [Self.ago(gap)], logs: [:], cleaned: [], isRest: Self.never, today: Self.today)
      #expect(s.level == want, "\(gap) ngày")
    }
  }

  @Test func aSessionOrAPaidCleanSweepsEverything() {
    #expect(KoaDust.compute(sessions: [Self.ago(12), Self.today], logs: [:], cleaned: [], isRest: Self.never, today: Self.today) == .clean)
    #expect(KoaDust.compute(sessions: [Self.ago(12)], logs: [:], cleaned: [Self.today], isRest: Self.never, today: Self.today) == .clean)
  }

  @Test func twoLogsLowerOneLevel() {
    let dusty = KoaDust.compute(sessions: [Self.ago(9)], logs: [:], cleaned: [], isRest: Self.never, today: Self.today)
    let swept = KoaDust.compute(sessions: [Self.ago(9)], logs: [Self.today: 2], cleaned: [], isRest: Self.never, today: Self.today)
    #expect(dusty.level == 3 && swept.level == 2)
    let one = KoaDust.compute(sessions: [Self.ago(9)], logs: [Self.today: 1], cleaned: [], isRest: Self.never, today: Self.today)
    #expect(one.level == 3)
  }

  @Test func plannedRestDaysDoNotGatherDust() {
    let s = KoaDust.compute(sessions: [Self.ago(9)], logs: [:], cleaned: [], isRest: { _ in true }, today: Self.today)
    #expect(s == .clean)
  }

  @Test func aNewAccountStartsClean() {
    #expect(KoaDust.compute(sessions: [], logs: [:], cleaned: [], isRest: Self.never, today: Self.today) == .clean)
    // vắng lâu hơn cửa sổ: vẫn bụi dày
    #expect(KoaDust.compute(sessions: [Self.ago(40)], logs: [:], cleaned: [], isRest: Self.never, today: Self.today).level == 3)
  }

  @Test func logCountsAndCleanKeys() {
    let daily: [JSONValue] = [
      .object(["date": .string("2026-10-28"), "kcal": .number(500), "water_ml": .number(0), "sleep_duration_min": .number(420)])
    ]
    let weights: [JSONValue] = [.object(["date": .string("2026-10-28")]), .object(["date": .string("2026-10-28")])]
    #expect(KoaDustSync.logCounts(daily: daily, weights: weights) == [Self.ago(1): 3])
    #expect(KoaDust.day(ofClean: KoaDust.refKey(Self.today)) == Self.today)
    #expect(KoaDust.day(ofClean: "x:photo") == nil)
    #expect(KoaDustSync.cleanQuery(userId: "u").filters.contains(.or("ref_key.like.\"clean:*\"")))
  }

  @Test func dustLayersDrawOverTheRoomWithoutRecolouring() {
    var o = StudioScene.Options()
    let base = StudioScene.tree(o)
    var counts: [Int] = []
    for level in 1...3 {
      o.dust = level
      let tree = StudioScene.tree(o)
      counts.append(tree.count - base.count)
      // không phần tử gốc nào đổi: bụi chỉ chồng thêm
      #expect(base.allSatisfy { e in tree.contains(e) })
    }
    #expect(counts[0] > 0 && counts[1] > counts[0] && counts[2] > counts[1])
  }
}
