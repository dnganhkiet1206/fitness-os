@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T52: lịch sử Gains đọc từng trang tới hết (trước đây một lần `limit 2000`, bị trần `max_rows` cắt lặng
/// lẽ), sổ tăng tải hỏng là đọc hỏng (giữ Gains cũ), chạm trần thì nói ra.
struct KoaGainsSyncTests {
  final class PagedStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var sessions: [JSONValue] = []
    var overload: [JSONValue] = []
    var failOverload = false
    /// Chèn một buổi mới ở đầu sau trang đầu (làm lệch offset).
    var insertAfterFirstPage: JSONValue?
    var reads = 0

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      let result: Result<[JSONValue], RowStoreError> = lock.withLock {
        reads += 1
        let all: [JSONValue]
        switch q.table {
        case "workout_sessions": all = sessions
        case "mascot_transactions":
          if failOverload { return .failure(RowStoreError(code: nil, message: "offline")) }
          all = overload
        default: all = []
        }
        let from = q.offset ?? 0, n = q.limit ?? all.count
        let page = Array(all.dropFirst(from).prefix(n))
        if q.table == "workout_sessions", from == 0, let extra = insertAfterFirstPage {
          sessions.insert(extra, at: 0)
          insertAfterFirstPage = nil
        }
        return .success(page)
      }
      return try result.get()
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
  }

  static let tz = TimeZone(identifier: "UTC")!
  static let today = LocalDate("2026-11-20")!

  /// `n` buổi, mỗi ngày một buổi, mới → cũ.
  static func sessions(_ n: Int) -> [JSONValue] {
    (0..<n).map { i in
      let d = today.adding(days: -i)
      return .object([
        "id": .string("s\(i)"), "date_time": .string("\(d)T10:00:00.000Z"), "pr_detected": .bool(false),
      ])
    }
  }

  func load(_ s: PagedStore) async -> KoaGainsSync.Loaded? {
    await KoaGainsSync.load(userId: "u", store: s, plans: nil, now: EpochMillis(Int64(Self.today.daysSinceEpoch) * 86_400_000 + 12 * 3_600_000), in: Self.tz)
  }

  @Test func readsEveryPageBeyondTheOldCap() async throws {
    let s = PagedStore()
    s.sessions = Self.sessions(2500)
    let l = try #require(await load(s))
    #expect(l.days.count == 2500, "trước đây dừng ở 2000 (hay 1000 nếu server cắt)")
    #expect(!l.truncated)
  }

  @Test func aSessionInsertedBetweenPagesIsNotCountedTwice() async throws {
    let s = PagedStore()
    s.sessions = Self.sessions(1500)
    s.insertAfterFirstPage = .object([
      "id": .string("new"), "date_time": .string("\(Self.today)T20:00:00.000Z"), "pr_detected": .bool(false),
    ])
    let l = try #require(await load(s))
    #expect(l.days.count == 1500, "hàng s999 đọc lặp ở trang 2 bị bỏ trùng theo id")
  }

  @Test func overloadFailureKeepsTheOldGains() async {
    let s = PagedStore()
    s.sessions = Self.sessions(10)
    s.failOverload = true
    #expect(await load(s) == nil, "không công bố Gains thấp hơn vì sổ tăng tải đọc hỏng")
  }

  @Test func hittingTheCeilingIsReported() async throws {
    let s = PagedStore()
    s.sessions = Self.sessions(KoaGainsSync.pageSize * KoaGainsSync.maxPages)
    let l = try #require(await load(s))
    #expect(l.truncated)
  }
}
