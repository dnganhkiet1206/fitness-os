public import ASCNDCore
import Foundation
import Supabase

/// Xoá một lần đo (`useDeleteBiometricSample`): `delete().eq('id').eq('user_id')`
/// rồi `confirmWrite` — trả số hàng đã xoá để bên gọi phân biệt "đã xoá" với
/// "không có gì để xoá" (RLS cũng chỉ cho xoá hàng của mình).
public struct SupabaseBiometricsRemover: BiometricsRemover {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func deleteSample(id: String, userId: String) async throws(RowStoreError) -> Int {
    do {
      let gone: [JSONValue] = try await client.from("biometric_samples")
        .delete()
        .eq("id", value: id)
        .eq("user_id", value: userId)
        .select("id")
        .execute().value
      return gone.count
    } catch {
      throw SupabaseRowStore.wrap(error)
    }
  }
}
