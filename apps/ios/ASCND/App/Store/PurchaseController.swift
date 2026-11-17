import ASCNDCore
import Foundation
import Observation

/// Trạng thái màn paywall — lớp mỏng trên `PurchaseCoordinator`: giữ trạng
/// thái cho UI, mọi quyết định mua/xác minh nằm trong coordinator (test được
/// trên Linux).
@MainActor
@Observable
final class PurchaseController {
  /// Trạng thái tải product. Gói hiện tại nằm riêng ở `tier` để hàng Cài đặt
  /// vẫn hiện được gói ngay cả khi cửa hàng chưa mở bán.
  enum State: Equatable {
    case loading
    case unconfigured
    case ready(products: [StoreProduct])
    case failed(PurchaseFailure)
  }

  /// Thông báo sau một lần mua/khôi phục — view dịch ra câu chữ.
  enum Notice: Equatable {
    case purchased
    case restored
    case pending
    case failed(PurchaseFailure)
  }

  private let coordinator: PurchaseCoordinator
  private let config: StoreProductConfig
  private let userId: String?

  private(set) var state: State = .loading
  private(set) var tier: PurchaseTier = .free
  private(set) var purchasingID: String?
  private(set) var restoring = false
  private(set) var notice: Notice?

  init(coordinator: PurchaseCoordinator, config: StoreProductConfig, userId: String?) {
    self.coordinator = coordinator
    self.config = config
    self.userId = userId
  }

  /// Gói của một product — cùng ánh xạ config/server. `nil` thì product ấy
  /// không được bán (load đã loại, đây là phòng thủ).
  func tier(for product: StoreProduct) -> PurchaseTier? { config.tier(for: product.id) }

  func load() async {
    state = .loading
    notice = nil
    tier = await coordinator.currentTier()
    switch await coordinator.loadProducts() {
    case .success(let products): state = .ready(products: products)
    case .failure(.notConfigured): state = .unconfigured
    case .failure(let failure): state = .failed(failure)
    }
  }

  func buy(_ product: StoreProduct) async {
    guard purchasingID == nil, !restoring else { return }
    purchasingID = product.id
    notice = nil
    defer { purchasingID = nil }
    switch await coordinator.purchase(product: product, userId: userId) {
    case .verified(let newTier):
      tier = newTier
      notice = .purchased
    case .cancelled:
      break
    case .pending:
      notice = .pending
    case .failed(let failure):
      notice = .failed(failure)
    }
  }

  func restore() async {
    guard !restoring, purchasingID == nil else { return }
    restoring = true
    notice = nil
    defer { restoring = false }
    switch await coordinator.restore(userId: userId) {
    case .verified(let newTier):
      tier = newTier
      notice = .restored
    case .cancelled, .pending:
      break
    case .failed(let failure):
      notice = .failed(failure)
    }
  }
}

/// `PurchaseVerifier` qua edge function `verify-purchase` — cùng đường gọi
/// của AI (`EdgeCaller`), cùng phân loại lỗi. Thân trả về không đọc được
/// `tier` thì coi như xác minh hỏng, không bao giờ coi như đạt.
struct EdgePurchaseVerifier: PurchaseVerifier {
  let edge: any EdgeCaller

  func verify(transactionID: String) async throws(PurchaseFailure) -> PurchaseVerification {
    let value: JSONValue?
    do {
      value = try await edge.call(.verifyPurchase, body: ["transactionId": .string(transactionID)])
    } catch {
      throw .verificationFailed(error)
    }
    guard let verification = PurchaseVerification.parse(value) else {
      throw .verificationFailed(.unknown)
    }
    return verification
  }
}

/// `PurchaseTierSource` từ một closure — `AppServices` nối vào `SupabaseTier`
/// (chỉ `AppServices` được import `ASCNDBackend`).
struct ClosurePurchaseTierSource: PurchaseTierSource {
  let read: @Sendable () async -> PurchaseTier

  func currentTier() async -> PurchaseTier { await read() }
}
