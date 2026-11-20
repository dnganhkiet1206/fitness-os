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
///
/// Giai đoạn 2: cùng struct này thỏa `AdminRemote` — `myRole` /
/// `userRestriction` / `restrict` / `unrestrict` trùng chữ ký với
/// `ModerationRemote` nên một hàm phục vụ cả hai protocol.
public struct SupabaseModeration: ModerationRemote {
  private let client: SupabaseClient
  private let config: BackendConfig

  public init(backend: Backend) {
    self.client = backend.client
    self.config = backend.config
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

  // MARK: - Admin (giai đoạn 2)

  /// Như RN: tối đa 200 dòng nhật ký.
  public func adminAudit(action: String?) async throws -> [JSONValue] {
    do {
      return rpcRows(try await client.rpc(
        "admin_audit", params: AuditParams(p_limit: 200, p_action: action)
      ).execute().value)
    } catch {
      throw Self.failure(error)
    }
  }

  public func adminUsers(query: String) async throws -> [JSONValue] {
    do {
      return rpcRows(try await client.rpc(
        "admin_users", params: UsersParams(p_query: query, p_limit: 100)
      ).execute().value)
    } catch {
      throw Self.failure(error)
    }
  }

  public func adminUser(id: String) async throws -> JSONValue {
    do {
      return try await client.rpc("admin_user", params: UserParams(p_user: id)).execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  public func setRole(user: String, role: AppRole, reason: String) async throws {
    do {
      try await client.rpc(
        "admin_set_role", params: SetRoleParams(p_user: user, p_role: role.rawValue, p_reason: reason)
      ).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  public func adminArt() async throws -> [JSONValue] {
    do {
      return rpcRows(try await client.rpc("admin_art").execute().value)
    } catch {
      throw Self.failure(error)
    }
  }

  public func setArtActive(id: String, active: Bool, reason: String) async throws {
    do {
      try await client.rpc(
        "admin_set_art_active", params: SetArtActiveParams(p_art: id, p_active: active, p_reason: reason)
      ).execute()
    } catch {
      throw Self.failure(error)
    }
  }

  /// Tải ảnh lên thư viện qua Edge Function `admin-art`.
  ///
  /// `SupabaseEdgeCaller` chỉ gửi thân JSON — function này nhận multipart nên
  /// gọi thẳng bằng URLSession, cùng hai đầu như RN (`supabase.functions`
  /// gắn sẵn): `Authorization: Bearer <token phiên>` (function kiểm vai trò
  /// admin BẰNG TOKEN NÀY trước khi chạm Storage) và `apikey: <anon key>`.
  /// Client đã kiểm tệp / style / alt trước khi gửi; server kiểm lại.
  public func uploadArt(_ upload: ArtUpload) async throws {
    guard let session = try? await client.auth.session else { throw ModerationFailure.forbidden }
    let url = config.url.appendingPathComponent("functions/v1/admin-art")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    let boundary = "ASCND-\(UUID().uuidString)"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.httpBody = Self.multipartBody(boundary: boundary, upload: upload)
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw ModerationFailure.server(code: nil) }
      switch http.statusCode {
      case 200...299: return
      case 403: throw ModerationFailure.forbidden
      default: throw ModerationFailure.server(code: "\(http.statusCode)")
      }
    } catch let f as ModerationFailure {
      throw f
    } catch {
      throw Self.failure(error)
    }
  }

  /// URL công khai của một ảnh trong bucket `community-art` (để xem trước).
  public func artImageURL(path: String) -> URL? {
    try? client.storage.from("community-art").getPublicURL(path: path)
  }

  // MARK: - Nội bộ

  struct AuditParams: Encodable, Sendable {
    let p_limit: Int
    let p_action: String?
  }

  struct UsersParams: Encodable, Sendable {
    let p_query: String
    let p_limit: Int
  }

  struct SetRoleParams: Encodable, Sendable {
    let p_user: String
    let p_role: String
    let p_reason: String
  }

  struct SetArtActiveParams: Encodable, Sendable {
    let p_art: String
    let p_active: Bool
    let p_reason: String
  }

  private static func multipartBody(boundary: String, upload: ArtUpload) -> Data {
    var body = Data()
    func field(_ name: String, _ value: String) {
      body.append("--\(boundary)\r\n".data(using: .utf8)!)
      body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
      body.append("\(value)\r\n".data(using: .utf8)!)
    }
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append(
      "Content-Disposition: form-data; name=\"file\"; filename=\"\(upload.fileName)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: \(upload.mimeType)\r\n\r\n".data(using: .utf8)!)
    body.append(upload.data)
    body.append("\r\n".data(using: .utf8)!)
    field("kind", upload.kind.rawValue)
    field("style", upload.style)
    field("tags", upload.tags)
    field("alt_en", upload.altEn)
    field("alt_vi", upload.altVi)
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)
    return body
  }

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
    // Hạ admin cuối cùng: server chặn bằng 22023 — phân biệt bằng thông điệp
    // để màn hiện lỗi rõ thay vì "máy chủ lỗi".
    if code == "22023", (error as? PostgrestError)?.message.contains("cannot remove the last admin") == true {
      return .lastAdmin
    }
    return .server(code: code)
  }
}

// `myRole` / `userRestriction` / `restrict` / `unrestrict` đã thỏa
// `ModerationRemote` bằng đúng chữ ký của `AdminRemote`.
extension SupabaseModeration: AdminRemote {}
