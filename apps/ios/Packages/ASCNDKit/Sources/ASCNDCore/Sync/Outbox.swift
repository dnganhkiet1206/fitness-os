/// Một bản ghi lớp Ghi nhận đang chờ gửi.
public struct OutboxEntry: Sendable, Hashable, Codable, Identifiable {
  /// Idempotency key: sinh MỘT lần lúc tạo bản ghi, đi theo mọi lần gửi lại.
  /// Server bỏ trùng bằng nó (`onConflict: 'id', ignoreDuplicates`) — ADR-0003.
  public let id: String
  /// Chủ bản ghi. Không bao giờ được gửi dưới phiên của người khác.
  public let userId: String
  /// Loại bản ghi: `water`, `workout`, `weight`, `meal`, `sleep`,
  /// `measurement`, `biometrics` (baseline `KNOWN_KINDS`).
  public let kind: String
  public let payload: JSONValue
  public let createdAt: EpochMillis

  public internal(set) var history = FailureHistory()
  /// Sớm nhất được gửi lại lúc nào; `nil` = gửi ngay.
  public internal(set) var notBefore: EpochMillis?
  /// Lần lỗi trước là mất mạng: chờ có mạng rồi mới gửi.
  public internal(set) var needsNetwork = false

  public init(id: String, userId: String, kind: String, payload: JSONValue, createdAt: EpochMillis) {
    self.id = id
    self.userId = userId
    self.kind = kind
    self.payload = payload
    self.createdAt = createdAt
  }
}

/// Bản ghi đã rời hàng đợi mà không tới được server. Chỉ trên máy, không gửi
/// lại — để chẩn đoán (ADR-0003 §7; baseline vứt đi).
public struct DeadEntry: Sendable, Hashable, Codable {
  public enum Reason: String, Sendable, Hashable, Codable {
    /// Server hoặc dữ liệu từ chối; hỏi lại không đổi được gì.
    case refused
    /// Hết ngân sách thử lại cho lỗi tạm thời.
    case exhausted
    /// Thuộc tài khoản khác phiên hiện tại.
    case wrongAccount
  }

  public let entry: OutboxEntry
  public let reason: Reason
  public let failure: WriteFailure?
  public let at: EpochMillis
}

extension WriteFailure: Codable {
  private enum CodingKeys: String, CodingKey { case type, code }

  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    switch try c.decode(String.self, forKey: .type) {
    case "offline": self = .offline
    case "server": self = .server(code: try c.decodeIfPresent(String.self, forKey: .code))
    case "wrongAccount": self = .wrongAccount
    default: self = .unusable
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .offline: try c.encode("offline", forKey: .type)
    case .server(let code):
      try c.encode("server", forKey: .type)
      try c.encodeIfPresent(code, forKey: .code)
    case .wrongAccount: try c.encode("wrongAccount", forKey: .type)
    case .unusable: try c.encode("unusable", forKey: .type)
    }
  }
}

/// Hàng đợi lớp Ghi nhận: MỘT làn tuần tự, đúng thứ tự tạo (baseline
/// `scope: offline-write`). Hai lần ghi cùng `(user_id, date)` phải tới server
/// theo thứ tự, nếu không giá trị sai thắng.
///
/// Giá trị thuần: không I/O, không giờ hệ thống. `ASCNDStore` lưu nó, worker
/// gửi hỏi nó `next(...)` rồi báo lại `succeeded` / `failed`.
public struct Outbox: Sendable, Hashable, Codable {
  public private(set) var pending: [OutboxEntry] = []
  public private(set) var dead: [DeadEntry] = []
  /// Bản ghi đang được gửi. Không lưu xuống đĩa: app chết giữa chừng thì lần
  /// mở sau gửi lại — vô hại, server bỏ trùng theo `id`.
  public private(set) var inFlight: String?

  public init() {}

  private enum CodingKeys: String, CodingKey { case pending, dead }

  public enum Next: Sendable, Hashable {
    /// Gửi bản ghi này (đã đánh dấu đang gửi).
    case send(OutboxEntry)
    /// Đầu hàng chưa tới lúc gửi lại.
    case wait(until: EpochMillis)
    /// Đầu hàng chờ có mạng.
    case waitForNetwork
    /// Đang có một lượt gửi chưa xong.
    case busy
    /// Không có gì để gửi (hàng rỗng, hoặc chưa đăng nhập).
    case idle
  }

  public mutating func enqueue(_ entry: OutboxEntry) {
    guard !pending.contains(where: { $0.id == entry.id }) else { return }
    pending.append(entry)
  }

  /// Việc kế tiếp. Chỉ nhìn ĐẦU hàng — làn tuần tự. Bản ghi của tài khoản
  /// khác ở đầu hàng bị chuyển sang `dead` ngay (như `WrongAccountError`,
  /// lỗi vĩnh viễn) để không chặn những bản ghi sau nó.
  public mutating func next(now: EpochMillis, online: Bool, signedInUser: String?) -> Next {
    if inFlight != nil { return .busy }
    guard let user = signedInUser else { return .idle }
    while let head = pending.first, head.userId != user {
      pending.removeFirst()
      dead.append(DeadEntry(entry: head, reason: .wrongAccount, failure: .wrongAccount, at: now))
    }
    guard let head = pending.first else { return .idle }
    if head.needsNetwork && !online { return .waitForNetwork }
    if let t = head.notBefore, now < t { return .wait(until: t) }
    if !online { return .waitForNetwork }
    inFlight = head.id
    return .send(head)
  }

  public mutating func succeeded(id: String) {
    guard inFlight == id else { return }
    inFlight = nil
    pending.removeAll { $0.id == id }
  }

  public enum FailureOutcome: Sendable, Hashable {
    case willRetry(notBefore: EpochMillis, needsNetwork: Bool)
    case dead(DeadEntry.Reason)
  }

  /// Báo lượt gửi `id` thất bại. Bản ghi giữ vị trí đầu hàng nếu còn gửi lại.
  @discardableResult
  public mutating func failed(id: String, _ failure: WriteFailure, now: EpochMillis) -> FailureOutcome? {
    guard inFlight == id, let i = pending.firstIndex(where: { $0.id == id }) else { return nil }
    inFlight = nil
    var entry = pending[i]
    switch entry.history.record(failure) {
    case .retry(let delay, let needsNetwork):
      entry.notBefore = now + delay
      entry.needsNetwork = needsNetwork
      pending[i] = entry
      return .willRetry(notBefore: now + delay, needsNetwork: needsNetwork)
    case .giveUp(let permanent):
      pending.remove(at: i)
      let reason: DeadEntry.Reason = failure == .wrongAccount ? .wrongAccount : (permanent ? .refused : .exhausted)
      dead.append(DeadEntry(entry: entry, reason: reason, failure: failure, at: now))
      return .dead(reason)
    }
  }

  /// Đăng xuất: xoá hàng đợi như baseline (`clearPersistedCache`, #241 chờ
  /// Kiệt). Trả về số bản ghi bị bỏ — để có thể báo, nếu #241 chọn (c).
  @discardableResult
  public mutating func dropAllOnSignOut() -> Int {
    let n = pending.count
    pending.removeAll()
    inFlight = nil
    return n
  }
}
