#if canImport(AuthenticationServices)
  import AuthenticationServices
#endif
import CryptoKit
public import Foundation

/// Đăng nhập Google kiểu native (23/10, Kiệt chọn cách A): đi thẳng tới Google bằng
/// OAuth client **iOS** của project Google Cloud "ASCND" — không qua trang của
/// Supabase, nên Google chỉ hiện tên "ASCND" (không hiện địa chỉ dự án Supabase).
/// Lấy mã bằng PKCE (client iOS không có secret), đổi lấy `id_token`, rồi đưa cho
/// Supabase `signInWithIdToken`. Nonce: Google nhận bản băm, Supabase nhận bản thô
/// (như Sign in with Apple).
public enum GoogleNativeSignIn {
  /// Khoá Info.plist mang Client ID iOS (theo bundle Debug / Release).
  public static let clientIdKey = "ASCNDGoogleIOSClientID"

  public struct Request: Sendable, Hashable {
    public let url: URL
    public let callbackScheme: String
    public let redirectURI: String
    public let state: String
    public let verifier: String
    public let rawNonce: String
  }

  /// Client ID hợp lệ trong Info.plist; trống / chưa thay biến build = `nil`.
  public static func clientId(info: [String: Any]?) -> String? {
    guard let id = info?[clientIdKey] as? String, id.hasSuffix(".apps.googleusercontent.com"), !id.contains("$(")
    else { return nil }
    return id
  }

  /// `com.googleusercontent.apps.<số>-<mã>` — scheme quay về của client iOS.
  public static func callbackScheme(clientId: String) -> String {
    "com.googleusercontent.apps." + clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
  }

  public static func request(
    clientId: String, state: String = random(), verifier: String = random(48), rawNonce: String = random()
  ) -> Request {
    let scheme = callbackScheme(clientId: clientId)
    let redirect = "\(scheme):/oauthredirect"
    var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    c.queryItems = [
      .init(name: "client_id", value: clientId),
      .init(name: "redirect_uri", value: redirect),
      .init(name: "response_type", value: "code"),
      .init(name: "scope", value: "openid email profile"),
      .init(name: "code_challenge", value: challenge(verifier)),
      .init(name: "code_challenge_method", value: "S256"),
      .init(name: "state", value: state),
      .init(name: "nonce", value: sha256Hex(rawNonce)),
      .init(name: "prompt", value: "select_account"),
    ]
    return Request(
      url: c.url!, callbackScheme: scheme, redirectURI: redirect, state: state, verifier: verifier, rawNonce: rawNonce)
  }

  public enum Failure: Error, Sendable, Hashable {
    case cancelled
    case stateMismatch
    case noCode
    case google(String)
    case noIdToken
  }

  /// Mã từ link quay về; `state` phải khớp lượt này.
  public static func code(from callback: URL, state: String) throws -> String {
    let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
    func value(_ n: String) -> String? { items.first { $0.name == n }?.value }
    if let e = value("error") { throw e == "access_denied" ? Failure.cancelled : Failure.google(e) }
    guard value("state") == state else { throw Failure.stateMismatch }
    guard let code = value("code"), !code.isEmpty else { throw Failure.noCode }
    return code
  }

  /// Thân POST đổi mã lấy token (client iOS: không có secret).
  public static func tokenRequestBody(clientId: String, code: String, verifier: String, redirectURI: String) -> Data {
    var c = URLComponents()
    c.queryItems = [
      .init(name: "client_id", value: clientId), .init(name: "code", value: code),
      .init(name: "code_verifier", value: verifier), .init(name: "grant_type", value: "authorization_code"),
      .init(name: "redirect_uri", value: redirectURI),
    ]
    // `+` trong mã phải được mã hoá, URLComponents để nguyên nó.
    return Data((c.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
  }

  /// Toàn bộ luồng: tấm web của hệ thống → mã → `id_token`. Trả (`id_token`, nonce thô).
  @MainActor
  public static func idToken(clientId: String) async throws -> (idToken: String, rawNonce: String) {
    let r = request(clientId: clientId)
    let callback = try await present(r)
    let code = try code(from: callback, state: r.state)
    var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
    req.httpMethod = "POST"
    req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    req.httpBody = tokenRequestBody(clientId: clientId, code: code, verifier: r.verifier, redirectURI: r.redirectURI)
    let (data, _) = try await URLSession.shared.data(for: req)
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    if let e = json?["error"] as? String { throw Failure.google(e) }
    guard let token = json?["id_token"] as? String else { throw Failure.noIdToken }
    return (token, r.rawNonce)
  }

  @MainActor
  private static func present(_ r: Request) async throws -> URL {
    #if canImport(AuthenticationServices)
      let anchor = AnchorProvider()
      return try await withCheckedThrowingContinuation { cont in
        let session = ASWebAuthenticationSession(url: r.url, callbackURLScheme: r.callbackScheme) { url, error in
          _ = anchor
          if let url {
            cont.resume(returning: url)
          } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
            // Người dùng đóng tấm: `CancellationError` — màn đăng nhập không báo lỗi.
            cont.resume(throwing: CancellationError())
          } else {
            cont.resume(throwing: error ?? Failure.noCode)
          }
        }
        session.presentationContextProvider = anchor
        // Dùng chung với Safari (Kiệt 23/10): ai đã đăng nhập Google trong Safari chỉ
        // cần chạm chọn tài khoản. iOS hỏi "ASCND muốn sử dụng google.com để đăng nhập".
        session.prefersEphemeralWebBrowserSession = false
        session.start()
      }
    #else
      throw Failure.cancelled
    #endif
  }

  #if canImport(AuthenticationServices)
    private final class AnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
      func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { ASPresentationAnchor() }
    }
  #endif

  // MARK: - Mã ngẫu nhiên, PKCE

  public static func random(_ bytes: Int = 32) -> String {
    var b = [UInt8](repeating: 0, count: bytes)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes, &b)
    return base64url(Data(b))
  }

  public static func challenge(_ verifier: String) -> String { base64url(Data(SHA256.hash(data: Data(verifier.utf8)))) }

  public static func sha256Hex(_ s: String) -> String {
    SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  static func base64url(_ d: Data) -> String {
    d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
