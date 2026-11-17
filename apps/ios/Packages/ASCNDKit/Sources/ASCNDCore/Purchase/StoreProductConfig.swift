import Foundation

/// Product ID của App Store Connect — đọc từ Info.plist, điền qua
/// `Config/Backend.xcconfig`, cùng mẫu với `BackendConfig` (URL/key Supabase).
///
/// Không có ID thật nào trong code, và không bịa ID: product ID chỉ tồn tại
/// khi Kiệt tạo trong App Store Connect rồi điền vào xcconfig. Chưa cấu hình
/// thì cửa hàng coi như chưa mở bán — UI hiện trạng thái đó, không hiện
/// product giả, không có nút mua nào chạy được.
public struct StoreProductConfig: Sendable, Hashable {
  public static let plusInfoKey = "ASCNDProductIDPlus"
  public static let maxInfoKey = "ASCNDProductIDMax"

  public let plusProductID: String?
  public let maxProductID: String?

  public init(plus: String?, max: String?) {
    self.plusProductID = Self.cleaned(plus)
    self.maxProductID = Self.cleaned(max)
  }

  /// Đọc từ Info.plist của app (đã được xcconfig điền).
  public init(infoDictionary: [String: Any]) {
    self.init(
      plus: infoDictionary[Self.plusInfoKey] as? String,
      max: infoDictionary[Self.maxInfoKey] as? String)
  }

  /// Ít nhất một ID đã cấu hình. Chưa có ID nào → chưa mở bán.
  public var isConfigured: Bool { plusProductID != nil || maxProductID != nil }

  /// Mọi ID đã cấu hình — danh sách duy nhất gửi cho StoreKit.
  public var productIDs: [String] { [plusProductID, maxProductID].compactMap { $0 } }

  /// Gói mà một product ID thuộc về — cùng ánh xạ với `tierFor` của server
  /// (`supabase/functions/_shared/apple.ts`, env `PRODUCT_ID_PLUS` /
  /// `PRODUCT_ID_MAX`). ID lạ → `nil`: StoreKit có thể trả về product không
  /// nằm trong config khi hai phía lệch nhau, và product ấy không được bán.
  public func tier(for productID: String) -> PurchaseTier? {
    if let maxProductID, productID == maxProductID { return .max }
    if let plusProductID, productID == plusProductID { return .plus }
    return nil
  }

  private static func cleaned(_ raw: String?) -> String? {
    guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    return trimmed
  }
}
