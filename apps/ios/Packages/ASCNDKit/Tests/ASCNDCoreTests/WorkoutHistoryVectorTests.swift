import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/workout-history.json` (D-25 #405) — đọc
/// CHÍNH tệp vector, không chép tay đầu vào, nên vector đổi là test đổi theo.
///
/// Mỗi ca chạy trên `HistoryBook` thật với nguồn giả CƯ XỬ NHƯ SERVER: chỉ trả
/// hàng của `userId` được hỏi (`.eq('user_id', …)` + RLS). Ca nào runner không
/// biết → đỏ (vector mới phải có phép kiểm). Ca chưa port nằm trong `notPorted`
/// kèm lý do; ca ấy biến mất hoặc được port thì phải sửa danh sách.
@MainActor
struct WorkoutHistoryVectorTests {
  /// WH-3a: dựng lại daily_log của ngày bị xoá + hôm nay — readiness thuộc #266
  /// (khoá), `WorkoutHistory.swift` ghi "chưa port".
  static let notPorted: Set<String> = ["WH-3a"]

  private actor ServerLikeSource: HistorySource {
    let rows: [JSONValue]
    private(set) var askedFor: [String] = []
    init(_ rows: [JSONValue]) { self.rows = rows }
    func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
      askedFor.append(userId)
      return rows.filter { ($0["user_id"]?.stringValue ?? userId) == userId }
    }
  }

  private actor Cache: HistoryCache {
    var store: [String: [HistoryEntry]] = [:]
    func load(userId: String) async throws -> [HistoryEntry]? { store[userId] }
    func save(userId: String, _ entries: [HistoryEntry]) async throws { store[userId] = entries }
  }

  /// Hàng `workout_sessions` từ một ca vector: giữ id / date_time / user_id của
  /// vector, điền các cột còn lại như một buổi thường.
  private static func row(_ s: JSONValue) -> JSONValue {
    var o: [String: JSONValue] = [
      "template_name": .string("Push"), "session_rpe": .number(8), "volume_load": .number(480),
      "pr_detected": .bool(false),
      "sets": .array([.object(["exerciseName": .string("Bench"), "weight": .number(60), "reps": .number(8)])]),
    ]
    if case .object(let given) = s { for (k, v) in given { o[k] = v } }
    return .object(o)
  }

  private static func sessions(_ input: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = input?["sessions"] { return a.map(row) }
    return []
  }

  private static let clock = ManualClock(EpochMillis(1_791_183_600_000))  // 2026-10-05 07:00Z

  private func book(_ source: ServerLikeSource, user: String, store: InMemoryWorkoutStore = InMemoryWorkoutStore())
    -> HistoryBook
  {
    HistoryBook(userId: user, source: source, cache: Cache(), store: store, clock: Self.clock, makeId: { "d" })
  }

  private static func cases() throws -> [JSONValue] {
    let url = RepoPaths.specVectors.appendingPathComponent("workout-history.json")
    let doc = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let list)? = doc["vectors"] else { return [] }
    return list
  }

  @Test func everyVectorIsRunOrListedAsNotPorted() async throws {
    let all = try Self.cases()
    #expect(!all.isEmpty)
    let ids = Set(all.compactMap { $0["id"]?.stringValue })
    for gap in Self.notPorted {
      #expect(ids.contains(gap), "\(gap) không còn trong vector — bỏ khỏi notPorted")
    }
    for c in all {
      guard let id = c["id"]?.stringValue, !Self.notPorted.contains(id) else { continue }
      try await run(id, c["input"], c["expected"])
    }
  }

  private func run(_ id: String, _ input: JSONValue?, _ expected: JSONValue?) async throws {
    switch id {
    case "WH-1a":
      let b = book(ServerLikeSource(Self.sessions(input)), user: "u1")
      await b.load()
      let first = b.entries.first.map { WorkoutSessionRecord.iso8601($0.at) }
      #expect(first == expected?["first"]?.stringValue, "WH-1a: mới trước")
      #expect(b.entries.map(\.at.millis) == b.entries.map(\.at.millis).sorted(by: >), "WH-1a: cả danh sách mới trước")

    case "WH-1b":
      let viewer = try #require(input?["viewer"]?.stringValue)
      let src = ServerLikeSource(Self.sessions(input))
      let b = book(src, user: viewer)
      await b.load()
      #expect(b.entries.count == expected?["count"]?.intValue, "WH-1b: chỉ buổi của mình")
      #expect(await src.askedFor.allSatisfy { $0 == viewer }, "WH-1b: hỏi server đúng người xem")

    case "WH-1c":
      let b = book(ServerLikeSource([]), user: "u1")
      await b.load()
      #expect(b.loaded && b.entries.isEmpty, "WH-1c")

    case "WH-1d":
      // Hợp đồng cột: native hỏi đúng các cột RN đọc (`SupabaseHistorySource`).
      let src = try String(
        contentsOf: RepoPaths.root.appendingPathComponent(
          "apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend/SupabaseHistorySource.swift"),
        encoding: .utf8)
      guard case .array(let fields)? = expected?["fields"] else {
        Issue.record("WH-1d: thiếu fields")
        return
      }
      for f in fields.compactMap(\.stringValue) {
        #expect(src.contains(f), "WH-1d: SupabaseHistorySource không select cột \(f)")
      }

    case "WH-2a", "WH-2b":
      let user = try #require(input?["userId"]?.stringValue)
      let target = try #require(input?["deleteId"]?.stringValue)
      let store = InMemoryWorkoutStore()
      let b = book(ServerLikeSource(Self.sessions(input)), user: user, store: store)
      await b.load()
      var refused = false
      do throws(HistoryBook.DeleteRefusal) {
        try await b.delete(target)
      } catch {
        refused = true
      }
      let deleted = await store.outbox.filter { $0.kind == WorkoutSessionRecord.deleteKind }
        .compactMap { $0.payload["id"]?.stringValue }
      guard case .array(let want)? = expected?["deleted"] else {
        Issue.record("\(id): thiếu deleted")
        return
      }
      #expect(deleted == want.compactMap(\.stringValue), "\(id): đúng buổi bị xoá")
      #expect(await store.outbox.allSatisfy { $0.userId == user }, "\(id): lệnh xoá mang đúng chủ")
      if expected?["error"] != nil {
        #expect(refused, "\(id): buổi của người khác bị từ chối")
      } else {
        #expect(!refused && !b.entries.contains { $0.id == target }, "\(id): biến khỏi danh sách")
      }

    case "WH-2c":
      // Native: lần hai là `notFound` (buổi đã khỏi danh sách) — màn lịch sử bỏ
      // qua refusal ấy, nên với người dùng "không lỗi"; và KHÔNG xếp lệnh thứ hai.
      let target = try #require(input?["deleteId"]?.stringValue)
      let times = input?["repeat"]?.intValue ?? 2
      let store = InMemoryWorkoutStore()
      let b = book(
        ServerLikeSource([Self.row(.object(["id": .string(target), "date_time": .string("2026-10-05T06:00:00.000Z")]))]),
        user: "u1", store: store)
      await b.load()
      for _ in 0..<times {
        do throws(HistoryBook.DeleteRefusal) { try await b.delete(target) } catch {}
      }
      let count = await store.outbox.filter { $0.kind == WorkoutSessionRecord.deleteKind }.count
      #expect((count == 1) == (expected?["deletedOnce"]?.boolValue == true), "WH-2c: xoá đúng một lần")

    case "WH-4a":
      let b = book(ServerLikeSource([]), user: "u1")
      await b.load()
      let new = try #require(input?["newSession"])
      let id = try #require(new["id"]?.stringValue)
      await b.absorb(
        OutboxEntry(
          id: id, userId: "u1", kind: WorkoutSessionRecord.outboxKind, payload: Self.row(new),
          createdAt: Self.clock.nowMillis()))
      #expect(b.entries.contains { $0.id == id } == (expected?["appears"]?.boolValue == true), "WH-4a")

    default:
      Issue.record("workout-history.json: ca \(id) chưa có phép kiểm Swift — viết nó, hoặc ghi vào notPorted kèm lý do")
    }
  }
}
