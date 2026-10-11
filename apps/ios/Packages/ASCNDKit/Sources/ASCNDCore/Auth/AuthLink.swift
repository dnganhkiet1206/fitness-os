public import Foundation

/// Link trong email auth quay về app (#527, deep link lát 1).
///
/// App gửi hai đường quay lại, như RN (`use-auth.tsx:141,196`):
/// - đăng ký: `ascnd:///` — Supabase thêm `code` (PKCE) hoặc token (implicit);
/// - quên mật khẩu: `ascnd:///auth?type=recovery` — cùng như thế.
///
/// RN behavior: `detectSessionInUrl: false` và không có handler — token bị bỏ,
///   đặt lại mật khẩu qua email KHÔNG dùng được (chưa đăng nhập thì chỉ thấy
///   màn đăng nhập; đã đăng nhập thì `/auth` là "Unmatched Route").
/// Native behavior: link có `code` / `access_token` mở phiên; link đặt lại mật
///   khẩu thì sau đó hỏi mật khẩu mới; link hỏng / hết hạn nói đúng lý do.
/// Reason: Kiệt cho làm (#527 6104187995 → "Được làm hết đi"). Ghi
///   `NATIVE_IMPROVEMENTS`.
///
/// Đọc tham số y như `extractParams` của supabase-swift: fragment rồi query
/// (query thắng), cặp `a=b` có giá trị rỗng bị bỏ, `+` là dấu cách.
public struct AuthLink: Sendable, Hashable {
  public enum Kind: Sendable, Hashable {
    /// `type=recovery`: sau khi mở phiên phải hỏi mật khẩu mới.
    case recovery
    /// Xác nhận đăng ký / đổi email / magic link: mở phiên là xong.
    case confirm
  }

  public let kind: Kind
  /// Lỗi Supabase gắn sẵn vào link (`error` / `error_code`) — không cần gọi
  /// server mới biết là hỏng.
  public let failure: AuthLinkFailure?

  /// `nil`: không phải link auth (không có `code`, `access_token`, `error`…) —
  /// để cho bộ định tuyến route xử lý.
  public init?(_ url: URL) {
    guard url.scheme?.lowercased() == "ascnd" else { return nil }
    let p = Self.params(url)
    let hasCredential = p["code"] != nil || p["access_token"] != nil
    let hasError = p["error"] != nil || p["error_code"] != nil || p["error_description"] != nil
    guard hasCredential || hasError else { return nil }
    kind = p["type"] == "recovery" ? .recovery : .confirm
    failure = hasError ? AuthLinkFailure(code: p["error_code"] ?? p["error"]) : nil
  }

  /// `extractParams(from:)` của supabase-swift.
  static func params(_ url: URL) -> [String: String] {
    guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return [:] }
    var out: [String: String] = [:]
    for part in [c.percentEncodedFragment, c.percentEncodedQuery] {
      guard let part else { continue }
      for pair in part.split(separator: "&") {
        let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        guard kv.count == 2, !kv[1].isEmpty else { continue }
        out[decode(kv[0])] = decode(kv[1])
      }
    }
    return out
  }

  private static func decode(_ s: Substring) -> String {
    let plus = s.replacingOccurrences(of: "+", with: " ")
    return plus.removingPercentEncoding ?? plus
  }
}

/// Vì sao một link auth không mở được — mỗi lý do một câu cho người dùng.
public enum AuthLinkFailure: Error, Sendable, Hashable {
  /// Hết hạn hoặc đã dùng (`otp_expired`, `flow_state_expired`).
  case expired
  /// Mở trên máy khác máy đã yêu cầu: PKCE cần mã kiểm chứng chỉ máy ấy giữ
  /// (`bad_code_verifier`, `flow_state_not_found`).
  case otherDevice
  case offline
  /// Mọi lý do khác.
  case invalid

  /// Từ mã lỗi của Supabase Auth (`error_code` trong link, hay của API).
  public init(code: String?) {
    switch code {
    case "otp_expired", "flow_state_expired": self = .expired
    case "bad_code_verifier", "flow_state_not_found": self = .otherDevice
    default: self = .invalid
    }
  }
}

/// Link auth đang ở đâu — màn gốc hiện theo đây.
public enum AuthLinkState: Sendable, Hashable {
  case verifying(AuthLink.Kind)
  /// Phiên đặt lại mật khẩu đã mở: hỏi mật khẩu mới.
  case recoveryReady
  case failed(AuthLink.Kind, AuthLinkFailure)
}
