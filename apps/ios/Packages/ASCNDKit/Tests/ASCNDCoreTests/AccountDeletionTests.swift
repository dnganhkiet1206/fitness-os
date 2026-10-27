import ASCNDCore
import Foundation
import Testing

struct AccountDeletionTests {
  @Test func twoHundredIsDeleted() {
    #expect(AccountDeletion.outcome(status: 200, body: Data(#"{"ok":true}"#.utf8)) == .deleted)
  }

  @Test func failureKeepsThePartialFlag() {
    let partial = Data(#"{"error":"Could not delete the account","partial":true}"#.utf8)
    #expect(AccountDeletion.outcome(status: 500, body: partial) == .failed(partial: true))
    let clean = Data(#"{"error":"Could not read stored files","partial":false}"#.utf8)
    #expect(AccountDeletion.outcome(status: 500, body: clean) == .failed(partial: false))
  }

  @Test func unreadableBodyIsNotClaimedPartial() {
    #expect(AccountDeletion.outcome(status: 502, body: nil) == .failed(partial: false))
    #expect(AccountDeletion.outcome(status: 401, body: Data("nope".utf8)) == .failed(partial: false))
  }

  /// Phản hồi của lần xoá bị mất (hết giờ, rớt mạng giữa chừng): server có thể
  /// đã xoá xong — không được báo "chưa có gì bị xoá" (`offline`).
  @Test func lostReplyIsUnconfirmedNotOffline() {
    for code: URLError.Code in [.timedOut, .networkConnectionLost, .cancelled, .badServerResponse] {
      #expect(AccountDeletion.outcome(transport: URLError(code)) == .unconfirmed)
    }
    #expect(AccountDeletion.outcome(transport: CancellationError()) == .unconfirmed)
    struct Odd: Error {}
    #expect(AccountDeletion.outcome(transport: Odd()) == .unconfirmed)
  }

  /// Không rời được máy: chắc chắn chưa xoá gì.
  @Test func notSentIsOffline() {
    for code: URLError.Code in [.notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed] {
      #expect(AccountDeletion.outcome(transport: URLError(code)) == .offline)
    }
    let bridged = NSError(domain: NSURLErrorDomain, code: URLError.Code.notConnectedToInternet.rawValue)
    #expect(AccountDeletion.outcome(transport: bridged) == .offline)
    let lostBridged = NSError(domain: NSURLErrorDomain, code: URLError.Code.timedOut.rawValue)
    #expect(AccountDeletion.outcome(transport: lostBridged) == .unconfirmed)
  }
}
