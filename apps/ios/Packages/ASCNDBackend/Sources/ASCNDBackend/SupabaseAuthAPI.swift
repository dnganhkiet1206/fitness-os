public import ASCNDCore
import CryptoKit
public import Foundation
import Supabase

/// `AuthAPI` thật, trên supabase-swift. Phiên nằm trong Keychain (mặc định của
/// supabase-swift trên nền Apple) và tự làm mới.
public struct SupabaseAuthAPI: AuthAPI {
  /// Đường quay lại app sau khi bấm link trong email — như
  /// `Linking.createURL('/')` của bản RN với scheme `ascnd`.
  public static let emailRedirect = URL(string: "ascnd:///")!
  public static let recoveryRedirect = URL(string: "ascnd:///auth?type=recovery")!

  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func currentSession() async throws -> AuthSession? {
    client.auth.currentSession.map(Self.session(from:))
  }

  public func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
    let source = client.auth.authStateChanges
    return AsyncStream { continuation in
      let task = Task {
        for await change in source {
          continuation.yield((Self.event(from: change.event), change.session.map(Self.session(from:))))
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }

  public func signUp(email: String, password: String, name: String) async throws {
    _ = try await client.auth.signUp(
      email: email, password: password, data: ["name": .string(name)], redirectTo: Self.emailRedirect)
  }

  public func signIn(email: String, password: String) async throws {
    _ = try await client.auth.signIn(email: email, password: password)
  }

  public func signInWithApple(identityToken: String, rawNonce: String) async throws {
    _ = try await client.auth.signInWithIdToken(
      credentials: OpenIDConnectCredentials(provider: .apple, idToken: identityToken, nonce: rawNonce))
  }

  public func resetPassword(email: String) async throws {
    try await client.auth.resetPasswordForEmail(email, redirectTo: Self.recoveryRedirect)
  }

  /// `supabase.auth.updateUser({ password })` (`change-password.tsx:49`).
  /// Thành công thì supabase-swift tự cập nhật phiên và phát `USER_UPDATED`.
  public func updatePassword(_ password: String) async throws {
    do {
      _ = try await client.auth.update(user: UserAttributes(password: password))
    } catch {
      throw Self.passwordFailure(error)
    }
  }

  /// Mã lỗi của Supabase Auth → `PasswordChangeFailure`.
  static func passwordFailure(_ error: any Error) -> PasswordChangeFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    guard let auth = error as? AuthError else { return .server(code: nil) }
    if case .weakPassword(_, let reasons) = auth { return .weakPassword(reasons: reasons) }
    return passwordFailure(code: auth.errorCode.rawValue)
  }

  static func passwordFailure(code: String) -> PasswordChangeFailure {
    switch code {
    case ErrorCode.samePassword.rawValue: .samePassword
    case ErrorCode.weakPassword.rawValue: .weakPassword(reasons: [])
    case ErrorCode.reauthenticationNeeded.rawValue: .reauthenticationNeeded
    case ErrorCode.sessionNotFound.rawValue: .signedOut
    case ErrorCode.overRequestRateLimit.rawValue: .rateLimited
    default: .server(code: code)
    }
  }

  public func signOut() async throws {
    try await client.auth.signOut()
  }

  /// Link email quay về app (`ascnd:///…?code=…`, PKCE — mặc định của
  /// supabase-swift): đổi `code` lấy phiên. Thành công thì supabase-swift lưu
  /// phiên và phát `signedIn`.
  public func session(from url: URL) async throws {
    do {
      _ = try await client.auth.session(from: url)
    } catch {
      throw Self.linkFailure(error)
    }
  }

  /// Lỗi của `session(from:)` → `AuthLinkFailure`. Lỗi gắn trong link đến qua
  /// `pkceGrantCodeExchange(code:)`; lỗi của server qua `errorCode`.
  static func linkFailure(_ error: any Error) -> AuthLinkFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    guard let auth = error as? AuthError else { return .invalid }
    if case .pkceGrantCodeExchange(_, _, let code) = auth { return AuthLinkFailure(code: code) }
    return AuthLinkFailure(code: auth.errorCode.rawValue)
  }

  static func session(from s: Session) -> AuthSession {
    AuthSession(userId: s.user.id.uuidString.lowercased(), email: s.user.email)
  }

  static func event(from e: AuthChangeEvent) -> AuthEvent {
    switch e {
    case .initialSession: return .initialSession
    case .signedIn: return .signedIn
    case .signedOut: return .signedOut
    case .tokenRefreshed: return .tokenRefreshed
    case .userUpdated: return .userUpdated
    case .passwordRecovery: return .passwordRecovery
    default: return .other
    }
  }
}

/// Nonce cho Sign in with Apple: Apple nhận SHA-256 của nó, Supabase nhận bản
/// gốc để so (use-auth.tsx: "Supabase expects the RAW nonce; Apple receives its
/// SHA-256 hash"). Mỗi lần đăng nhập một nonce mới.
public struct AppleSignInNonce: Sendable, Hashable {
  public let raw: String

  public init(raw: String = UUID().uuidString) {
    self.raw = raw
  }

  /// Hex chữ thường — dạng `Crypto.digestStringAsync` của bản RN trả về.
  public var sha256Hex: String {
    SHA256.hash(data: Data(raw.utf8)).map { b in
      let s = String(b, radix: 16)
      return b < 16 ? "0" + s : s
    }.joined()
  }
}
