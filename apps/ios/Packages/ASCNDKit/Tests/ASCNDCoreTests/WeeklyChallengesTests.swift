@testable import ASCNDCore
import Foundation
import Testing

/// Thử thách tuần (#527) so với CHÍNH `challenge-progress.ts` / `macro-targets.ts`
/// + biểu thức của `use-extras.ts` @ fac9ac2 (`Fixtures/challenges-golden.json`,
/// `gen-challenges.mjs`).
struct WeeklyChallengesGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "challenges-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) throws -> [JSONValue] {
    guard case .array(let a)? = v else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  @Test func poolAndRotationMatchRN() throws {
    let g = try Self.golden()
    let pool = try Self.array(g["pool"])
    #expect(pool.map { $0["key"]?.stringValue } == WeeklyChallenges.pool.map(\.key))
    #expect(pool.map { $0["target"]?.doubleValue.map { Int($0) } } == WeeklyChallenges.pool.map(\.target))
    #expect(pool.map { $0["tier"]?.stringValue } == WeeklyChallenges.pool.map(\.tier))
    #expect(pool.map { $0["icon"]?.stringValue } == WeeklyChallenges.pool.map(\.icon))
    for c in try Self.array(g["pick"]) {
      let week = try #require(c["weekStart"]?.stringValue.flatMap(LocalDate.init))
      #expect(WeeklyChallenges.pick(weekStart: week).map(\.key) == (try Self.array(c["keys"]).compactMap(\.stringValue)))
    }
  }

  @Test func targetsFromProfileMatchRN() throws {
    for c in try Self.array(Self.golden()["targets"]) {
      let t = WeeklyChallenges.Targets(profile: c["profile"] == .null ? nil : c["profile"])
      #expect(t.sleepMinutes == c["sleepTargetMin"]?.doubleValue, "\(c)")
      #expect(t.waterMl == c["waterTargetMl"]?.doubleValue, "\(c)")
      #expect(t.proteinG == c["proteinTargetG"]?.doubleValue, "\(c)")
    }
  }

  /// Phép đo từng khoá trên cùng các hàng RN đo.
  @Test func measurementMatchesRN() throws {
    let daily: [JSONValue] = [
      .object(["date": .string("2026-10-05"), "steps": .number(12000), "sleep_duration_min": .number(480), "protein_g": .number(150), "kcal": .number(2100)]),
      .object(["date": .string("2026-10-06"), "steps": .null, "sleep_duration_min": .number(450), "protein_g": .string("149"), "kcal": .string("500")]),
      .object(["date": .string("2026-10-07"), "steps": .number(8000), "sleep_duration_min": .null, "protein_g": .null, "kcal": .number(501)]),
      .object(["date": .string("2026-10-08"), "steps": .number(31000), "sleep_duration_min": .number(360), "protein_g": .string("x"), "kcal": .null]),
      .object(["date": .string("2026-10-09"), "steps": .number(0), "sleep_duration_min": .number(600), "protein_g": .number(200), "kcal": .number(2800)]),
    ]
    let water: [JSONValue] = [
      ("2026-10-05", 2000), ("2026-10-05", 500), ("2026-10-06", 2499), ("2026-10-07", 3000), ("2026-10-08", 1500),
      ("2026-10-08", 1500),
    ].map { .object(["date": .string($0.0), "amount_ml": .number(Double($0.1))]) }
    let workouts: [JSONValue] = ["a", "b", "c"].map { .object(["id": .string($0)]) }
    let logged: [JSONValue] = ["2026-10-05", "2026-10-06"].map { .object(["date": .string($0)]) }
    func rows(_ key: String) -> [JSONValue] {
      switch WeeklyChallenges.source(key) {
      case .workouts: workouts
      case .loggedDays: logged
      case .water: water
      case .dailyLogs, .nothing: daily
      }
    }
    let cases = try Self.array(Self.golden()["measured"])
    #expect(cases.count == 6 * 9)
    for c in cases {
      let key = try #require(c["key"]?.stringValue)
      let t = WeeklyChallenges.Targets(profile: c["profile"] == .null ? nil : c["profile"])
      #expect(WeeklyChallenges.measure(key, rows: rows(key), targets: t) == c["value"]?.doubleValue, "\(c)")
    }
  }

  /// `challengeStep`: kẹp hai đầu; "vừa xong" chỉ một lần — kể cả khi tụt rồi đạt lại.
  @Test func stepMatchesRN() throws {
    for c in try Self.array(Self.golden()["step"]) {
      let r = try #require(c["row"])
      let s = WeeklyChallenges.step(
        currentValue: r["current_value"]?.doubleValue ?? 0, targetValue: r["target_value"]?.doubleValue ?? 0,
        completed: r["completed"] == .bool(true), completedAt: r["completed_at"]?.stringValue,
        newValue: c["newValue"]?.doubleValue ?? .nan)
      let want = try #require(c["step"])
      #expect(Double(s.value) == want["value"]?.doubleValue, "\(c)")
      #expect(s.completed == (want["completed"] == .bool(true)), "\(c)")
      #expect(s.justCompleted == (want["justCompleted"] == .bool(true)), "\(c)")
      #expect(s.unchanged == (want["unchanged"] == .bool(true)), "\(c)")
    }
  }

  @Test func displayMatchesRN() throws {
    for c in try Self.array(Self.golden()["display"]) {
      let row = try #require(
        WeeklyChallenges.Row(
          row: .object([
            "id": .string("x"), "challenge_key": .string("k"), "current_value": c["current"] ?? .null,
            "target_value": c["target"] ?? .null,
          ])))
      let d = row.display
      #expect(Double(d.current) == c["shown"]?.doubleValue && Double(d.target) == c["of"]?.doubleValue, "\(c)")
      #expect(Double(d.percent) == c["pct"]?.doubleValue, "\(c)")
    }
  }

  /// Tuần bắt đầu Thứ Hai; tuần [Thứ Hai, Thứ Hai kế) theo giờ máy.
  @Test func weekIsMondayToMonday() {
    #expect(WeeklyChallenges.weekStart(LocalDate("2026-10-08")!) == LocalDate("2026-10-05")!)  // Thứ Năm
    #expect(WeeklyChallenges.weekStart(LocalDate("2026-10-11")!) == LocalDate("2026-10-05")!)  // Chủ Nhật
    #expect(WeeklyChallenges.weekStart(LocalDate("2026-10-05")!) == LocalDate("2026-10-05")!)
    let r = WeeklyChallenges.reads(userId: "u", weekStart: LocalDate("2026-10-05")!, in: TimeZone(identifier: "Asia/Ho_Chi_Minh")!)
    #expect(r.loggedDays.filters.contains(.lt("date", .string("2026-10-12"))))
    #expect(r.loggedDays.filters.contains(.or(Streak.loggedDayFilter)))
    #expect(r.workouts.filters.contains(.gte("date_time", .string("2026-10-04T17:00:00.000Z"))))
    #expect(r.workouts.filters.contains(.lt("date_time", .string("2026-10-11T17:00:00.000Z"))))
  }
}

/// `WeeklyChallengesBook`: gieo, đo, trả thưởng một lần, ghi sau khi trả, lỗi đứng riêng.
@MainActor
struct WeeklyChallengesBookTests {
  final class FakeStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var challenges: [[String: JSONValue]] = []
    var daily: [JSONValue] = []
    var workouts: [JSONValue] = []
    var failTables: Set<String> = []
    var updates: [([String: JSONValue], [RowQuery.Filter])] = []
    var updateTouches = 1
    var inserts: [[String: JSONValue]] = []
    var selects: [RowQuery] = []

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      lock.withLock { selects.append(q) }
      if failTables.contains(q.table) { throw RowStoreError(code: nil, message: "offline") }
      switch q.table {
      case "weekly_challenges": return lock.withLock { challenges.map(JSONValue.object) }
      case "workout_sessions": return workouts
      case "daily_logs": return daily
      default: return []
      }
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
      if failTables.contains("insert") { throw RowStoreError(code: nil, message: "offline") }
      lock.withLock {
        inserts.append(row)
        var r = row
        r["id"] = .string("id-\(challenges.count)")
        r["completed"] = .bool(false)
        challenges.append(r)
      }
    }
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
      lock.withLock {
        updates.append((row, filters))
        for i in challenges.indices where filters.contains(.eq("id", challenges[i]["id"] ?? .null)) {
          for (k, v) in row { challenges[i][k] = v }
        }
      }
      return updateTouches
    }
  }

  final class FakeEconomy: MascotEconomy, @unchecked Sendable {
    let lock = NSLock()
    var claims: [String] = []
    var failure: MascotFailure?
    func claimReward(refKey: String, reason: String) async throws -> Int {
      lock.withLock { claims.append(refKey) }
      if let failure { throw failure }
      return 50
    }
    func buyStreakFreeze(requestId: UUID) async throws -> Int { 0 }
  }

  let thursday = LocalDate("2026-10-08")!

  func book(_ s: FakeStore, _ e: FakeEconomy = FakeEconomy()) -> WeeklyChallengesBook {
    WeeklyChallengesBook(
      userId: "acct-A", today: thursday, store: s, economy: e,
      english: { ("T \($0)", "D \($0)", "R \($0)") }, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!)
  }

  static func row(_ id: String, _ key: String, current: Double = 0, target: Double, completed: Bool = false, tier: String = "silver")
    -> [String: JSONValue]
  {
    [
      "id": .string(id), "challenge_key": .string(key), "title": .string(key), "current_value": .number(current),
      "target_value": .number(target), "completed": .bool(completed), "reward_tier": .string(tier),
      "reward_title": .string("R"),
    ]
  }

  /// Tuần trống → gieo đúng ba cái của tuần (2026-10-05: log_7, calories_5, water_7), chữ tiếng Anh.
  @Test func emptyWeekIsSeededForThisAccount() async {
    let s = FakeStore()
    let b = book(s)
    await b.load()
    #expect(s.inserts.map { $0["challenge_key"]?.stringValue } == ["log_7", "calories_5", "water_7"])
    #expect(s.inserts.allSatisfy { $0["user_id"] == .string("acct-A") && $0["week_start"] == .string("2026-10-05") })
    #expect(s.inserts[0]["title"] == .string("T log_7") && s.inserts[0]["reward_tier"] == .string("gold"))
    guard case .ready(let rows) = b.phase else { Issue.record("not ready"); return }
    #expect(rows.count == 3)
  }

  /// Vừa xong: trả TRƯỚC, ghi SAU, một lần; lượt sau im lặng.
  @Test func justCompletedPaysOnceThenWrites() async {
    let s = FakeStore()
    s.challenges = [Self.row("c1", "workouts_3", current: 2, target: 3, tier: "bronze")]
    s.workouts = (0..<4).map { .object(["id": .string("w\($0)")]) }
    let e = FakeEconomy()
    let b = book(s, e)
    await b.load()
    #expect(e.claims == ["ch:bronze:2026-10-05:workouts_3"])
    #expect(s.updates.count == 1)
    #expect(s.updates[0].0["current_value"] == .number(3) && s.updates[0].0["completed"] == .bool(true))
    #expect(s.updates[0].0["completed_at"] != nil)
    #expect(s.updates[0].1.contains(.eq("user_id", .string("acct-A"))))
    #expect(b.justCompleted == ["workouts_3"])
    await b.refreshProgress()
    #expect(e.claims.count == 1)
    #expect(s.updates.count == 1)
  }

  /// Trả hỏng → KHÔNG ghi "xong" (lượt sau còn trả lại được); lỗi được nói ra.
  @Test func failedPaymentLeavesRowUnfinished() async {
    let s = FakeStore()
    s.challenges = [Self.row("c1", "workouts_3", current: 2, target: 3)]
    s.workouts = (0..<3).map { .object(["id": .string("w\($0)")]) }
    let e = FakeEconomy()
    e.failure = .offline
    let b = book(s, e)
    await b.load()
    #expect(s.updates.isEmpty)
    #expect(b.progressFailure == .reward(.offline))
    #expect(b.justCompleted.isEmpty)
  }

  /// Trùng (đã trả ở máy khác) không phải lỗi.
  @Test func duplicatePaymentIsNotAFailure() async {
    let s = FakeStore()
    s.challenges = [Self.row("c1", "workouts_3", current: 2, target: 3)]
    s.workouts = (0..<3).map { .object(["id": .string("w\($0)")]) }
    let e = FakeEconomy()
    e.failure = .server(code: "23505")
    let b = book(s, e)
    await b.load()
    #expect(s.updates.count == 1)
    #expect(b.progressFailure == nil)
  }

  /// Một nguồn đọc hỏng: thử thách ấy KHÔNG bị ghi 0; thử thách khác vẫn đi tiếp.
  @Test func unreadableSourceWritesNothingForThatChallenge() async {
    let s = FakeStore()
    s.challenges = [
      Self.row("c1", "steps_50k", current: 20000, target: 50000),
      Self.row("c2", "workouts_3", current: 0, target: 3),
    ]
    s.workouts = [.object(["id": .string("w0")])]
    s.failTables = ["daily_logs"]
    let b = book(s)
    await b.load()
    #expect(s.updates.count == 1)
    #expect(s.updates[0].1.contains(.eq("id", .string("c2"))))
    #expect(b.progressFailure == .measure)
  }

  @Test func nothingChangedWritesNothing() async {
    let s = FakeStore()
    s.challenges = [Self.row("c1", "workouts_3", current: 1, target: 3)]
    s.workouts = [.object(["id": .string("w0")])]
    let b = book(s)
    await b.load()
    #expect(s.updates.isEmpty)
    #expect(b.progressFailure == nil)
  }

  @Test func rowNotWrittenIsNamed() async {
    let s = FakeStore()
    s.challenges = [Self.row("c1", "workouts_3", current: 0, target: 3)]
    s.workouts = [.object(["id": .string("w0")])]
    s.updateTouches = 0
    let b = book(s)
    await b.load()
    #expect(b.progressFailure == .nothingWritten)
  }

  @Test func unreadableListIsAnError() async {
    let s = FakeStore()
    s.failTables = ["weekly_challenges"]
    let b = book(s)
    await b.load()
    #expect(b.phase == .failed(.unavailable))
    #expect(s.inserts.isEmpty)
  }

  @Test func closedBookIgnoresLateResults() async {
    let s = FakeStore()
    let b = book(s)
    b.close()
    await b.load()
    #expect(b.phase == .loading)
    #expect(s.inserts.isEmpty)
  }
}
