@testable import ASCNDCore
import Foundation
import Testing

/// Cân nặng và nước đọc từ Apple Health (17/10, khác RN): chỉ đọc, ghi tay
/// thắng, đồng bộ lại không đếm đôi.
struct HealthIntakeTests {
  typealias S = HealthSyncTests
  static let hcm = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static func at(_ iso: String) -> EpochMillis { EpochMillis(iso8601: iso)! }
  static func empty(weighIns: [HealthData.WeighIn] = [], water: [HealthData.WaterRow] = []) -> HealthSync.Snapshot {
    HealthSync.Snapshot(
      bio: nil, steps: nil, activeKcal: nil, exerciseMinutes: nil, sleep: nil, workouts: [], stepDays: [],
      weighIns: weighIns, water: water)
  }

  /// Lần cân mới nhất mỗi ngày ĐỊA PHƯƠNG; ngoài dải 20–400 kg bỏ.
  @Test func newestWeighInPerLocalDay() {
    let list = HealthData.weighIns(
      [
        .init(at: Self.at("2026-10-15T23:00:00Z"), kg: 70.123),  // 16/10 ở Sài Gòn
        .init(at: Self.at("2026-10-16T01:00:00Z"), kg: 70.5),  // 16/10, mới hơn
        .init(at: Self.at("2026-10-14T02:00:00Z"), kg: 71),
        .init(at: Self.at("2026-10-13T02:00:00Z"), kg: 900),
      ], in: Self.hcm)
    #expect(list.map(\.date.description) == ["2026-10-14", "2026-10-16"])
    #expect(list.map(\.kg) == [71, 70.5])
  }

  /// Nước: id = UUID mẫu (chữ thường); bỏ mẫu không UUID, ≤ 0, quá 5 L.
  @Test func waterRowsKeepTheSampleId() {
    let u = "A1B2C3D4-0000-4000-8000-000000000001"
    let rows = HealthData.waterRows(
      [
        .init(uuid: u, at: Self.at("2026-10-16T17:30:00Z"), ml: 249.6),
        .init(uuid: "nope", at: Self.at("2026-10-16T03:00:00Z"), ml: 250),
        .init(uuid: UUID().uuidString, at: Self.at("2026-10-16T03:00:00Z"), ml: 0),
        .init(uuid: UUID().uuidString, at: Self.at("2026-10-16T03:00:00Z"), ml: 9_000),
      ], in: Self.hcm)
    #expect(rows.count == 1)
    #expect(rows[0].id == u.lowercased() && rows[0].ml == 250 && rows[0].date.description == "2026-10-17")
  }

  /// Ngày đã có lần cân (ghi tay) thì để yên; ngày mới được chèn theo hình
  /// dạng hàng ghi tay; hồ sơ theo lần cân mới nhất vừa chèn.
  @Test func manualWeighInWinsAndProfileFollowsNewest() async throws {
    let store = S.Store()
    store.tables["weight_logs"] = [.object(["user_id": .string("u1"), "date": .string("2026-10-15"), "weight_kg": .number(69)])]
    let list: [HealthData.WeighIn] = [
      .init(date: LocalDate("2026-10-15")!, kg: 70), .init(date: LocalDate("2026-10-16")!, kg: 70.4),
    ]
    try await HealthSync.run(Self.empty(weighIns: list), userId: "u1", lang: "vi", store: store, now: S.now, in: S.utc)
    let rows = try #require(store.upserts.first { $0.table == "weight_logs" })
    #expect(rows.onConflict == "user_id,date")
    #expect(rows.rows == [["user_id": .string("u1"), "date": .string("2026-10-16"), "weight_kg": .number(70.4), "notes": .string("")]])
    #expect(store.updates.map(\.table) == ["profiles"])
    #expect(store.updates.first?.row == ["weight_kg": .number(70.4)])
  }

  /// Có lần cân SAU ngày nhập (ghi tay hôm sau): hồ sơ không bị lùi về số cũ.
  @Test func profileKeepsANewerManualWeighIn() async throws {
    let store = S.Store()
    store.tables["weight_logs"] = [.object(["user_id": .string("u1"), "date": .string("2026-10-20"), "weight_kg": .number(68)])]
    try await HealthSync.run(
      Self.empty(weighIns: [.init(date: LocalDate("2026-10-16")!, kg: 70.4)]), userId: "u1", lang: "vi", store: store,
      now: S.now, in: S.utc)
    #expect(store.upserts.contains { $0.table == "weight_logs" })
    #expect(store.updates.isEmpty)
  }

  /// Mọi ngày đều đã có hàng: không ghi gì, không đụng hồ sơ.
  @Test func allDaysTakenWritesNothing() async throws {
    let store = S.Store()
    store.tables["weight_logs"] = [.object(["user_id": .string("u1"), "date": .string("2026-10-16"), "weight_kg": .number(69)])]
    try await HealthSync.run(
      Self.empty(weighIns: [.init(date: LocalDate("2026-10-16")!, kg: 70.4)]), userId: "u1", lang: "vi", store: store,
      now: S.now, in: S.utc)
    #expect(!store.upserts.contains { $0.table == "weight_logs" })
    #expect(store.updates.isEmpty)
  }

  /// Nước: upsert theo `id` (đồng bộ lại không đếm đôi), rồi dựng lại ngày ấy
  /// (`daily_logs.water_ml`).
  @Test func waterUpsertsByIdAndRebuildsTheDay() async throws {
    let store = S.Store()
    let row = HealthData.WaterRow(
      id: "a1b2c3d4-0000-4000-8000-000000000001", date: LocalDate("2026-10-26")!, ml: 300,
      loggedAt: Self.at("2026-10-26T08:00:00Z"))
    try await HealthSync.run(Self.empty(water: [row]), userId: "u1", lang: "vi", store: store, now: S.now, in: S.utc)
    let up = try #require(store.upserts.first { $0.table == "water_logs" })
    #expect(up.onConflict == "id")
    #expect(up.rows.first?["id"] == .string(row.id) && up.rows.first?["amount_ml"] == .number(300))
    #expect(up.rows.first?["user_id"] == .string("u1") && up.rows.first?["date"] == .string("2026-10-26"))
    let rebuilt = (store.tables["daily_logs"] ?? []).compactMap { $0["date"]?.stringValue }
    #expect(rebuilt.contains("2026-10-26"))
  }

  /// Ghi cân / nước hỏng: các phần khác vẫn chạy, lỗi báo đúng tên phần.
  @Test func weightAndWaterFailuresAreCollected() async {
    let store = S.Store()
    store.failUpsert = "water_logs"
    let row = HealthData.WaterRow(
      id: "a1b2c3d4-0000-4000-8000-000000000002", date: LocalDate("2026-10-27")!, ml: 250,
      loggedAt: Self.at("2026-10-27T08:00:00Z"))
    await #expect(throws: HealthSync.Failure.incomplete(["nCxHealthSyncPartWater"])) {
      try await HealthSync.run(
        Self.empty(weighIns: [.init(date: LocalDate("2026-10-27")!, kg: 70)], water: [row]), userId: "u1", lang: "vi",
        store: store, now: S.now, in: S.utc)
    }
    #expect(store.upserts.contains { $0.table == "weight_logs" })
  }
}
