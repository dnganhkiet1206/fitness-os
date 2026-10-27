public import Foundation

/// Kết quả xoá tài khoản (`supabase/functions/delete-account` — App Store 5.1.1(v)).
///
/// Hàm trả 2xx CHỈ khi mọi thứ đã xoá; lỗi kèm `partial: true` khi đã có thứ bị
/// xoá (ảnh tiến trình) trước khi hỏng — app phải nói đúng điều ấy, không được nói
/// "chưa có gì bị xoá" khi ảnh đã mất.
public enum AccountDeletion: Sendable, Hashable {
  case deleted
  /// Không xoá xong; `partial` = đã có dữ liệu bị xoá.
  case failed(partial: Bool)
  /// Chưa tới được server — chắc chắn chưa có gì bị xoá.
  case offline
  /// Yêu cầu có thể đã tới server nhưng mất phản hồi (hết giờ, rớt mạng giữa
  /// chừng, lỗi lạ): có thể đã xoá xong. Không được nói "chưa có gì bị xoá";
  /// hàm phía server gọi lại an toàn (tài khoản đã mất → 200), nên bảo bấm lại.
  case unconfirmed
  /// Chưa có phiên (không gửi gì).
  case notSignedIn

  /// Đọc phản hồi của hàm: mã HTTP + thân JSON (`{"ok":true}` / `{"error","partial"}`).
  public static func outcome(status: Int, body: Data?) -> AccountDeletion {
    if (200..<300).contains(status) { return .deleted }
    let partial = body
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      .flatMap { $0["partial"] as? Bool } ?? false
    return .failed(partial: partial)
  }

  /// Lỗi trước khi yêu cầu kịp rời máy: không mạng, không phân giải / không nối
  /// được tới máy chủ, bắt tay TLS hỏng. Mọi lỗi khác (`timedOut`,
  /// `networkConnectionLost`, huỷ, lỗi lạ) có thể xảy ra SAU khi server đã nhận.
  public static let notSentCodes: Set<URLError.Code> = [
    .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
    .internationalRoamingOff, .dataNotAllowed, .callIsActive, .secureConnectionFailed,
  ]

  /// Đọc lỗi tầng vận chuyển (không có mã HTTP).
  public static func outcome(transport error: any Error) -> AccountDeletion {
    if let e = error as? URLError { return notSentCodes.contains(e.code) ? .offline : .unconfirmed }
    let ns = error as NSError
    if ns.domain == NSURLErrorDomain, notSentCodes.contains(where: { $0.rawValue == ns.code }) { return .offline }
    return .unconfirmed
  }
}

/// Cổng gọi hàm xoá — bản Supabase ở `ASCNDBackend`.
public protocol AccountDeleter: Sendable {
  func deleteAccount() async -> AccountDeletion
}
