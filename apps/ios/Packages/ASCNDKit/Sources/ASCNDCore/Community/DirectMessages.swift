public import Foundation
public import Observation

/// Nhắn tin giữa người dùng (15/10, chủ dự án duyệt mock: hộp thư + hội thoại).
/// Server CHƯA có (xem `docs/design/community/MESSAGING-PLAN.md`): lõi chỉ nói
/// chuyện với `DMSource`; bản Debug cắm nguồn giả sau cờ `ASCND_FAKE_DM=1`, bản
/// thật không có nguồn → app không hiện lối vào nào.
public enum DirectMessages {
  public struct Thread: Sendable, Hashable, Identifiable {
    public let id: String
    public let other: CommunityFeed.Author
    public var lastText: String
    public var lastAt: EpochMillis
    /// Tin cuối do mình gửi ("Bạn: …").
    public var lastFromMe: Bool
    public var unread: Bool
    /// Tin chờ: người lạ (mình chưa theo dõi) nhắn trước.
    public var isRequest: Bool
    /// "Đang tập · Chest day" — vòng hồng quanh avatar.
    public var training: String?

    public init(
      id: String, other: CommunityFeed.Author, lastText: String, lastAt: EpochMillis, lastFromMe: Bool,
      unread: Bool, isRequest: Bool, training: String?
    ) {
      self.id = id
      self.other = other
      self.lastText = lastText
      self.lastAt = lastAt
      self.lastFromMe = lastFromMe
      self.unread = unread
      self.isRequest = isRequest
      self.training = training
    }
  }

  /// Buổi tập gửi vào hội thoại (bảng điểm thu nhỏ).
  public struct SharedWorkout: Sendable, Hashable {
    public let title: String
    public let volumeKg: Double
    public let exerciseCount: Int
    public let minutes: Int?
    public let pr: Bool

    public init(title: String, volumeKg: Double, exerciseCount: Int, minutes: Int?, pr: Bool) {
      self.title = title
      self.volumeKg = volumeKg
      self.exerciseCount = exerciseCount
      self.minutes = minutes
      self.pr = pr
    }
  }

  public enum Body: Sendable, Hashable {
    case text(String)
    case workout(SharedWorkout)
  }

  public struct Message: Sendable, Hashable, Identifiable {
    public let id: String
    public let senderId: String
    public let body: Body
    public let at: EpochMillis
    public var readAt: EpochMillis?

    public init(id: String, senderId: String, body: Body, at: EpochMillis, readAt: EpochMillis? = nil) {
      self.id = id
      self.senderId = senderId
      self.body = body
      self.at = at
      self.readAt = readAt
    }
  }

  /// Một hàng của màn hội thoại: vạch ngày, hoặc bong bóng (+ "Đã xem" dưới tin
  /// cuối cùng của mình đã được đọc).
  public enum Row: Sendable, Hashable, Identifiable {
    case day(LocalDate)
    case message(Message, mine: Bool, seen: Bool)

    public var id: String {
      switch self {
      case .day(let d): "d:\(d)"
      case .message(let m, _, _): "m:\(m.id)"
      }
    }
  }

  public static let maxLength = 1000

  /// Chữ gửi được: bỏ khoảng trắng hai đầu; rỗng → `nil`; quá dài → cắt.
  public static func sendable(_ draft: String) -> String? {
    let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { return nil }
    return String(t.prefix(maxLength))
  }

  /// Hàng của hội thoại theo thời gian: vạch ngày khi đổi ngày (giờ máy); "Đã xem"
  /// chỉ dưới tin CUỐI của mình đã đọc — không lặp ở mọi tin.
  public static func rows(_ messages: [Message], me: String, timeZone: TimeZone) -> [Row] {
    let sorted = messages.sorted { $0.at < $1.at }
    let lastSeen = sorted.last { $0.senderId == me && $0.readAt != nil }?.id
    var out: [Row] = []
    var day: LocalDate?
    for m in sorted {
      let d = LocalDate(m.at, in: timeZone)
      if d != day {
        out.append(.day(d))
        day = d
      }
      out.append(.message(m, mine: m.senderId == me, seen: m.id == lastSeen))
    }
    return out
  }

  /// Hộp thư: mới nhất trước; tin chờ tách riêng.
  public static func split(_ threads: [Thread]) -> (main: [Thread], requests: [Thread]) {
    let s = threads.sorted { $0.lastAt > $1.lastAt }
    return (s.filter { !$0.isRequest }, s.filter(\.isRequest))
  }

  /// Lọc theo tên / @handle, không phân biệt dấu và hoa thường.
  public static func filter(_ threads: [Thread], query: String) -> [Thread] {
    let q = fold(query)
    guard !q.isEmpty else { return threads }
    return threads.filter { fold($0.other.displayName).contains(q) || fold($0.other.handle).contains(q) }
  }

  static func fold(_ s: String) -> String {
    s.trimmingCharacters(in: .whitespaces)
      .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en"))
      .replacingOccurrences(of: "đ", with: "d")
  }
}

public protocol DMSource: Sendable {
  func threads(userId: String) async throws -> [DirectMessages.Thread]
  func messages(threadId: String) async throws -> [DirectMessages.Message]
  func send(threadId: String, from userId: String, body: DirectMessages.Body) async throws -> DirectMessages.Message
  /// Mở (hoặc tạo) hội thoại với một người — từ trang cá nhân.
  func open(with other: CommunityFeed.Author, userId: String) async throws -> DirectMessages.Thread
  func markRead(threadId: String, userId: String) async throws
}

/// Đánh dấu một nguồn là dữ liệu mẫu (nguồn giả của bản Debug).
public protocol DMSampleSource: DMSource {}

/// Hộp thư.
@MainActor
@Observable
public final class DMInboxBook {
  public enum Phase: Sendable, Hashable { case loading, ready, failed }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var threads: [DirectMessages.Thread] = []
  @ObservationIgnored private let source: any DMSource
  /// Nguồn là dữ liệu mẫu (bản Debug) — màn hiện nhãn "Dữ liệu mẫu"; nguồn thật thì không.
  public let isSample: Bool

  public init(userId: String, source: any DMSource) {
    self.userId = userId
    self.source = source
    self.isSample = source is any DMSampleSource
  }

  public var unreadCount: Int { threads.filter { $0.unread && !$0.isRequest }.count }

  public func load() async {
    do {
      threads = try await source.threads(userId: userId)
      phase = .ready
    } catch {
      if threads.isEmpty { phase = .failed }
    }
  }

  public func open(with other: CommunityFeed.Author) async -> DirectMessages.Thread? {
    guard let t = try? await source.open(with: other, userId: userId) else { return nil }
    if !threads.contains(where: { $0.id == t.id }) { threads.append(t) }
    return t
  }

  public func thread(_ t: DirectMessages.Thread) -> DMThreadBook {
    DMThreadBook(userId: userId, thread: t, source: source) { [weak self] updated in
      guard let self, let i = self.threads.firstIndex(where: { $0.id == updated.id }) else { return }
      self.threads[i] = updated
    }
  }
}

/// Một hội thoại.
@MainActor
@Observable
public final class DMThreadBook {
  public enum Phase: Sendable, Hashable { case loading, ready, failed }

  public let userId: String
  public private(set) var thread: DirectMessages.Thread
  public private(set) var phase: Phase = .loading
  public private(set) var messages: [DirectMessages.Message] = []
  public private(set) var sending = false
  public private(set) var sendFailed = false
  @ObservationIgnored private let source: any DMSource
  @ObservationIgnored private let changed: @MainActor (DirectMessages.Thread) -> Void

  public init(
    userId: String, thread: DirectMessages.Thread, source: any DMSource,
    changed: @escaping @MainActor (DirectMessages.Thread) -> Void = { _ in }
  ) {
    self.userId = userId
    self.thread = thread
    self.source = source
    self.changed = changed
  }

  public func rows(timeZone: TimeZone) -> [DirectMessages.Row] {
    DirectMessages.rows(messages, me: userId, timeZone: timeZone)
  }

  public func load() async {
    do {
      messages = try await source.messages(threadId: thread.id)
      phase = .ready
      if thread.unread {
        try? await source.markRead(threadId: thread.id, userId: userId)
        thread.unread = false
        changed(thread)
      }
    } catch {
      if messages.isEmpty { phase = .failed }
    }
  }

  /// Gửi chữ (đã qua `sendable`) hoặc buổi tập. `true` khi đã gửi.
  @discardableResult
  public func send(_ body: DirectMessages.Body) async -> Bool {
    if case .text(let t) = body, DirectMessages.sendable(t) == nil { return false }
    guard !sending else { return false }
    sending = true
    sendFailed = false
    defer { sending = false }
    let clean: DirectMessages.Body =
      if case .text(let t) = body { .text(DirectMessages.sendable(t) ?? t) } else { body }
    do {
      let m = try await source.send(threadId: thread.id, from: userId, body: clean)
      messages.append(m)
      thread.lastAt = m.at
      thread.lastFromMe = true
      thread.isRequest = false
      if case .text(let t) = clean { thread.lastText = t }
      changed(thread)
      return true
    } catch {
      sendFailed = true
      return false
    }
  }
}

extension CommunityFeed.Author {
  /// Dựng tác giả ngoài lõi (nguồn nhắn tin giả của bản Debug).
  public init(userId: String, handle: String, displayName: String, mascotId: String?) {
    self.init(userId: userId, handle: handle, displayName: displayName, mascotId: mascotId, isOfficial: false, bio: nil)
  }
}

// MARK: - Đọc hàng của server (`20261020130000_direct_messages.sql`)

extension DirectMessages {
  /// Hộp thư từ `dm_inbox()` + hồ sơ người kia (`community_profiles`). Hàng thiếu
  /// hồ sơ (người kia đã xoá hồ sơ cộng đồng) bị bỏ — không có tên để hiện.
  public static func threads(inbox: [JSONValue], profiles: [JSONValue]) -> [Thread] {
    var byId: [String: CommunityFeed.Author] = [:]
    for p in profiles { if let a = CommunityFeed.author(p) { byId[a.userId] = a } }
    return inbox.compactMap { r in
      guard let id = r["thread_id"]?.stringValue, let other = r["other_id"]?.stringValue,
        let author = byId[other]
      else { return nil }
      return Thread(
        id: id, other: author, lastText: r["last_text"]?.stringValue ?? "",
        lastAt: r["last_at"]?.stringValue.flatMap { EpochMillis(iso8601: $0) } ?? EpochMillis(0),
        lastFromMe: r["last_from_me"] == .bool(true), unread: r["unread"] == .bool(true),
        isRequest: r["is_request"] == .bool(true), training: nil)
    }
  }

  /// Một tin từ `dm_messages` / `dm_send`.
  public static func message(_ r: JSONValue) -> Message? {
    guard let id = r["id"]?.stringValue, let sender = r["sender_id"]?.stringValue,
      let at = r["created_at"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
    else { return nil }
    let body: Body
    if case .object? = r["workout"], let w = r["workout"] {
      let minutes = JS.number(w["minutes"])
      body = .workout(SharedWorkout(
        title: w["title"]?.stringValue ?? "", volumeKg: JS.number(w["volume_kg"]).isFinite ? JS.number(w["volume_kg"]) : 0,
        exerciseCount: Int(JS.number(w["exercises"]).isFinite ? JS.number(w["exercises"]) : 0),
        minutes: minutes.isFinite && minutes > 0 ? Int(minutes) : nil, pr: w["pr"] == .bool(true)))
    } else {
      body = .text(r["body"]?.stringValue ?? "")
    }
    return Message(
      id: id, senderId: sender, body: body, at: at,
      readAt: r["read_at"]?.stringValue.flatMap { EpochMillis(iso8601: $0) })
  }

  /// Buổi tập gửi đi → `workout` jsonb của `dm_send`.
  public static func workoutJSON(_ w: SharedWorkout) -> JSONValue {
    var o: [String: JSONValue] = [
      "title": .string(w.title), "volume_kg": .number(w.volumeKg), "exercises": .number(Double(w.exerciseCount)),
      "pr": .bool(w.pr),
    ]
    if let m = w.minutes { o["minutes"] = .number(Double(m)) }
    return .object(o)
  }
}
