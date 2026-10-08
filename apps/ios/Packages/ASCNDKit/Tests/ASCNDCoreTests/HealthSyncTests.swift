@testable import ASCNDCore
import Foundation
import Testing

/// Một lượt đồng bộ Apple Health → server (`useSyncMutation` + `writeHealthSync`
/// của RN): đúng bảng / cột / khoá xung đột, ghi tay thắng, ngày bị chạm được
/// dựng lại, lỗi `daily_logs` gom từng phần.
struct HealthSyncTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let now = EpochMillis(iso8601: "2026-10-27T09:00:00.000Z")!

  final class Store: RowStore, @unchecked Sendable {
    var tables: [String: [JSONValue]] = [:]
    var upserts: [(table: String, rows: [[String: JSONValue]], onConflict: String)] = []
    var failUpsert: String?
    let golden = DailyLogGoldenTests.TableStore(tables: [:])

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      golden.tables = tables
      return try await golden.select(q)
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
      tables[table, default: []].append(.object(row))
    }
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 1 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {
      if table == failUpsert { throw RowStoreError(code: nil, message: "x") }
      upserts.append((table, rows, onConflict))
    }
  }

  static let bio = HealthData.Biometrics(hrBpm: 55, hrvSdnnMs: 60, spo2Pct: 97, respRateRpm: 14, dateTime: "2026-10-27T06:00:00.000Z", externalId: "hk:a")
  static let sleep = HealthData.Sleep(
    externalId: "sleep:2026-10-26T22:30:00.000Z", bedtime: "2026-10-26T22:30:00.000Z", waketime: "2026-10-27T06:10:00.000Z",
    asleepMin: 440, deepMin: 60, lightMin: 300, remMin: 80)
  static let run = HealthData.Workout(externalId: "hk:r", dateTime: "2026-10-25T07:00:00.000Z", minutes: 32, kcal: 280, activityType: 37)
  static let walk = HealthData.Workout(externalId: "hk:w", dateTime: "2026-10-26T18:00:00.000Z", minutes: 40, kcal: 0, activityType: 52)

  static func snapshot() -> HealthSync.Snapshot {
    HealthSync.Snapshot(
      bio: bio, steps: 8200, activeKcal: nil, exerciseMinutes: 25, sleep: sleep, workouts: [run, walk],
      stepDays: [(LocalDate("2026-10-25")!, 9000), (LocalDate("2026-10-26")!, 4000)])
  }

  @Test func writesEverySourceLikeRN() async throws {
    let store = Store()
    try await HealthSync.run(Self.snapshot(), userId: "u1", lang: "vi", store: store, now: Self.now, in: Self.utc)
    let byTable = Dictionary(grouping: store.upserts, by: \.table)
    #expect(byTable["biometric_samples"]?.first?.onConflict == "user_id,external_id")
    #expect(byTable["sleep_logs"]?.first?.rows.first?["asleep_min"] == .number(440))
    let sessions = try #require(byTable["workout_sessions"]?.first?.rows)
    #expect(sessions.map { $0["template_name"] } == [.string("Chạy bộ · 32′ · 280 kcal"), .string("Đi bộ · 40′")])
    #expect(sessions.allSatisfy { $0["sets"] == .array([]) && $0["volume_load"] == .number(0) && $0["source"] == .string("apple_health") })
    let logs = try #require(byTable["daily_logs"])
    #expect(logs[0].rows == [["user_id": .string("u1"), "date": .string("2026-10-27"), "steps": .number(8200), "active_minutes": .number(25)]])
    #expect(logs[1].rows.map { $0["date"] } == [.string("2026-10-25"), .string("2026-10-26")])
    // Dựng lại: hôm nay (sinh trắc, giấc dậy hôm nay), 25 và 26 (buổi tập).
    let rebuilt = (store.tables["daily_logs"] ?? []).compactMap { $0["date"]?.stringValue }
    #expect(rebuilt == ["2026-10-25", "2026-10-26", "2026-10-27"])
  }

  /// Ghi tay thắng: giấc ghi tay trong ±12 giờ, buổi ghi tay trong ±2 giờ.
  @Test func manualEntriesWin() async throws {
    let store = Store()
    store.tables["sleep_logs"] = [.object(["user_id": .string("u1"), "id": .string("m"), "source": .string("manual"), "bedtime": .string("2026-10-27T05:00:00.000Z")])]
    store.tables["workout_sessions"] = [.object(["user_id": .string("u1"), "source": .string("manual"), "date_time": .string("2026-10-25T08:30:00.000Z")])]
    try await HealthSync.run(Self.snapshot(), userId: "u1", lang: "en", store: store, now: Self.now, in: Self.utc)
    #expect(!store.upserts.contains { $0.table == "sleep_logs" })
    let sessions = store.upserts.first { $0.table == "workout_sessions" }?.rows ?? []
    #expect(sessions.map { $0["external_id"] } == [.string("hk:w")], "buổi chạy trùng giờ buổi ghi tay bị bỏ")
    #expect(sessions.first?["template_name"] == .string("Walking · 40′"))
  }

  @Test func emptySnapshotIsNoData() async {
    let s = HealthSync.Snapshot(bio: nil, steps: nil, activeKcal: nil, exerciseMinutes: nil, sleep: nil, workouts: [], stepDays: [])
    await #expect(throws: HealthSync.Failure.noData) {
      try await HealthSync.run(s, userId: "u1", lang: "vi", store: Store(), now: Self.now, in: Self.utc)
    }
  }

  /// `daily_logs` hỏng: phần khác vẫn ghi, lỗi báo một lần, đủ từng phần.
  @Test func dailyLogFailuresAreCollected() async {
    let store = Store()
    store.failUpsert = "daily_logs"
    await #expect(throws: HealthSync.Failure.incomplete(["nCxHealthSyncPartToday", "nCxHealthSyncPartSteps"])) {
      try await HealthSync.run(Self.snapshot(), userId: "u1", lang: "vi", store: store, now: Self.now, in: Self.utc)
    }
    #expect(store.upserts.contains { $0.table == "workout_sessions" })
  }

  @Test func autoSyncEveryFifteenMinutesOnlyOnceAsked() {
    let t = Self.now
    #expect(HealthSync.shouldAutoSync(asked: true, lastSync: nil, now: t))
    #expect(!HealthSync.shouldAutoSync(asked: false, lastSync: nil, now: t))
    #expect(!HealthSync.shouldAutoSync(asked: true, lastSync: t - 14 * 60_000, now: t))
    #expect(HealthSync.shouldAutoSync(asked: true, lastSync: t - 15 * 60_000, now: t))
  }
}
