@testable import ASCNDCore
import Foundation
import Testing

/// Ba vòng hoạt động (#527 N4). Golden: `activity.ts` / `prescription.ts`
/// @ fac9ac2 biên dịch + `minutesOf` chép nguyên văn (`gen-activity.mjs`).
struct ActivityRingsGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "activity-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  /// Ô số của golden: `"NaN"` là NaN, `null` là `nil`.
  static func opt(_ v: JSONValue?) -> Double? {
    if v?.stringValue == "NaN" { return .nan }
    return v?.doubleValue
  }

  static func same(_ a: Double, _ b: JSONValue?) -> Bool {
    guard let e = opt(b) else { return false }
    return a == e || a.isNaN && e.isNaN
  }

  static let enUS = Locale(identifier: "en_US")

  @Test func targetsMatchRN() throws {
    let g = try Self.golden()
    #expect(ActivityRings.moveTargetKcal == g["moveTargetKcal"]?.doubleValue)
    #expect(ActivityRings.exerciseTargetMin == g["exerciseTargetMin"]?.doubleValue)
  }

  @Test func modelMatchesRN() throws {
    let cases = Self.array(try Self.golden()["models"])
    #expect(cases.count == 300)
    for c in cases {
      let i = c["input"]
      let m = ActivityRings.model(
        ActivityRings.Input(
          moveKcal: Self.opt(i?["moveKcal"]), estimatedMoveKcal: Self.opt(i?["estimatedMoveKcal"]),
          healthMinutes: Self.opt(i?["healthMinutes"]), loggedMinutes: Self.opt(i?["loggedMinutes"]) ?? 0,
          steps: Self.opt(i?["steps"]) ?? 0, stepsTarget: Self.opt(i?["stepsTarget"]) ?? 0))
      let o = c["out"]
      #expect(Double(m.closed) == o?["closed"]?.doubleValue, "\(c)")
      #expect(m.hasAny == (o?["hasAny"] == .bool(true)), "\(c)")
      let rings = Self.array(o?["rings"])
      #expect(m.rings.count == rings.count)
      for (r, e) in zip(m.rings, rings) {
        #expect(r.key.rawValue == e["key"]?.stringValue, "\(c)")
        #expect(Self.same(r.current, e["current"]), "\(c) current")
        #expect(Self.same(r.target, e["target"]), "\(c) target")
        #expect(r.source.rawValue == e["source"]?.stringValue, "\(c) source")
        #expect(Self.same(r.pct, e["pct"]), "\(c) pct")
        #expect(ActivityRings.valueText(r, locale: Self.enUS) == e["value"]?.stringValue, "\(c) value")
        #expect(
          ActivityRings.targetText(r, unit: "u", locale: Self.enUS) == e["targetText"]?.stringValue, "\(c) target text")
      }
    }
  }

  @Test func loggedMinutesMatchesMinutesOf() throws {
    let cases = Self.array(try Self.golden()["minutes"])
    #expect(cases.count == 80)
    for c in cases {
      #expect(Self.same(ActivityRings.loggedMinutes(Self.array(c["rows"])), c["out"]), "\(c)")
    }
  }
}

/// Luật native-only: đọc, gộp kcal theo buổi, đổi ngày, đọc hỏng.
@MainActor
struct ActivityRingsBookTests {
  final class Store: RowStore, @unchecked Sendable {
    var fail = false
    var daily: [JSONValue] = []
    var sessions: [JSONValue] = []
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if fail { throw RowStoreError(code: nil, message: "offline") }
      return q.table == "daily_logs" ? daily : sessions
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let day = LocalDate("2026-10-13")!
  static let body = SessionEnergy.Body(weightKg: 70, heightCm: 175, age: 30, sex: .male)

  static func session(reps: Double, rpe: Double) -> JSONValue {
    .object([
      "session_rpe": .number(rpe),
      "sets": .array(Array(repeating: .object(["reps": .number(reps), "weight": .number(60)]), count: 4)),
    ])
  }

  @Test func readsAreTheRNQueries() {
    let q = ActivityRings.reads(userId: "u1", today: Self.day, in: Self.hanoi)
    #expect(q.daily.table == "daily_logs")
    #expect(q.daily.columns == "active_kcal, active_minutes, steps")
    #expect(q.daily.filters.contains(.eq("date", .string("2026-10-13"))))
    #expect(q.daily.mode == .maybeSingle)
    #expect(q.sessions.columns == "sets, session_rpe")
    // Ngày địa phương Hà Nội: 2026-10-12T17:00Z … 2026-10-13T17:00Z.
    #expect(q.sessions.filters.contains(.gte("date_time", .string("2026-10-12T17:00:00.000Z"))))
    #expect(q.sessions.filters.contains(.lt("date_time", .string("2026-10-13T17:00:00.000Z"))))
  }

  /// Kcal ước lượng tính theo TỪNG buổi rồi cộng, như `useTodayActiveKcal`.
  @Test func estimatedKcalSumsPerSession() {
    let rows = [Self.session(reps: 10, rpe: 9), Self.session(reps: 10, rpe: 5)]
    let each = rows.compactMap { SessionEnergy.kcal(sets: $0["sets"], rpe: $0["session_rpe"], body: Self.body) }
    #expect(each.count == 2)
    #expect(ActivityRings.estimatedKcal(rows, body: Self.body) == Double(each.reduce(0, +)))
    #expect(ActivityRings.estimatedKcal(rows, body: nil) == nil)
    #expect(ActivityRings.estimatedKcal([], body: Self.body) == nil)
  }

  /// Health có số thì Health thắng; ô `null` là "chưa ghi", không phải 0 đo được.
  @Test func healthWinsAndNullIsNotMeasured() {
    let rows = [Self.session(reps: 10, rpe: 8)]
    let measured = ActivityRings.model(
      ActivityRings.input(
        daily: .object(["active_kcal": .string("212"), "active_minutes": .number(41), "steps": .number(5300)]),
        sessions: rows, body: Self.body, stepsTarget: 8000))
    #expect(measured.rings.map(\.source) == [.measured, .measured, .measured])
    #expect(measured.rings[0].current == 212)
    let unmeasured = ActivityRings.model(
      ActivityRings.input(
        daily: .object(["active_kcal": .null, "active_minutes": .null, "steps": .null]), sessions: rows,
        body: Self.body, stepsTarget: 0))
    #expect(unmeasured.rings.map(\.source) == [.estimated, .estimated, .none])
    #expect(unmeasured.rings[2].target == ActivityRings.defaultStepsTarget)
  }

  @Test func newDayDropsTheOldNumbers() async {
    let store = Store()
    store.daily = [.object(["steps": .number(9000)])]
    let book = ActivityRingsBook(userId: "u1", today: Self.day, store: store, in: Self.hanoi)
    await book.load()
    #expect(book.model(body: nil, stepsTarget: 10000)?.rings[2].current == 9000)
    store.fail = true
    await book.load()
    #expect(book.model(body: nil, stepsTarget: 10000)?.rings[2].current == 9000)  // làm mới hỏng: giữ số
    await book.load(today: Self.day.adding(days: 1))
    #expect(book.phase == .failed)  // ngày mới: không mang số hôm qua sang
  }

  @Test func closedBookIgnoresALateAnswer() async {
    let book = ActivityRingsBook(userId: "u1", today: Self.day, store: Store(), in: Self.hanoi)
    book.close()
    await book.load()
    #expect(book.phase == .loading)
  }
}
