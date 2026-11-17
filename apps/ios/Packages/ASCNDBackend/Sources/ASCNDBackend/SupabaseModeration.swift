public import ASCNDCore
import Foundation
import Supabase

/// Bảng kiểm duyệt Cộng đồng qua RPC `mod_*` (#915) — cùng hợp đồng với
/// `use-admin.ts` (RN web, A 03/10) trên migration
/// `20261007130000_community_admin.sql` (+ `counted` của
/// `20261007220000_community_report_trust.sql`).
///
/// Mọi hàm tự kiểm quyền ở database (`moderation_require`); người thường gọi
/// thì nhận 42501 → `.forbidden`. Lỗi map như `SupabaseCommunity`:
/// mất mạng → `.offline`, P0002 (đích / kháng nghị không còn) → `.gone`.
public struct SupabaseModeration: ModerationRemote {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  /// `my_app_role()`: vai trò của chính người đang đăng nhập.
  public func myRole() async throws -> String {
    do {
      let role: String = try await client.rpc("my_app_role").execute().value
      return role
    } catch {
      throw Self.failure(error)
    }
  }

  public func dashboard() async throws -> JSONValue {
    do {
      return try await client.rpc("mod_dashboard").execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  /// Như RN: tối đa 100 mục (server mặc định 50, trần 200).
  public func reports(status: ModReportStatus) async throws -> [JSONValue] {
    do {
      return rpcRows(try await client.rpc(
        "mod_reports", params: StatusParams(p_status: status.rawValue, p_limit: 100)
      ).execute().value)
    } catch {
      throw Self.failure(error)
    }
  }

  public func appeals(status: ModAppealStatus) async throws -> [JSONValue] {
    do {
      return rpcRows(try await client.rpc(
        "mod_appeals", params: StatusParams(p_status: status.rawValue, p_limit: 100)
      ).execute().value)
    } catch {
      throw Self.failure(error)
    }
  }

  public func target(type: ModTargetType, id: String) async throws -> JSONValue {
    do {
      return try await client.rpc("mod_target", params: TargetParams(p_type: type.rawValue, p_id: id)).execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  /// Hàm trả JSON `null` khi không bị khoá. PostgREST trả thân rỗng cho
  /// `null` ở một số bản thì giải mã hỏng → `.server`, và sổ coi hạn chế là
  /// "chưa biết" (không chặn màn chi tiết).
  public func userRestriction(user: String) async throws -> JSONValue? {
    do {
      let v: JSONValue = try await client.rpc(
        "mod_user_restriction", params: UserParams(p_user: user)
      ).execute().value
      return v == .null ? nil : v
    } catch {
      throw Self.failure(error)
    }
  }

  /// `mod_hide` / `mod_restore` / `mod_remove` / `mod_dismiss` — cùng ba tham
  /// số `p_type` / `p_id` / `p_reason`.
  public func decide(action: ModAction, type: ModTargetType, id: String, reason: String) async throws {
    do {
      try await client.rpc(
        "mod_\(action.rawValue)",
        params: DecideParams(p_type: type.rawValue, p_id: id, p_reason: reason)
      ).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  public func decideAppeal(id: String, approve: Bool, reason: String) async throws {
    do {
      try await client.rpc(
        "mod_decide_appeal", params: DecideAppealParams(p_appeal: id, p_approve: approve, p_reason: reason)
      ).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  public func restrict(user: String, hours: Int, reason: String) async throws {
    do {
      try await client.rpc(
        "mod_restrict", params: RestrictParams(p_user: user, p_hours: hours, p_reason: reason)
      ).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  public func unrestrict(user: String, reason: String) async throws {
    do {
      try await client.rpc("mod_unrestrict", params: UnrestrictParams(p_user: user, p_reason: reason)).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  // MARK: - Nội bộ

  struct StatusParams: Encodable, Sendable {
    let p_status: String
    let p_limit: Int
  }

  struct TargetParams: Encodable, Sendable {
    let p_type: String
    let p_id: String
  }

  struct UserParams: Encodable, Sendable {
    let p_user: String
  }

  struct DecideParams: Encodable, Sendable {
    let p_type: String
    let p_id: String
    let p_reason: String
  }

  struct DecideAppealParams: Encodable, Sendable {
    let p_appeal: String
    let p_approve: Bool
    let p_reason: String
  }

  struct RestrictParams: Encodable, Sendable {
    let p_user: String
    let p_hours: Int
    let p_reason: String
  }

  struct UnrestrictParams: Encodable, Sendable {
    let p_user: String
    let p_reason: String
  }

  private func rpcRows(_ v: JSONValue) -> [JSONValue] {
    if case .array(let a) = v { return a }
    return []
  }

  static func failure(_ error: any Error) -> ModerationFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    let code = (error as? PostgrestError)?.code
    if code == "42501" { return .forbidden }
    if code == "P0002" { return .gone }
    return .server(code: code)
  }
}
