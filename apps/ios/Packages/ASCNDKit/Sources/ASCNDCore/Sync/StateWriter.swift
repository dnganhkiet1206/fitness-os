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
/// Ý chờ gửi ĐƯỢC LƯU XUỐNG MÁY (AUD-29): tắt app giữa chừng rồi mở lại thì ý
/// vẫn còn — `pending()` vẫn hiện nó, và màn của chủ nó gắn lại `send`
/// (`adopt`) khi mở, rồi gửi khi có mạng (`flush()` khi có mạng lại). `send`
/// là closure nên không lưu được: ý khôi phục từ đĩa chưa có `send`, và
/// `start` bỏ qua nó tới khi chủ nó nhận lại. Đăng xuất vẫn bỏ mọi ý — cả
/// trong bộ nhớ lẫn trên đĩa: ý thuộc về người đã tạo ra nó, và khoá không
/// mang `userId` nên không được sống sang phiên khác.
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
    /// `nil` = ý khôi phục từ đĩa, chưa có ai nhận lại (`adopt`).
    var send: Send?
    var inFlight: Bool
  }

  /// Lời báo vừa có (`stateGone` / lỗi) — màn đọc rồi `clearNotice()`.
  public enum Notice: Sendable, Hashable { case gone, failed }
  public private(set) var notice: Notice?
  public func clearNotice() { notice = nil }

  @ObservationIgnored public var environment: Environment
  @ObservationIgnored private var entries: [String: Entry] = [:]
  @ObservationIgnored private var persistence: (any StateIntentPersistence)?
  /// Lần lưu / nạp gần nhất hỏng — ý trong bộ nhớ vẫn đúng, nhưng đĩa đang đi
  /// sau; lần lưu sau thử lại. `false` khi chưa gắn nơi lưu nào.
  public private(set) var persistenceFailed = false
  /// Đổi mỗi khi một ý đổi — một danh sách đọc nó để dựng lại.
  public private(set) var version = 0

  public init(environment: Environment) {
    self.environment = environment
  }

  /// Gắn nơi lưu bền rồi nạp các ý còn lại từ lần mở app trước. Nạp hỏng thì
  /// bắt đầu với bộ nhớ trống — trong phiên vẫn đúng như cũ, chỉ là ý cũ mất.
  public func attachPersistence(_ persistence: any StateIntentPersistence) {
    self.persistence = persistence
    restore()
  }

  /// Nạp lại các ý trên đĩa, GỘP vào các ý đang có: ý đang sống trong bộ nhớ
  /// thắng ý trên đĩa cùng khoá (nó mới hơn — `set` sau lần lưu cuối, hay lần
  /// lưu cuối hỏng). Ý nạp về chưa có `send`; chủ nó gắn lại bằng `adopt`.
  /// Nạp hỏng thì giữ nguyên bộ nhớ và đặt `persistenceFailed`.
  public func restore() {
    guard let persistence else { return }
    let loaded: [StateIntent]
    do {
      loaded = try persistence.load()
    } catch {
      persistenceFailed = true
      return
    }
    var added = false
    for intent in loaded where entries[intent.key] == nil {
      entries[intent.key] = Entry(desired: intent.desired, server: intent.server, send: nil, inFlight: false)
      added = true
    }
    // Lưu lại hợp nhất (ý đang sống có thể mới hơn đĩa). Trống hoàn toàn
    // thì khỏi lưu — lúc chưa ai đăng nhập, lưu cũng bị chốt từ chối.
    if !entries.isEmpty { persist() }
    // `persist()` đã đặt `persistenceFailed` theo kết quả lưu.
    if added { notify() }
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
    persist()
    let entry = entries[key]!
    if entry.inFlight {
      notify()
      return .queued
    }
    if entry.desired == entry.server {
      entries[key] = nil
      persist()
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

  /// Mọi khoá đang có ý chờ gửi — chủ một nhóm khoá liệt kê để nhận lại /
  /// dọn ý hết hạn. Sắp xếp để thứ tự gửi ổn định.
  public var pendingKeys: [String] { entries.keys.sorted() }

  /// Nhận lại một ý đã khôi phục từ đĩa: gắn `send` của chủ nó và giá trị
  /// server vừa đọc. Chỉ nhận ý CHƯA có `send` — ý đang sống thuộc về `set`,
  /// không ai được cướp `send` của nó. `server == nil` = không biết giá trị
  /// server (món ngoài danh sách đã đọc): luôn gửi, vì lệnh ghi là tuyệt đối
  /// nên gửi lại giá trị đã có cũng vô hại. Trả `false` khi không có ý nào
  /// để nhận — không bao giờ tạo ý mới từ một lần nhận.
  ///
  /// Ý vừa nhận mà đã trùng giá trị server mới thì bỏ ngay, không gửi.
  /// Có mạng thì gửi ngay; không thì đợi `flush()` khi có mạng lại.
  @discardableResult
  public func adopt(key: String, server: Bool?, send: @escaping Send) -> Bool {
    guard var e = entries[key], e.send == nil, !e.inFlight else { return false }
    e.send = send
    if let server { e.server = server }
    entries[key] = e
    persist()
    if let server, e.desired == server {
      entries[key] = nil
      persist()
      notify()
      return true
    }
    if environment.online() {
      start(key)
    } else {
      notify()
    }
    return true
  }

  /// Bỏ một ý — chủ nó dọn ý đã hết hạn (khoá mang ngày đã qua). Trả `false`
  /// khi khoá không có ý nào.
  @discardableResult
  public func remove(key: String) -> Bool {
    guard entries[key] != nil else { return false }
    entries[key] = nil
    persist()
    notify()
    return true
  }

  /// Có mạng lại: gửi mọi ý còn chờ. Ý khôi phục từ đĩa mà chưa ai nhận lại
  /// (chưa có `send`) thì đứng yên — chủ nó gắn `send` khi màn của nó mở.
  public func flush() {
    for key in entries.keys.sorted() { start(key) }
  }

  public var size: Int { entries.count }

  /// Đăng xuất: ý thuộc về người đã tạo ra nó — bỏ cả trong bộ nhớ lẫn trên
  /// đĩa, để ý của người này không sống sang phiên của người khác.
  public func clear() {
    entries.removeAll()
    persist()
    notify()
  }

  private func notify() { version &+= 1 }

  /// Ảnh của mọi ý đang có, để lưu xuống đĩa. Lượt đang bay không lưu cờ bay:
  /// app chết giữa chừng thì lần mở sau gửi lại — vô hại, vì lệnh ghi tuyệt
  /// đối và server bỏ trùng.
  private var snapshot: [StateIntent] {
    entries.map { StateIntent(key: $0.key, desired: $0.value.desired, server: $0.value.server) }
      .sorted { $0.key < $1.key }
  }

  /// Đẩy ảnh hiện tại xuống đĩa. Hỏng thì chỉ đặt cờ — ý trong bộ nhớ vẫn
  /// đúng, lần lưu sau thử lại; không bao giờ làm hỏng một lần ghi vì đĩa.
  private func persist() {
    guard let persistence else { return }
    do {
      try persistence.save(snapshot)
      persistenceFailed = false
    } catch {
      persistenceFailed = true
    }
  }

  private func start(_ key: String) {
    guard var e = entries[key], !e.inFlight, let send = e.send else { return }
    if e.desired == e.server {
      entries[key] = nil
      persist()
      notify()
      return
    }
    guard environment.online() else { return }
    e.inFlight = true
    entries[key] = e
    let sent = e.desired
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
      persist()
      notify()
      notice = .gone
      environment.onGone(key)
      environment.onSettled(key)
      return
    }
    e.server = sent
    entries[key] = e
    persist()
    // Một ý mới hơn đến trong lúc bay: gửi nó ngay, thay vì để phản hồi này
    // quyết định mục ấy hiện gì.
    if e.desired != e.server {
      start(key)
      return
    }
    entries[key] = nil
    persist()
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
    persist()
    notify()
    notice = .failed
    environment.onError(key, error)
    environment.onSettled(key)
  }
}

/// Một ý đang chờ gửi, ở dạng lưu được xuống đĩa: khoá, giá trị muốn đặt, và
/// giá trị server lúc ý ấy được ghi. `send` không lưu được (closure) — ý nạp
/// về phải đợi chủ nó `adopt`.
public struct StateIntent: Sendable, Hashable, Codable {
  public let key: String
  public var desired: Bool
  public var server: Bool

  public init(key: String, desired: Bool, server: Bool) {
    self.key = key
    self.desired = desired
    self.server = server
  }
}

/// Nơi giữ các ý đang chờ gửi của `StateWriter` trên đĩa. `ASCNDStore`
/// hiện thực bằng GRDB.
///
/// - `load` trả các ý của tài khoản đang đăng nhập; không ai đăng nhập thì
///   trả rỗng — không bao giờ trả ý của người khác.
/// - `save` ghi đè TOÀN BỘ ảnh của tài khoản đang đăng nhập (xoá hàng cũ của
///   họ rồi ghi hàng mới). `save([])` là xoá sạch — `clear()` lúc đăng xuất.
/// - Cả hai chạy đồng bộ trên main actor, sau mỗi lần ý đổi: phải nhanh
///   (bảng chỉ có vài hàng) và không được ném vì lý do thường gặp — ném thì
///   `StateWriter` chỉ đặt `persistenceFailed` và lần sau thử lại.
public protocol StateIntentPersistence: Sendable {
  func load() throws -> [StateIntent]
  func save(_ intents: [StateIntent]) throws
}
