import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Runner Swift cho `spec/vectors/sync.json` (OB-*, issue #254, D-7 #282).
///
/// Cùng một tệp vector chạy ở cả hai bên: RN (`spec/vectors/run-sync.mjs`)
/// và Swift (ở đây). Mỗi ca trace về `RetryPolicy` / `Outbox` thật.
///
/// Ngữ nghĩa probe của OB-3 (giống hệt runner RN): `failures` là danh sách
/// lỗi đã ghi nhận, và vector hỏi "quyết định ở `failureCount` này là gì".
/// `failureCount < maxTransientRetries` dùng hằng thật của `RetryPolicy`.
/// Ca `variant == "baseline"` bị bỏ qua — nó khóa hành vi baseline
/// (offline tính vào failureCount), native cố ý khác (DE-XUAT-6 #2).
struct SyncVectorTests {
  private static func vectors() throws -> [GoldenVector<JSONValue, JSONValue>] {
    try GoldenVectors.load(
      RepoPaths.specVectors.appendingPathComponent("sync.json"))
  }

  private static func makeFailure(_ input: JSONValue) -> WriteFailure {
    if let kind = input["kind"]?.stringValue {
      switch kind {
      case "wrongAccount": return .wrongAccount
      case "unusable": return .unusable
      case "offline": return .offline
      default: break
      }
    }
    if let code = input["code"]?.stringValue { return .server(code: code) }
    return .server(code: nil)
  }

  @Test func ob1PermanentClassification() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("OB-1") {
      let actual = RetryPolicy.isPermanent(Self.makeFailure(v.input))
      #expect(actual == v.expected["permanent"]?.boolValue, "\(v.rule)")
    }
  }

  @Test func ob2RetryDelayMatchesTanStack() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("OB-2") {
      // Vector đếm failures từ 0 (như `retryDelay(attempt)` của TanStack);
      // Swift đếm từ 1 (`delayMillis(afterFailures:)`).
      let failures = try #require(v.input["failures"]?.intValue)
      let actual = RetryPolicy.delayMillis(afterFailures: failures + 1)
      #expect(actual == v.expected["delayMs"]?.intValue.map(Int64.init),
              "\(v.rule): delayMillis(\(failures + 1))")
    }
  }

  @Test func ob3RetryOrGiveUp() throws {
    for v in try Self.vectors() where v.rule.hasPrefix("OB-3") {
      if v.input["variant"]?.stringValue == "baseline" { continue }
      guard case .array(let items) = v.input["failures"] else {
        Issue.record("\(v.rule): failures không phải mảng"); continue
      }
      let names = items.compactMap { $0.stringValue }
      var count = 0
      var permanent = false
      for n in names {
        let wf: WriteFailure = n == "offline" ? .offline
          : n == "server" ? .server(code: "500") : .server(code: n)
        if RetryPolicy.isPermanent(wf) { permanent = true; break }
        // Native (DE-XUAT-6 #2): mất mạng không đốt ngân sách thử lại.
        if n != "offline" { count += 1 }
      }
      let decision: String
      if permanent {
        decision = "giveUp"
      } else if names.contains("offline") {
        decision = "retry" // mất mạng được thử lại vô hạn khi có mạng lại
      } else {
        decision = count < RetryPolicy.maxTransientRetries ? "retry" : "giveUp"
      }
      #expect(decision == v.expected["decision"]?.stringValue, "\(v.rule)")
      if v.rule == "OB-3d" {
        #expect(v.expected["permanent"]?.boolValue == true, "\(v.rule)")
      }
    }
  }
}
