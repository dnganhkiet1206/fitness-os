public import ASCNDCore
import Foundation
import Supabase

/// Nhắn tin thật (#527; `20261020130000_community_direct_messages.sql`). Đọc qua RLS
/// (chỉ người trong cuộc), ghi CHỈ qua RPC `dm_open` / `dm_send` / `dm_mark_read`
/// — server kiểm chặn, khoá, "ai được nhắn cho tôi" và giới hạn tốc độ.
public struct SupabaseDMSource: DMSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct OpenParams: Encodable, Sendable { let p_other: String }
  struct ThreadParams: Encodable, Sendable { let p_thread: String }
  struct SendParams: Encodable, Sendable {
    let p_thread: String
    let p_body: String
    let p_workout: JSONValue?
  }

  public func threads(userId: String) async throws -> [DirectMessages.Thread] {
    let inbox: [JSONValue] = try await client.rpc("dm_inbox").execute().value
    let ids = Array(Set(inbox.compactMap { $0["other_id"]?.stringValue }))
    let profiles: [JSONValue] =
      ids.isEmpty
      ? []
      : try await client.from("community_profiles").select(CommunityFeed.profileColumns).in("user_id", values: ids)
        .execute().value
    return DirectMessages.threads(inbox: inbox, profiles: profiles)
  }

  public func messages(threadId: String) async throws -> [DirectMessages.Message] {
    let rows: [JSONValue] = try await client.from("dm_messages")
      .select("id, sender_id, body, workout, created_at, read_at")
      .eq("thread_id", value: threadId)
      .order("created_at", ascending: true)
      .limit(500)
      .execute().value
    return rows.compactMap(DirectMessages.message)
  }

  public func send(threadId: String, from userId: String, body: DirectMessages.Body) async throws
    -> DirectMessages.Message
  {
    let params: SendParams
    switch body {
    case .text(let t): params = SendParams(p_thread: threadId, p_body: t, p_workout: nil)
    case .workout(let w): params = SendParams(p_thread: threadId, p_body: "", p_workout: DirectMessages.workoutJSON(w))
    }
    let row: JSONValue = try await client.rpc("dm_send", params: params).execute().value
    guard let m = DirectMessages.message(row) else { throw URLError(.cannotParseResponse) }
    return m
  }

  public func open(with other: CommunityFeed.Author, userId: String) async throws -> DirectMessages.Thread {
    let id: String = try await client.rpc("dm_open", params: OpenParams(p_other: other.userId)).execute().value
    // Hội thoại đã có tin thì lấy đúng hàng của hộp thư (chưa đọc, tin chờ…).
    if let existing = try? await threads(userId: userId).first(where: { $0.id == id }) { return existing }
    return DirectMessages.Thread(
      id: id, other: other, lastText: "", lastAt: EpochMillis(0), lastFromMe: false, unread: false,
      isRequest: false, training: nil)
  }

  public func markRead(threadId: String, userId: String) async throws {
    try await client.rpc("dm_mark_read", params: ThreadParams(p_thread: threadId)).execute()
  }
}
