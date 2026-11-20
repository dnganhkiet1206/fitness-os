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

  /// Kho giả theo đúng ngữ nghĩa PostgREST mà `SupabaseRowStore` thực thi:
  /// xếp theo `order` của truy vấn rồi mới cắt `limit` (bộ lọc `or` bỏ qua —
  /// mọi hàng trong test đều là hàng cần đọc).
  final class OrderedStore: RowStore, @unchecked Sendable {
    var rows: [JSONValue] = []
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      var out = rows
      if let o = q.order {
        out = out.enumerated().sorted {
          let a = $0.element[o.column]?.stringValue ?? "", b = $1.element[o.column]?.stringValue ?? ""
          let c = (a < b ? -1 : a > b ? 1 : 0) * (o.ascending ? 1 : -1)
          return c != 0 ? c < 0 : $0.offset < $1.offset
        }.map(\.element)
      }
      if let l = q.limit { out = Array(out.prefix(l)) }
      return out
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int { 0 }
  }

  /// R2-ECO-11: 61 lần dọn — trần 60 phải giữ 60 lần MỚI nhất, không phải 60
  /// lần cũ nhất mà thứ tự không xác định có thể trả về.
  @Test func cleanQueryKeepsTheNewestSixtyCleans() async throws {
    let q = KoaDustSync.cleanQuery(userId: "u")
    #expect(q.order == RowQuery.Order(column: "created_at", ascending: false))
    #expect(q.limit == 60)
    let start = LocalDate("2026-08-01")!
    let store = OrderedStore()
    store.rows = (0..<61).map { i in
      let day = start.adding(days: i)
      return JSONValue.object([
        "ref_key": .string("clean:\(day)"), "created_at": .string("\(day)T00:00:00.000Z"),
      ])
    }
    let keys = try await store.select(q).compactMap { $0["ref_key"]?.stringValue }
    #expect(keys.count == 60)
    #expect(keys.first == "clean:\(start.adding(days: 60))")
    #expect(keys.last == "clean:\(start.adding(days: 1))")
    #expect(!keys.contains("clean:\(start)"))
  }
}
