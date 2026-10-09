@testable import ASCNDCore
import Foundation
import Testing

/// AI Coach (#527 Phase 6) — `use-coach-chat.tsx` @ fac9ac2.
struct CoachRulesTests {
  @Test func sseLinesLikeTheHook() {
    #expect(Coach.parse(line: #"data: {"choices":[{"delta":{"content":"Chào"}}]}"#) == .delta("Chào"))
    #expect(Coach.parse(line: "data: {\"choices\":[{\"delta\":{\"content\":\" bạn\"}}]}\r") == .delta(" bạn"))
    #expect(Coach.parse(line: "data: [DONE]") == .done)
    #expect(Coach.parse(line: ": keep-alive") == .skip)
    #expect(Coach.parse(line: "") == .skip)
    #expect(Coach.parse(line: "event: ping") == .skip)
    #expect(Coach.parse(line: #"data: {"choices":[{"delta":{}}]}"#) == .skip)  // vai trò, không chữ
    #expect(Coach.parse(line: #"data: {"choices":[{"delta":{"content":""}}]}"#) == .skip)
    #expect(Coach.parse(line: "data: {broken") == .skip)
  }

  @Test func titleIsFiftyUTF16UnitsWithoutHalfAnEmoji() {
    #expect(Coach.title("Ngắn") == "Ngắn")
    let long = String(repeating: "a", count: 60)
    #expect(Coach.title(long).count == 50)
    // 49 chữ + một emoji (2 đơn vị UTF-16): JS cắt đôi emoji; ở đây bỏ hẳn nửa ấy.
    let edge = String(repeating: "a", count: 49) + "💪" + "b"
    #expect(Coach.title(edge) == String(repeating: "a", count: 49))
  }

  @Test func tzOffsetIsMinutesBehindUTC() {
    let vn = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    // 2026-10-09 (UTC+7). Mốc 1970 thì sai: khi ấy Sài Gòn dùng UTC+8 (−480).
    #expect(Coach.tzOffset(vn, at: Date(timeIntervalSince1970: 1_791_500_000)) == -420)
    #expect(Coach.tzOffset(vn, at: Date(timeIntervalSince1970: 0)) == -480)
    #expect(Coach.tzOffset(TimeZone(identifier: "UTC")!, at: Date()) == 0)
  }

  @Test func learnOnlyFromAConversationWithTwoQuestionsAndSomethingNew() {
    let one = [Coach.Message(id: "1", role: .user, content: "a"), Coach.Message(id: "2", role: .assistant, content: "b")]
    #expect(!Coach.shouldLearn(one, learnedAt: 0))
    let two = one + [Coach.Message(id: "3", role: .user, content: "c")]
    #expect(Coach.shouldLearn(two, learnedAt: 0))
    #expect(!Coach.shouldLearn(two, learnedAt: 3))
  }

  @Test func wireSendsTheLastTwenty() {
    let msgs = (0..<25).map { Coach.Message(id: "\($0)", role: $0 % 2 == 0 ? .user : .assistant, content: "m\($0)") }
    guard case .array(let a) = Coach.wire(msgs) else { Issue.record("not array"); return }
    #expect(a.count == 20)
    #expect(a.first?["id"]?.stringValue == "5")
    #expect(a.last?["role"]?.stringValue == "user")
  }
}

@MainActor
struct CoachChatTests {
  final class Stream: CoachStream, @unchecked Sendable {
    let lock = NSLock()
    var chunks: [String] = ["Xin ", "chào"]
    var failure: EdgeFunction.Failure?
    private var log: [(Int, String, String, Int)] = []
    var calls: [(Int, String, String, Int)] { lock.withLock { log } }
    func stream(messages: [Coach.Message], lang: String, date: LocalDate, tzOffset: Int)
      -> AsyncThrowingStream<String, any Error>
    {
      lock.withLock { log.append((messages.count, lang, date.description, tzOffset)) }
      let (chunks, failure) = lock.withLock { (self.chunks, self.failure) }
      return AsyncThrowingStream { c in
        for ch in chunks { c.yield(ch) }
        c.finish(throwing: failure)
      }
    }
  }

  final class Store: CoachStore, @unchecked Sendable {
    let lock = NSLock()
    var failCreate = false
    var failDelete = false
    var saved: [(String, Coach.Role, String)] = []
    var touched: [String] = []
    var deleted: [String] = []
    var stored: [String: [Coach.Message]] = [:]
    var list: [Coach.Conversation] = []
    var delayFor: [String: UInt64] = [:]
    func createConversation(userId: String, title: String) async throws -> String {
      if lock.withLock({ failCreate }) { throw RowStoreError(code: nil, message: "down") }
      return "c-\(title.prefix(3))"
    }
    func saveMessage(conversationId: String, role: Coach.Role, content: String) async throws {
      lock.withLock { saved.append((conversationId, role, content)) }
    }
    func touch(conversationId: String, userId: String) async throws { lock.withLock { touched.append(conversationId) } }
    func messages(conversationId: String) async throws -> [Coach.Message] {
      if let d = lock.withLock({ delayFor[conversationId] }) { try await Task.sleep(nanoseconds: d) }
      return lock.withLock { stored[conversationId] ?? [] }
    }
    func conversations(userId: String) async throws -> [Coach.Conversation] { lock.withLock { list } }
    func deleteConversation(id: String, userId: String) async throws {
      if lock.withLock({ failDelete }) { throw RowStoreError(code: nil, message: "down") }
      lock.withLock { deleted.append(id) }
    }
  }

  final class Edgy: EdgeCaller, @unchecked Sendable {
    let lock = NSLock()
    private var log: [(EdgeFunction.Name, [String: JSONValue])] = []
    var calls: [(EdgeFunction.Name, [String: JSONValue])] { lock.withLock { log } }
    func call(_ fn: EdgeFunction.Name, body: [String: JSONValue]) async throws(EdgeFunction.Failure) -> JSONValue? {
      lock.withLock { log.append((fn, body)) }
      return nil
    }
  }

  static let today = LocalDate("2026-10-09")!

  @Test func streamsAnAnswerAndSavesBothSides() async {
    let stream = Stream()
    let store = Store()
    let chat = CoachChat(userId: "u", stream: stream, store: store, edge: nil)
    await chat.send("  Hôm nay tập gì?  ", lang: "vi", today: Self.today, tzOffset: -420)
    #expect(chat.messages.map(\.content) == ["Hôm nay tập gì?", "Xin chào"])
    #expect(chat.messages.map(\.role) == [.user, .assistant])
    #expect(chat.conversationId == "c-Hôm")
    #expect(!chat.isLoading)
    #expect(stream.calls.first?.0 == 1)
    #expect(stream.calls.first?.1 == "vi")
    #expect(stream.calls.first?.2 == "2026-10-09")
    #expect(stream.calls.first?.3 == -420)
    #expect(store.saved.map(\.1) == [.user, .assistant])
    #expect(store.saved.last?.2 == "Xin chào")
    #expect(store.touched == ["c-Hôm"])
    // Lượt hai dùng lại cuộc trò chuyện, gửi cả lịch sử.
    await chat.send("Còn ngày mai?", lang: "vi", today: Self.today, tzOffset: -420)
    #expect(stream.calls.last?.0 == 3)
    #expect(chat.conversationId == "c-Hôm")
  }

  @Test func blankOrBusyDoesNothing() async {
    let stream = Stream()
    let chat = CoachChat(userId: "u", stream: stream, store: Store(), edge: nil)
    await chat.send("   ", lang: "vi", today: Self.today, tzOffset: 0)
    #expect(chat.messages.isEmpty)
    #expect(stream.calls.isEmpty)
  }

  @Test func failureIsNamedAndPartialAnswerStays() async {
    let stream = Stream()
    stream.chunks = ["Một nửa"]
    stream.failure = .rateLimited
    let store = Store()
    let chat = CoachChat(userId: "u", stream: stream, store: store, edge: nil)
    await chat.send("Hỏi", lang: "en", today: Self.today, tzOffset: 0)
    #expect(chat.failure == .rateLimited)
    #expect(chat.messages.last?.content == "Một nửa")
    #expect(!chat.isLoading)
    // Như RN: lượt hỏng không lưu phần trả lời dở, chỉ còn câu hỏi.
    #expect(store.saved.map(\.1) == [.user])
    #expect(store.touched.isEmpty)
  }

  @Test func savingIsBestEffort() async {
    let store = Store()
    store.failCreate = true
    let chat = CoachChat(userId: "u", stream: Stream(), store: store, edge: nil)
    await chat.send("Hỏi", lang: "vi", today: Self.today, tzOffset: 0)
    #expect(chat.messages.count == 2)
    #expect(chat.conversationId == nil)
    #expect(store.saved.isEmpty)
  }

  @Test func newChatLearnsOnceFromARealConversation() async {
    let edge = Edgy()
    let chat = CoachChat(userId: "u", stream: Stream(), store: Store(), edge: edge)
    await chat.send("Một", lang: "vi", today: Self.today, tzOffset: 0)
    chat.appBackgrounded()  // một câu hỏi: chưa đáng học
    await chat.send("Hai", lang: "vi", today: Self.today, tzOffset: 0)
    chat.appBackgrounded()
    chat.appBackgrounded()  // không có gì mới: không học lại
    try? await Task.sleep(nanoseconds: 50_000_000)
    #expect(edge.calls.count == 1)
    #expect(edge.calls.first?.0 == .coachMemory)
    chat.newChat()
    #expect(chat.messages.isEmpty)
    #expect(chat.conversationId == nil)
  }

  @Test func openingOldConversationsLateLoadLoses() async {
    let store = Store()
    store.stored = [
      "a": [Coach.Message(id: "1", role: .user, content: "A")],
      "b": [Coach.Message(id: "2", role: .user, content: "B")],
    ]
    store.delayFor = ["a": 80_000_000]
    let chat = CoachChat(userId: "u", stream: Stream(), store: store, edge: nil)
    async let first: Void = chat.open("a")
    try? await Task.sleep(nanoseconds: 10_000_000)
    await chat.open("b")
    await first
    #expect(chat.conversationId == "b")
    #expect(chat.messages.map(\.content) == ["B"])
  }

  @Test func deletingTheOpenConversationStartsFresh() async {
    let store = Store()
    store.list = [Coach.Conversation(id: "c-Hỏi", title: "Hỏi", updatedAt: nil)]
    let chat = CoachChat(userId: "u", stream: Stream(), store: store, edge: nil)
    await chat.send("Hỏi", lang: "vi", today: Self.today, tzOffset: 0)
    await chat.loadHistory()
    await chat.delete("c-Hỏi")
    #expect(store.deleted == ["c-Hỏi"])
    #expect(chat.messages.isEmpty)
    #expect(chat.history == .ready([]))
    store.failDelete = true
    await chat.delete("x")
    #expect(chat.deleteFailed)
  }

  @Test func closedChatIgnoresLateWork() async {
    let chat = CoachChat(userId: "u", stream: Stream(), store: Store(), edge: nil)
    chat.close()
    await chat.send("Hỏi", lang: "vi", today: Self.today, tzOffset: 0)
    #expect(chat.messages.isEmpty)
  }
}

/// `markdown-lite.tsx` @ fac9ac2.
struct MarkdownLiteTests {
  typealias R = MarkdownLite.Run

  @Test func blocksLikeTheRNRenderer() {
    let text = "# Kế hoạch\n## Tuần này\n### Chi tiết\n\n- Ngủ **8 giờ**\n* Uống nước\n1. Squat\n2) Deadlift  \nĐoạn thường"
    #expect(
      MarkdownLite.blocks(text) == [
        .heading(level: 1, [R("Kế hoạch")]),
        .heading(level: 2, [R("Tuần này")]),
        .heading(level: 2, [R("Chi tiết")]),
        .gap,
        .bullet([R("Ngủ "), R("8 giờ", bold: true)]),
        .bullet([R("Uống nước")]),
        .numbered("1", [R("Squat")]),
        .numbered("2", [R("Deadlift")]),
        .paragraph([R("Đoạn thường")]),
      ])
  }

  @Test func notQuiteMarkdownStaysText() {
    // `#chữ` không có khoảng trắng, `-chữ`, `1.chữ`: đoạn thường như regex của RN.
    #expect(MarkdownLite.blocks("#tag") == [.paragraph([R("#tag")])])
    #expect(MarkdownLite.blocks("-5 kg") == [.paragraph([R("-5 kg")])])
    #expect(MarkdownLite.blocks("1.5 lít") == [.paragraph([R("1.5 lít")])])
    #expect(MarkdownLite.blocks("   ") == [.gap])
  }

  @Test func boldPairsOnlyLikeTheSplit() {
    #expect(MarkdownLite.inline("a **b** c **d**") == [R("a "), R("b", bold: true), R(" c "), R("d", bold: true)])
    // `**` lẻ (đang stream giữa chừng) giữ nguyên.
    #expect(MarkdownLite.inline("**đang") == [R("**đang")])
    #expect(MarkdownLite.inline("****") == [R("****")])
    #expect(MarkdownLite.inline("") == [R("")])
  }
}
