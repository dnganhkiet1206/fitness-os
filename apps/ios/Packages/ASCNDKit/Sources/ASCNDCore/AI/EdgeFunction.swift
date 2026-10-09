public import Foundation

/// Gọi edge function của Supabase (#527) — `lib/edge.ts` + `lib/edge-failure.ts`
/// + `EDGE_FUNCTIONS` của `lib/backend.ts` @ fac9ac2.
///
/// Như RN: chưa có phiên thì không gọi (`unauthorised`); lỗi phân theo thứ
/// người đọc làm được gì với nó — 404 chưa triển khai, 401/403 đăng nhập lại,
/// 429 (hết lượt của mình hay nhà cung cấp từ chối) quay lại sau, 5xx dịch vụ
/// AI lỗi, mất mạng, còn lại không rõ. Core chỉ biết giao thức; lớp Supabase ở
/// `ASCNDBackend` (`SupabaseEdgeCaller`).
public enum EdgeFunction {
  /// Mọi edge function app gọi (`EDGE_FUNCTIONS`) — cũng là danh sách triển khai.
  public enum Name: String, Sendable, Hashable, CaseIterable {
    case mealSuggest = "ai-meal-suggest"
    case scanFood = "scan-food"
    case weeklyReview = "ai-weekly-review"
    case smartNudges = "ai-smart-nudges"
    case coach = "ai-coach"
    case coachMemory = "ai-coach-memory"
    case verifyPurchase = "verify-purchase"
    case storeWebhook = "store-webhook"
    case deleteAccount = "delete-account"
    case adminArt = "admin-art"
  }

  /// `EdgeFailure`.
  public enum Failure: String, Error, Sendable, Hashable, CaseIterable {
    case notDeployed = "not-deployed"
    case providerError = "provider-error"
    case unauthorised
    case rateLimited = "rate-limited"
    case offline
    case unknown
  }

  /// `classify`: theo mã HTTP nếu có, không thì theo câu lỗi mạng.
  public static func classify(status: Int?, message: String) -> Failure {
    if status == 404 { return .notDeployed }
    if status == 401 || status == 403 { return .unauthorised }
    if status == 429 { return .rateLimited }
    if let status, status >= 500 { return .providerError }
    // `/failed to (send|fetch)|network|fetch failed/i`
    let m = message.lowercased()
    if m.contains("failed to send") || m.contains("failed to fetch") || m.contains("network") || m.contains("fetch failed") {
      return .offline
    }
    return .unknown
  }
}

/// Một lần gọi edge function: thân JSON vào, JSON ra. `nil` khi hàm trả rỗng.
public protocol EdgeCaller: Sendable {
  func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue?
}
