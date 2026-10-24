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
    /// "Ghi hôm nay": câu kể → các mục (19/10).
    case logParse = "ai-log-parse"
    case verifyPurchase = "verify-purchase"
    case storeWebhook = "store-webhook"
    case deleteAccount = "delete-account"
    case adminArt = "admin-art"
  }

  /// `EdgeFailure`.
  public enum Failure: String, Error, Sendable, Hashable, CaseIterable {
    case notDeployed = "not-deployed"
    case providerError = "provider-error"
    /// Nhà cung cấp AI thật sự quá tải / không phục vụ (`ai_unavailable`, 503, 402) —
    /// khác lỗi thường của hàm (AI trả sai định dạng, lỗi máy chủ): chỉ ca này mới
    /// được báo "quá tải" (24/10, Kiệt: không báo tuỳ tiện gây hiểu nhầm).
    case overloaded
    case unauthorised
    case rateLimited = "rate-limited"
    /// Hết lượt AI của chính người dùng trong ngày (`quotaExceeded` của máy chủ, 429
    /// kèm câu "hết lượt") — khác máy chủ quá tải: chờ ít phút không giúp gì.
    case quotaExceeded = "quota-exceeded"
    case offline
    case unknown

    /// AI quá tải / hết lượt ở máy chủ (24/10, Kiệt: "AI quá tải mà app không hề báo
    /// gì") — mọi tính năng AI phải nói ra, không im lặng.
    public var isBusy: Bool { self == .overloaded || self == .rateLimited || self == .quotaExceeded }
  }

  /// `classify`: theo mã HTTP nếu có, không thì theo câu lỗi mạng.
  public static func classify(status: Int?, message: String) -> Failure {
    if status == 404 { return .notDeployed }
    if status == 401 || status == 403 { return .unauthorised }
    if status == 429 {
      let m = message.lowercased()
      return m.contains("hết lượt") || m.contains("quota") ? .quotaExceeded : .rateLimited
    }
    // Nhà cung cấp AI hết hạn mức ("Credits exhausted") / quá tải.
    if status == 402 || status == 503 || status == 529 { return .overloaded }
    if let status, status >= 500 {
      return message.contains("ai_unavailable") ? .overloaded : .providerError
    }
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
