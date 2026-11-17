import ASCNDCore
import Foundation
import Testing

/// Mua hàng — logic thuần trên giao thức giả, không chạm App Store thật.
/// Thứ tự bắt buộc được khoá ở đây: server xác minh xong mới finish.
struct PurchaseTests {
  // MARK: - Fakes

  /// Ghi lại các lần gọi từ client/verifier giả — struct fake không tự sửa
  /// được mình (giao thức không yêu cầu `mutating`), nên sổ ghi là class.
  private final class CallLog: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var values: [String] = []
    func add(_ v: String) { lock.lock(); defer { lock.unlock() }; values.append(v) }
  }

  private struct FakeStoreClient: PurchaseStoreClient {
    var products: [StoreProduct] = []
    var productsThrow = false
    var purchaseAttempt = PurchaseAttempt(productID: "p", state: .cancelled)
    var purchaseThrow = false
    var entitlements: [PurchaseAttempt] = []
    var finished = CallLog()

    func products(for ids: [String]) async throws -> [StoreProduct] {
      if productsThrow { throw FakeError.store }
      return products
    }

    func purchase(productID: String, appAccountToken: UUID) async throws -> PurchaseAttempt {
      if purchaseThrow { throw FakeError.store }
      return purchaseAttempt
    }

    func currentEntitlements() async -> [PurchaseAttempt] { entitlements }

    func finish(transactionID: String) async { finished.add(transactionID) }

    func observeTransactions(verify: @escaping @Sendable (PurchaseAttempt) async -> Bool) async {}
  }

  private struct FakeVerifier: PurchaseVerifier {
    var result: Result<PurchaseVerification, PurchaseFailure> = .success(PurchaseVerification(tier: .plus))
    var verified = CallLog()

    func verify(transactionID: String) async throws(PurchaseFailure) -> PurchaseVerification {
      verified.add(transactionID)
      return try result.get()
    }
  }

  private struct FakeTierSource: PurchaseTierSource {
    var tier: PurchaseTier = .free
    func currentTier() async -> PurchaseTier { tier }
  }

  private enum FakeError: Error { case store }

  private static let userId = "123e4567-e89b-12d3-a456-426614174000"
  private static let plus = StoreProduct(id: "ascnd.plus", displayName: "Plus", displayPrice: "99.000đ")
  private static let max = StoreProduct(id: "ascnd.max", displayName: "Max", displayPrice: "199.000đ")

  private func coordinator(
    config: StoreProductConfig = StoreProductConfig(plus: "ascnd.plus", max: "ascnd.max"),
    client: FakeStoreClient = FakeStoreClient(),
    verifier: any PurchaseVerifier = FakeVerifier(),
    tierSource: FakeTierSource = FakeTierSource()
  ) -> PurchaseCoordinator {
    PurchaseCoordinator(config: config, client: client, verifier: verifier, tierSource: tierSource)
  }

  // MARK: - Config & tier

  @Test func emptyConfigIsNotConfigured() {
    #expect(!StoreProductConfig(plus: nil, max: nil).isConfigured)
    #expect(!StoreProductConfig(plus: "", max: "   ").isConfigured)
    #expect(StoreProductConfig(plus: "ascnd.plus", max: nil).isConfigured)
    #expect(StoreProductConfig(plus: nil, max: "ascnd.max").productIDs == ["ascnd.max"])
  }

  @Test func configTrimsIDs() {
    let config = StoreProductConfig(plus: "  ascnd.plus\n", max: nil)
    #expect(config.plusProductID == "ascnd.plus")
  }

  @Test func configReadsInfoDictionary() {
    let config = StoreProductConfig(infoDictionary: [
      "ASCNDProductIDPlus": "ascnd.plus",
      "ASCNDProductIDMax": "",
    ])
    #expect(config.plusProductID == "ascnd.plus")
    #expect(config.maxProductID == nil)
    #expect(StoreProductConfig(infoDictionary: [:]).isConfigured == false)
  }

  @Test func tierMappingMatchesServer() {
    let config = StoreProductConfig(plus: "ascnd.plus", max: "ascnd.max")
    #expect(config.tier(for: "ascnd.plus") == .plus)
    #expect(config.tier(for: "ascnd.max") == .max)
    #expect(config.tier(for: "ascnd.other") == nil)
  }

  @Test func tierParsingIsCaseInsensitiveAndStrict() {
    #expect(PurchaseTier(serverValue: "plus") == .plus)
    #expect(PurchaseTier(serverValue: "MAX") == .max)
    #expect(PurchaseTier(serverValue: "free") == .free)
    #expect(PurchaseTier(serverValue: "premium") == nil)
    #expect(PurchaseTier(serverValue: "") == nil)
    #expect(PurchaseTier.plus.isPaid)
    #expect(!PurchaseTier.free.isPaid)
  }

  // MARK: - Verification parsing

  @Test func verificationParsesTierOnly() {
    let body: JSONValue = .object(["tier": .string("max"), "expires_at": .string("2027-01-01T00:00:00Z")])
    #expect(PurchaseVerification.parse(body)?.tier == .max)
    #expect(PurchaseVerification.parse(.object(["tier": .string("plus")]))?.tier == .plus)
  }

  @Test func verificationRejectsMissingOrUnknownTier() {
    #expect(PurchaseVerification.parse(nil) == nil)
    #expect(PurchaseVerification.parse(.object([:])) == nil)
    #expect(PurchaseVerification.parse(.object(["tier": .string("gold")])) == nil)
    #expect(PurchaseVerification.parse(.object(["tier": .number(1)])) == nil)
  }

  @Test func transactionIDValidationMatchesServerLimit() {
    #expect(!PurchaseCoordinator.isValidTransactionID(""))
    #expect(PurchaseCoordinator.isValidTransactionID("123"))
    #expect(PurchaseCoordinator.isValidTransactionID(String(repeating: "1", count: 64)))
    #expect(!PurchaseCoordinator.isValidTransactionID(String(repeating: "1", count: 65)))
  }

  @Test func appAccountTokenRequiresUUID() {
    #expect(PurchaseCoordinator.appAccountToken(userId: Self.userId) != nil)
    #expect(PurchaseCoordinator.appAccountToken(userId: Self.userId.uppercased()) != nil)
    #expect(PurchaseCoordinator.appAccountToken(userId: "not-a-uuid") == nil)
    #expect(PurchaseCoordinator.appAccountToken(userId: "") == nil)
  }

  // MARK: - Loading products

  @Test func loadProductsRefusesUnconfiguredStore() async {
    let result = await coordinator(config: StoreProductConfig(plus: nil, max: nil)).loadProducts()
    #expect(result == .failure(.notConfigured))
  }

  @Test func loadProductsFiltersUnknownIDs() async {
    let stranger = StoreProduct(id: "ascnd.other", displayName: "Other", displayPrice: "1đ")
    var client = FakeStoreClient()
    client.products = [Self.plus, stranger]
    let result = await coordinator(client: client).loadProducts()
    #expect(result == .success([Self.plus]))
  }

  @Test func loadProductsReportsEmptyAndErrors() async {
    #expect(await coordinator().loadProducts() == .failure(.noProducts))
    var client = FakeStoreClient()
    client.productsThrow = true
    #expect(await coordinator(client: client).loadProducts() == .failure(.storeUnavailable))
  }

  // MARK: - Purchase

  @Test func purchaseRequiresSignedInUUIDAccount() async {
    #expect(await coordinator().purchase(product: Self.plus, userId: nil) == .failed(.notSignedIn))
    #expect(await coordinator().purchase(product: Self.plus, userId: "abc") == .failed(.invalidAccount))
  }

  @Test func purchaseCancelledPendingUnverified() async {
    for (state, expected) in [
      (PurchaseAttempt.State.cancelled, PurchaseOutcome.cancelled),
      (.pending, .pending),
      (.unverified, .failed(.unverified)),
    ] {
      var client = FakeStoreClient()
      client.purchaseAttempt = PurchaseAttempt(productID: Self.plus.id, state: state)
      #expect(await coordinator(client: client).purchase(product: Self.plus, userId: Self.userId) == expected)
    }
  }

  @Test func purchaseVerifiesThenFinishesThenReadsTier() async {
    var client = FakeStoreClient()
    client.purchaseAttempt = PurchaseAttempt(productID: Self.plus.id, state: .verified(transactionID: "tx-1"))
    let verifier = FakeVerifier()
    let outcome = await coordinator(
      client: client, verifier: verifier, tierSource: FakeTierSource(tier: .plus)
    ).purchase(product: Self.plus, userId: Self.userId)
    #expect(outcome == .verified(tier: .plus))
    #expect(verifier.verified.values == ["tx-1"])
    #expect(client.finished.values == ["tx-1"])
  }

  @Test func purchaseDoesNotFinishWhenServerVerificationFails() async {
    var client = FakeStoreClient()
    client.purchaseAttempt = PurchaseAttempt(productID: Self.plus.id, state: .verified(transactionID: "tx-1"))
    let verifier = FakeVerifier(result: .failure(.verificationFailed(.offline)))
    let outcome = await coordinator(client: client, verifier: verifier)
      .purchase(product: Self.plus, userId: Self.userId)
    #expect(outcome == .failed(.verificationFailed(.offline)))
    // Mấu chốt: chưa finish thì StoreKit gửi lại giao dịch sau — quyền lợi
    // không mất chỉ vì mạng rớt giữa chừng.
    #expect(client.finished.values.isEmpty)
  }

  @Test func purchaseStoreError() async {
    var client = FakeStoreClient()
    client.purchaseThrow = true
    #expect(await coordinator(client: client).purchase(product: Self.plus, userId: Self.userId) == .failed(.storeUnavailable))
  }

  // MARK: - Restore

  @Test func restoreWithNoEntitlements() async {
    #expect(await coordinator().restore(userId: Self.userId) == .failed(.nothingToRestore))
    #expect(await coordinator().restore(userId: nil) == .failed(.notSignedIn))
  }

  @Test func restoreVerifiesAndFinishes() async {
    var client = FakeStoreClient()
    client.entitlements = [PurchaseAttempt(productID: Self.max.id, state: .verified(transactionID: "tx-9"))]
    let outcome = await coordinator(client: client, tierSource: FakeTierSource(tier: .max))
      .restore(userId: Self.userId)
    #expect(outcome == .verified(tier: .max))
    #expect(client.finished.values == ["tx-9"])
  }

  @Test func restoreTriesNextTransactionWhenOneIsRefused() async {
    var client = FakeStoreClient()
    client.entitlements = [
      PurchaseAttempt(productID: Self.plus.id, state: .verified(transactionID: "tx-old")),
      PurchaseAttempt(productID: Self.max.id, state: .verified(transactionID: "tx-new")),
    ]
    // Giao dịch đầu server từ chối (của tài khoản khác), giao dịch sau đạt.
    struct RefuseFirst: PurchaseVerifier {
      let log = CallLog()
      func verify(transactionID: String) async throws(PurchaseFailure) -> PurchaseVerification {
        log.add(transactionID)
        if transactionID == "tx-old" { throw .verificationFailed(.unauthorised) }
        return PurchaseVerification(tier: .max)
      }
    }
    let verifier = RefuseFirst()
    let outcome = await coordinator(client: client, verifier: verifier, tierSource: FakeTierSource(tier: .max))
      .restore(userId: Self.userId)
    #expect(outcome == .verified(tier: .max))
    #expect(verifier.log.values == ["tx-old", "tx-new"])
    #expect(client.finished.values == ["tx-new"])
  }

  // MARK: - Background updates

  @Test func verifyUpdateOnlyFinishesVerifiedServerAccepted() async {
    let attempt = PurchaseAttempt(productID: Self.plus.id, state: .verified(transactionID: "tx-2"))
    #expect(await coordinator().verifyUpdate(attempt, userId: Self.userId))
    #expect(await coordinator().verifyUpdate(attempt, userId: nil) == false)
    #expect(await coordinator().verifyUpdate(attempt, userId: "nope") == false)
    let pending = PurchaseAttempt(productID: Self.plus.id, state: .pending)
    #expect(await coordinator().verifyUpdate(pending, userId: Self.userId) == false)
    let failing = FakeVerifier(result: .failure(.verificationFailed(.providerError)))
    #expect(await coordinator(verifier: failing).verifyUpdate(attempt, userId: Self.userId) == false)
  }
}
