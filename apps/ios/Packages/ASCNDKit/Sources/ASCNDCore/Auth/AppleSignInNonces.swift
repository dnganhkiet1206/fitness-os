/// Nonce của Sign in with Apple, gắn với ĐÚNG lượt xin quyền đã tạo ra nó.
///
/// Bản trước giữ một `appleNonce` dùng chung trong View: bấm nút hai lần (hoặc
/// lượt trước còn treo khi lượt sau bắt đầu) thì request B ghi đè nonce trước
/// khi response A về, và A gửi lên Supabase nonce của B. Token của A mang
/// `sha256(nonceA)` nên server từ chối — hoặc tệ hơn, một token lọt sang lượt
/// khác được chấp nhận với nonce không phải của nó.
///
/// Mỗi lượt có một `state` riêng (đặt vào `ASAuthorizationAppleIDRequest.state`;
/// Apple trả lại đúng chuỗi ấy trong `ASAuthorizationAppleIDCredential.state`).
/// Nonce thô được tra theo `state` và XOÁ ngay khi lấy: dùng một lần, không
/// phát lại được. Thiếu `state` hoặc `state` lạ thì không có nonce — nơi gọi
/// phải dừng, không đoán.
public struct AppleSignInNonces: Sendable {
  /// Số lượt chờ tối đa. Lượt bị huỷ không báo `state` về, nên không xoá được
  /// theo `state`; giữ tối đa chừng này lượt mới nhất để bảng không phình.
  public static let capacity = 8

  private var pending: [(state: String, rawNonce: String)] = []

  public init() {}

  /// Ghi một lượt mới. `state` và `rawNonce` do nơi gọi sinh từ CSPRNG.
  public mutating func register(state: String, rawNonce: String) {
    pending.removeAll { $0.state == state }
    pending.append((state: state, rawNonce: rawNonce))
    if pending.count > Self.capacity {
      pending.removeFirst(pending.count - Self.capacity)
    }
  }

  /// Nonce thô của đúng lượt `state`, và bỏ lượt ấy (dùng một lần).
  /// `nil` khi `state` thiếu, lạ, hoặc đã dùng.
  public mutating func take(state: String?) -> String? {
    guard let state, let i = pending.firstIndex(where: { $0.state == state }) else { return nil }
    return pending.remove(at: i).rawNonce
  }

  /// Số lượt đang chờ.
  public var count: Int { pending.count }
}
