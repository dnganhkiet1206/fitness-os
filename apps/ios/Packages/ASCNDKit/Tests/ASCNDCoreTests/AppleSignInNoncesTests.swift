import ASCNDCore
import Testing

/// P1 (#523): nonce Sign in with Apple phải thuộc đúng lượt xin quyền.
struct AppleSignInNoncesTests {
  /// Hai lượt chồng nhau: response A về SAU khi B đã bắt đầu vẫn lấy nonce A.
  /// Bản dùng chung một biến thì A nhận nonce B.
  @Test func interleavedRequestsEachGetTheirOwnNonce() {
    var n = AppleSignInNonces()
    n.register(state: "A", rawNonce: "nonce-A")
    n.register(state: "B", rawNonce: "nonce-B")
    #expect(n.take(state: "A") == "nonce-A")
    #expect(n.take(state: "B") == "nonce-B")
    #expect(n.count == 0)
  }

  /// Dùng một lần: cùng `state` lần hai không có nonce (không phát lại được).
  @Test func nonceIsSingleUse() {
    var n = AppleSignInNonces()
    n.register(state: "A", rawNonce: "nonce-A")
    #expect(n.take(state: "A") == "nonce-A")
    #expect(n.take(state: "A") == nil)
  }

  /// Thiếu `state` hoặc `state` lạ → không đoán nonce nào.
  @Test func missingOrUnknownStateYieldsNoNonce() {
    var n = AppleSignInNonces()
    n.register(state: "A", rawNonce: "nonce-A")
    #expect(n.take(state: nil) == nil)
    #expect(n.take(state: "Z") == nil)
    #expect(n.count == 1, "lượt A vẫn chờ, không bị lượt lạ lấy mất")
  }

  /// Lượt bị huỷ không báo `state` về: bảng giữ tối đa `capacity` lượt mới nhất.
  @Test func cancelledRequestsDoNotGrowWithoutBound() {
    var n = AppleSignInNonces()
    for i in 0..<(AppleSignInNonces.capacity + 5) {
      n.register(state: "s\(i)", rawNonce: "n\(i)")
    }
    #expect(n.count == AppleSignInNonces.capacity)
    #expect(n.take(state: "s0") == nil, "lượt cũ nhất đã bị đẩy ra")
    let last = AppleSignInNonces.capacity + 4
    #expect(n.take(state: "s\(last)") == "n\(last)")
  }
}
