@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Supabase
import Testing

/// Lỗi của `functions.invoke` → `EdgeFunction.Failure` (`classify` của `edge-failure.ts`).
struct EdgeMappingTests {
  @Test func httpStatusDecides() {
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 404, data: Data())) == .notDeployed)
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 401, data: Data())) == .unauthorised)
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 403, data: Data())) == .unauthorised)
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 429, data: Data())) == .rateLimited)
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 502, data: Data())) == .providerError)
    #expect(SupabaseEdgeCaller.failure(FunctionsError.httpError(code: 400, data: Data())) == .unknown)
  }

  @Test func relayAndNetwork() {
    #expect(SupabaseEdgeCaller.failure(FunctionsError.relayError) == .unknown)
    #expect(SupabaseEdgeCaller.failure(URLError(.notConnectedToInternet)) == .offline)
    #expect(SupabaseEdgeCaller.failure(CocoaError(.fileReadCorruptFile)) == .unknown)
  }
}
