import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/remove-set-undo.json` (#412) — đọc CHÍNH tệp
/// vector. Mỗi ca chạy trên `WorkoutSessionController` thật: hàng kế hoạch
/// dựng từ `input.sets`, tích hết, chốt, rồi gỡ.
///
/// Khác RN có chủ đích (RS-1): RN chỉ có TÊN bài nên cắt set CUỐI cùng tên
/// (`cutIndex`); native biết hàng nào bị bỏ tích (`loggedKeys`) nên gỡ ĐÚNG
/// hàng ấy. Runner kiểm phần tương đương: gỡ hàng ở `cutIndex` của RN thì đúng
/// set ấy rời buổi và mọi set khác ở lại; ca RN "không tìm thấy" là hàng không
/// nằm trong buổi → `notLogged`.
@MainActor
struct RemoveSetVectorTests {
  private static let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
  private static let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  private static let today = LocalDate("2026-10-05")!

  private static func cases() throws -> [JSONValue] {
    let url = RepoPaths.specVectors.appendingPathComponent("remove-set-undo.json")
    let doc = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let list)? = doc["vectors"] else { return [] }
    return list
  }

  private static func sets(_ input: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = input?["sets"] { return a }
    if case .array(let a)? = input?["snapshot"]?["sets"] { return a }
    return []
  }

  /// Hàng kế hoạch "s0", "s1"… — một hàng cho mỗi set của vector.
  private static func rows(_ sets: [JSONValue], rpe: (Int) -> Int = { _ in 7 }) -> [PlannedSet] {
    sets.enumerated().map { i, s in
      PlannedSet(
        key: "s\(i)", exerciseName: s["exerciseName"]?.stringValue ?? "", ordinal: i + 1, of: sets.count,
        weightKg: s["weight"]?.doubleValue ?? 0, reps: s["reps"]?.intValue ?? 0, plannedRest: 90, plannedRpe: rpe(i))
    }
  }

  /// Controller đã tích hết và chốt.
  private func logged(_ rows: [PlannedSet], store: InMemoryWorkoutStore) async throws -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: Self.today, templateId: "tpl", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: Self.clock, timeZone: Self.saigon)
    await c.load()
    for r in rows { await c.toggle(r.key) }
    _ = try await c.finish()
    return c
  }

  private static func payloadSets(_ e: OutboxEntry?) -> [JSONValue] {
    if case .array(let a)? = e?.payload["sets"] { return a }
    return []
  }

  /// Nội dung một set để so: tên, tạ, reps (+ setIndex khi vector có).
  private static func shape(_ s: JSONValue, withIndex: Bool) -> String {
    let base = "\(s["exerciseName"]?.stringValue ?? "")|\(s["weight"]?.doubleValue ?? 0)|\(s["reps"]?.doubleValue ?? 0)"
    return withIndex ? base + "|\(s["setIndex"]?.doubleValue ?? 0)" : base
  }

  @Test func everyVectorHasANativeCheck() async throws {
    let all = try Self.cases()
    #expect(!all.isEmpty)
    for c in all {
      guard let id = c["id"]?.stringValue else { continue }
      try await run(id, c["input"], c["expected"])
    }
  }

  private func run(_ id: String, _ input: JSONValue?, _ expected: JSONValue?) async throws {
    let sets = Self.sets(input)
    switch id {
    case "RS-1a", "RS-1b":
      let cut = try #require(expected?["cutIndex"]?.intValue)
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(sets), store: store)
      _ = try await c.removeLoggedSet("s\(cut)")
      let left = Self.payloadSets(await store.outbox.last).map { Self.shape($0, withIndex: false) }
      var want = sets.map { Self.shape($0, withIndex: false) }
      want.remove(at: cut)
      #expect(left == want, "\(id): đúng set ở cutIndex rời buổi, các set khác ở lại")

    case "RS-1c":
      let c = try await logged(Self.rows(sets), store: InMemoryWorkoutStore())
      await #expect(throws: WorkoutSessionController.RemoveRefusal.notLogged, "RS-1c") {
        try await c.removeLoggedSet("not-in-session")
      }

    case "RS-2a":
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(sets), store: store)
      _ = try await c.removeLoggedSet("s\(sets.count - 1)")  // set cuối cùng tên = cutIndex của RN
      let last = await store.outbox.last
      let got = Self.payloadSets(last).map { Self.shape($0, withIndex: true) }
      guard case .array(let want)? = expected?["left"] else {
        Issue.record("RS-2a: thiếu left")
        return
      }
      #expect(got == want.map { Self.shape($0, withIndex: true) }, "RS-2a: đánh lại setIndex từ 1")
      #expect(last?.payload["volume_load"]?.intValue == expected?["volume"]?.intValue, "RS-2a: volume tính lại")

    case "RS-2b":
      // Luật volume nằm ở bản ghi (WS-5): bỏ khởi động. Màn ngày tập không
      // sinh set khởi động (như RN day-plan), nên kiểm thẳng trên bản ghi.
      var kept = sets
      kept.removeLast()
      let record = try #require(
        WorkoutSessionRecord(
          id: "x", userId: "u1", dateTime: Self.clock.nowMillis(), templateId: nil, templateName: "Push",
          sets: kept.map {
            SessionSet(
              exerciseId: "", exerciseName: $0["exerciseName"]?.stringValue ?? "",
              weightKg: $0["weight"]?.doubleValue ?? 0, reps: $0["reps"]?.intValue ?? 0, rpe: 7,
              warmup: $0["warmup"]?.boolValue == true)
          }))
      #expect(record.volumeLoad == expected?["volume"]?.intValue, "RS-2b: volume bỏ set khởi động")

    case "RS-3a":
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(sets), store: store)
      let removal = try await c.removeLoggedSet("s0")
      #expect(removal.deletedSession == (expected?["deleted"]?.boolValue == true), "RS-3a")
      #expect(await store.outbox.last?.kind == WorkoutSessionRecord.deleteKind, "RS-3a: hàng xoá buổi")

    case "RS-4a":
      // Set nặng nhất (RPE của buổi) là set bị gỡ: session_rpe vẫn giữ.
      let rpe = try #require(input?["sessionRpe"]?.intValue)
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(sets) { $0 == sets.count - 1 ? rpe : max(1, rpe - 2) }, store: store)
      _ = try await c.removeLoggedSet("s\(sets.count - 1)")
      #expect(
        await store.outbox.last?.payload["session_rpe"]?.intValue == expected?["rpe"]?.intValue,
        "RS-4a: giữ session_rpe")

    case "RS-5a":
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(sets), store: store)
      let before = Self.payloadSets(await store.outbox.first).map { Self.shape($0, withIndex: true) }
      let removal = try await c.removeLoggedSet("s\(sets.count - 1)")
      try await c.undo(removal)
      let after = Self.payloadSets(await store.outbox.last).map { Self.shape($0, withIndex: true) }
      #expect((after == before) == (expected?["restored"]?.boolValue == true), "RS-5a: hoàn tác dựng lại nguyên vẹn")

    case "RS-6a":
      let two = [
        JSONValue.object(["exerciseName": .string("Bench Press"), "weight": .number(60), "reps": .number(8)]),
        .object(["exerciseName": .string("Bench Press"), "weight": .number(60), "reps": .number(6)]),
      ]
      let store = InMemoryWorkoutStore()
      let c = try await logged(Self.rows(two), store: store)
      await store.hold()
      async let first = try? c.removeLoggedSet("s0")
      while await store.parked == 0 { await Task.yield() }
      var blocked = false
      do throws(WorkoutSessionController.RemoveRefusal) {
        _ = try await c.removeLoggedSet("s1")
      } catch {
        blocked = error == .inProgress
      }
      await store.release()
      _ = await first
      #expect(blocked == (expected?["secondBlocked"]?.boolValue == true), "RS-6a: lần hai bị chặn khi đang xử lý")

    default:
      Issue.record("remove-set-undo.json: ca \(id) chưa có phép kiểm Swift")
    }
  }
}
