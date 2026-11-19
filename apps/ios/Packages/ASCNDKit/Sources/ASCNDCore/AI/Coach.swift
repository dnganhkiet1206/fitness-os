public import Foundation
public import Observation

/// AI Coach (#527 Phase 6) — `hooks/use-coach-chat.tsx` @ fac9ac2.
///
/// Như RN:
/// - gửi 20 tin cuối + `lang` + ngày địa phương + `tzOffset` (phút SAU UTC,
///   `getTimezoneOffset`) cho `ai-coach`, đọc câu trả lời dạng **stream SSE**
///   (`data: {choices:[{delta:{content}}]}`, kết thúc `[DONE]`);
/// - tin đầu của một cuộc trò chuyện tạo hàng `ai_conversations` (tiêu đề = 50
///   ký tự đầu), mỗi tin lưu vào `ai_messages`; trả lời xong thì chạm
///   `updated_at` để cuộc trò chuyện nổi lên đầu lịch sử;
/// - không gửi chồng (bấm hai gợi ý cùng lúc chỉ gửi một);
/// - mở lại một cuộc trò chuyện: 60 tin gần nhất, lượt mở cũ về muộn không đè lượt mới;
/// - "học" từ cuộc trò chuyện (`ai-coach-memory`, 20 tin cuối) khi bắt đầu chat
///   mới HOẶC khi app vào nền — chỉ khi có ≥ 2 tin của người dùng và có tin mới
///   kể từ lần học trước; không chờ, lỗi thì bỏ qua.
///
/// Lưu cuộc trò chuyện là việc phụ như RN: tạo / lưu hỏng thì vẫn chat được.
public enum Coach {
  public enum Role: String, Sendable, Hashable { case user, assistant }

  public struct Message: Sendable, Hashable, Identifiable {
    public let id: String
    public let role: Role
    public var content: String

    public init(id: String, role: Role, content: String) {
      self.id = id
      self.role = role
      self.content = content
    }
  }

  /// Một dòng của lịch sử (`ai_conversations`).
  public struct Conversation: Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let updatedAt: String?

    public init(id: String, title: String, updatedAt: String?) {
      self.id = id
      self.title = title
      self.updatedAt = updatedAt
    }
  }

  /// `SEND_WINDOW`: số tin gửi lên mỗi lượt (server cũng cắt ở 20).
  public static let sendWindow = 20
  /// `HISTORY_LIMIT`: số tin nạp lại khi mở một cuộc trò chuyện.
  public static let historyLimit = 60
  /// Số cuộc trò chuyện trong bảng lịch sử.
  public static let conversationLimit = 20

  /// `text.slice(0, 50)` — tính theo đơn vị UTF-16 như JS, nhưng không cắt đôi
  /// một cặp surrogate (JS để lại nửa ký tự hỏng ở cuối tiêu đề).
  public static func title(_ text: String) -> String {
    var units = Array(text.utf16.prefix(50))
    if let last = units.last, UTF16.isLeadSurrogate(last) { units.removeLast() }
    return String(decoding: units, as: UTF16.self)
  }

  /// `new Date().getTimezoneOffset()`: số phút múi giờ đứng SAU UTC (Việt Nam: −420).
  public static func tzOffset(_ tz: TimeZone, at date: Date) -> Int { -tz.secondsFromGMT(for: date) / 60 }

  // MARK: - SSE

  public enum StreamEvent: Sendable, Hashable {
    case delta(String)
    /// `finish_reason: "length"` — hết hạn mức token giữa câu (lỗi 21/10: Coach bị
    /// cắt giữa câu). Mang mẩu chữ cuối (có thể rỗng); app nối `cutOffMark` để người
    /// đọc biết câu chưa xong, thay vì một câu cụt không lời giải thích.
    case cutOff(String)
    case done
    case skip
  }

  /// Dấu nối vào câu trả lời bị cắt vì hết hạn mức.
  public static let cutOffMark = "…"

  /// Một dòng của luồng SSE: chú thích (`:`), dòng trống, dòng không phải
  /// `data: ` → bỏ qua; `[DONE]` → hết; JSON có `choices[0].delta.content`
  /// không rỗng → một mẩu chữ. JSON hỏng → bỏ qua (dòng đã trọn vẹn).
  public static func parse(line raw: String) -> StreamEvent {
    let line = raw.hasSuffix("\r") ? String(raw.dropLast()) : raw
    if line.hasPrefix(":") || line.trimmingCharacters(in: .whitespaces).isEmpty { return .skip }
    guard line.hasPrefix("data: ") else { return .skip }
    let payload = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
    if payload == "[DONE]" { return .done }
    guard let data = payload.data(using: .utf8),
      let json = try? JSONDecoder().decode(JSONValue.self, from: data),
      case .array(let choices)? = json["choices"], let first = choices.first
    else { return .skip }
    let content = first["delta"]?["content"]?.stringValue ?? ""
    if first["finish_reason"]?.stringValue == "length" { return .cutOff(content) }
    guard !content.isEmpty else { return .skip }
    return .delta(content)
  }

  /// `learnFrom`: có đáng gửi đi học không — ≥ 2 tin của người dùng và dài hơn
  /// lần học trước.
  public static func shouldLearn(_ convo: [Message], learnedAt: Int) -> Bool {
    convo.count > learnedAt && convo.filter { $0.role == .user }.count >= 2
  }

  /// Thân POST của `ai-coach`. `waterUnit` (27/10): server viết nước theo nó; server
  /// cũ bỏ qua trường lạ, server mới thiếu trường thì coi là "ml".
  public static func requestBody(
    messages: [Message], lang: String, date: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict],
    waterUnit: Water.Unit
  ) -> JSONValue {
    .object([
      "messages": wire(messages), "lang": .string(lang), "date": .string(date.description),
      "tzOffset": .number(Double(tzOffset)),
      // Số đã ghi vs số vừa nói — server bảo AI hỏi lại cái nào đúng.
      "checks": .array(checks.map {
        .object(["kind": .string($0.kind.rawValue), "logged": .number($0.logged), "stated": .number($0.stated)])
      }),
      "waterUnit": .string(waterUnit.rawValue),
    ])
  }

  /// Thân gửi lên (`{id, role, content}` như `Msg` của RN).
  public static func wire(_ messages: [Message]) -> JSONValue {
    .array(
      messages.suffix(sendWindow).map {
        .object(["id": .string($0.id), "role": .string($0.role.rawValue), "content": .string($0.content)])
      })
  }
}

/// Luồng trả lời của `ai-coach`: mỗi phần tử là một mẩu chữ. Lỗi là
/// `EdgeFunction.Failure` (cùng bảng chữ với các màn AI khác).
public protocol CoachStream: Sendable {
  func stream(messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int)
    -> AsyncThrowingStream<String, any Error>
  /// Kèm các chỗ lời người dùng khác số đã ghi (`CoachLogPrompt.Conflict`) để AI
  /// hỏi lại số nào đúng (16/10), và đơn vị nước của người dùng (27/10: `ai-coach`
  /// viết nước bằng oz / ml theo nó; số trong `checks` vẫn là ml).
  func stream(
    messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict],
    waterUnit: Water.Unit
  ) -> AsyncThrowingStream<String, any Error>
}

extension CoachStream {
  public func stream(
    messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict],
    waterUnit: Water.Unit
  ) -> AsyncThrowingStream<String, any Error> {
    stream(messages: messages, lang: lang, date: date, tzOffset: tzOffset)
  }
}

/// Kho cuộc trò chuyện (`ai_conversations`, `ai_messages`) — RLS theo người dùng.
public protocol CoachStore: Sendable {
  /// Tạo cuộc trò chuyện, trả id.
  func createConversation(userId: String, title: String) async throws -> String
  func saveMessage(conversationId: String, role: Coach.Role, content: String) async throws
  /// Chạm `updated_at` (cuộc trò chuyện vừa có trả lời).
  func touch(conversationId: String, userId: String) async throws
  /// `historyLimit` tin gần nhất, cũ → mới, chỉ `user` / `assistant`.
  func messages(conversationId: String) async throws -> [Coach.Message]
  /// `conversationLimit` cuộc gần nhất theo `updated_at`.
  func conversations(userId: String) async throws -> [Coach.Conversation]
  func deleteConversation(id: String, userId: String) async throws
}

/// Chat coach của MỘT tài khoản. Đóng khi phiên đổi.
@MainActor @Observable
public final class CoachChat {
  public enum History: Sendable, Hashable {
    case idle
    case loading
    case failed
    case ready([Coach.Conversation])
  }

  public let userId: String
  /// Làm sạch câu trả lời trước khi lưu (16/10: đối chiếu khối tổng quan với số
  /// thật — `CoachOverview.sanitize`). App gán; `nil` = lưu nguyên văn.
  @ObservationIgnored public var sanitize: ((String) -> String)?
  /// Đơn vị nước của người dùng cho câu hỏi lại dựng sẵn ("16 oz" thay "473 ml"). App gán.
  @ObservationIgnored public var waterUnit: Water.Unit = .ml
  public private(set) var messages: [Coach.Message] = []
  /// Chỗ lệch giữa lời kể và số đã ghi, theo id tin của người dùng — màn chat hiện
  /// nút chọn số đúng dưới câu trả lời ngay sau tin đó.
  public private(set) var conflicts: [String: [CoachLogPrompt.Conflict]] = [:]
  public private(set) var isLoading = false
  public private(set) var conversationId: String?
  /// Lỗi của lượt gửi gần nhất (RN: `Alert`); xoá khi gửi lượt mới.
  public private(set) var failure: EdgeFunction.Failure?
  public private(set) var history: History = .idle
  /// Xoá một cuộc trò chuyện hỏng (RN: toast).
  public private(set) var deleteFailed = false

  @ObservationIgnored private let stream: any CoachStream
  @ObservationIgnored private let store: any CoachStore
  @ObservationIgnored private let edge: (any EdgeCaller)?
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var learnedAt = 0
  @ObservationIgnored private var loadGeneration = 0
  @ObservationIgnored private var seq = 0

  public init(userId: String, stream: any CoachStream, store: any CoachStore, edge: (any EdgeCaller)?) {
    self.userId = userId
    self.stream = stream
    self.store = store
    self.edge = edge
  }

  public func close() { closed = true }

  private func nextId() -> String {
    seq += 1
    return "local-\(seq)"
  }

  /// Câu hỏi của lượt hỏng gần nhất — để "Thử lại" gửi lại đúng câu ấy (KOA-T06).
  @ObservationIgnored private var lastAsk: (text: String, checks: [CoachLogPrompt.Conflict])?
  /// Tin trả lời dở của lượt hỏng (đã đánh dấu "…") — "Thử lại" thay nó bằng câu mới.
  @ObservationIgnored private var truncatedId: String?
  /// Câu hỏi của `lastAsk` đã vào lịch sử chưa (Devin #961: gửi lúc mất mạng thì chưa —
  /// "Thử lại" phải lưu bù, không thì lịch sử chỉ còn câu trả lời).
  @ObservationIgnored private var askSaved = false
  /// Việc đọc luồng đang chạy — `stop()` huỷ nó (nút Dừng, mọi đường gửi).
  @ObservationIgnored private var streamTask: Task<(any Error)?, Never>?
  @ObservationIgnored private var stopRequested = false
  /// Câu trả lời đang chảy của lượt hiện tại (chữ + id tin trên màn).
  @ObservationIgnored private var live: (text: String, id: String?) = ("", nil)

  /// Nút Dừng (KOA-T06): cắt luồng đang chảy, giữ phần đã nhận. Dùng được cho mọi lượt
  /// gửi, kể cả lượt bắt đầu từ ngoài màn chat (bảng Xu hướng — Devin #961).
  public func stop() {
    guard isLoading else { return }
    stopRequested = true
    streamTask?.cancel()
  }

  /// Gửi một câu (đã cắt khoảng trắng); không làm gì khi rỗng hoặc đang gửi.
  public func send(
    _ raw: String, lang: String, today: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict] = []
  ) async {
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !isLoading, !closed else { return }
    await run(text, lang: lang, today: today, tzOffset: tzOffset, checks: checks, isRetry: false)
  }

  /// Gửi lại câu của lượt vừa hỏng (KOA-T06): không thêm bong bóng câu hỏi lần hai,
  /// không lưu câu hỏi lần hai; tin trả lời dở (nếu có) được thay bằng câu mới.
  public func retry(lang: String, today: LocalDate, tzOffset: Int) async {
    guard let ask = lastAsk, failure != nil, !isLoading, !closed else { return }
    if let id = truncatedId, let i = messages.lastIndex(where: { $0.id == id }) { messages.remove(at: i) }
    truncatedId = nil
    await run(ask.text, lang: lang, today: today, tzOffset: tzOffset, checks: ask.checks, isRetry: true)
  }

  /// Có thể thử lại lượt vừa hỏng không. Hết lượt trong ngày, phiên hết hạn, hàm chưa
  /// triển khai: thử lại không giúp gì — không đưa nút.
  public var canRetry: Bool {
    guard let failure, lastAsk != nil, !isLoading else { return false }
    return ![.quotaExceeded, .unauthorised, .notDeployed].contains(failure)
  }

  private func run(
    _ text: String, lang: String, today: LocalDate, tzOffset: Int, checks: [CoachLogPrompt.Conflict], isRetry: Bool
  ) async {
    isLoading = true
    failure = nil
    stopRequested = false
    lastAsk = (text, checks)
    if !isRetry {
      askSaved = false
      let askedId = nextId()
      messages.append(Coach.Message(id: askedId, role: .user, content: text))
      if !checks.isEmpty { conflicts[askedId] = checks }
    }
    let outgoing = messages
    defer { if !closed { isLoading = false } }

    // Lưu là việc phụ: hỏng thì vẫn hỏi coach. Câu hỏi lưu NGAY khi gửi (KOA-T06) —
    // thử lại không lưu lần hai.
    if conversationId == nil, let id = try? await store.createConversation(userId: userId, title: Coach.title(text)) {
      guard !closed else { return }
      conversationId = id
    }
    let convo = conversationId
    // Câu hỏi chưa vào lịch sử (lần đầu, hoặc lần trước lưu hỏng) thì lưu — kể cả khi thử lại.
    if let convo, !askSaved {
      do {
        try await store.saveMessage(conversationId: convo, role: .user, content: text)
        askSaved = true
      } catch {}
    }

    live = ("", nil)
    let source = stream.stream(
      messages: Array(outgoing.suffix(Coach.sendWindow)), lang: lang, date: today, tzOffset: tzOffset,
      checks: checks, waterUnit: waterUnit)
    // Đọc luồng trong một việc riêng để `stop()` huỷ được từ bất kỳ đâu.
    let reader = Task<(any Error)?, Never> { [weak self] in
      do {
        for try await chunk in source {
          guard let self, !self.closed else { return nil }
          self.append(chunk)
        }
        return nil
      } catch {
        return error
      }
    }
    streamTask = reader
    let streamError = await withTaskCancellationHandler { await reader.value } onCancel: { reader.cancel() }
    streamTask = nil
    guard !closed else { return }
    var answer = live.text
    let answerId = live.id

    // Người dùng bấm Dừng (huỷ việc gửi): giữ phần đã nhận, đánh dấu chưa xong, không báo lỗi.
    if stopRequested || Task.isCancelled || reader.isCancelled || streamError is CancellationError {
      await keepPartial(answer, id: answerId, convo: convo)
      lastAsk = nil
      return
    }
    if let streamError {
      // KOA-T06: lượt hỏng giữ phần trả lời dở (đánh dấu "…") cả trên màn lẫn trong lịch
      // sử, để mở lại thấy đúng điều đã thấy; "Thử lại" thay nó.
      failure = (streamError as? EdgeFunction.Failure) ?? .unknown
      truncatedId = await keepPartial(answer, id: answerId, convo: convo)
      return
    }
    // Luồng "xong" mà không có chữ nào: không im lặng — báo để thử lại.
    guard !answer.isEmpty else {
      failure = .incomplete
      return
    }
    lastAsk = nil
    // Hỏi lại khi lệch: AI chép chỉ dẫn ra thay vì hỏi → câu hỏi dựng sẵn.
    if let c = checks.first, CoachLogPrompt.leaksInstructions(answer) {
      answer = CoachLogPrompt.question(c, lang: lang, unit: waterUnit)
    }
    let final = sanitize?(answer) ?? answer
    if final != answer, let id = answerId, let i = messages.lastIndex(where: { $0.id == id }) {
      messages[i].content = final
    }
    guard let convo else { return }
    try? await store.saveMessage(conversationId: convo, role: .assistant, content: final)
    try? await store.touch(conversationId: convo, userId: userId)
  }

  /// Một mẩu chữ của luồng: nối vào tin trả lời đang hiện (tạo tin ở mẩu đầu).
  private func append(_ chunk: String) {
    live.text += chunk
    if let id = live.id, let i = messages.lastIndex(where: { $0.id == id }) {
      messages[i].content = live.text
    } else {
      let id = nextId()
      live.id = id
      messages.append(Coach.Message(id: id, role: .assistant, content: live.text))
    }
  }

  /// Phần trả lời dở: đối chiếu số liệu như câu hoàn chỉnh (Devin #961: lịch sử không
  /// được hiện số sai đã bị ẩn), thêm dấu `cutOffMark`, lưu vào lịch sử. Lệnh lưu chạy
  /// trong một việc MỚI: bấm Dừng huỷ lượt gửi, và lệnh lưu trong việc đã huỷ cũng bị huỷ
  /// theo (Devin #961). Trả id tin.
  @discardableResult
  private func keepPartial(_ answer: String, id: String?, convo: String?) async -> String? {
    guard !answer.isEmpty, let id, let i = messages.lastIndex(where: { $0.id == id }) else { return nil }
    let checked = sanitize?(answer) ?? answer
    let marked = checked.hasSuffix(Coach.cutOffMark) ? checked : checked + Coach.cutOffMark
    messages[i].content = marked
    if let convo {
      let store = self.store, userId = self.userId
      await Task {
        try? await store.saveMessage(conversationId: convo, role: .assistant, content: marked)
        try? await store.touch(conversationId: convo, userId: userId)
      }.value
    }
    return id
  }

  /// Trả lời không qua AI (`CoachQuickReply`, 16/10): câu hỏi và câu trả lời dựng
  /// sẵn vào cuộc trò chuyện như một lượt thường — lưu vào lịch sử, có "đang gõ"
  /// một nhịp ngắn cho tự nhiên, nhưng không gọi edge function.
  public func answerLocally(_ raw: String, reply: String) async {
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !isLoading, !closed else { return }
    isLoading = true
    failure = nil
    messages.append(Coach.Message(id: nextId(), role: .user, content: text))
    defer { if !closed { isLoading = false } }
    if conversationId == nil, let id = try? await store.createConversation(userId: userId, title: Coach.title(text)) {
      guard !closed else { return }
      conversationId = id
    }
    if let convo = conversationId { try? await store.saveMessage(conversationId: convo, role: .user, content: text) }
    try? await Task.sleep(for: .milliseconds(650))
    guard !closed else { return }
    messages.append(Coach.Message(id: nextId(), role: .assistant, content: reply))
    // Một nhịp để màn thấy tin mới lúc còn "đang về" — chữ nhả dần như câu AI.
    try? await Task.sleep(for: .milliseconds(60))
    if let convo = conversationId {
      try? await store.saveMessage(conversationId: convo, role: .assistant, content: reply)
      try? await store.touch(conversationId: convo, userId: userId)
    }
  }

  /// Chat mới: học từ cuộc vừa xong rồi xoá màn.
  public func newChat() {
    learn()
    conversationId = nil
    messages = []
    conflicts = [:]
    failure = nil
    lastAsk = nil
    truncatedId = nil
    learnedAt = 0
  }

  /// App vào nền — "xong rồi" thật sự trông như thế này (RN: `AppState`).
  public func appBackgrounded() { learn() }

  private func learn() {
    guard let edge, Coach.shouldLearn(messages, learnedAt: learnedAt) else { return }
    learnedAt = messages.count
    let body = ["messages": Coach.wire(messages)]
    Task.detached { _ = try? await edge.call(.coachMemory, body: body) }
  }

  /// Mở một cuộc trò chuyện cũ. Lượt mở về muộn không đè lượt mới hơn.
  public func open(_ id: String) async {
    loadGeneration += 1
    let mine = loadGeneration
    guard let loaded = try? await store.messages(conversationId: id) else { return }
    guard !closed, mine == loadGeneration else { return }
    conversationId = id
    messages = loaded
    failure = nil
    lastAsk = nil
    truncatedId = nil
    // Đã học từ những tin này rồi (hoặc chúng đến từ máy khác) — không trả lại.
    learnedAt = loaded.count
  }

  /// Đọc bảng lịch sử.
  public func loadHistory() async {
    if case .ready = history {} else { history = .loading }
    do {
      let list = try await store.conversations(userId: userId)
      guard !closed else { return }
      history = .ready(list)
    } catch {
      guard !closed else { return }
      if case .ready = history { return }
      history = .failed
    }
  }

  /// Xoá một cuộc trò chuyện; đang mở đúng cuộc ấy thì về chat mới.
  public func delete(_ id: String) async {
    deleteFailed = false
    do {
      try await store.deleteConversation(id: id, userId: userId)
      guard !closed else { return }
      if case .ready(let list) = history { history = .ready(list.filter { $0.id != id }) }
      if conversationId == id {
        conversationId = nil
        messages = []
        learnedAt = 0
      }
    } catch {
      guard !closed else { return }
      deleteFailed = true
    }
  }
}
