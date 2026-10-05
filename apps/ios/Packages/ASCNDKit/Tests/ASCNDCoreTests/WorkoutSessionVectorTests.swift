import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/workout-session.json` (WS-S*, issue #280,
/// D-7 #282). Cùng một tệp vector chạy ở cả hai bên: RN
/// (`spec/vectors/run-workout-session.mjs`) và Swift (ở đây).
///
/// Mỗi ca gọi logic Swift THẬT: `DayProgressStore`, `WorkoutDay`,
/// `WorkoutSessionRecord`, `WorkoutSessionController`.
private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

struct WorkoutSessionVectorTests {
  private static func vectors() throws -> [GoldenVector<JSONValue, JSONValue>] {
    try GoldenVectors.load(
      RepoPaths.specVectors.appendingPathComponent("workout-session.json"))
  }

  // MARK: - WS-S1: mở / khôi phục

  @Test func s1OpenAndRestore() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("WS-S1") {
      let date = try #require(LocalDate(v.input["dateStr"]?.stringValue ?? ""))
      let templateId = try #require(v.input["templateId"]?.stringValue)
      #expect(DayProgressStore.key(date: date, templateId: templateId)
        == v.expected["key"]?.stringValue, "\(v.rule): key")

      // Blob: null → mới; chuỗi hỏng → mới; object → khôi phục.
      let blob = v.input["blob"] ?? .null
      var idle = true
      var progress = DayProgress()
      var extraCount = 0
      switch blob {
      case .null:
        break
      case .string(let s):
        if let data = s.data(using: .utf8),
           let p = try? JSONDecoder().decode(DayProgress.self, from: data) {
          idle = false; progress = p
        }
      case .object(let o):
        let data = try JSONEncoder().encode(JSONValue.object(o))
        // Trường lạ (extra) bị bỏ qua khi decode — đúng hợp đồng.
        if let p = try? JSONDecoder().decode(DayProgress.self, from: data) {
          idle = false; progress = p
        }
        if case .array(let extra) = o["extra"] {
          extraCount = extra.filter {
            if case .object(let e) = $0, case .string(let id) = e["id"], !id.isEmpty { return true }
            return false
          }.count
        }
      default:
        break
      }
      #expect(idle == v.expected["idle"]?.boolValue, "\(v.rule): idle")
      #expect(progress.done.count == v.expected["doneCount"]?.intValue, "\(v.rule): doneCount")
      if !idle {
        #expect(progress.done == decodeStringBoolMap(v.expected["done"]), "\(v.rule): done")
        #expect(progress.rpe == decodeStringIntMap(v.expected["rpe"]), "\(v.rule): rpe")
        #expect(progress.weightText == decodeStringMap(v.expected["weightText"]), "\(v.rule): weightText")
        #expect(progress.repsText == decodeStringMap(v.expected["repsText"]), "\(v.rule): repsText")
        #expect(extraCount == v.expected["extraCount"]?.intValue, "\(v.rule): extraCount")
      }
    }
  }

  // MARK: - WS-S2: log / sửa set

  @Test func s2LogAndEditSet() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("WS-S2") {
      let row = try #require(plannedSet(from: v.input["row"] ?? .null))
      var progress = DayProgress()
      progress.weightText = decodeStringMap(v.input["weightText"])
      progress.repsText = decodeStringMap(v.input["repsText"])
      let wUnit = v.input["wUnit"]?.stringValue ?? "kg"
      let toKg: (Double) -> Double = wUnit == "lbs" ? { $0 / 2.2046226218 } : { $0 }
      let p = WorkoutDay.performed(row, progress, toKg: toKg)
      let exp = v.expected
      #expect(abs(p.weightKg - (exp["weight"]?.numberValue ?? 0)) < 0.0002, "\(v.rule): weight")
      #expect(p.reps == exp["reps"]?.intValue, "\(v.rule): reps")
      #expect(p.durationSec == exp["durationSec"]?.intValue, "\(v.rule): durationSec")
      #expect((p.reps > 0 || (p.durationSec ?? 0) > 0) == exp["counted"]?.boolValue,
              "\(v.rule): counted")
    }
  }

  // MARK: - WS-S3: chốt

  @Test func s3FinishPayload() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("WS-S3") {
      guard case .array(let sets) = v.input["sets"],
            case .array(let ticked) = v.input["ticked"] else {
        Issue.record("\(v.rule): thiếu sets/ticked"); continue
      }
      var sessionSets: [SessionSet] = []
      for (i, s) in sets.enumerated() {
        guard ticked[i].boolValue == true else { continue } // chỉ hàng đã tick
        sessionSets.append(SessionSet(
          exerciseId: "",
          exerciseName: s["name"]?.stringValue ?? "Exercise",
          weightKg: s["weight"]?.numberValue ?? 0,
          reps: s["reps"]?.intValue ?? 0,
          rpe: s["rpe"]?.intValue ?? 0,
          warmup: s["warmup"]?.boolValue ?? false))
      }
      let t = v.input["template"]
      let templateId: String? = {
        guard case .object(let o) = t else { return nil }
        return o["id"]?.stringValue
      }()
      let templateName = {
        guard case .object(let o) = t else { return "Workout" }
        return o["name"]?.stringValue ?? "Workout"
      }()
      let record = try #require(WorkoutSessionRecord(
        id: "v-\(v.rule)", userId: "u1", dateTime: EpochMillis(0),
        templateId: templateId, templateName: templateName, sets: sessionSets))
      let exp = v.expected
      if let n = exp["setCount"]?.intValue { #expect(record.sets.count == n, "\(v.rule): setCount") }
      if let names = exp["names"], case .array(let ns) = names {
        #expect(record.sets.map { $0.exerciseName } == ns.compactMap { $0.stringValue },
                "\(v.rule): names")
      }
      if let rpe = exp["sessionRpe"]?.intValue {
        #expect(record.sessionRpe == rpe, "\(v.rule): sessionRpe = max")
      }
      if let vol = exp["volumeLoad"]?.intValue {
        #expect(record.volumeLoad == vol, "\(v.rule): volumeLoad bỏ warmup")
      }
      // template_id null cho buổi tự do; tên rỗng → "Workout" (trong .row).
      let row = record.row
      if exp["templateId"] != nil {
        #expect(row["template_id"] == .null || row["template_id"]?.stringValue == templateId,
                "\(v.rule): template_id")
      }
      if let tn = exp["templateName"]?.stringValue {
        #expect(row["template_name"]?.stringValue == tn, "\(v.rule): template_name")
      }
      // Dấu thời gian: ngày quá khứ → 12:00 trưa địa phương (WS-S3d).
      if let dateStr = v.input["date"]?.stringValue,
         let date = LocalDate(dateStr),
         let expDate = exp["stampLocalDate"]?.stringValue {
        let now = EpochMillis(1_791_000_000_000)
        let stamped = WorkoutSessionRecord.stamp(
          for: date, today: LocalDate(now, in: saigon), now: now, timeZone: saigon)
        #expect(LocalDate(stamped, in: saigon).description == expDate, "\(v.rule): stamp date")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = saigon
        #expect(cal.component(.hour, from: stamped.date) == exp["stampLocalHour"]?.intValue,
                "\(v.rule): stamp hour")
      }
    }
  }

  // MARK: - WS-S4/S5: chốt trùng, ngày tương lai/đã chốt

  @MainActor
  private static func finishedController(
    store: InMemoryWorkoutStore = InMemoryWorkoutStore(),
    date: LocalDate = LocalDate("2026-10-05")!
  ) async throws -> (WorkoutSessionController, InMemoryWorkoutStore) {
    let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
    let rows = [
      PlannedSet(key: "b1", exerciseName: "Bench Press", ordinal: 1, of: 2,
                 weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7),
      PlannedSet(key: "b2", exerciseName: "Bench Press", ordinal: 2, of: 2,
                 weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 8),
    ]
    let c = WorkoutSessionController(
      plan: .init(date: date, templateId: "tpl-1", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: clock, timeZone: saigon, makeId: { "sess-1" },
      onRest: { _, _ in }, onEnqueued: { _ in })
    await c.load()
    _ = await c.toggle("b1")
    _ = await c.toggle("b2")
    _ = try await c.finish()
    return (c, store)
  }

  /// WS-S4: chốt hai lần → một buổi, cùng id, không ghi thêm.
  @Test @MainActor func s4DoubleFinishIsOneSession() async throws {
    for rule in ["WS-S4a", "WS-S4b"] {
      let (c, store) = try await Self.finishedController()
      #expect(!c.canFinish, "\(rule): đã chốt → không chốt nữa")
      let again = try await c.finish()
      #expect(again.sessionId == "sess-1", "\(rule): cùng id")
      #expect(await store.outbox.count == 1, "\(rule): một hàng outbox duy nhất")
    }
  }

  /// WS-S5a: ngày tương lai → chốt bị từ chối.
  @Test @MainActor func s5FutureDayCannotFinish() async throws {
    let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
    let store = InMemoryWorkoutStore()
    let c = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-06")!, templateId: "tpl-1",
                  templateName: "Push",
                  rows: [PlannedSet(key: "b1", exerciseName: "Bench", ordinal: 1, of: 1,
                                    weightKg: 60, reps: 8, plannedRest: 90)]),
      userId: "u1", store: store, clock: clock, timeZone: saigon, makeId: { "sess-f" },
      onRest: { _, _ in }, onEnqueued: { _ in })
    await c.load()
    _ = await c.toggle("b1")
    #expect(!c.canFinish, "WS-S5a: ngày tương lai không chốt được")
    do {
      _ = try await c.finish()
      Issue.record("WS-S5a: ngày tương lai mà chốt được")
    } catch let e as WorkoutSessionController.FinishRefusal {
      #expect(e == .futureDay, "WS-S5a")
    }
  }

  /// WS-S5b: ngày đã chốt → khoá.
  @Test @MainActor func s5LoggedDayIsLocked() async throws {
    let (c, _) = try await Self.finishedController()
    #expect(!c.canFinish, "WS-S5b: ngày đã chốt → khoá")
  }

  // MARK: - WS-S6: dấu thời gian

  @Test func s6Timestamp() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("WS-S6") {
      let raw = try #require(v.input["dateStr"]?.stringValue)
      let now = EpochMillis(1_791_183_600_000) // 2026-10-05T14:00:00+07:00
      let today = LocalDate(now, in: saigon)
      let date: LocalDate = raw == "today" ? today : try #require(LocalDate(raw))
      let stamped = WorkoutSessionRecord.stamp(for: date, today: today, now: now, timeZone: saigon)
      if v.expected["isToday"]?.boolValue == true {
        #expect(stamped == now, "\(v.rule): hôm nay = lúc này")
      } else {
        #expect(LocalDate(stamped, in: saigon).description
          == v.expected["localDate"]?.stringValue, "\(v.rule): ngày")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = saigon
        #expect(cal.component(.hour, from: stamped.date) == v.expected["localHour"]?.intValue,
                "\(v.rule): 12:00 trưa địa phương")
      }
    }
  }
}

// MARK: - helpers

private func plannedSet(from json: JSONValue) -> PlannedSet? {
  guard case .object(let o) = json, let key = o["key"]?.stringValue else { return nil }
  return PlannedSet(
    key: key, exerciseName: "Row",
    ordinal: 1, of: 1,
    weightKg: o["weight"]?.numberValue ?? 0,
    reps: o["reps"]?.intValue ?? 0,
    plannedRest: 90)
}

private func decodeStringMap(_ json: JSONValue?) -> [String: String] {
  guard case .object(let o) = json else { return [:] }
  return o.compactMapValues { $0.stringValue }
}

private func decodeStringIntMap(_ json: JSONValue?) -> [String: Int] {
  guard case .object(let o) = json else { return [:] }
  return o.compactMapValues { $0.intValue }
}

private func decodeStringBoolMap(_ json: JSONValue?) -> [String: Bool] {
  guard case .object(let o) = json else { return [:] }
  return o.compactMapValues { $0.boolValue }
}

private extension JSONValue {
  var numberValue: Double? {
    if case .number(let n) = self { return n }
    return nil
  }
}
