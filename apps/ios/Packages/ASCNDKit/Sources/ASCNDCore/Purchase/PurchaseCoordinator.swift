public import Foundation

/// Điều phối mua hàng: StoreKit chỉ bán, server mới quyết định quyền lợi.
///
/// Luồng bắt buộc cho mọi giao dịch, không ngoại lệ:
///
/// 1. Mua qua StoreKit với `appAccountToken` là user id.
/// 2. Gửi transaction ID lên `verify-purchase` — server hỏi lại Apple và so
///    token với người gọi, rồi mới ghi `entitlements`.
/// 3. `finish` giao dịch CHỈ sau khi server trả lời thành công.
/// 4. Đọc lại gói qua `current_tier()` — đó mới là gói app được hiện.
///
/// Không bước nào được bỏ: finish trước khi server ghi thì mất quyền lợi khi
/// mạng rớt giữa chừng; tin giao dịch trên máy mà không qua server thì ai
/// cũng tự cấp gói được.
///
/// Logic thuần trên giao thức — test được trên Linux bằng client/verifier giả,
/// không chạm App Store thật.
public struct PurchaseCoordinator: Sendable {
  private let config: StoreProductConfig
  private let client: any PurchaseStoreClient
  private let verifier: any PurchaseVerifier
  private let tierSource: any PurchaseTierSource

  public init(
    config: StoreProductConfig,
    client: any PurchaseStoreClient,
    verifier: any PurchaseVerifier,
    tierSource: any PurchaseTierSource
  ) {
    self.config = config
    self.client = client
    self.verifier = verifier
    self.tierSource = tierSource
  }

  /// Transaction ID server chấp nhận: không rỗng, tối đa 64 ký tự
  /// (`verify-purchase` từ chối dài hơn).
  public static func isValidTransactionID(_ id: String) -> Bool { !id.isEmpty && id.count <= 64 }

  /// Token gắn vào giao dịch lúc mua — phải là đúng user id dạng UUID, vì
  /// server so token này với người gọi (không phân biệt hoa/thường) và
  /// webhook cũng yêu cầu token là UUID mới tìm được hàng `entitlements`.
  public static func appAccountToken(userId: String) -> UUID? { UUID(uuidString: userId) }

  public func currentTier() async -> PurchaseTier { await tierSource.currentTier() }

  /// Product đang bán được: chỉ những ID nằm trong config. StoreKit trả về
  /// ID lạ (config lệch với App Store Connect) thì loại — không bán thứ
  /// server không biết ánh xạ tới gói nào.
  public func loadProducts() async -> Result<[StoreProduct], PurchaseFailure> {
    guard config.isConfigured else { return .failure(.notConfigured) }
    do {
      let products = try await client.products(for: config.productIDs)
      let known = products.filter { config.tier(for: $0.id) != nil }
      return known.isEmpty ? .failure(.noProducts) : .success(known)
    } catch is CancellationError {
      return .failure(.storeUnavailable)
    } catch {
      return .failure(.storeUnavailable)
    }
  }

  /// Mua một product: StoreKit → server xác minh → finish → đọc lại gói.
  /// Huỷ và chờ duyệt trả về ngay, không chạm server.
  public func purchase(product: StoreProduct, userId: String?) async -> PurchaseOutcome {
    guard let token = Self.token(for: userId) else {
      return .failed(userId == nil ? .notSignedIn : .invalidAccount)
    }
    let attempt: PurchaseAttempt
    do {
      attempt = try await client.purchase(productID: product.id, appAccountToken: token)
    } catch is CancellationError {
      return .cancelled
    } catch {
      return .failed(.storeUnavailable)
    }
    switch attempt.state {
    case .cancelled: return .cancelled
    case .pending: return .pending
    case .unverified: return .failed(.unverified)
    case .verified(let transactionID): return await verifyAndRefresh(transactionID: transactionID)
    }
  }

  /// Khôi phục trên máy mới: đọc quyền lợi đang có, xác minh từng giao dịch
  /// với server (server tự giải quyết tới trạng thái hiện tại của gói, nên
  /// giao dịch cũ cũng cho đáp án đúng), rồi đọc lại gói. Giao dịch nào
  /// server từ chối thì thử giao dịch sau — chỉ hỏng hết mới báo lỗi.
  public func restore(userId: String?) async -> PurchaseOutcome {
    guard Self.token(for: userId) != nil else {
      return .failed(userId == nil ? .notSignedIn : .invalidAccount)
    }
    let ids = await client.currentEntitlements().compactMap { attempt -> String? in
      if case .verified(let id) = attempt.state { return id }
      return nil
    }
    guard !ids.isEmpty else { return .failed(.nothingToRestore) }
    var lastFailure: PurchaseFailure?
    for id in ids {
      let outcome = await verifyAndRefresh(transactionID: id)
      if case .failed(let failure) = outcome {
        lastFailure = failure
      } else {
        return outcome
      }
    }
    return .failed(lastFailure ?? .nothingToRestore)
  }

  /// Giao dịch StoreKit đẩy về trong nền: xác minh với server, trả `true` thì
  /// client mới được finish. `false` — chưa đăng nhập, token lạ, server hỏng —
  /// thì giao dịch ở lại hàng đợi để StoreKit gửi lại lần sau.
  public func verifyUpdate(_ attempt: PurchaseAttempt, userId: String?) async -> Bool {
    guard Self.token(for: userId) != nil,
      case .verified(let id) = attempt.state,
      Self.isValidTransactionID(id)
    else { return false }
    do {
      _ = try await verifier.verify(transactionID: id)
      return true
    } catch {
      return false
    }
  }

  private static func token(for userId: String?) -> UUID? {
    guard let userId, !userId.isEmpty else { return nil }
    return appAccountToken(userId: userId)
  }

  /// Xác minh + finish + đọc lại gói. Finish chỉ sau khi server trả lời
  /// thành công — thứ tự này là toàn bộ điểm mấu chốt của luồng.
  private func verifyAndRefresh(transactionID: String) async -> PurchaseOutcome {
    guard Self.isValidTransactionID(transactionID) else { return .failed(.unverified) }
    do {
      _ = try await verifier.verify(transactionID: transactionID)
      await client.finish(transactionID: transactionID)
      return .verified(tier: await tierSource.currentTier())
    } catch let failure {
      return .failed(failure)
    }
  }
}
