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

  @Test func otherErrorsAreNot() {
    struct Boom: Error {}
    #expect(!NetworkFailure.isOffline(URLError(.badServerResponse)))
    #expect(!NetworkFailure.isOffline(NSError(domain: "PostgREST", code: 400)))
    #expect(!NetworkFailure.isOffline(Boom()))
  }
}
