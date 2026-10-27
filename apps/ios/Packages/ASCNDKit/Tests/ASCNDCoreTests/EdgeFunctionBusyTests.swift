import Testing
@testable import ASCNDCore

/// AI quá tải phải được nói ra (Kiệt 24/10): 429 / 5xx / 402 đều là "bận".
struct EdgeFunctionBusyTests {
  @Test func overloadAndQuotaAreBusy() {
    #expect(EdgeFunction.classify(status: 429, message: "") == .rateLimited)
    #expect(EdgeFunction.classify(status: 429, message: #"{"error":"Rate limited"}"#) == .rateLimited)
    #expect(
      EdgeFunction.classify(status: 429, message: #"{"error":"Đã dùng hết lượt AI hôm nay. Vui lòng thử lại vào ngày mai."}"#)
        == .quotaExceeded)
    #expect(EdgeFunction.Failure.quotaExceeded.isBusy)
    #expect(EdgeFunction.classify(status: 503, message: "") == .overloaded)
    #expect(EdgeFunction.classify(status: 502, message: #"{"error":"ai_unavailable"}"#) == .overloaded)
    #expect(EdgeFunction.classify(status: 402, message: "Credits exhausted") == .overloaded)
    // Lỗi thường của hàm KHÔNG phải quá tải — không được báo "quá tải".
    #expect(EdgeFunction.classify(status: 502, message: #"{"error":"ai_incomplete"}"#) == .providerError)
    #expect(EdgeFunction.classify(status: 500, message: #"{"error":"ai_failed"}"#) == .providerError)
    #expect(!EdgeFunction.Failure.providerError.isBusy)
    #expect(EdgeFunction.Failure.rateLimited.isBusy && EdgeFunction.Failure.overloaded.isBusy)
    #expect(!EdgeFunction.Failure.offline.isBusy && !EdgeFunction.Failure.notDeployed.isBusy)
  }
}
