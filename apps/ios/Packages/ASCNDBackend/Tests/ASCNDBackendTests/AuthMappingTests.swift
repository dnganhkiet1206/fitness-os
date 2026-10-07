@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Supabase
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

  /// Đổi mật khẩu (#423): mã của Supabase Auth → lỗi có tên.
  @Test func passwordFailuresAreNamed() {
    #expect(SupabaseAuthAPI.passwordFailure(code: "same_password") == .samePassword)
    #expect(SupabaseAuthAPI.passwordFailure(code: "weak_password") == .weakPassword(reasons: []))
    #expect(SupabaseAuthAPI.passwordFailure(code: "reauthentication_needed") == .reauthenticationNeeded)
    #expect(SupabaseAuthAPI.passwordFailure(code: "session_not_found") == .signedOut)
    #expect(SupabaseAuthAPI.passwordFailure(code: "over_request_rate_limit") == .rateLimited)
    #expect(SupabaseAuthAPI.passwordFailure(code: "teapot") == .server(code: "teapot"))
    #expect(SupabaseAuthAPI.passwordFailure(AuthError.weakPassword(message: "weak", reasons: ["length"])) == .weakPassword(reasons: ["length"]))
    #expect(SupabaseAuthAPI.passwordFailure(AuthError.sessionMissing) == .signedOut)
    #expect(SupabaseAuthAPI.passwordFailure(URLError(.notConnectedToInternet)) == .offline)
  }
}
