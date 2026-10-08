import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Đơn vị tạ trong luồng tập (#527 1.9-A): DB luôn kg, người dùng xem và gõ
/// theo `profiles.units_weight`.
///
/// RN (`day-plan.tsx` @ fac9ac2): ô hạt giống `String(Math.round(displayWeight(kg) * 10) / 10)`,
/// `performed` đọc chữ trong ô bằng `weightToKg(typed, wUnit)` — không làm tròn;
/// lúc GHI set, `use-fitness-data.ts:410` / `:631` làm tròn 2 chữ số lẻ
/// (`Math.round(weight * 100) / 100`) — 135 lb lên server là 61.23 kg.
@MainActor
struct WorkoutUnitsTests {
  private let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
  private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  private let today = LocalDate("2026-10-05")!
  private static let lbPerKg = 2.2046226218

  private let rows = [
    PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7),
    PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 8),
    PlannedSet(key: "s1", exerciseId: "ex-squat", exerciseName: "Squat", ordinal: 1, of: 1, weightKg: 100, reps: 5, plannedRest: 120, plannedRpe: 8),
  ]

  private static func set(_ name: String, _ id: String, _ kg: Double, _ reps: Int, index: Int) -> JSONValue {
    .object([
      "exerciseId": .string(id), "exerciseName": .string(name), "setIndex": .number(Double(index)),
      "weight": .number(kg), "reps": .number(Double(reps)), "rpe": .number(8),
    ])
  }

  /// Buổi máy khác ghi: Bench 60 kg (máy kg) và Bench 61.23 kg (máy lb gõ
  /// "135" → `weightToKg` = 61.23497… → ghi 2 chữ số lẻ), cùng một Curl ngoài kế hoạch.
  private var remote: JSONValue {
    .object([
      "id": .string("s-other"), "date_time": .string("2026-10-05T02:00:00.000Z"),
      "session_rpe": .number(8), "pr_detected": .bool(false),
      "sets": .array([
        Self.set("Bench Press", "ex-bench", 60, 8, index: 1),
        Self.set("Bench Press", "ex-bench", 61.23, 6, index: 2),
        Self.set("Curl", "", 15, 12, index: 3),
      ]),
    ])
  }

  private func controller(
    _ store: InMemoryWorkoutStore, unit: WeightUnit, remote: [JSONValue] = [], loggedElsewhere: Bool? = nil
  ) async -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: today, templateId: "tpl", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: clock, timeZone: saigon,
      loggedElsewhere: loggedElsewhere ?? !remote.isEmpty, remoteSessions: remote)
    c.setWeightUnit(unit)
    await c.load()
    return c
  }

  private func serverSets(_ server: FakeServer, _ id: String) async throws -> [JSONValue] {
    guard case .array(let sets)? = await server.table[id]?["sets"] else {
      Issue.record("mất hàng \(id)")
      return []
    }
    return sets
  }

  private func outboxSets(_ store: InMemoryWorkoutStore) async throws -> [JSONValue] {
    let entry = try #require(await store.outbox.last)
    guard case .array(let sets)? = entry.payload["sets"] else { return [] }
    return sets
  }

  // MARK: - Đa thiết bị (`WorkoutSessionController.adoptRemote`)

  /// Server kg → hồ sơ lbs → ô hiện lb (một chữ số lẻ), set vẫn mang đúng số
  /// kg của server.
  @Test func serverKgShowsAsPoundsForALbsProfile() async {
    let c = await controller(InMemoryWorkoutStore(), unit: .lbs, remote: [remote])
    #expect(c.adoptedRemote)
    #expect(c.progress.weightText["b1"] == "132.3", "60 kg → 132.3 lb, không phải \"60\" đọc thành 60 lb")
    #expect(c.progress.weightText["b2"] == "135", "61.23 kg (gõ 135 lb ở máy kia) → 134.99 → 135 lb")
    #expect(c.performed(rows[0]).weightKg == 60, "không thành 132.3 / 2.2046 = 60.0103")
    #expect(c.performed(rows[1]).weightKg == 61.23)
  }

  /// Dữ liệu gốc lb đã chuẩn hoá kg trên server → hồ sơ kg hiện 61.2 kg.
  @Test func lbOriginDataShowsAsKgForAKgProfile() async {
    let c = await controller(InMemoryWorkoutStore(), unit: .kg, remote: [remote])
    #expect(c.progress.weightText["b1"] == "60")
    #expect(c.progress.weightText["b2"] == "61.2")
    #expect(c.performed(rows[1]).weightKg == 61.23, "ô hiện 61.2, set vẫn 61.23 kg")
  }

  /// Gỡ set đã nhận dưới hồ sơ lbs: đúng set ấy rời buổi trên server. Không có
  /// số kg thật thì bản ghi lại mang 60.0103 kg — `SessionRevisionMerge` so
  /// theo nội dung không tìm thấy set 60 kg để gỡ, set nằm lại trên server.
  @Test(arguments: [WeightUnit.kg, .lbs])
  func removingAnAdoptedRowRemovesThatExactServerSet(unit: WeightUnit) async throws {
    let server = FakeServer()
    await server.externalWrite("s-other", remote)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: unit, remote: [remote])
    _ = try await c.removeLoggedSet("b2")
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, "s-other")
    #expect(sets.count == 2)
    #expect(!sets.contains { $0["reps"] == .number(6) }, "set 135 lb × 6 bị gỡ")
    #expect(sets.contains { $0["weight"] == .number(60) && $0["reps"] == .number(8) }, "set 60 kg ở nguyên số")
    #expect(sets.contains { $0["exerciseName"] == .string("Curl") })
  }

  /// Nối thêm dưới hồ sơ lbs: set server giữ đúng số kg; set mới gõ lb đổi
  /// về kg không làm tròn rồi ghi 2 chữ số lẻ như RN (225 lb → 102.06 kg).
  @Test func appendingUnderLbsKeepsServerKgAndStoresTypedPoundsUnrounded() async throws {
    let server = FakeServer()
    await server.externalWrite("s-other", remote)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs, remote: [remote])
    #expect(await c.setWeightText("225", for: "s1"))
    #expect(await c.toggle("s1"))
    _ = try await c.append()
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, "s-other")
    #expect(sets.map { $0["weight"]?.doubleValue } == [60, 61.23, 15, 102.06])
  }

  /// Hồ sơ đổi đơn vị SAU khi đã nhận buổi (hồ sơ nạp muộn hơn buổi, hay đổi
  /// ở máy khác): ô của set server điền lại theo đơn vị mới, số kg giữ nguyên.
  @Test func adoptedRowsFollowAUnitChange() async throws {
    let server = FakeServer()
    await server.externalWrite("s-other", remote)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .kg, remote: [remote])
    #expect(c.progress.weightText["b1"] == "60")
    c.setWeightUnit(.lbs)
    #expect(c.progress.weightText["b1"] == "132.3" && c.progress.weightText["b2"] == "135")
    #expect(c.performed(rows[0]).weightKg == 60)
    _ = try await c.removeLoggedSet("b1")
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, "s-other")
    #expect(!sets.contains { $0["weight"] == .number(60) }, "đúng set 60 kg bị gỡ sau khi đổi đơn vị")
    #expect(sets.count == 2)
  }

  /// Mở lại app: số kg thật của set đã nhận còn đó (bền cùng ngày).
  @Test func remoteWeightSurvivesReload() async {
    let store = InMemoryWorkoutStore()
    _ = await controller(store, unit: .lbs, remote: [remote])
    let reopened = await controller(store, unit: .lbs, loggedElsewhere: true)
    #expect(reopened.loggedSessionId == "s-other")
    #expect(reopened.progress.weightText["b1"] == "132.3")
    #expect(reopened.performed(rows[0]).weightKg == 60)
  }

  /// Bản lưu trên máy (GRDB mã hoá JSON) giữ số kg thật; bản cũ không có
  /// trường ấy đọc ra rỗng, không lỗi.
  @Test func remoteWeightIsCodableAndOptional() throws {
    var p = DayProgress()
    p.weightText["b1"] = "135"
    p.remoteWeight["b1"] = RemoteWeight(text: "135", kg: 135 / Self.lbPerKg)
    let back = try JSONDecoder().decode(DayProgress.self, from: JSONEncoder().encode(p))
    #expect(back == p)
    let old = try JSONDecoder().decode(DayProgress.self, from: Data(#"{"weightText":{"b1":"60"}}"#.utf8))
    #expect(old.remoteWeight.isEmpty && old.weightText["b1"] == "60")
  }

  // MARK: - Chốt theo đơn vị của tài khoản

  /// Hồ sơ lbs: gõ "135" → `performed` = 135 / 2.2046226218 kg (không làm
  /// tròn), set ghi 61.23 kg (2 chữ số lẻ, `use-fitness-data.ts:410`).
  @Test func finishingUnderLbsStoresUnroundedKg() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs)
    #expect(await c.setWeightText("135", for: "b1"))
    #expect(await c.toggle("b1"))
    #expect(await c.toggle("s1"))
    #expect(c.performed(rows[0]).weightKg == 135 / Self.lbPerKg)
    _ = try await c.finish()
    let sets = try await outboxSets(store)
    #expect(sets.map { $0["weight"]?.doubleValue } == [61.23, 100], "hàng chưa gõ giữ đúng số kế hoạch (kg)")
  }

  /// Gọi tường minh `toKg` vẫn thắng đơn vị (Lab, test cũ).
  @Test func explicitConversionStillWins() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs)
    #expect(await c.setWeightText("70", for: "b1"))
    #expect(await c.toggle("b1"))
    _ = try await c.finish(toKg: { $0 })
    #expect(try await outboxSets(store).first?["weight"]?.doubleValue == 70)
  }

  /// RN behavior giữ nguyên (không có đơn vị theo set): đổi đơn vị giữa ngày
  /// thì chữ người dùng ĐÃ GÕ đọc lại theo đơn vị mới — "100" gõ lúc kg
  /// thành 100 lb (45.359… kg, ghi 45.36) khi chốt sau khi đổi sang lbs.
  @Test func midDayUnitChangeRereadsTypedText() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .kg)
    #expect(await c.setWeightText("100", for: "b1"))
    #expect(await c.toggle("b1"))
    #expect(c.performed(rows[0]).weightKg == 100)
    c.setWeightUnit(.lbs)
    #expect(c.progress.weightText["b1"] == "100", "chữ gõ không bị viết lại")
    #expect(c.performed(rows[0]).weightKg == 100 / Self.lbPerKg)
    _ = try await c.finish()
    #expect(try await outboxSets(store).first?["weight"]?.doubleValue == 45.36)
  }

  /// Gõ đè lên ô của set đã nhận (sau khi gỡ nó): chữ mới đọc theo đơn vị,
  /// không còn bám số kg cũ.
  @Test func typingOverAnAdoptedRowDropsTheServerWeight() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs, remote: [remote])
    _ = try await c.removeLoggedSet("b1")
    #expect(await c.setWeightText("132.3", for: "b1"))
    #expect(c.progress.remoteWeight["b1"] == nil)
    #expect(c.performed(rows[0]).weightKg == 132.3 / Self.lbPerKg)
  }

  // MARK: - 1.9-B: màn tập + Today

  /// Ô tạ của hàng chưa gõ hiện `unit.seed(kg)`; KHÔNG chạm thì set ghi đúng
  /// số kế hoạch (60 kg). Khác RN có chủ đích: RN gieo chữ "132.3" vào state
  /// rồi đọc lại → 60.0103 → ghi 60.01 kg cho một set kế hoạch 60 kg.
  @Test func untouchedPlannedRowUnderLbsLogsThePlannedKg() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs)
    #expect(WeightUnit.lbs.seed(rows[0].weightKg) == "132.3", "ô hiện 132.3 lb")
    #expect(await c.toggle("b1"))
    _ = try await c.finish()
    #expect(try await outboxSets(store).first?["weight"]?.doubleValue == 60)
  }

  /// Gõ lại đúng chữ ô đang hiện ("132.3" lb) là một số người dùng NHẬP:
  /// đổi về kg rồi ghi 2 chữ số lẻ như RN → 60.01 kg.
  @Test func retypedSeedIsReadAsTypedPounds() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs)
    #expect(await c.setWeightText(WeightUnit.lbs.seed(60), for: "b1"))
    #expect(await c.toggle("b1"))
    _ = try await c.finish()
    #expect(try await outboxSets(store).first?["weight"]?.doubleValue == 60.01)
  }

  /// Dòng kế hoạch của Today: một chữ số lẻ theo đơn vị, dấu thập phân của
  /// máy; không tạ → không có chữ (không "0 kg").
  @Test func todayLoadFollowsUnitAndLocale() {
    let en = Locale(identifier: "en_US"), vi = Locale(identifier: "vi_VN")
    #expect(WeightUnit.kg.localizedLoad(62.5, locale: en) == "62.5 kg")
    #expect(WeightUnit.kg.localizedLoad(62.5, locale: vi) == "62,5 kg")
    #expect(WeightUnit.lbs.localizedLoad(62.5, locale: en) == "137.8 lb")
    #expect(WeightUnit.lbs.localizedLoad(62.5, locale: vi) == "137,8 lb")
    #expect(WeightUnit.kg.localizedLoad(100, locale: vi) == "100 kg")
    #expect(WeightUnit.lbs.localizedLoad(60, locale: Locale(identifier: "es_ES")) == "132,3 lb")
    #expect(WeightUnit.lbs.localizedLoad(1000, locale: en) == "2204.6 lb", "không nhóm nghìn, như RN")
    #expect(WeightUnit.kg.localizedLoad(62.25, locale: en) == "62.3 kg", "một chữ số lẻ như displayWeight")
    #expect(WeightUnit.kg.localizedLoad(0, locale: en) == nil)
    #expect(WeightUnit.lbs.localizedLoad(-5, locale: en) == nil)
  }

  // MARK: - 1.9-D: số kg đã gửi giữ nguyên qua đổi đơn vị

  /// Gõ "135" dưới lbs, chốt (gửi 61.23 kg), hồ sơ đổi sang kg, rồi bỏ tích:
  /// đúng set ấy rời server. Không có mốc kg đã gửi, bản ghi lại đọc "135"
  /// thành 135 kg → `SessionRevisionMerge` không thấy set nào để gỡ (RN gỡ
  /// theo tên bài nên không vấp). Ô hiện lại theo kg: "61.2".
  @Test func loggedPoundsSetIsRemovedAfterSwitchingToKg() async throws {
    let server = FakeServer()
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs)
    #expect(await c.setWeightText("135", for: "b1"))
    #expect(await c.toggle("b1"))
    #expect(await c.toggle("s1"))
    let summary = try await c.finish()
    c.setWeightUnit(.kg)
    #expect(c.progress.weightText["b1"] == "61.2", "set đã ghi là số kg đã gửi, hiện theo đơn vị mới")
    #expect(c.performed(rows[0]).weightKg == 135 / Self.lbPerKg)
    _ = try await c.removeLoggedSet("b1")
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, summary.sessionId)
    #expect(sets.map { $0["exerciseName"]?.stringValue } == ["Squat"], "set Bench 135 lb bị gỡ, Squat ở lại")
  }

  /// Nối thêm dưới lbs rồi đổi sang kg: set nối thêm vẫn gỡ đúng.
  @Test func appendedPoundsSetIsRemovedAfterSwitchingToKg() async throws {
    let server = FakeServer()
    await server.externalWrite("s-other", remote)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs, remote: [remote])
    #expect(await c.setWeightText("225", for: "s1"))
    #expect(await c.toggle("s1"))
    _ = try await c.append()
    c.setWeightUnit(.kg)
    _ = try await c.removeLoggedSet("s1")
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, "s-other")
    #expect(sets.map { $0["weight"]?.doubleValue } == [60, 61.23, 15], "set 225 lb (102.06) bị gỡ, set server nguyên")
  }

  /// Gỡ rồi hoàn tác set nhận từ máy khác dưới lbs: set trở lại ĐÚNG 60 kg,
  /// không phải 60.01 (đọc lại từ "132.3").
  @Test func undoingAnAdoptedRowUnderLbsRestoresTheExactKg() async throws {
    let server = FakeServer()
    await server.externalWrite("s-other", remote)
    let store = InMemoryWorkoutStore()
    let c = await controller(store, unit: .lbs, remote: [remote])
    let removal = try await c.removeLoggedSet("b1")
    try await c.undo(removal)
    for e in await store.outbox { try await server.send(e) }
    let sets = try await serverSets(server, "s-other")
    #expect(sets.count == 3)
    #expect(sets.filter { $0["exerciseName"] == .string("Bench Press") }.map { $0["weight"]?.doubleValue }.sorted { ($0 ?? 0) < ($1 ?? 0) } == [60, 61.23])
  }

  /// Hàng CHƯA ghi giữ hành vi RN: đổi đơn vị không viết lại chữ người dùng gõ.
  @Test func unloggedTypedTextIsNeverRewrittenByAUnitChange() async {
    let c = await controller(InMemoryWorkoutStore(), unit: .lbs)
    #expect(await c.setWeightText("135", for: "b1"))
    #expect(await c.toggle("b1"))
    c.setWeightUnit(.kg)
    #expect(c.progress.weightText["b1"] == "135")
    #expect(c.progress.remoteWeight["b1"] == nil)
  }
}
