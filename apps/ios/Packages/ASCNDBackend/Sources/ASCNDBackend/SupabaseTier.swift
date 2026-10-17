import Foundation
import Supabase

/// Gói của tài khoản (`current_tier()` — đọc `entitlements`, chỉ server ghi;
/// `20260810120000_economy_server_authority.sql`): "free" / "plus" / "max".
public struct SupabaseTier: Sendable {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func current() async throws -> String {
    try await client.rpc("current_tier").execute().value
  }
}
