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
  case offline
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
}

/// Cổng gọi hàm xoá — bản Supabase ở `ASCNDBackend`.
public protocol AccountDeleter: Sendable {
  func deleteAccount() async -> AccountDeletion
}
