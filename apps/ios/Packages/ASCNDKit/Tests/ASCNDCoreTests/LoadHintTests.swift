@testable import ASCNDCore
import Foundation
import Testing

/// Gợi ý tải của `log-workout` (#527). Golden: `user-state.ts` /
/// `load-progression.ts` / `goal-training.ts` @ fac9ac2 biên dịch + `askedRpe` /
/// `loadHint` của màn chép nguyên văn (`gen-load-hint.mjs`, TZ Hà Nội).
struct LoadHintGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "load-hint-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func templates(_ v: JSONValue?) -> [WorkoutTemplate] {
    array(v).enumerated().map { i, t in
      WorkoutTemplate(
        id: "t\(i)", name: t["name"]?.stringValue ?? "",
        exercises: array(t["exercises"]).map {
          TemplateExercise(
            exerciseName: "x", sets: 1, reps: 1, weightKg: 0,
            rpe: $0["rpe"]?.doubleValue.map { Int($0) } ?? WorkoutPlanning.defaultRpe)
        })
    }
  }

  @Test func goalTargetMatchesRN() throws {
    guard case .object(let o)? = try Self.golden()["goalTarget"] else { Issue.record("goalTarget"); return }
    #expect(o.count == 10)
    for (k, v) in o {
      #expect(LoadProgression.goalRpeTarget(k == "null" ? nil : k) == v.doubleValue, "\(k)")
    }
  }

  @Test func userStateMatchesRN() throws {
    let g = try Self.golden()
    let today = try #require(LocalDate(g["today"]?.stringValue ?? ""))
    let cases = Self.array(g["userState"])
    #expect(cases.count == 300)
    var seen = Set<String>()
    for c in cases {
      let i = c["input"]
      let dates = Self.array(i?["loggedDates"]).compactMap { $0.stringValue.flatMap { LocalDate($0) } }
      #expect(dates.count == Self.array(i?["loggedDates"]).count)
      let sessions: [JSONValue]? = i?["sessions"] == .null ? nil : Self.array(i?["sessions"])
      let st = UserState.from(
        loggedDates: dates, today: today, acwr: i?["acwr"]?.doubleValue, sessions: sessions, in: Self.hanoi)
      let o = c["out"]
      #expect(st.situation.rawValue == o?["situation"]?.stringValue, "\(c)")
      #expect(st.confidence.rawValue == o?["confidence"]?.stringValue, "\(c)")
      #expect(st.recent == o?["recent"]?.doubleValue, "\(c)")
      #expect(st.baseline == o?["baseline"]?.doubleValue, "\(c)")
      #expect(st.trend?.rawValue == o?["trend"]?.stringValue, "\(c)")
      #expect(Double(st.daysQuiet) == o?["daysQuiet"]?.doubleValue, "\(c)")
      seen.insert(st.situation.rawValue)
    }
    #expect(seen.count == 6)
  }

  @Test func suggestLoadMatchesRN() throws {
    let cases = Self.array(try Self.golden()["suggest"])
    #expect(cases.count == 600)
    for c in cases {
      let i = c["input"]
      let s = LoadProgression.suggest(
        reported: Self.array(i?["reported"]).map { Optional($0) }, target: i?["target"]?.doubleValue,
        goal: i?["goal"]?.stringValue,
        situation: i?["situation"]?.stringValue.flatMap(UserState.Situation.init(rawValue:)),
        situationConfidence: i?["situationConfidence"]?.stringValue.flatMap(UserState.Confidence.init(rawValue:)),
        readiness: i?["readiness"]?.stringValue, recoverySignal: c["recovery"] == .bool(true))
      let o = c["out"]
      #expect(s.advice.rawValue == o?["advice"]?.stringValue, "\(c)")
      #expect(s.confidence.rawValue == o?["confidence"]?.stringValue, "\(c)")
      #expect(s.step == o?["step"]?.doubleValue, "\(c)")
      #expect(s.target == o?["target"]?.doubleValue, "\(c)")
    }
  }

  @Test func screenHintMatchesRN() throws {
    let cases = Self.array(try Self.golden()["hint"])
    #expect(cases.count == 300)
    #expect(cases.contains { $0["hint"]?["up"] == .bool(true) })
    #expect(cases.contains { $0["hint"]?["up"] == .bool(false) })
    for c in cases {
      let name = c["name"]?.stringValue ?? ""
      let tpls = Self.templates(c["templates"])
      #expect(LoadHint.askedRpe(name: name, templates: tpls) == c["askedRpe"]?.doubleValue, "\(c)")
      let state = UserState(
        situation: UserState.Situation(rawValue: c["situation"]?.stringValue ?? "") ?? .settlingIn,
        confidence: UserState.Confidence(rawValue: c["confidence"]?.stringValue ?? "") ?? UserState.Confidence.none)
      let h = LoadHint.hint(
        name: name, templates: tpls, sessions: Self.array(c["recentSessions"]), goal: c["goal"]?.stringValue,
        state: state, readiness: c["readiness"]?.stringValue, recoverySignal: c["recovery"] == .bool(true))
      let want = c["hint"]
      if want == .null {
        #expect(h == nil, "\(c)")
      } else {
        #expect(h?.up == (want?["up"] == .bool(true)), "\(c)")
        #expect(h?.name == want?["name"]?.stringValue, "\(c)")
        #expect(h?.aim == want?["aim"]?.doubleValue, "\(c)")
        #expect(h.map { Double($0.percent) } == want?["pct"]?.doubleValue, "\(c)")
      }
    }
  }
}

/// Kho giả: trả hàng theo bảng / cột; bảng nào trong `failing` thì ném.
private final class HintRows: RowStore, @unchecked Sendable {
  let streak: [JSONValue]
  let log: [JSONValue]
  let sessions: [JSONValue]
  let failing: Set<String>
  private let lock = NSLock()
  private var _queries: [RowQuery] = []
  var queries: [RowQuery] { lock.withLock { _queries } }

  init(streak: [JSONValue], log: [JSONValue], sessions: [JSONValue], failing: Set<String> = []) {
    self.streak = streak
    self.log = log
    self.sessions = sessions
    self.failing = failing
  }

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    lock.withLock { _queries.append(q) }
    let which = q.table == "daily_logs" ? (q.columns == "date" ? "streak" : "log") : q.table
    if failing.contains(which) { throw RowStoreError(code: "500", message: "boom") }
    switch which {
    case "streak": return streak
    case "log": return log
    default: return sessions
    }
  }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
    -> Int
  { 0 }
  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
}

/// 2026-10-11 12:00 giờ Hà Nội (05:00Z).
private struct HintClock: WallClock {
  func now() -> Date { Date(timeIntervalSince1970: 1_791_694_800) }
}

@MainActor
struct LoadHintBookTests {
  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  /// 30 ngày ghi liền: có nền, `steady`.
  static let steadyDays: [JSONValue] = (0..<30).map {
    .object(["date": .string(LocalDate("2026-10-11")!.adding(days: -$0).description)])
  }

  /// Ba buổi "Push" báo RPE 5 (nhẹ hơn mức 7,5 của mục tiêu mặc định) trong 14 ngày,
  /// và một buổi cũ hơn 14 ngày (không tính).
  static let lightPush: [JSONValue] = [
    .object(["date_time": .string("2026-10-10T01:00:00+00:00"), "template_name": .string("Push"), "session_rpe": .number(5)]),
    .object(["date_time": .string("2026-10-07T01:00:00+00:00"), "template_name": .string("push"), "session_rpe": .number(5)]),
    .object(["date_time": .string("2026-10-03T01:00:00+00:00"), "template_name": .string("Push "), "session_rpe": .number(5)]),
    .object(["date_time": .string("2026-09-20T01:00:00+00:00"), "template_name": .string("Push"), "session_rpe": .number(10)]),
  ]

  static func book(_ rows: HintRows, recovery: Bool = false) -> LoadHintBook {
    LoadHintBook(userId: "u1", store: rows, clock: HintClock(), in: hanoi, recovery: { _ in recovery })
  }

  @Test func lightSessionsSuggestMore() async {
    let rows = HintRows(streak: Self.steadyDays, log: [.object(["readiness_status": .string("green")])], sessions: Self.lightPush)
    let b = Self.book(rows)
    #expect(b.hint(name: "Push", templates: [], goal: nil) == nil)  // chưa tải
    await b.load()
    #expect(b.recent.count == 3)
    #expect(b.state.situation == .steady)
    let h = b.hint(name: " push ", templates: [], goal: nil)
    #expect(h == LoadHint.Hint(up: true, name: "push", aim: 7.5, percent: 10))
    // Ba truy vấn đều của người này; buổi 56 ngày tính theo giờ local.
    #expect(rows.queries.count == 3)
    #expect(rows.queries.allSatisfy { $0.filters.contains(.eq("user_id", .string("u1"))) })
    let s = rows.queries.first { $0.table == "workout_sessions" }
    #expect(s?.filters.contains(.gte("date_time", .string("2026-08-16T05:00:00.000Z"))) == true)
  }

  /// Quá tải (acwr ≥ 1,5): giữ nguyên, không có câu.
  @Test func overreachingHolds() async {
    let rows = HintRows(streak: Self.steadyDays, log: [.object(["acwr": .string("1.7")])], sessions: Self.lightPush)
    let b = Self.book(rows)
    await b.load()
    #expect(b.state.situation == .overreaching)
    #expect(b.hint(name: "Push", templates: [], goal: nil) == nil)
  }

  /// Sẵn sàng đỏ có tín hiệu hồi phục: giữ; đỏ chỉ vì tải: vẫn khuyên tăng.
  @Test func recoveryRedHolds() async {
    let log: [JSONValue] = [.object(["readiness_status": .string("red"), "readiness_explain": .string("sleep:30")])]
    let held = Self.book(HintRows(streak: Self.steadyDays, log: log, sessions: Self.lightPush), recovery: true)
    await held.load()
    #expect(held.hint(name: "Push", templates: [], goal: nil) == nil)
    let loadOnly = Self.book(HintRows(streak: Self.steadyDays, log: log, sessions: Self.lightPush), recovery: false)
    await loadOnly.load()
    #expect(loadOnly.hint(name: "Push", templates: [], goal: nil)?.up == true)
  }

  /// Không đọc được streak: chốt chặn chưa biết → không bao giờ khuyên tăng;
  /// khuyên giảm vẫn có.
  @Test func unknownGatesNeverSayMore() async {
    let b = Self.book(HintRows(streak: [], log: [], sessions: Self.lightPush, failing: ["streak"]))
    await b.load()
    #expect(!b.gatesKnown)
    #expect(b.state == .unknown)
    #expect(b.hint(name: "Push", templates: [], goal: nil) == nil)
    let heavy: [JSONValue] = Self.lightPush.map {
      var o = $0
      if case .object(var d) = o { d["session_rpe"] = .number(9.5); o = .object(d) }
      return o
    }
    let h = Self.book(HintRows(streak: [], log: [], sessions: heavy, failing: ["log"]))
    await h.load()
    #expect(h.hint(name: "Push", templates: [], goal: nil) == LoadHint.Hint(up: false, name: "Push", aim: 7.5, percent: 10))
  }

  /// Template cùng tên đặt mức: giữa dải RPE của nó.
  @Test func templateSetsTheAim() async {
    let b = Self.book(HintRows(streak: Self.steadyDays, log: [], sessions: Self.lightPush))
    await b.load()
    let tpl = WorkoutTemplate(
      id: "t", name: "PUSH",
      exercises: [
        TemplateExercise(exerciseName: "a", sets: 3, reps: 5, weightKg: 60, rpe: 6),
        TemplateExercise(exerciseName: "b", sets: 3, reps: 5, weightKg: 60, rpe: 7),
      ])
    // Mức 6,5; báo 5 → lệch 1,5 → làm tròn 2 → +10 %.
    #expect(b.hint(name: "Push", templates: [tpl], goal: "strength") == LoadHint.Hint(up: true, name: "Push", aim: 6.5, percent: 10))
  }
}
