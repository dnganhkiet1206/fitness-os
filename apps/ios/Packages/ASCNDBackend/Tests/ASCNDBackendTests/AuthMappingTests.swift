@testable import ASCNDBackend
import ASCNDCore
import Testing

struct AuthMappingTests {
  /// Vector chuẩn của SHA-256 (FIPS 180-2): "abc".
  @Test func nonceHashIsLowercaseHexSHA256() {
    #expect(AppleSignInNonce(raw: "abc").sha256Hex == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  }

  @Test func eachNonceIsFresh() {
    #expect(AppleSignInNonce().raw != AppleSignInNonce().raw)
  }

  @Test func redirectsUseAppScheme() {
    #expect(SupabaseAuthAPI.emailRedirect.scheme == "ascnd")
    #expect(SupabaseAuthAPI.recoveryRedirect.absoluteString == "ascnd:///auth?type=recovery")
  }

  @Test func eventMapping() {
    #expect(SupabaseAuthAPI.event(from: .signedOut) == AuthEvent.signedOut)
    #expect(SupabaseAuthAPI.event(from: .initialSession) == AuthEvent.initialSession)
    #expect(SupabaseAuthAPI.event(from: .tokenRefreshed) == AuthEvent.tokenRefreshed)
    #expect(SupabaseAuthAPI.event(from: .passwordRecovery) == AuthEvent.passwordRecovery)
  }
}
