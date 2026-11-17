@testable import ASCNDCore
import Foundation
import Testing

/// Nhiệm vụ Koa phần 4 (Kiệt duyệt 29/10): tăng tải theo gợi ý, khám phá app.
struct KoaQuestsTests {
  static func perf(
    _ key: String, _ date: String, at: Int64, kind: ExerciseKind = .compound, weight: Double?, reps: Int?
  ) -> ExercisePerformance {
    ExercisePerformance(
      exerciseKey: key, exerciseName: key, sessionId: "s\(at)", at: EpochMillis(at), date: LocalDate(date)!, kind: kind,
      setCount: 3, totalReps: 24, totalVolumeKg: 0, bestWeightKg: weight, bestReps: reps, bestE1rmKg: nil,
      bestDurationSec: nil, records: [], bodyweightKg: nil, topSetReps: reps)
  }

  static let today = LocalDate("2026-10-29")!

  @Test func heavierOrMoreRepsThanLastTimeCounts() {
    let last = Self.perf("bench", "2026-10-27", at: 1, weight: 60, reps: 8)
    #expect(OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 62.5, reps: 8)]))
    #expect(OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 60, reps: 9)]))
    // nặng hơn mà tụt quá 2 rep ở set đỉnh thì không tính
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 65, reps: 5)]))
    // y như lần trước, hay nhẹ hơn
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 60, reps: 8)]))
    #expect(!OverloadQuest.achieved(on: Self.today, [last, Self.perf("bench", "2026-10-29", at: 2, weight: 55, reps: 12)]))
  }

  @Test func needsAPreviousSessionOfTheSameLift() {
    let first = Self.perf("squat", "2026-10-29", at: 2, weight: 100, reps: 5)
    #expect(!OverloadQuest.achieved(on: Self.today, [first]))
    let other = Self.perf("bench", "2026-10-27", at: 1, weight: 40, reps: 5)
    #expect(!OverloadQuest.achieved(on: Self.today, [other, first]))
  }

  @Test func bodyweightCountsRepsAndTimedNeverCounts() {
    let dips = [
      Self.perf("dips", "2026-10-27", at: 1, kind: .bodyweight, weight: nil, reps: 10),
      Self.perf("dips", "2026-10-29", at: 2, kind: .bodyweight, weight: nil, reps: 11),
    ]
    #expect(OverloadQuest.achieved(on: Self.today, dips))
    let plank = [
      Self.perf("plank", "2026-10-27", at: 1, kind: .timed, weight: nil, reps: 1),
      Self.perf("plank", "2026-10-29", at: 2, kind: .timed, weight: nil, reps: 2),
    ]
    #expect(!OverloadQuest.achieved(on: Self.today, plank))
  }

  @Test func keysRoundTrip() {
    #expect(OverloadQuest.refKey(Self.today) == "d:2026-10-29:overload")
    #expect(OverloadQuest.day(of: "d:2026-10-29:overload") == Self.today)
    #expect(OverloadQuest.day(of: "d:2026-10-29:meal") == nil)
    #expect(ExploreQuest.photo.refKey == "x:photo")
    // khớp migration koa_quests_v2 (Q1 của supabase/tests/core/rpc_koa_quests.test.sql)
    #expect(ExploreQuest.allCases.map(\.coins).reduce(0, +) == 195)
  }

  @Test func overloadDayAddsThreeGains() {
    let week = KoaGains.Week(planned: [2], rest: [])
    let plain = KoaGains.compute([.init(date: Self.today, personalRecord: false)], week: week, today: Self.today)
    let marked = KoaGainsSync.mark([.init(date: Self.today, personalRecord: false)], overload: [Self.today])
    let up = KoaGains.compute(marked, week: week, today: Self.today)
    #expect(up.points - plain.points == KoaGains.overload)
    // ngày không tập thì cờ tăng tải không cho gì
    let noSession = KoaGainsSync.mark([], overload: [Self.today])
    #expect(KoaGains.compute(noSession, week: week, today: Self.today).points == 0)
  }

  @Test func overloadDaysComeFromTheCoinLedger() {
    let rows: [JSONValue] = [
      .object(["ref_key": .string("d:2026-10-27:overload")]), .object(["ref_key": .string("d:2026-10-27:meal")]),
      .object(["ref_key": .string("x:photo")]),
    ]
    #expect(KoaGainsSync.overloadDays(rows) == [LocalDate("2026-10-27")!])
    let q = KoaGainsSync.overloadQuery(userId: "u")
    #expect(q.table == "mascot_transactions" && q.filters.contains(.or("ref_key.like.\"*:overload\"")))
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

  /// R2-ECO-11 (kiểm như `cleanQuery`): quá trần 2000 ngày tăng tải thì các
  /// ngày MỚI nhất thắng — ngày cũ nhất rơi ra ngoài, không phải ngày mới nhất.
  @Test func overloadQueryKeepsTheNewestRows() async throws {
    let q = KoaGainsSync.overloadQuery(userId: "u")
    #expect(q.order == RowQuery.Order(column: "created_at", ascending: false))
    #expect(q.limit == KoaGainsSync.limit)
    let start = LocalDate("2026-08-01")!
    let store = OrderedStore()
    store.rows = (0...KoaGainsSync.limit).map { i in
      let day = start.adding(days: i)
      return JSONValue.object([
        "ref_key": .string("d:\(day):overload"), "created_at": .string("\(day)T00:00:00.000Z"),
      ])
    }
    let keys = try await store.select(q).compactMap { $0["ref_key"]?.stringValue }
    #expect(keys.count == KoaGainsSync.limit)
    #expect(keys.first == "d:\(start.adding(days: KoaGainsSync.limit)):overload")
    #expect(keys.last == "d:\(start.adding(days: 1)):overload")
    #expect(!keys.contains("d:\(start):overload"))
  }

  /// Mất mạng lúc nhận thưởng tự động: giữ khoá để nhận bù; server đã trả lời có tên thì thôi.
  @Test func retryOnlyWhenNotDelivered() {
    #expect(QuestRetry.shouldRetry(.offline))
    #expect(QuestRetry.shouldRetry(.server(code: nil)))
    #expect(!QuestRetry.shouldRetry(.server(code: "P0001")))
    #expect(!QuestRetry.shouldRetry(.dailyCeiling))
    #expect(!QuestRetry.shouldRetry(.unknownReward))
    #expect(!QuestRetry.shouldRetry(.notSignedIn))
  }

  @Test func retryListDedupesAndCaps() {
    let a = QuestRetry.Pending(ref: "x:photo", reason: "explore photo")
    var list = QuestRetry.adding(a, to: [])
    list = QuestRetry.adding(a, to: list)
    #expect(list == [a])
    for i in 0..<30 { list = QuestRetry.adding(.init(ref: "d:2026-10-\(i):overload", reason: "overload"), to: list) }
    #expect(list.count == QuestRetry.limit)
    #expect(list.last?.ref == "d:2026-10-29:overload")
    #expect(!list.contains(a))
  }
}
