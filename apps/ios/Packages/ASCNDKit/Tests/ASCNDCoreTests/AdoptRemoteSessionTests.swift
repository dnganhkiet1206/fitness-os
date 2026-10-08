import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// #523 đa thiết bị: buổi của hôm nay đã ghi ở máy KHÁC (Android / iPhone
/// khác), máy này chưa có buổi riêng. RN (`day-plan.tsx` `proven`): hàng được
/// chứng minh hiện đã tích, không phải hàng mới; "Ghi thêm" nối vào buổi ấy;
/// bỏ tích hàng đã chứng minh thì gỡ set khỏi buổi ấy.
@MainActor
struct AdoptRemoteSessionTests {
  private let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
  private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  private let today = LocalDate("2026-10-05")!

  private let rows = [
    PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7),
    PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 8),
    PlannedSet(key: "s1", exerciseId: "ex-squat", exerciseName: "Squat", ordinal: 1, of: 1, weightKg: 100, reps: 5, plannedRest: 120, plannedRpe: 8),
  ]

  private static func set(_ name: String, _ id: String, _ kg: Double, _ reps: Int, rpe: Int?, index: Int) -> JSONValue {
    .object([
      "exerciseId": .string(id), "exerciseName": .string(name), "setIndex": .number(Double(index)),
      "weight": .number(kg), "reps": .number(Double(reps)), "rpe": rpe.map { JSONValue.number(Double($0)) } ?? .null,
    ])
  }

  /// Buổi Android ghi lúc 09:00 giờ Sài Gòn: hai set Bench (tạ lẻ, khác kế
  /// hoạch) + một bài ngoài kế hoạch (Curl) mà màn này không có hàng nào.
  private var android: JSONValue {
    .object([
      "id": .string("s-android"), "date_time": .string("2026-10-05T02:00:00.000Z"),
      "session_rpe": .number(9), "pr_detected": .bool(true), "volume_load": .number(1060),
      "sets": .array([
        Self.set("Bench Press", "ex-bench", 62.5, 8, rpe: 9, index: 1),
        Self.set("Bench Press", "ex-bench", 60, 7, rpe: 8, index: 2),
        Self.set("Curl", "", 15, 12, rpe: nil, index: 3),
      ]),
    ])
  }

  private func controller(_ store: InMemoryWorkoutStore, remote: [JSONValue]) async -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: today, templateId: "tpl", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: clock, timeZone: saigon, loggedElsewhere: true, remoteSessions: remote)
    await c.load()
    return c
  }

  @Test func assignmentFollowsRowOrderPerName() {
    let a = TodayRules.sessionAssignment(
      rows: [("r1", "Bench Press"), ("r2", "Bench Press"), ("r3", "Squat")],
      setNames: ["bench  press", "Curl", "Bench Press"])
    #expect(a == ["r1": 0, "r2": 2])
  }

  /// Hàng được chứng minh: đã tích, mang tạ / reps / RPE THẬT của buổi; buổi
  /// ấy thành buổi đã chốt của máy này; không còn hàng mới, nút Chốt tắt.
  @Test func adoptsTheRemoteSessionWithItsRealNumbers() async {
    let c = await controller(InMemoryWorkoutStore(), remote: [android])
    #expect(c.adoptedRemote)
    #expect(c.loggedSessionId == "s-android")
    #expect(c.loggedKeys == ["b1", "b2"])
    #expect(c.progress.done["b1"] == true && c.progress.done["b2"] == true && c.progress.done["s1"] == nil)
    #expect(c.progress.weightText["b1"] == "62.5" && c.progress.repsText["b2"] == "7")
    #expect(c.progress.rpe["b1"] == 9)
    #expect(c.pendingRows.isEmpty)
    #expect(!c.canFinish)
    #expect(c.canRemove("b1"), "bỏ tích hàng đã chứng minh = gỡ set khỏi buổi ấy (RN)")
  }

  /// Không có buổi trên server (hoặc máy này đã có buổi riêng): không nhận gì
  /// — hành vi trước đây giữ nguyên.
  @Test func noRemoteRowsMeansNoAdoption() async throws {
    let c = await controller(InMemoryWorkoutStore(), remote: [])
    #expect(!c.adoptedRemote && c.loggedSessionId == nil)
    await c.toggle("b1")
    await #expect(throws: WorkoutSessionController.FinishRefusal.loggedElsewhere) { try await c.finish() }
  }

  /// Hai máy, đầu-cuối qua server giả gộp như writer thật: nhận buổi Android,
  /// tích Squat, "Ghi thêm" → server có ĐỦ set Android (kể cả Curl ngoài kế
  /// hoạch, nguyên vẹn) + Squat, không set nào bị nhân đôi.
  @Test func appendingToTheAdoptedSessionKeepsEveryAndroidSet() async throws {
    let server = FakeServer()
    await server.externalWrite("s-android", android)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, remote: [android])
    #expect(await c.toggle("s1"))
    #expect(c.canAppend)
    _ = try await c.append()
    for e in await store.outbox { try await server.send(e) }
    guard case .array(let sets)? = await server.table["s-android"]?["sets"] else {
      Issue.record("mất hàng")
      return
    }
    #expect(sets.compactMap { $0["exerciseName"]?.stringValue } == ["Bench Press", "Bench Press", "Curl", "Squat"])
    #expect(sets[0]["weight"] == .number(62.5) && sets[1]["reps"] == .number(7), "set Android giữ đúng số")
    #expect(await server.table["s-android"]?["pr_detected"] == .bool(true), "kỷ lục đã có không mất")
  }

  /// Bỏ tích hàng đã chứng minh → set ấy rời buổi trên server; set khác ở lại.
  @Test func removingAnAdoptedRowRemovesThatSetOnTheServer() async throws {
    let server = FakeServer()
    await server.externalWrite("s-android", android)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, remote: [android])
    _ = try await c.removeLoggedSet("b1")
    for e in await store.outbox { try await server.send(e) }
    guard case .array(let sets)? = await server.table["s-android"]?["sets"] else {
      Issue.record("mất hàng")
      return
    }
    #expect(sets.count == 2)
    #expect(!sets.contains { $0["weight"] == .number(62.5) }, "đúng set 62.5 × 8 bị gỡ")
    #expect(sets.contains { $0["exerciseName"] == .string("Curl") })
  }

  /// Hai buổi cùng ngày: nhận buổi MỚI nhất; hàng do buổi cũ chứng minh thì
  /// tích, khoá, không phải hàng mới — và giữ như vậy sau khi mở lại app.
  @Test func rowsProvenByAnOlderSessionStayLockedAcrossReload() async throws {
    let older: JSONValue = .object([
      "id": .string("s-morning"), "date_time": .string("2026-10-04T23:30:00.000Z"),
      "session_rpe": .number(8), "pr_detected": .bool(false),
      "sets": .array([Self.set("Squat", "ex-squat", 100, 5, rpe: 8, index: 1)]),
    ])
    let store = InMemoryWorkoutStore()
    let c = await controller(store, remote: [older, android])
    #expect(c.loggedSessionId == "s-android")
    #expect(c.olderProven == ["s1"])
    #expect(c.progress.done["s1"] == true)
    #expect(c.pendingRows.isEmpty, "hàng của buổi cũ không bị nối lại")
    #expect(await c.toggle("s1") == false, "khoá")

    let reopened = await controller(store, remote: [])
    #expect(reopened.loggedSessionId == "s-android")
    #expect(reopened.olderProven == ["s1"])
    #expect(reopened.pendingRows.isEmpty)
  }
}
