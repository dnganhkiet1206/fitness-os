public import Foundation
public import Supabase

/// Một client Supabase cho cả app.
///
/// Phiên đăng nhập: supabase-swift mặc định lưu trong Keychain trên nền Apple
/// (`KeychainLocalStorage`) và tự làm mới token — đúng điều #224 cần, nên KHÔNG
/// tự viết lớp lưu phiên. Bản RN lưu phiên trong AsyncStorage; chuyện mang
/// phiên cũ sang khi cập nhật app đang chờ Kiệt quyết (#224).
public final class Backend: Sendable {
  public let config: BackendConfig
  public let client: SupabaseClient
  /// `URLSession` riêng của client (nil ở chế độ UI test — người gọi tự lo session).
  private let session: URLSession?

  public init(config: BackendConfig) {
    self.config = config
    let session = StallRecovery.makeSession()
    self.session = session
    self.client = SupabaseClient(
      supabaseURL: config.url,
      supabaseKey: config.anonKey,
      options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(
          // Phát ngay phiên lưu trong Keychain làm `.initialSession`, kể cả khi
          // đã hết hạn, rồi mới làm mới token ngầm. Tránh cảnh báo `reportIssue`
          // của supabase-swift và là hành vi mặc định ở major kế tiếp.
          emitLocalSessionAsInitialSession: true
        ),
        global: SupabaseClientOptions.GlobalOptions(session: session)
      )
    )
  }

  /// Bỏ các kết nối đang mở — lượt gọi sau mở kết nối MỚI. Gọi khi app quay lại
  /// tiền cảnh và khi người dùng bấm "Thử lại" (kết nối HTTP/2 chết sau khi máy
  /// ngủ / đổi mạng là nguyên nhân của "Offline" giả, audit 28/10).
  public func resetConnections() {
    session?.flush {}
  }

  /// Client với `URLSession` do người gọi đưa và phiên chỉ trong bộ nhớ — chế độ UI
  /// test (bản Debug, `UITestMode`) dùng để mọi request đi vào máy chủ giả trong app,
  /// và phiên giả không chạm Keychain của phiên thật.
  public init(config: BackendConfig, session: URLSession) {
    self.config = config
    self.session = nil
    self.client = SupabaseClient(
      supabaseURL: config.url,
      supabaseKey: config.anonKey,
      options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(
          storage: InMemoryAuthStorage(), autoRefreshToken: false, emitLocalSessionAsInitialSession: true),
        global: SupabaseClientOptions.GlobalOptions(session: session)
      )
    )
  }
}

/// Kho phiên trong bộ nhớ (chế độ UI test): mất khi app tắt, không đụng Keychain.
final class InMemoryAuthStorage: AuthLocalStorage, @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String: Data] = [:]

  func store(key: String, value: Data) throws { lock.withLock { values[key] = value } }
  func retrieve(key: String) throws -> Data? { lock.withLock { values[key] } }
  func remove(key: String) throws { _ = lock.withLock { values.removeValue(forKey: key) } }
}
