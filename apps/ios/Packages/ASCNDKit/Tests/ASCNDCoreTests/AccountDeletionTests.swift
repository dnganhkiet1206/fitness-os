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
}
