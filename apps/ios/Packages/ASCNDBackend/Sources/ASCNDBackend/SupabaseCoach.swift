public import ASCNDCore
import Foundation
import Supabase

/// Luồng trả lời của `ai-coach` (#527 Phase 6) — phần `expoFetch` của
/// `use-coach-chat.tsx`: POST thẳng tới `functions/v1/ai-coach` với token của
/// phiên + `apikey`, đọc SSE từng dòng.
///
/// Không đi qua `functions.invoke` vì hàm này trả về luồng (RN cũng tự `fetch`
/// vì cùng lý do). Mã lỗi HTTP phân loại bằng chính `EdgeFunction.classify`,
/// nên chữ lỗi giống mọi màn AI khác; mất mạng là `offline`.
public struct SupabaseCoachStream: CoachStream {
  private let client: SupabaseClient
  private let url: URL
  private let anonKey: String
  private let session: URLSession

  public init(backend: Backend, session: URLSession = .shared) {
    self.client = backend.client
    self.url = backend.config.url.appendingPathComponent("functions/v1/\(EdgeFunction.Name.coach.rawValue)")
    self.anonKey = backend.config.anonKey
    self.session = session
  }

  public func stream(messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int)
    -> AsyncThrowingStream<String, any Error>
  {
    let client = self.client
    let url = self.url
    let anonKey = self.anonKey
    let session = self.session
    let body = JSONValue.object([
      "messages": Coach.wire(messages), "lang": .string(lang), "date": .string(date.description),
      "tzOffset": .number(Double(tzOffset)),
    ])
    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          guard let auth = try? await client.auth.session else { throw EdgeFunction.Failure.unauthorised }
          let request = try Self.request(url: url, anonKey: anonKey, token: auth.accessToken, body: body)
          let (bytes, response) = try await session.bytes(for: request)
          if let failure = Self.failure(status: (response as? HTTPURLResponse)?.statusCode ?? 0) { throw failure }
          for try await line in bytes.lines {
            switch Coach.parse(line: line) {
            case .delta(let text): continuation.yield(text)
            case .done:
              continuation.finish()
              return
            case .skip: continue
            }
          }
          continuation.finish()
        } catch {
          continuation.finish(throwing: Self.failure(error))
        }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }

  /// POST của `expoFetch`: token của phiên + `apikey`, thân JSON.
  static func request(url: URL, anonKey: String, token: String, body: JSONValue) throws -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(body)
    return request
  }

  /// Mã HTTP không 2xx → loại lỗi của bảng chung.
  static func failure(status: Int) -> EdgeFunction.Failure? {
    (200..<300).contains(status) ? nil : EdgeFunction.classify(status: status, message: "")
  }

  /// Lỗi giữa chừng: đã phân loại thì giữ; mất mạng → `offline`.
  static func failure(_ error: any Error) -> EdgeFunction.Failure {
    if let failure = error as? EdgeFunction.Failure { return failure }
    return NetworkFailure.isOffline(error) ? .offline : EdgeFunction.classify(status: nil, message: String(describing: error))
  }
}

/// Kho cuộc trò chuyện của coach (`ai_conversations`, `ai_messages`).
public struct SupabaseCoachStore: CoachStore {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct NewConversation: Encodable, Sendable {
    let user_id: String
    let title: String
  }

  struct NewMessage: Encodable, Sendable {
    let conversation_id: String
    let role: String
    let content: String
  }

  struct IdRow: Decodable, Sendable { let id: String }

  struct MessageRow: Decodable, Sendable {
    let id: String
    let role: String
    let content: String?
  }

  struct ConversationRow: Decodable, Sendable {
    let id: String
    let title: String?
    let updated_at: String?
  }

  /// Xoá không chạm hàng nào (RN: `confirmWrite` → "nothing written").
  struct NothingWritten: Error {}

  public func createConversation(userId: String, title: String) async throws -> String {
    let row: IdRow = try await client.from("ai_conversations")
      .insert(NewConversation(user_id: userId, title: title))
      .select("id").single().execute().value
    return row.id
  }

  public func saveMessage(conversationId: String, role: Coach.Role, content: String) async throws {
    try await client.from("ai_messages")
      .insert(NewMessage(conversation_id: conversationId, role: role.rawValue, content: content)).execute()
  }

  public func touch(conversationId: String, userId: String) async throws {
    try await client.from("ai_conversations")
      .update(["updated_at": ISO8601DateFormatter().string(from: Date())])
      .eq("id", value: conversationId).eq("user_id", value: userId).execute()
  }

  public func messages(conversationId: String) async throws -> [Coach.Message] {
    let rows: [MessageRow] = try await client.from("ai_messages")
      .select("id, role, content")
      .eq("conversation_id", value: conversationId)
      .order("created_at", ascending: false)
      .limit(Coach.historyLimit)
      .execute().value
    return rows.reversed().compactMap { r in
      guard let role = Coach.Role(rawValue: r.role) else { return nil }
      return Coach.Message(id: r.id, role: role, content: r.content ?? "")
    }
  }

  public func conversations(userId: String) async throws -> [Coach.Conversation] {
    let rows: [ConversationRow] = try await client.from("ai_conversations")
      .select("id, title, updated_at")
      .eq("user_id", value: userId)
      .order("updated_at", ascending: false)
      .limit(Coach.conversationLimit)
      .execute().value
    return rows.map { Coach.Conversation(id: $0.id, title: $0.title ?? "", updatedAt: $0.updated_at) }
  }

  public func deleteConversation(id: String, userId: String) async throws {
    let gone: [IdRow] = try await client.from("ai_conversations")
      .delete().eq("id", value: id).eq("user_id", value: userId)
      .select("id").execute().value
    if gone.isEmpty { throw NothingWritten() }
  }
}
