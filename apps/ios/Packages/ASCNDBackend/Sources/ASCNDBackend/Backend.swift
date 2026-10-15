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

  public init(config: BackendConfig) {
    self.config = config
    self.client = SupabaseClient(
      supabaseURL: config.url,
      supabaseKey: config.anonKey,
      options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(
          // Phát ngay phiên lưu trong Keychain làm `.initialSession`, kể cả khi
          // đã hết hạn, rồi mới làm mới token ngầm. Tránh cảnh báo `reportIssue`
          // của supabase-swift và là hành vi mặc định ở major kế tiếp.
          emitLocalSessionAsInitialSession: true
        )
      )
    )
  }
}
