@testable import ASCNDCore
import Foundation
import Testing

/// Lời nhắc "?" = CHÍNH `lib/help-nudge.ts` @ fac9ac2 —
/// `Fixtures/help-nudge-golden.json` (`gen-help-nudge.mjs`).
struct HelpNudgeTests {
  final class Store: KeyValueStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]
    func string(forKey key: String) -> String? { lock.withLock { values[key] } }
    func set(_ value: String, forKey key: String) { lock.withLock { values[key] = value } }
    func remove(_ key: String) { lock.withLock { _ = values.removeValue(forKey: key) } }
  }

  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "help-nudge-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  @Test func countingIsRNs() throws {
    let g = try Self.golden()
    #expect(g["limit"]?.doubleValue == Double(HelpNudge.limit))
    let cases = Self.array(g["cases"])
    #expect(cases.count == 160)
    for c in cases {
      let store = Store()
      var run = HelpNudge.Run()
      var nudges = HelpNudge(store: store, run: run)
      // Đăng xuất ở RN xoá khoá + tập lượt; native: một người khác — đọc của
      // người khác là rỗng, lượt tính theo người.
      var user = 0
      for step in Self.array(c["steps"]) {
        let topic = step["topic"]?.stringValue ?? ""
        let uid = "u\(user)"
        switch step["op"]?.stringValue {
        case "mount":
          let shown = nudges.shouldNudge(topic, userId: uid)
          if shown { nudges.noteNudged(topic, userId: uid) }
          #expect(shown == step["shown"].map { JS.truthyValue($0) }, "\(step)")
        case "open":
          nudges.noteHelpOpened(topic, userId: uid)
        case "launch":
          run = HelpNudge.Run()
          nudges = HelpNudge(store: store, run: run)
        case "corrupt":
          store.set("{\"readiness\":", forKey: HelpNudge.storeKey)
        case "signout":
          user += 1
        default:
          Issue.record("op lạ \(step)")
        }
        let now = "u\(user)"
        for t in ["readiness", "training"] {
          let want = step["stored"]?[t]
          let got = nudges.state(t, userId: now)
          if case .object(let o)? = want {
            #expect(got?.count == o["count"]?.doubleValue.map { Int($0) }, "\(step)")
            #expect(got?.opened == o["opened"].map { JS.truthyValue($0) }, "\(step)")
          } else {
            #expect(got == nil, "\(step) \(t)")
          }
        }
      }
    }
  }

  /// Ba lần, mỗi lần chạy một lần; mở giải thích là thôi hẳn; ẩn không phải đọc.
  @Test func threeLaunchesThenSilence() {
    let store = Store()
    for launch in 1...5 {
      let n = HelpNudge(store: store, run: HelpNudge.Run())
      let shown = n.shouldNudge(HelpNudge.readiness, userId: "u1")
      #expect(shown == (launch <= 3), "lần chạy \(launch)")
      if shown { n.noteNudged(HelpNudge.readiness, userId: "u1") }
      // Thẻ dựng lại trong CÙNG lần chạy (đổi tab): không hiện lần hai.
      #expect(!n.shouldNudge(HelpNudge.readiness, userId: "u1"))
    }
    #expect(HelpNudge(store: store, run: HelpNudge.Run()).state(HelpNudge.readiness, userId: "u1")?.count == 3)
  }

  @Test func openingTheHelpEndsItForGood() {
    let store = Store()
    let first = HelpNudge(store: store, run: HelpNudge.Run())
    #expect(first.shouldNudge(HelpNudge.readiness, userId: "u1"))
    first.noteNudged(HelpNudge.readiness, userId: "u1")
    first.noteHelpOpened(HelpNudge.readiness, userId: "u1")
    for _ in 0..<3 {
      #expect(!HelpNudge(store: store, run: HelpNudge.Run()).shouldNudge(HelpNudge.readiness, userId: "u1"))
    }
    // Mở trước khi từng hiện: cũng thôi hẳn, và không đếm thêm.
    let fresh = HelpNudge(store: Store(), run: HelpNudge.Run())
    fresh.noteHelpOpened(HelpNudge.readiness, userId: "u1")
    fresh.noteNudged(HelpNudge.readiness, userId: "u1")
    #expect(fresh.state(HelpNudge.readiness, userId: "u1") == .init(count: 0, opened: true))
  }

  @Test func anotherAccountStartsFromZeroAndCorruptDataIsEmpty() {
    let store = Store()
    let run = HelpNudge.Run()
    let n = HelpNudge(store: store, run: run)
    for _ in 0..<3 { n.noteNudged(HelpNudge.readiness, userId: "u1") }
    #expect(!HelpNudge(store: store, run: HelpNudge.Run()).shouldNudge(HelpNudge.readiness, userId: "u1"))
    // Người thứ hai trên cùng máy, cùng lần chạy: có lượt riêng, bắt đầu từ 0.
    #expect(n.shouldNudge(HelpNudge.readiness, userId: "u2"))
    #expect(n.state(HelpNudge.readiness, userId: "u2") == nil)
    // Dữ liệu hỏng: như chưa có gì (thêm một lần nhắc rẻ hơn một thẻ hỏng).
    store.set("not json", forKey: HelpNudge.storeKey)
    #expect(HelpNudge(store: store, run: HelpNudge.Run()).shouldNudge(HelpNudge.readiness, userId: "u2"))
  }
}
