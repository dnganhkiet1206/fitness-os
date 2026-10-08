import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// Runner của `spec/vectors/workout-day-account.json` (#453): `workout_day`
/// theo tài khoản, chạy trên `GRDBWorkoutStore` thật và một tệp SQLite thật
/// (để `reopen` là kill / mở lại thật).
///
/// Mỗi ca: `input.legacy` (hàng `workout_day` không chủ, ghi ở schema v3 trước
/// khi mở), `input.steps` (chạy lần lượt, mỗi bước tự kiểm `expect` của nó),
/// rồi `expected` kiểm trên đĩa, QUA MẶT chốt: `owners` (chủ của từng hàng,
/// sắp xếp), `outbox` (id hàng outbox, sắp xếp) hoặc `outboxCount`.
///
/// Bước:
/// - `signIn {user}` / `signOut` — mở / đóng chốt (`AccountScope`). Lúc vừa mở
///   tệp, chốt ở chế độ không chốt (mặc định của `ASCNDDatabase`).
/// - `reopen` — đóng tệp, mở lại; chốt đóng như `AppServices` lúc khởi động.
/// - `clearAll {expect: n}` — dọn của phiên (`clearAll`), trả về số ngày bỏ.
/// - `save {day, done, expect}` — `saveDay` ngày chưa chốt.
/// - `finish {day, session, done, expect}` — `commitFinish`; hàng outbox id
///   `session`, `userId` = người đăng nhập gần nhất (lượt muộn mang id người cũ).
/// - `delete {session, expect}` — `commitDelete`, hàng outbox `<session>@del`.
/// - `race {day, sessions, expect: {ok, dayAlreadyLogged}}` — các `finish`
///   chạy đồng thời.
/// - `load {day, expect}` — `loadDay`; `null` = không thấy; object = chỉ so các
///   trường có mặt (`done` sắp xếp, `loggedSessionId`, `loggedKeys`).
/// - `raw {owner, day, expect}` — đọc thẳng hàng của `owner` trên đĩa.
/// - `prune {today, expect: n}` — `pruneDays`.
/// `expect` của phép ghi: `ok` | `closed` (`AccountScopeClosed`) |
/// `dayAlreadyLogged`.

private let vectorsURL: URL = {
  // <root>/apps/ios/Packages/ASCNDStore/Tests/ASCNDStoreTests/<tệp này>
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<7 { url.deleteLastPathComponent() }
  return url.appendingPathComponent("spec/vectors/workout-day-account.json")
}()

private struct Vector: Decodable {
  let rule: String
  let input: JSONValue
  let expected: JSONValue
}

private func loadVectors() throws -> [Vector] {
  try JSONDecoder().decode([Vector].self, from: Data(contentsOf: vectorsURL))
}

private struct VectorFailure: Error, CustomStringConvertible {
  let description: String
}

private func key(_ day: String) throws -> String {
  guard let date = LocalDate(day) else { throw VectorFailure(description: "ngày hỏng: \(day)") }
  return DayProgressStore.key(date: date, templateId: "tpl")
}

private func strings(_ v: JSONValue?) -> [String] {
  guard case .array(let a)? = v else { return [] }
  return a.compactMap(\.stringValue)
}

private func ticks(_ done: [String]) -> DayProgress {
  var p = DayProgress()
  for k in done { p.done[k] = true }
  return p
}

/// Kết quả một phép ghi, theo từ vựng của vectors.
private func outcome(_ body: () async throws -> Void) async -> String {
  do {
    try await body()
    return "ok"
  } catch is AccountScopeClosed {
    return "closed"
  } catch is DayAlreadyLogged {
    return "dayAlreadyLogged"
  } catch {
    return "error: \(error)"
  }
}

/// So `state` với object `expect` — chỉ các trường có mặt.
private func mismatch(_ state: DayState?, _ expect: JSONValue?) -> String? {
  switch (state, expect) {
  case (nil, .null?), (nil, nil): return nil
  case (let s?, .null?), (let s?, nil): return "thấy \(s), chờ không thấy gì"
  case (nil, _): return "không thấy gì, chờ \(expect!)"
  case (let s?, let e?):
    if let done = e["done"] {
      let got = s.progress.done.filter(\.value).keys.sorted()
      if got != strings(done).sorted() { return "done \(got) ≠ \(strings(done).sorted())" }
    }
    if let id = e["loggedSessionId"], s.loggedSessionId != id.stringValue {
      return "loggedSessionId \(s.loggedSessionId ?? "nil") ≠ \(id)"
    }
    if let keys = e["loggedKeys"], s.loggedKeys != strings(keys) {
      return "loggedKeys \(s.loggedKeys ?? []) ≠ \(strings(keys))"
    }
    return nil
  }
}

/// Một lượt chạy: tệp, database đang mở, người đăng nhập gần nhất.
private final class Run {
  let path: String
  var db: ASCNDDatabase
  var store: GRDBWorkoutStore
  var lastUser = ""
  var failures: [String] = []

  init(legacy: JSONValue?) async throws {
    path = FileManager.default.temporaryDirectory.appendingPathComponent("wdv-\(UUID().uuidString).sqlite").path
    if case .array(let rows)? = legacy {
      let queue = try DatabaseQueue(path: path)
      try ASCNDDatabase.migrator.migrate(queue, upTo: "v3-read-cache")
      for row in rows {
        let state = row["state"]
        let day = DayState(
          progress: ticks(strings(state?["done"])), loggedSessionId: state?["loggedSessionId"]?.stringValue,
          loggedKeys: state?["loggedKeys"].map(strings))
        let k = try key(row["day"]?.stringValue ?? "")
        let json = try OutboxStore.json(day)
        try await queue.write { db in
          try db.execute(sql: "INSERT INTO workout_day (key, state) VALUES (?, ?)", arguments: [k, json])
        }
      }
    }
    db = try ASCNDDatabase(path: path)
    store = GRDBWorkoutStore(db)
  }

  deinit { try? FileManager.default.removeItem(atPath: path) }

  func entry(_ id: String) -> OutboxEntry {
    OutboxEntry(
      id: id, userId: lastUser, kind: WorkoutSessionRecord.outboxKind, payload: .object(["id": .string(id)]),
      createdAt: EpochMillis(0))
  }

  func finish(_ day: String, _ session: String, _ done: [String]) async throws {
    let state = DayState(progress: ticks(done), loggedSessionId: session, loggedKeys: done)
    _ = try await store.commitFinish(try key(day), state, entry(session))
  }

  func check(_ ok: Bool, _ step: Int, _ op: String, _ message: @autoclosure () -> String) {
    if !ok { failures.append("bước \(step) (\(op)): \(message())") }
  }

  func step(_ i: Int, _ s: JSONValue) async throws {
    let op = s["op"]?.stringValue ?? "?"
    let expect = s["expect"]
    switch op {
    case "signIn":
      lastUser = (s["user"]?.stringValue ?? "").lowercased()
      db.accounts.signIn(lastUser)
    case "signOut":
      db.accounts.signOut()
    case "reopen":
      db = try ASCNDDatabase(path: path)
      db.accounts.signOut()
      store = GRDBWorkoutStore(db)
    case "clearAll":
      let n = try await store.clearAll()
      check(n == expect?.intValue, i, op, "dọn \(n), chờ \(expect.map { "\($0)" } ?? "?")")
    case "save":
      let k = try key(s["day"]?.stringValue ?? "")
      let got = await outcome { try await self.store.saveDay(k, DayState(progress: ticks(strings(s["done"])))) }
      check(got == expect?.stringValue, i, op, "\(got), chờ \(expect?.stringValue ?? "?")")
    case "finish":
      let got = await outcome {
        try await self.finish(s["day"]?.stringValue ?? "", s["session"]?.stringValue ?? "", strings(s["done"]))
      }
      check(got == expect?.stringValue, i, op, "\(got), chờ \(expect?.stringValue ?? "?")")
    case "delete":
      let id = s["session"]?.stringValue ?? ""
      let got = await outcome { try await self.store.commitDelete(sessionId: id, self.entry("\(id)@del")) }
      check(got == expect?.stringValue, i, op, "\(got), chờ \(expect?.stringValue ?? "?")")
    case "race":
      let k = try key(s["day"]?.stringValue ?? "")
      let attempts = strings(s["sessions"]).map { id in
        (DayState(progress: ticks(["0-0"]), loggedSessionId: id, loggedKeys: ["0-0"]), entry(id))
      }
      let store = store
      let results = await withTaskGroup(of: String.self) { group in
        for (state, row) in attempts {
          group.addTask { await outcome { _ = try await store.commitFinish(k, state, row) } }
        }
        return await group.reduce(into: [String]()) { $0.append($1) }
      }
      for kind in ["ok", "dayAlreadyLogged"] {
        let n = results.filter { $0 == kind }.count
        check(n == expect?[kind]?.intValue, i, op, "\(kind) \(n) lần, kết quả \(results)")
      }
    case "load":
      let got = try await store.loadDay(try key(s["day"]?.stringValue ?? ""))
      if let m = mismatch(got, expect) { check(false, i, op, "\(s["day"]?.stringValue ?? ""): \(m)") }
    case "raw":
      let k = try key(s["day"]?.stringValue ?? "")
      let owner = s["owner"]?.stringValue ?? ""
      let json = try await db.queue.read { db in
        try String.fetchOne(db, sql: "SELECT state FROM workout_day WHERE userId = ? AND key = ?", arguments: [owner, k])
      }
      let state = try json.map { try JSONDecoder().decode(DayState.self, from: Data($0.utf8)) }
      if let m = mismatch(state, expect) { check(false, i, op, "\(owner): \(m)") }
    case "prune":
      let today = try #require(LocalDate(s["today"]?.stringValue ?? ""))
      let n = try await store.pruneDays(today: today)
      check(n == expect?.intValue, i, op, "dọn \(n), chờ \(expect.map { "\($0)" } ?? "?")")
    default:
      throw VectorFailure(description: "bước \(i): op lạ '\(op)'")
    }
  }

  /// `expected` của ca — đọc thẳng trên đĩa, qua mặt chốt.
  func final(_ expected: JSONValue) async throws {
    let (owners, outbox) = try await db.queue.read { db in
      (
        try String.fetchAll(db, sql: "SELECT userId FROM workout_day ORDER BY userId"),
        try String.fetchAll(db, sql: "SELECT id FROM outbox ORDER BY id")
      )
    }
    if let want = expected["owners"] {
      check(owners == strings(want).sorted(), -1, "owners", "\(owners) ≠ \(strings(want).sorted())")
    }
    if let want = expected["outbox"] {
      check(outbox == strings(want).sorted(), -1, "outbox", "\(outbox) ≠ \(strings(want).sorted())")
    }
    if let want = expected["outboxCount"]?.intValue {
      check(outbox.count == want, -1, "outbox", "\(outbox.count) hàng, chờ \(want)")
    }
  }
}

/// Chạy một ca; trả về các dòng sai (rỗng = qua).
private func run(_ v: Vector) async throws -> [String] {
  let r = try await Run(legacy: v.input["legacy"])
  guard case .array(let steps)? = v.input["steps"] else { throw VectorFailure(description: "\(v.rule): không có steps") }
  for (i, s) in steps.enumerated() { try await r.step(i, s) }
  try await r.final(v.expected)
  return r.failures
}

struct WorkoutDayAccountVectorTests {
  @Test func vectorFileIsPresentAndWellFormed() throws {
    let cases = try loadVectors()
    #expect(cases.count >= 9)
    #expect(Set(cases.map(\.rule)).count == cases.count, "trùng rule")
  }

  @Test(arguments: try loadVectors().map(\.rule))
  func vector(_ rule: String) async throws {
    let v = try #require(try loadVectors().first { $0.rule == rule })
    for failure in try await run(v) { Issue.record("\(rule): \(failure)") }
  }
}
