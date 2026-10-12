public import Observation

/// Lớp "Trạng thái" của `docs/OFFLINE-POLICY.md` (#161) — port
/// `lib/state-write-core.ts` @ fac9ac2. Dành cho một cờ / một lựa chọn mà chỉ
/// giá trị CUỐI có nghĩa: "đã uống hôm nay" của một thực phẩm bổ sung, dấu
/// tick của danh sách đi chợ.
///
/// Ba luật, mỗi luật là một lỗi cũ của các lệnh ghi:
///
/// - **Giá trị tuyệt đối, không bao giờ "đảo".** `send` nhận giá trị cần ĐẶT;
///   "đặt = true" gửi hai lần vẫn là một kết quả, còn "đảo" gửi hai lần là sai.
/// - **Gộp theo khoá, ý cuối thắng.** Khoá là (thực thể, trường). Tick → bỏ →
///   tick khi mất mạng còn MỘT ý: "đã tick"; tick → bỏ không còn ý nào vì nó
///   trùng giá trị server, và không gửi gì. Hàng đợi bền (outbox) không làm
///   được điều này — nó chỉ giữ "tick", nên tick rồi bỏ tick vẫn ghi là đã uống.
/// - **Mỗi khoá một lượt gửi đang bay, phản hồi cũ không bao giờ ghi đè.** Ý
///   mới đến lúc đang gửi thì đợi lượt ấy xong rồi gửi giá trị mới nhất. Giá
///   trị server chỉ tiến tới đúng giá trị đã thật sự gửi.
///
/// Thực thể đã bị xoá ở nơi khác (`send` trả `.gone`) → bỏ ý và BÁO. Gửi hỏng
/// vì mất mạng → giữ ý tới lần có mạng; hỏng vì lý do khác → bỏ ý và báo.
///
/// Chỉ trong phiên, đúng lựa chọn của chủ dự án: không lưu xuống máy, và câu
/// báo khi một ý phải chờ nói rõ điều đó.
@MainActor
@Observable
public final class StateWriter {
  public enum SendResult: Sendable, Hashable { case ok, gone }

  /// Điều đã xảy ra với một ý vừa ghi.
  public enum Outcome: Sendable, Hashable {
    case sending
    /// Mất mạng, hoặc đang đợi sau một lượt gửi đang bay.
    case queued
    /// Trùng giá trị server — không gửi gì.
    case unchanged
  }

  public typealias Send = @MainActor @Sendable (Bool) async throws -> SendResult

  /// Môi trường: mạng, cách nhận ra lỗi mất mạng, và ba lời báo.
  public struct Environment {
    public var online: @MainActor () -> Bool
    public var isOffline: @MainActor (any Error) -> Bool
    /// Xong theo cách nào đó — đọc lại bản của server.
    public var onSettled: @MainActor (String) -> Void
    public var onGone: @MainActor (String) -> Void
    public var onError: @MainActor (String, any Error) -> Void

    public init(
      online: @escaping @MainActor () -> Bool,
      isOffline: @escaping @MainActor (any Error) -> Bool,
      onSettled: @escaping @MainActor (String) -> Void = { _ in },
      onGone: @escaping @MainActor (String) -> Void = { _ in },
      onError: @escaping @MainActor (String, any Error) -> Void = { _, _ in }
    ) {
      self.online = online
      self.isOffline = isOffline
      self.onSettled = onSettled
      self.onGone = onGone
      self.onError = onError
    }
  }

  private struct Entry {
    var desired: Bool
    var server: Bool
    var send: Send
    var inFlight: Bool
  }

  /// Lời báo vừa có (`stateGone` / lỗi) — màn đọc rồi `clearNotice()`.
  public enum Notice: Sendable, Hashable { case gone, failed }
  public private(set) var notice: Notice?
  public func clearNotice() { notice = nil }

  @ObservationIgnored public var environment: Environment
  @ObservationIgnored private var entries: [String: Entry] = [:]
  /// Đổi mỗi khi một ý đổi — một danh sách đọc nó để dựng lại.
  public private(set) var version = 0

  public init(environment: Environment) {
    self.environment = environment
  }

  /// Ghi một ý: giá trị tuyệt đối cho `key`, so với `server` (giá trị đang
  /// đọc được từ server). Trả điều đã xảy ra với nó.
  @discardableResult
  public func set(key: String, value: Bool, server: Bool, send: @escaping Send) -> Outcome {
    if var e = entries[key] {
      e.desired = value
      e.send = send
      // Không lượt nào đang bay: lần đọc server mới nhất là đúng hơn.
      if !e.inFlight { e.server = server }
      entries[key] = e
    } else {
      entries[key] = Entry(desired: value, server: server, send: send, inFlight: false)
    }
    let entry = entries[key]!
    if entry.inFlight {
      notify()
      return .queued
    }
    if entry.desired == entry.server {
      entries[key] = nil
      notify()
      return .unchanged
    }
    if !environment.online() {
      notify()
      return .queued
    }
    start(key)
    return .sending
  }

  /// Giá trị đang chờ gửi của `key`, nếu có — thứ mục ấy phải HIỆN.
  public func pending(_ key: String) -> Bool? {
    entries[key]?.desired
  }

  /// Có mạng lại: gửi mọi ý còn chờ.
  public func flush() {
    for key in entries.keys.sorted() { start(key) }
  }

  public var size: Int { entries.count }

  /// Đăng xuất: ý thuộc về người đã tạo ra nó.
  public func clear() {
    entries.removeAll()
    notify()
  }

  private func notify() { version &+= 1 }

  private func start(_ key: String) {
    guard var e = entries[key], !e.inFlight else { return }
    if e.desired == e.server {
      entries[key] = nil
      notify()
      return
    }
    guard environment.online() else { return }
    e.inFlight = true
    entries[key] = e
    let sent = e.desired
    let send = e.send
    notify()
    Task { @MainActor in
      do {
        let result = try await send(sent)
        self.finished(key, sent: sent, result: result)
      } catch {
        self.failed(key, error)
      }
    }
  }

  private func finished(_ key: String, sent: Bool, result: SendResult) {
    guard var e = entries[key] else { return }
    e.inFlight = false
    if result == .gone {
      entries[key] = nil
      notify()
      notice = .gone
      environment.onGone(key)
      environment.onSettled(key)
      return
    }
    e.server = sent
    entries[key] = e
    // Một ý mới hơn đến trong lúc bay: gửi nó ngay, thay vì để phản hồi này
    // quyết định mục ấy hiện gì.
    if e.desired != e.server {
      start(key)
      return
    }
    entries[key] = nil
    notify()
    environment.onSettled(key)
  }

  private func failed(_ key: String, _ error: any Error) {
    guard var e = entries[key] else { return }
    e.inFlight = false
    if environment.isOffline(error) {
      entries[key] = e
      notify()
      return
    }
    entries[key] = nil
    notify()
    notice = .failed
    environment.onError(key, error)
    environment.onSettled(key)
  }
}
