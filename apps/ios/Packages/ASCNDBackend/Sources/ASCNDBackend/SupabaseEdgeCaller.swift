public import ASCNDCore
import Foundation
import Supabase

/// Gọi edge function qua supabase-swift (`callEdge` của `lib/edge.ts`).
///
/// Như RN: chưa có phiên (hoặc không làm mới được) thì không gọi — `unauthorised`;
/// gắn đúng token của phiên vào `Authorization`; lỗi HTTP phân theo mã
/// (`EdgeFunction.classify`), lỗi relay của Supabase là lỗi không rõ, mất mạng là
/// `offline`. Thân trả về đọc thành `JSONValue`; rỗng / `null` → `nil`.
public struct SupabaseEdgeCaller: EdgeCaller {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue? {
    guard let session = try? await client.auth.session else { throw .unauthorised }
    do {
      let value: JSONValue? = try await client.functions.invoke(
        fn.rawValue,
        options: FunctionInvokeOptions(
          headers: ["Authorization": "Bearer \(session.accessToken)"], body: JSONValue.object(body))
      ) { data, _ in
        if data.isEmpty { return nil }
        let v = try JSONDecoder().decode(JSONValue.self, from: data)
        return v == .null ? nil : v
      }
      return value
    } catch {
      throw Self.failure(error)
    }
  }

  static func failure(_ error: any Error) -> EdgeFunction.Failure {
    if NetworkFailure.isOffline(error) { return .offline }
    if let e = error as? FunctionsError {
      switch e {
      case .httpError(let code, _): return EdgeFunction.classify(status: code, message: "")
      case .relayError: return .unknown
      }
    }
    return EdgeFunction.classify(status: nil, message: String(describing: error))
  }
}
