import ASCNDCore
import Foundation
import StoreKit

/// StoreKit 2 — lớp duy nhất của app chạm App Store.
///
/// Ranh giới: lớp này chỉ bán và giao dịch. Nó không quyết định quyền lợi —
/// mọi giao dịch đã kiểm đều phải qua `PurchaseCoordinator` (server xác minh)
/// rồi mới được `finish`. Giao dịch StoreKit không kiểm được chữ ký thì không
/// bao giờ rời khỏi đây dưới dạng "đã xác minh".
///
/// Actor vì `Transaction` đang chờ finish được giữ trong một từ điển, và cả
/// luồng mua lẫn luồng nghe nền đều chạm tới nó.
actor StoreKitClient: PurchaseStoreClient {
  private enum ClientError: Error {
    /// StoreKit không trả product cho ID đã hỏi (chưa tạo/duyệt trong
    /// App Store Connect, hoặc ID sai).
    case productNotFound
  }

  /// Giao dịch đã kiểm nhưng chưa finish, theo transaction ID — `finish`
  /// cần đúng đối tượng `Transaction` StoreKit đã đưa.
  private var pending: [String: Transaction] = [:]

  init() {}

  func products(for ids: [String]) async throws -> [StoreProduct] {
    let products = try await Product.products(for: ids)
    return products.map {
      StoreProduct(id: $0.id, displayName: $0.displayName, displayPrice: $0.displayPrice)
    }
  }

  func purchase(productID: String, appAccountToken: UUID) async throws -> PurchaseAttempt {
    let products = try await Product.products(for: [productID])
    guard let product = products.first else { throw ClientError.productNotFound }
    let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
    if case .success(let verification) = result {
      if case .verified(let transaction) = verification {
        pending[String(transaction.id)] = transaction
        return PurchaseAttempt(productID: productID, state: .verified(transactionID: String(transaction.id)))
      }
      return PurchaseAttempt(productID: productID, state: .unverified)
    }
    if case .userCancelled = result {
      return PurchaseAttempt(productID: productID, state: .cancelled)
    }
    // `.pending` và mọi trạng thái Apple thêm sau này: chưa có quyết định.
    // Giao dịch tới sau qua `Transaction.updates` và được xác minh như thường.
    return PurchaseAttempt(productID: productID, state: .pending)
  }

  func currentEntitlements() async -> [PurchaseAttempt] {
    // Khôi phục trên máy mới: đồng bộ từ App Store trước, rồi mới đọc.
    // Sync hỏng thì vẫn đọc dữ liệu máy đã có — không chặn khôi phục.
    try? await AppStore.sync()
    var attempts: [PurchaseAttempt] = []
    for await result in Transaction.currentEntitlements {
      guard case .verified(let transaction) = result else { continue }
      pending[String(transaction.id)] = transaction
      attempts.append(
        PurchaseAttempt(productID: transaction.productID, state: .verified(transactionID: String(transaction.id))))
    }
    return attempts
  }

  func finish(transactionID: String) async {
    guard let transaction = pending.removeValue(forKey: transactionID) else { return }
    await transaction.finish()
  }

  func observeTransactions(verify: @escaping @Sendable (PurchaseAttempt) async -> Bool) async {
    for await result in Transaction.updates {
      // Không kiểm được chữ ký thì bỏ qua, KHÔNG finish: giao dịch không
      // tin được không bao giờ được dọn khỏi hàng đợi như thể đã xử lý.
      // Nó sẽ được gửi lại, và vẫn bị bỏ qua cho tới khi kiểm được.
      guard case .verified(let transaction) = result else { continue }
      let id = String(transaction.id)
      pending[id] = transaction
      let attempt = PurchaseAttempt(productID: transaction.productID, state: .verified(transactionID: id))
      if await verify(attempt) {
        await transaction.finish()
        pending.removeValue(forKey: id)
      }
      // Xác minh hỏng: để nguyên trong hàng đợi — StoreKit gửi lại sau.
    }
  }
}
