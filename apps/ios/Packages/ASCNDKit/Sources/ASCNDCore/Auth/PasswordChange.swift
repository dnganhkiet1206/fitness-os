public import Foundation
public import Observation

/// Đổi mật khẩu (#423) — màn `app/change-password.tsx` @ fac9ac2.
///
/// RN behavior: hai ô (mới, nhập lại); tối thiểu 6 ký tự (`MIN_LENGTH`, đếm
///   như `String.length` của JS — đơn vị UTF-16); hai ô phải trùng; một lần
///   gọi `supabase.auth.updateUser({ password })`; thành công thì nút tắt luôn
///   (không gửi lần hai), quay lại và báo "đã đổi"; lỗi thì báo lỗi thô.
///   KHÔNG hỏi mật khẩu cũ, KHÔNG đăng xuất.
/// Native behavior: cùng luật và cùng một lời gọi; lỗi được gọi ĐÚNG TÊN
///   (`PasswordChangeFailure`) để màn nói điều người dùng làm được. Chính sách
///   phiên không đổi: phiên vẫn là phiên ấy (supabase phát `USER_UPDATED`);
///   nếu server kết thúc phiên thì đi qua `signedOut` như mọi đường khác và
///   `SessionStore` dọn dữ liệu như thường.
public enum PasswordRules {
  /// `MIN_LENGTH` (`change-password.tsx:25`).
  public static let minLength = 6

  /// Độ dài như JS đếm (`"😀".length == 2`) — để cùng một mật khẩu qua cùng
  /// một luật ở cả hai app.
  public static func length(_ s: String) -> Int { s.utf16.count }

  /// `a === b` của JS: so từng đơn vị UTF-16. `==` của Swift coi hai chuỗi
  /// tương đương chuẩn hoá là bằng ("é" dựng sẵn = "e" + dấu tổ hợp), nên hai
  /// ô gõ khác byte vẫn "trùng" và mật khẩu gửi đi không phải thứ người dùng
  /// gõ lại ở ô thứ hai.
  public static func same(_ a: String, _ b: String) -> Bool { a.utf16.elementsEqual(b.utf16) }
}

/// Vì sao đổi mật khẩu không xong, theo thứ người dùng làm được với nó.
public enum PasswordChangeFailure: Error, Sendable, Hashable {
  /// Không tới được server — thử lại khi có mạng.
  case offline
  /// Trùng mật khẩu đang dùng (`same_password`).
  case samePassword
  /// Server chê yếu (`weak_password`), kèm lý do của server nếu có.
  case weakPassword(reasons: [String])
  /// Dự án bật "đổi mật khẩu an toàn": phải đăng nhập lại gần đây
  /// (`reauthentication_needed`). RN cũng chỉ báo lỗi ở đây.
  case reauthenticationNeeded
  /// Không còn phiên (`session_not_found`) — đăng nhập lại.
  case signedOut
  /// Quá nhiều lần (`over_request_rate_limit`).
  case rateLimited
  /// Còn lại; mang mã thô cho log, không bao giờ cho người dùng.
  case server(code: String?)
}

/// Form đổi mật khẩu: luật của màn, không có lời gọi mạng nào trong View.
@MainActor @Observable
public final class PasswordChangeController {
  public var newPassword = ""
  public var confirmation = ""
  public private(set) var saving = false
  /// Đã đổi xong: nút tắt luôn — màn đang đóng không gửi lần hai.
  public private(set) var saved = false
  public private(set) var failure: PasswordChangeFailure?

  @ObservationIgnored private let change: @MainActor (String) async throws(PasswordChangeFailure) -> Void

  public init(change: @escaping @MainActor (String) async throws(PasswordChangeFailure) -> Void) {
    self.change = change
  }

  public convenience init(session: SessionStore) {
    self.init(change: { [weak session] password throws(PasswordChangeFailure) in
      guard let session else { throw .signedOut }
      try await session.updatePassword(password)
    })
  }

  /// Gõ rồi mà chưa đủ dài (`tooShort`).
  public var tooShort: Bool {
    let n = PasswordRules.length(newPassword)
    return n > 0 && n < PasswordRules.minLength
  }

  /// Ô nhập lại có chữ mà không trùng (`mismatch`).
  public var mismatch: Bool { !confirmation.isEmpty && !PasswordRules.same(newPassword, confirmation) }

  public var canSave: Bool {
    PasswordRules.length(newPassword) >= PasswordRules.minLength && PasswordRules.same(newPassword, confirmation)
      && !saving && !saved
  }

  /// Gửi. `true` khi đã đổi — màn quay lại và báo "đã đổi".
  @discardableResult
  public func submit() async -> Bool {
    guard canSave else { return false }
    saving = true
    failure = nil
    defer { saving = false }
    do throws(PasswordChangeFailure) {
      try await change(newPassword)
      saved = true
      return true
    } catch {
      failure = error
      return false
    }
  }
}

extension SessionStore {
  /// Đổi mật khẩu của phiên đang mở. Lỗi lạ: mất mạng thì `offline`, còn lại
  /// `server` — adapter thật đã dịch các mã của Supabase.
  public func updatePassword(_ password: String) async throws(PasswordChangeFailure) {
    guard session != nil else { throw .signedOut }
    do {
      try await authAPI.updatePassword(password)
    } catch let f as PasswordChangeFailure {
      throw f
    } catch {
      throw NetworkFailure.isOffline(error) ? .offline : .server(code: nil)
    }
  }
}
