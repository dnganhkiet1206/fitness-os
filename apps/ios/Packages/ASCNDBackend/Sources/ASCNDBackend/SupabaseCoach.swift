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

  public func stream(
    messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict],
    waterUnit: Water.Unit
  ) -> AsyncThrowingStream<String, any Error> {
    let client = self.client
    let url = self.url
    let anonKey = self.anonKey
    let session = self.session
    let body = Coach.requestBody(
      messages: messages, lang: lang, date: date, tzOffset: tzOffset, checks: checks, waterUnit: waterUnit)
    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          guard let auth = try? await client.auth.session else { throw EdgeFunction.Failure.unauthorised }
          let request = try Self.request(url: url, anonKey: anonKey, token: auth.accessToken, body: body)
          let (bytes, response) = try await session.bytes(for: request)
          let status = (response as? HTTPURLResponse)?.statusCode ?? 0
          if !(200..<300).contains(status) {
            // KOA-T07: đọc thân lỗi (tối đa 4 KB) để tách "hết lượt" / "quá tải" với lỗi khác.
            throw Self.failure(status: status, body: await Self.readBody(bytes)) ?? .unknown
          }
          // KOA-T09: byte đầu được chờ `firstByteTimeout` (request); sau byte đầu, im quá
          // `idleAfterFirstByte` là hết giờ — đồng hồ canh riêng cắt luồng.
          let watch = StreamWatch()
          let reader = Task {
            try await Self.relay(bytes.lines, yield: { continuation.yield($0) }, touch: { watch.touch() })
          }
          let dog = Task {
            while !Task.isCancelled {
              try? await Task.sleep(for: .seconds(Self.watchInterval))
              if watch.stalled(now: Date(), limit: Self.idleAfterFirstByte) {
                watch.markTimedOut()
                reader.cancel()
                return
              }
            }
          }
          defer { dog.cancel() }
          let sawDone: Bool
          do {
            sawDone = try await withTaskCancellationHandler { try await reader.value } onCancel: { reader.cancel() }
          } catch {
            if watch.timedOut { throw EdgeFunction.Failure.timedOut }
            throw error
          }
          if watch.timedOut { throw EdgeFunction.Failure.timedOut }
          // KOA-T06: hết luồng mà không có `[DONE]` = câu trả lời bị cắt, không phải xong.
          guard sawDone else { throw EdgeFunction.Failure.incomplete }
          continuation.finish()
        } catch {
          continuation.finish(throwing: Self.failure(error))
        }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }

  /// Đọc các dòng SSE: chữ → `yield`, mỗi dòng → `touch` (đồng hồ idle). Trả về đã thấy
  /// `[DONE]` chưa — `false` nghĩa là luồng đứt giữa chừng (KOA-T06).
  static func relay<Lines: AsyncSequence>(
    _ lines: Lines, yield: (String) -> Void, touch: () -> Void
  ) async throws -> Bool where Lines.Element == String {
    for try await line in lines {
      touch()
      switch Coach.parse(line: line) {
      case .delta(let text): yield(text)
      case .cutOff(let text): yield(text + Coach.cutOffMark)
      case .done: return true
      case .skip: continue
      }
    }
    return false
  }

  /// Thân lỗi, tối đa `limit` byte (KOA-T07). Đọc hỏng giữa chừng thì trả phần đã có —
  /// rỗng thì phân loại như trước (chỉ theo mã HTTP).
  static func readBody<Bytes: AsyncSequence>(_ bytes: Bytes, limit: Int = errorBodyLimit) async -> String
  where Bytes.Element == UInt8 {
    var data = Data()
    do {
      for try await byte in bytes {
        data.append(byte)
        if data.count >= limit { break }
      }
    } catch {}
    return String(decoding: data, as: UTF8.self)
  }

  /// Ngân sách BYTE ĐẦU (KOA-T09): `timeoutInterval` của `URLRequest` là hết giờ idle —
  /// không byte nào trong từng ấy giây thì hỏng. Trước byte đầu, server có thể đang chờ
  /// failover: mỗi nhà cung cấp tối đa 3 lần thử × hết giờ header 20 giây, ba nhà cung cấp
  /// ≈ 180 giây ở trường hợp xấu nhất (`_shared/ai.ts`). 90 giây cũ cắt oan đường đó và
  /// báo "mất mạng". Màn chat hiện "Koa đang suy nghĩ" khi chờ lâu.
  static let firstByteTimeout: TimeInterval = 180
  /// Sau byte đầu, chữ chảy liên tục; im quá 60 giây là treo thật → `.timedOut`.
  static let idleAfterFirstByte: TimeInterval = 60
  static let watchInterval: TimeInterval = 5
  static let errorBodyLimit = 4096
  /// Tên cũ (AUD-67) — nay là ngân sách byte đầu.
  static var idleTimeout: TimeInterval { firstByteTimeout }

  /// POST của `expoFetch`: token của phiên + `apikey`, thân JSON.
  static func request(url: URL, anonKey: String, token: String, body: JSONValue) throws -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = Self.firstByteTimeout
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(body)
    return request
  }

  /// Mã HTTP không 2xx → loại lỗi của bảng chung, đọc kèm thân lỗi (KOA-T07).
  static func failure(status: Int, body: String = "") -> EdgeFunction.Failure? {
    (200..<300).contains(status) ? nil : EdgeFunction.classify(status: status, message: body)
  }

  /// Lỗi giữa chừng: đã phân loại thì giữ; hết giờ → `timedOut` (KOA-T09, trước đây
  /// hiện là "mất mạng"); mất mạng → `offline`.
  static func failure(_ error: any Error) -> EdgeFunction.Failure {
    if let failure = error as? EdgeFunction.Failure { return failure }
    if (error as? URLError)?.code == .timedOut { return .timedOut }
    return NetworkFailure.isOffline(error) ? .offline : EdgeFunction.classify(status: nil, message: String(describing: error))
  }
}

/// Đồng hồ idle của một luồng: chưa có byte đầu thì không tính (đó là việc của
/// `timeoutInterval`); có rồi thì im quá giới hạn là treo.
final class StreamWatch: @unchecked Sendable {
  private let lock = NSLock()
  private var last: Date?
  private var didTimeOut = false

  func touch(at now: Date = Date()) { lock.withLock { last = now } }
  func stalled(now: Date, limit: TimeInterval) -> Bool {
    lock.withLock { last.map { now.timeIntervalSince($0) > limit } ?? false }
  }
  func markTimedOut() { lock.withLock { didTimeOut = true } }
  var timedOut: Bool { lock.withLock { didTimeOut } }
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

/// Kho trí nhớ coach (`coach_memory`): đọc + xoá — server mới ghi.
public struct SupabaseCoachMemoryStore: CoachMemoryStore {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func facts(userId: String) async throws -> [JSONValue] {
    let rows: [JSONValue] = try await client.from("coach_memory")
      .select("id, kind, fact, last_confirmed, source_excerpt")
      .eq("user_id", value: userId)
      .order("last_confirmed", ascending: false)
      .execute().value
    return rows
  }

  public func forget(id: String, userId: String) async throws {
    let gone: [SupabaseCoachStore.IdRow] = try await client.from("coach_memory")
      .delete().eq("id", value: id).eq("user_id", value: userId)
      .select("id").execute().value
    if gone.isEmpty { throw SupabaseCoachStore.NothingWritten() }
  }

  public func forgetAll(userId: String) async throws {
    let gone: [SupabaseCoachStore.IdRow] = try await client.from("coach_memory")
      .delete().eq("user_id", value: userId)
      .select("id").execute().value
    if gone.isEmpty { throw SupabaseCoachStore.NothingWritten() }
  }
}
