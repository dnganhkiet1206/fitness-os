import ASCNDCore
import Foundation
import Testing

struct NetworkFailureTests {
  @Test(arguments: [URLError.Code.notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotFindHost, .cancelled])
  func offline(code: URLError.Code) {
    #expect(NetworkFailure.isOffline(URLError(code)))
    // Qua cầu NSError (Linux, hoặc lỗi bọc lại) vẫn nhận ra.
    #expect(NetworkFailure.isOffline(NSError(domain: NSURLErrorDomain, code: code.rawValue)))
  }

  @Test func cancellationIsOffline() {
    #expect(NetworkFailure.isOffline(CancellationError()))
  }

  /// Audit của C (#222, 05/10): lỗi xác thực là "phiên hết hạn", không phải
  /// mất mạng — chúng rơi vào `.unavailable` ("tới được server mà không đọc
  /// được"), không vào `.offline`. Khoá lại để không ai thêm nhầm.
  @Test(arguments: [URLError.Code.userAuthenticationRequired, .userCancelledAuthentication])
  func authenticationIsNotOffline(code: URLError.Code) {
    #expect(!NetworkFailure.isOffline(URLError(code)))
    #expect(!NetworkFailure.isOffline(NSError(domain: NSURLErrorDomain, code: code.rawValue)))
  }

  @Test func otherErrorsAreNot() {
    struct Boom: Error {}
    #expect(!NetworkFailure.isOffline(URLError(.badServerResponse)))
    #expect(!NetworkFailure.isOffline(NSError(domain: "PostgREST", code: 400)))
    #expect(!NetworkFailure.isOffline(Boom()))
  }
}
