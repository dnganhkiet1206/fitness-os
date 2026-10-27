#if DEBUG
  import ASCNDBackend
  import ASCNDCore
  import Foundation

  /// Chế độ UI test (Maestro, `apps/ios/.maestro/`) — CHỈ bản Debug; bản Release
  /// không biên dịch file này (cổng `tools/native-uitest-mode.mjs`).
  ///
  /// Bật bằng launch argument `-uiTestFakeBackend` (hoặc biến môi trường
  /// `ASCND_UI_TEST=1`). Khi bật, `AppServices`:
  /// - nói chuyện với máy chủ GIẢ trong app (`FakeSupabaseProtocol`), dữ liệu từ
  ///   `UITestSeed` — không có tài khoản, không có server, không ra mạng;
  /// - đã đăng nhập sẵn bằng phiên giả (`UITestAuth`), không đụng Keychain;
  /// - dùng database trong bộ nhớ: mỗi lần mở app là dữ liệu mẫu sạch;
  /// - coi mạng luôn dùng được, không dò AI, không đồng bộ Health, không đo lường.
  /// Request lọt tới `*.supabase.co` bị chặn, đếm và ghi vào `Documents/uitest-blocked.log`.
  enum UITestMode {
    static let isOn: Bool = {
      let info = ProcessInfo.processInfo
      // `-uiTestFakeBackend` (simctl), `uiTestFakeBackend true` / `-uiTestFakeBackend true`
      // (Maestro `launchApp.arguments` — dạng tuỳ phiên bản), hoặc khoá UserDefaults của
      // app (workflow CI ghi bằng `simctl spawn … defaults write`).
      return info.arguments.contains { $0.trimmingCharacters(in: CharacterSet(charactersIn: "-")) == "uiTestFakeBackend" }
        || UserDefaults.standard.bool(forKey: "uiTestFakeBackend") || info.environment["ASCND_UI_TEST"] == "1"
    }()

    /// Tên miền `.invalid` (RFC 2606): không bao giờ phân giải được ra mạng thật.
    static let host = "ui-test.ascnd.invalid"
    static let userId = "e2e00000-0000-4000-8000-000000000001"
    static let email = "e2e@ui-test.invalid"

    /// Công tắc mất mạng (audit vòng 5, kiểm offline → online): có tệp
    /// `Documents/uitest-offline` trong container của app thì máy chủ giả trả
    /// `notConnectedToInternet` và phép dò báo không tới được; xoá tệp là có mạng lại.
    /// Bật / tắt từ máy Mac: `touch` / `rm` trên `simctl get_app_container … data`.
    static var offline: Bool {
      guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return false }
      return FileManager.default.fileExists(atPath: dir.appendingPathComponent("uitest-offline").path)
    }

    /// Client Supabase trỏ vào máy chủ giả. Gọi một lần, khi `isOn`.
    static func makeBackend() -> Backend {
      URLProtocol.registerClass(FakeSupabaseProtocol.self)
      FakeSupabaseStore.shared.reset(UITestSeed.tables(now: Date(), calendar: .current))
      let config = URLSessionConfiguration.ephemeral
      config.protocolClasses = [FakeSupabaseProtocol.self]
      // swiftlint:disable:next force_try
      let backend = Backend(
        config: try! BackendConfig(urlString: "https://\(host)", anonKey: "ui-test-anon-key"),
        session: URLSession(configuration: config))
      // Phiên của client (token cho edge function) — trong bộ nhớ, từ máy chủ giả.
      Task { _ = try? await backend.client.auth.signIn(email: email, password: "ui-test") }
      return backend
    }

    /// JWT không ký (máy chủ giả không kiểm) — supabase-swift chỉ đọc `exp`.
    static func accessToken(expiresAt: TimeInterval) -> String {
      func b64(_ s: String) -> String {
        Data(s.utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
          .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      }
      let payload = #"{"sub":"\#(userId)","role":"authenticated","exp":\#(Int(expiresAt))}"#
      return b64(#"{"alg":"none","typ":"JWT"}"#) + "." + b64(payload) + ".ui-test"
    }
  }

  /// Phiên giả: đã đăng nhập ngay từ đầu, đăng xuất thì về màn đăng nhập.
  final class UITestAuth: AuthAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var signedIn = true
    private var continuations: [AsyncStream<(AuthEvent, AuthSession?)>.Continuation] = []
    private let session = AuthSession(userId: UITestMode.userId, email: UITestMode.email)

    func currentSession() async throws -> AuthSession? { lock.withLock { signedIn ? session : nil } }

    func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
      AsyncStream { c in lock.withLock { continuations.append(c) } }
    }

    func signUp(email: String, password: String, name: String) async throws { emit(.signedIn) }
    func signIn(email: String, password: String) async throws { emit(.signedIn) }
    func signInWithApple(identityToken: String, rawNonce: String) async throws { emit(.signedIn) }
    func signInWithGoogle() async throws { emit(.signedIn) }
    func resetPassword(email: String) async throws {}
    func updatePassword(_ password: String) async throws {}
    func signOut() async throws { emit(.signedOut) }

    private func emit(_ event: AuthEvent) {
      let (listeners, value) = lock.withLock { () -> ([AsyncStream<(AuthEvent, AuthSession?)>.Continuation], AuthSession?) in
        signedIn = event == .signedIn
        return (continuations, signedIn ? session : nil)
      }
      for c in listeners { c.yield((event, value)) }
    }
  }

  /// Mạng "có internet" — dải Offline không hiện ngẫu nhiên trong test — trừ khi bật
  /// công tắc `UITestMode.offline`.
  @MainActor
  final class UITestReachabilityProber: ReachabilityProber {
    private final class Probe: ReachabilityProbe {
      func cancel() {}
    }

    func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe {
      Task { @MainActor in done(UITestMode.offline ? nil : 204) }
      return Probe()
    }
  }
#endif
