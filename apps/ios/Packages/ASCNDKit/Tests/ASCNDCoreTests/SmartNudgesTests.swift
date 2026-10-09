@testable import ASCNDCore
import Foundation
import Testing

/// "Insight hôm nay" (#527) — `use-smart-nudges.ts` @ fac9ac2.
@MainActor
struct SmartNudgesTests {
  static let today = LocalDate("2026-10-09")!

  final class Edge: EdgeCaller, @unchecked Sendable {
    let lock = NSLock()
    var failures: [EdgeFunction.Failure] = []
    var reply: JSONValue = .object([
      "nudges": .array([
        .object(["type": .string("water"), "message": .string("Uống thêm nước"), "priority": .string("high"), "icon": .string("💧")]),
        .object(["type": .string("x"), "message": .string(""), "priority": .string("low")]),
        .object(["type": .string("sleep"), "message": .string("Ngủ sớm"), "priority": .string("weird")]),
      ])
    ])
    private var log: [(EdgeFunction.Name, [String: JSONValue])] = []
    var calls: [(EdgeFunction.Name, [String: JSONValue])] { lock.withLock { log } }
    func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue? {
      let next: EdgeFunction.Failure? = lock.withLock {
        log.append((fn, body))
        return failures.isEmpty ? nil : failures.removeFirst()
      }
      if let next { throw next }
      return lock.withLock { reply }
    }
  }

  final class Memory: SmartNudgesCache, @unchecked Sendable {
    let lock = NSLock()
    var slots: [String: SmartNudges.Entry] = [:]
    func entry(_ key: String) -> SmartNudges.Entry? { lock.withLock { slots[key] } }
    func store(_ entry: SmartNudges.Entry, for key: String) { lock.withLock { slots[key] = entry } }
  }

  @Test func stampIsThreeFlags() {
    #expect(SmartNudges.stamp(nil) == "---")
    #expect(
      SmartNudges.stamp(.object(["sleep_duration_min": .number(420), "kcal": .number(0), "workout_count": .number(1)]))
        == "s-w")
  }

  @Test func parseKeepsMessagesAndIgnoresIcons() {
    let n = SmartNudges.parse(Edge().reply)
    #expect(n.map(\.message) == ["Uống thêm nước", "Ngủ sớm"])
    #expect(n.map(\.priority) == [.high, .low])
    #expect(SmartNudges.parse(nil).isEmpty)
  }

  @Test func oneCallPerKeyThenTheCache() async {
    let edge = Edge()
    let cache = Memory()
    let book = SmartNudgesBook(userId: "u", edge: edge, cache: cache, clock: { EpochMillis(Int64(1000)) })
    await book.load(date: Self.today, lang: "vi", stamp: "s--", tzOffset: -420)
    #expect(edge.calls.count == 1)
    #expect(edge.calls.first?.0 == .smartNudges)
    #expect(edge.calls.first?.1["tzOffset"] == .number(-420))
    #expect(edge.calls.first?.1["date"] == .string("2026-10-09"))
    guard case .ready(let e) = book.phase else {
      Issue.record("chưa có")
      return
    }
    #expect(e.at == EpochMillis(Int64(1000)))
    await book.load(date: Self.today, lang: "vi", stamp: "s--", tzOffset: -420)
    #expect(edge.calls.count == 1)
    // Mở lại app: sổ mới, cùng khoá → bộ nhớ đệm, không gọi AI.
    let again = SmartNudgesBook(userId: "u", edge: edge, cache: cache)
    await again.load(date: Self.today, lang: "vi", stamp: "s--", tzOffset: -420)
    #expect(edge.calls.count == 1)
    #expect(again.phase == book.phase)
    // Dấu đổi (vừa ghi bữa) → lượt mới.
    await book.load(date: Self.today, lang: "vi", stamp: "sm-", tzOffset: -420)
    #expect(edge.calls.count == 2)
  }

  @Test func retriesOnceThenNamesTheFailure() async {
    let edge = Edge()
    edge.failures = [.offline]
    let book = SmartNudgesBook(userId: "u", edge: edge, cache: Memory())
    await book.load(date: Self.today, lang: "en", stamp: "---", tzOffset: 0)
    #expect(edge.calls.count == 2)
    guard case .ready = book.phase else {
      Issue.record("thử lại không thành")
      return
    }
    let failing = Edge()
    failing.failures = [.offline, .rateLimited]
    let other = SmartNudgesBook(userId: "u", edge: failing, cache: Memory())
    await other.load(date: Self.today, lang: "en", stamp: "---", tzOffset: 0)
    #expect(other.phase == .failed(.rateLimited))
    #expect(failing.calls.count == 2)
  }
}
