@testable import ASCNDCore
import Foundation
import Testing

/// Avatar Today (#527) — `Fixtures/initials-golden.json` = CHÍNH `initialsFor`
/// của `lib/initials.ts` @ fac9ac2 (`tools/initials/gen.cjs`: 24 tên × 8 email).
struct AccountInitialsTests {
  @Test func initialsAreRNs() throws {
    let url = try #require(
      Bundle.module.url(forResource: "initials-golden", withExtension: "json", subdirectory: "Fixtures"))
    let golden = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    let cases = KoaRenderGoldenTests.array(golden["cases"])
    #expect(cases.count == 192)
    for c in cases {
      let name = c["name"]?.stringValue
      let email = c["email"]?.stringValue
      #expect(AccountInitials.of(name: name, email: email) == c["out"]?.stringValue, "\(name ?? "nil") / \(email ?? "nil")")
    }
  }
}
