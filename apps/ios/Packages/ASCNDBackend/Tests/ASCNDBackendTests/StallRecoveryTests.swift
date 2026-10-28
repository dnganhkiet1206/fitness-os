import ASCNDBackend
import Foundation
import Testing

/// Kết nối chết → "Offline" giả (audit 28/10): lỗi nào thì bỏ kết nối.
struct StallRecoveryTests {
  @Test func resetsOnBrokenConnectionErrorsOnly() {
    #expect(StallRecovery.shouldReset(URLError(.timedOut)))
    #expect(StallRecovery.shouldReset(URLError(.networkConnectionLost)))
    #expect(StallRecovery.shouldReset(NSError(domain: NSURLErrorDomain, code: URLError.Code.timedOut.rawValue)))
    // Huỷ (người dùng rời màn), không mạng, lỗi server: không phải kết nối hỏng.
    #expect(!StallRecovery.shouldReset(URLError(.cancelled)))
    #expect(!StallRecovery.shouldReset(URLError(.notConnectedToInternet)))
    #expect(!StallRecovery.shouldReset(URLError(.badServerResponse)))
    #expect(!StallRecovery.shouldReset(nil))
    struct Other: Error {}
    #expect(!StallRecovery.shouldReset(Other()))
  }

  @Test func sessionTimesOutWellBeforeSixtySeconds() {
    let s = StallRecovery.makeSession()
    #expect(s.configuration.timeoutIntervalForRequest == StallRecovery.requestTimeout)
    #expect(StallRecovery.requestTimeout < 60)
    #expect(s.delegate is StallRecovery)
  }
}
