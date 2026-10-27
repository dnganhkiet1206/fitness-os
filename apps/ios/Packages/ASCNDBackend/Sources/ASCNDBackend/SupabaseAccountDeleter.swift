public import ASCNDCore
import Foundation
import Supabase

/// Gọi `delete-account` bằng token của phiên (danh tính lấy từ token, không từ
/// thân yêu cầu). Đọc cả thân lỗi để giữ cờ `partial`.
public struct SupabaseAccountDeleter: AccountDeleter {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func deleteAccount() async -> AccountDeletion {
    guard let session = try? await client.auth.session else { return .notSignedIn }
    do {
      try await client.functions.invoke(
        EdgeFunction.Name.deleteAccount.rawValue,
        options: FunctionInvokeOptions(headers: ["Authorization": "Bearer \(session.accessToken)"], body: [String: String]()))
      return .deleted
    } catch let FunctionsError.httpError(code, data) {
      return AccountDeletion.outcome(status: code, body: data)
    } catch {
      return AccountDeletion.outcome(transport: error)
    }
  }
}
