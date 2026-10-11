import ASCNDCore
import Foundation
import Testing

/// Link email auth (#527 deep link lát 1). Đọc tham số như `extractParams`
/// của supabase-swift; link không phải auth để lại cho bộ định tuyến route.
struct AuthLinkParseTests {
  static func link(_ s: String) -> AuthLink? { URL(string: s).flatMap(AuthLink.init) }

  @Test func recoveryPKCE() {
    let l = Self.link("ascnd:///auth?type=recovery&code=8f2c")
    #expect(l?.kind == .recovery)
    #expect(l?.failure == nil)
  }

  @Test func signupConfirmPKCE() {
    let l = Self.link("ascnd:///?code=8f2c")
    #expect(l?.kind == .confirm)
    #expect(l?.failure == nil)
  }

  /// Implicit: token và `type` trong fragment.
  @Test func implicitFragment() {
    let l = Self.link("ascnd:///#access_token=a.b.c&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery")
    #expect(l?.kind == .recovery)
    let c = Self.link("ascnd:///#access_token=a.b.c&type=signup")
    #expect(c?.kind == .confirm)
  }

  /// Lỗi Supabase gắn vào link: biết ngay, không cần gọi server.
  @Test func embeddedErrors() {
    let expired = Self.link(
      "ascnd:///auth?type=recovery#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")
    #expect(expired?.kind == .recovery)
    #expect(expired?.failure == .expired)
    #expect(Self.link("ascnd:///?error=server_error")?.failure == .invalid)
    #expect(Self.link("ascnd:///?error_code=flow_state_not_found")?.failure == .otherDevice)
  }

  /// Không phải link auth: route, scheme khác, `code` rỗng.
  @Test func notAuthLinks() {
    #expect(Self.link("ascnd://water") == nil)
    #expect(Self.link("ascnd:///diary?date=2026-10-01") == nil)
    #expect(Self.link("ascnd:///auth?type=recovery") == nil, "không có code / token / lỗi")
    #expect(Self.link("https://ascnd.app/?code=8f2c") == nil)
    #expect(Self.link("ascnd:///?code=") == nil, "giá trị rỗng bị bỏ như supabase-swift")
  }

  /// Query thắng fragment (thứ tự của `extractParams`); `+` là dấu cách.
  @Test func queryWinsAndPlusDecodes() {
    #expect(Self.link("ascnd:///?type=recovery&code=1#type=signup")?.kind == .recovery)
    #expect(Self.link("ascnd:///?code=1&type=re+covery")?.kind == .confirm)
  }

  @Test func failureCodes() {
    #expect(AuthLinkFailure(code: "otp_expired") == .expired)
    #expect(AuthLinkFailure(code: "flow_state_expired") == .expired)
    #expect(AuthLinkFailure(code: "bad_code_verifier") == .otherDevice)
    #expect(AuthLinkFailure(code: "flow_state_not_found") == .otherDevice)
    #expect(AuthLinkFailure(code: "unexpected_failure") == .invalid)
    #expect(AuthLinkFailure(code: nil) == .invalid)
  }
}

/// `AuthAPI` giả cho link: `session(from:)` mở phiên đã cấu hình hoặc ném lỗi.
private final class LinkAuth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var current: AuthSession?
  private var _opened: [URL] = []
  let opens: AuthSession?
  let fails: (any Error)?

  init(current: AuthSession? = nil, opens: AuthSession? = nil, fails: (any Error)? = nil) {
    self.current = current
    self.opens = opens
    self.fails = fails
  }

  var opened: [URL] { lock.withLock { _opened } }

  func currentSession() async throws -> AuthSession? { lock.withLock { current } }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> { AsyncStream { _ in } }
  func signUp(email: String, password: String, name: String) async throws {}
  func signIn(email: String, password: String) async throws {}
  func signInWithApple(identityToken: String, rawNonce: String) async throws {}
  func resetPassword(email: String) async throws {}
  func updatePassword(_ password: String) async throws {}
  func signOut() async throws {}
  func session(from url: URL) async throws {
    lock.withLock { _opened.append(url) }
    if let fails { throw fails }
    lock.withLock { current = opens }
  }
}

private let alice = AuthSession(userId: "u-alice", email: "a@example.com")
private let bob = AuthSession(userId: "u-bob", email: "b@example.com")
private let recoveryURL = URL(string: "ascnd:///auth?type=recovery&code=8f2c")!
private let confirmURL = URL(string: "ascnd:///?code=8f2c")!

@MainActor
struct AuthLinkSessionTests {
  /// Đặt lại mật khẩu khi chưa đăng nhập: mở phiên ngay, rồi hỏi mật khẩu mới.
  @Test func recoveryOpensSessionThenAsksForPassword() async {
    let api = LinkAuth(opens: alice)
    let store = SessionStore(api: api)
    await store.start()
    #expect(store.phase == .signedOut)
    #expect(await store.open(recoveryURL))
    #expect(api.opened == [recoveryURL])
    #expect(store.phase == .signedIn(alice))
    #expect(store.authLink == .recoveryReady)
    store.dismissAuthLink()
    #expect(store.authLink == nil)
    #expect(store.phase == .signedIn(alice), "đóng màn không đăng xuất")
  }

  /// Xác nhận đăng ký: mở phiên là xong, không còn màn nào.
  @Test func confirmOpensSessionAndClears() async {
    let store = SessionStore(api: LinkAuth(opens: alice))
    await store.start()
    #expect(await store.open(confirmURL))
    #expect(store.phase == .signedIn(alice))
    #expect(store.authLink == nil)
  }

  /// Lỗi gắn trong link: nói lý do, KHÔNG gọi server, phiên không đổi.
  @Test func embeddedErrorNeverCallsServer() async {
    let api = LinkAuth(opens: alice)
    let store = SessionStore(api: api)
    await store.start()
    let url = URL(string: "ascnd:///auth?type=recovery#error=access_denied&error_code=otp_expired")!
    #expect(await store.open(url))
    #expect(api.opened.isEmpty)
    #expect(store.authLink == .failed(.recovery, .expired))
    #expect(store.phase == .signedOut)
  }

  /// Server từ chối (khác máy) / mất mạng / lỗi lạ: mỗi cái một lý do.
  @Test func serverFailuresAreNamed() async {
    let other = SessionStore(api: LinkAuth(fails: AuthLinkFailure.otherDevice))
    await other.start()
    await other.open(recoveryURL)
    #expect(other.authLink == .failed(.recovery, .otherDevice))
    #expect(other.phase == .signedOut)

    let offline = SessionStore(api: LinkAuth(fails: URLError(.notConnectedToInternet)))
    await offline.start()
    await offline.open(confirmURL)
    #expect(offline.authLink == .failed(.confirm, .offline))

    struct Weird: Error {}
    let weird = SessionStore(api: LinkAuth(fails: Weird()))
    await weird.start()
    await weird.open(confirmURL)
    #expect(weird.authLink == .failed(.confirm, .invalid))
  }

  /// Link route / scheme khác: không phải việc của phiên.
  @Test func nonAuthLinksAreLeftAlone() async {
    let api = LinkAuth(opens: alice)
    let store = SessionStore(api: api)
    await store.start()
    #expect(await store.open(URL(string: "ascnd://water")!) == false)
    #expect(api.opened.isEmpty)
    #expect(store.authLink == nil)
  }

  /// Link của tài khoản khác khi đang đăng nhập: đổi người là dọn dữ liệu
  /// của người trước, như mọi lần đổi tài khoản.
  @Test func linkForAnotherAccountRunsCleanup() async {
    let store = SessionStore(api: LinkAuth(current: alice, opens: bob))
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    #expect(store.phase == .signedIn(alice))
    await store.open(recoveryURL)
    #expect(store.phase == .signedIn(bob))
    #expect(cleaned == 1)
    #expect(store.authLink == .recoveryReady)
  }
}
