public import Foundation

/// Một sản phẩm App Store đã đọc được. Tên và giá đều do StoreKit trả về —
/// app không bao giờ hardcode giá, tên gói hay chu kỳ: những thứ ấy Kiệt đặt
/// trong App Store Connect, và StoreKit dịch theo ngôn ngữ của máy.
public struct StoreProduct: Sendable, Hashable {
  public let id: String
  public let displayName: String
  /// Giá đã định dạng theo ngôn ngữ/tiền tệ của máy (`Product.displayPrice`).
  public let displayPrice: String

  public init(id: String, displayName: String, displayPrice: String) {
    self.id = id
    self.displayName = displayName
    self.displayPrice = displayPrice
  }
}

/// Kết quả một lần chạm tới App Store — mua, khôi phục, hay một giao dịch
/// StoreKit đẩy về trong nền. Chỉ `verified` mới được gửi lên server; các
/// trạng thái còn lại không bao giờ tạo ra quyền lợi.
public struct PurchaseAttempt: Sendable, Hashable {
  public enum State: Sendable, Hashable {
    /// StoreKit đã kiểm chữ ký JWS: giao dịch thật.
    case verified(transactionID: String)
    /// Đang chờ duyệt (ví dụ Ask to Buy): chưa có gì để xác minh. StoreKit sẽ
    /// đẩy lại qua `Transaction.updates` khi có quyết định.
    case pending
    /// Người dùng huỷ trong sheet của Apple.
    case cancelled
    /// StoreKit không kiểm được chữ ký: không tin được, không gửi lên server.
    case unverified
  }

  public let productID: String
  public let state: State

  public init(productID: String, state: State) {
    self.productID = productID
    self.state = state
  }
}

/// Lối vào App Store. Core chỉ biết giao thức; bản thật dùng StoreKit 2 ở
/// target app (`StoreKitClient`) — ASCNDCore build được trên Linux nên không
/// thể import StoreKit.
public protocol PurchaseStoreClient: Sendable {
  /// Đọc product theo ID. Ném lỗi khi App Store không trả lời.
  func products(for ids: [String]) async throws -> [StoreProduct]
  /// Mua một product, gắn `appAccountToken` là user id của người mua — server
  /// chỉ công nhận giao dịch mang đúng token của người gọi (`verify-purchase`).
  /// Ném lỗi khi App Store không trả lời; huỷ/chờ/không kiểm được nằm trong
  /// `PurchaseAttempt` trả về.
  func purchase(productID: String, appAccountToken: UUID) async throws -> PurchaseAttempt
  /// Quyền lợi đang có trên máy này (khôi phục): chỉ giao dịch StoreKit kiểm
  /// được mới được trả về.
  func currentEntitlements() async -> [PurchaseAttempt]
  /// Đánh dấu một giao dịch đã xử lý xong — CHỈ gọi sau khi server đã xác
  /// minh và ghi entitlement. Gọi sớm thì giao dịch biến khỏi hàng đợi mà
  /// quyền lợi chưa được ghi.
  func finish(transactionID: String) async
  /// Nghe giao dịch StoreKit đẩy về trong nền (gia hạn, chờ duyệt xong, hoàn
  /// tiền). Chạy tới khi task bị huỷ. `verify` trả `true` thì client mới
  /// finish — xác minh hỏng thì giao dịch ở lại hàng đợi để StoreKit gửi lại.
  func observeTransactions(verify: @escaping @Sendable (PurchaseAttempt) async -> Bool) async
}

/// Server trả lời cho `verify-purchase`: `{ "tier": "plus", "expires_at": … }`.
/// Chỉ `tier` được đọc — ngày hết hạn là việc của server (`current_tier()`).
public struct PurchaseVerification: Sendable, Hashable {
  public let tier: PurchaseTier

  public init(tier: PurchaseTier) {
    self.tier = tier
  }

  /// Thân trả về không có `tier` đọc được → `nil`: không được coi như đã
  /// xác minh. `expires_at` có hay không không ảnh hưởng.
  public static func parse(_ value: JSONValue?) -> PurchaseVerification? {
    guard let tierString = value?["tier"]?.stringValue, let tier = PurchaseTier(serverValue: tierString) else {
      return nil
    }
    return PurchaseVerification(tier: tier)
  }
}

/// Gửi transaction ID lên `verify-purchase` — bản thật ở `AppServices` qua
/// `EdgeCaller`, cùng đường gọi edge function của AI.
public protocol PurchaseVerifier: Sendable {
  func verify(transactionID: String) async throws(PurchaseFailure) -> PurchaseVerification
}

/// Đọc gói hiện tại của tài khoản qua RPC `current_tier()` — bản thật ở
/// `AppServices` qua `SupabaseTier`. Lỗi đọc → `.free`: không đọc được thì
/// không cho quyền lợi.
public protocol PurchaseTierSource: Sendable {
  func currentTier() async -> PurchaseTier
}

/// Vì sao một lần mua/khôi phục không xong — gọi đúng tên để UI báo đúng câu,
/// không báo tuỳ tiện (cùng luật với lỗi AI: không nói "quá tải" khi không
/// phải quá tải).
public enum PurchaseFailure: Sendable, Hashable, Error {
  /// Chưa có product ID nào trong config — cửa hàng chưa mở bán.
  case notConfigured
  /// StoreKit không trả product nào cho ID đã cấu hình (chưa tạo trong
  /// App Store Connect, hoặc chưa duyệt).
  case noProducts
  /// Chưa đăng nhập — không có user id để gắn vào giao dịch.
  case notSignedIn
  /// User id không phải UUID nên không gắn được `appAccountToken` — server
  /// cũng sẽ từ chối giao dịch không mang token này.
  case invalidAccount
  /// App Store không trả lời (mất mạng, StoreKit lỗi).
  case storeUnavailable
  /// StoreKit không kiểm được chữ ký giao dịch.
  case unverified
  /// Server xác minh hỏng — giữ nguyên lỗi edge để UI phân biệt "chưa triển
  /// khai" (404) với "mất mạng" và "lỗi server".
  case verificationFailed(EdgeFunction.Failure)
  /// Khôi phục mà máy không có quyền lợi nào.
  case nothingToRestore
}

/// Kết quả một lần mua hay khôi phục, sau khi đã qua server (trừ huỷ/chờ).
public enum PurchaseOutcome: Sendable, Hashable {
  /// Server đã ghi entitlement; gói là gói `current_tier()` vừa đọc lại.
  case verified(tier: PurchaseTier)
  case cancelled
  /// Đang chờ Apple duyệt — chưa có gì được ghi; khi duyệt xong, giao dịch
  /// tới qua `Transaction.updates` và được xác minh như thường.
  case pending
  case failed(PurchaseFailure)
}
