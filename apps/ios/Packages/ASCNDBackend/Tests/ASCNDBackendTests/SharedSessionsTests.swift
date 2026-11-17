import ASCNDCore
@testable import ASCNDBackend
import Foundation
import Testing

/// Lượt đọc `workout_sessions` chung (R2-OPS-08): ba nguồn chia một chuyến
/// mạng mỗi chu kỳ làm mới; mỗi nguồn vẫn nhận đúng cửa sổ của mình; lỗi
/// không lưu.
struct SharedSessionsTests {
  /// Bộ đếm lượt đọc của `fetch` giả.
  actor Counter {
    private(set) var count = 0
    func record() -> Int { count += 1; return count }
  }

  struct Boom: Error {}

  static func row(id: String, dateTime: String) -> JSONValue {
    .object(["id": .string(id), "date_time": .string(dateTime), "sets": .array([])])
  }

  /// Như server trả: mới trước; một hàng hỏng `date_time` (bị bỏ khi lọc).
  static let fixture: [JSONValue] = [
    row(id: "c", dateTime: "2026-10-26T07:00:00Z"),
    row(id: "b", dateTime: "2026-10-25T07:00:00Z"),
    row(id: "x", dateTime: "bad"),
    row(id: "a", dateTime: "2026-09-01T07:00:00Z"),
  ]

  static func ids(_ rows: [JSONValue]) -> [String] { rows.compactMap { $0["id"]?.stringValue } }

  /// Ba nguồn gọi nối nhau trong một chu kỳ: MỘT lượt đọc; cửa sổ hẹp và buổi
  /// trong ngày lọc từ lượt đọc rộng.
  @Test func sequentialRefreshCycleFetchesOnce() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(fetch: { _, _ in
      _ = await counter.record()
      return Self.fixture
    })
    let wide = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    let narrow = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-10-26T00:00:00Z")!)
    let day = try await shared.rows(
      userId: "u1", from: EpochMillis(iso8601: "2026-10-25T00:00:00Z")!,
      to: EpochMillis(iso8601: "2026-10-26T00:00:00Z")!)
    #expect(await counter.count == 1)
    #expect(Self.ids(wide) == ["c", "b", "a"])
    #expect(Self.ids(narrow) == ["c"])
    #expect(Self.ids(day) == ["b"])
  }

  /// Ba lượt gọi cùng cửa sổ, cùng bay: MỘT lượt đọc.
  @Test func concurrentSameWindowFetchesOnce() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(fetch: { _, _ in
      _ = await counter.record()
      try await Task.sleep(for: .milliseconds(50))
      return Self.fixture
    })
    let since = EpochMillis(iso8601: "2026-08-01T00:00:00Z")!
    async let a = shared.rows(userId: "u1", since: since)
    async let b = shared.rows(userId: "u1", since: since)
    async let c = shared.rows(userId: "u1", since: since)
    let (ra, rb, rc) = try await (a, b, c)
    #expect(await counter.count == 1)
    #expect(Self.ids(ra) == ["c", "b", "a"])
    #expect(Self.ids(rb) == ["c", "b", "a"])
    #expect(Self.ids(rc) == ["c", "b", "a"])
  }

  /// Lượt đọc hẹp không phủ được cửa sổ rộng: lượt gọi rộng đọc lại.
  @Test func narrowFetchDoesNotCoverWiderWindow() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(fetch: { _, _ in
      _ = await counter.record()
      return Self.fixture
    })
    let narrow = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-10-26T00:00:00Z")!)
    let wide = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    #expect(await counter.count == 2)
    #expect(Self.ids(narrow) == ["c"])
    #expect(Self.ids(wide) == ["c", "b", "a"])
  }

  /// Người khác nhau không chia nhau.
  @Test func differentUsersFetchSeparately() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(fetch: { _, _ in
      _ = await counter.record()
      return Self.fixture
    })
    _ = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    _ = try await shared.rows(userId: "u2", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    #expect(await counter.count == 2)
  }

  /// Lượt đọc hỏng không lưu: lượt sau đọc lại và được hàng.
  @Test func failedFetchIsNotCached() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(fetch: { _, _ in
      if await counter.record() == 1 { throw Boom() }
      return Self.fixture
    })
    await #expect(throws: Boom.self) {
      try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    }
    let rows = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    #expect(await counter.count == 2)
    #expect(Self.ids(rows) == ["c", "b", "a"])
  }

  /// Hết hạn thì đọc lại (`ttlMillis: 0` = không còn tươi ngay).
  @Test func expiredResultRefetches() async throws {
    let counter = Counter()
    let shared = SharedWorkoutSessions(
      fetch: { _, _ in
        _ = await counter.record()
        return Self.fixture
      }, ttlMillis: 0)
    _ = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    _ = try await shared.rows(userId: "u1", since: EpochMillis(iso8601: "2026-08-01T00:00:00Z")!)
    #expect(await counter.count == 2)
  }
}
