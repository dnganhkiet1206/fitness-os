public import Foundation

/// Tính năng cần Apple Developer Program trả phí (#527, chỉ thị 6093754296).
///
/// Theo bảng "Supported capabilities (iOS)" của Apple, cột "Apple Developer"
/// (tài khoản miễn phí / Personal Team): App Groups, HealthKit, Background
/// modes, Keychain sharing CÓ; **Sign in with Apple chỉ có ở ADP**. Vậy chỉ
/// nút Sign in with Apple là bị khoá theo membership — và project hiện chưa
/// khai entitlement `com.apple.developer.applesignin`, nên nút ấy cũng chưa
/// chạy được ở bất kỳ bản nào. Audit đủ: `apps/ios/docs/APPLE_DEVELOPER_PROGRAM.md`.
///
/// Bật bằng khoá Info.plist `ASCNDSignInWithApple` (build setting
/// `ASCND_SIGN_IN_WITH_APPLE` trong `project.yml`), CÙNG LÚC với thêm
/// entitlement trên một team trả phí. Mặc định tắt: nút ẩn, đăng nhập email
/// vẫn đủ.
public enum AppleFeatureGates {
  public static let signInWithAppleKey = "ASCNDSignInWithApple"
  /// Nút "Tiếp tục với Google" (23/10): bật khi dự án Supabase đã bật nhà cung cấp
  /// Google — xem `docs/GOOGLE_SIGN_IN.md`.
  public static let signInWithGoogleKey = "ASCNDSignInWithGoogle"

  public static func signInWithGoogle(info: [String: Any]?) -> Bool { flag(info?[signInWithGoogleKey]) }

  /// Chỉ bật khi giá trị rõ ràng là có (`YES` / `true` / `1`, hoặc `Bool`
  /// `true`). Thiếu khoá, rỗng, `NO`, chưa thay biến build (`$(…)`) = tắt.
  public static func signInWithApple(info: [String: Any]?) -> Bool { flag(info?[signInWithAppleKey]) }

  static func flag(_ value: Any?) -> Bool {
    switch value {
    case let b as Bool:
      return b
    case let s as String:
      return ["yes", "true", "1"].contains(s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    case let n as NSNumber:
      return n.boolValue
    default:
      return false
    }
  }
}
