public import Observation

/// Có mạng hay không — và cái khoảng ở giữa (#527 Phase 1 · 1.11).
///
/// Port của `native/src/lib/net-status.ts`. Golden (`NetStatusGoldenTests`) là
/// output của CHÍNH mã RN chạy trên đồng hồ ảo, nên Swift phải đổi trạng thái ở
/// đúng các mốc mili giây RN đổi.
///
/// Ba trạng thái, không phải hai:
/// - `offline` — CHẮC CHẮN không dùng được mạng;
/// - `reconnecting` — mạng vừa về, app đang lấy lại phần đã lỡ;
/// - `online` — đã bắt kịp.
public enum NetStatus: String, Sendable, Hashable, Codable {
  case online, offline, reconnecting
}

public enum NetReachability {
  /// Mạng có DÙNG ĐƯỢC không (`isUsable` của RN). Chỉ báo mất mạng khi có câu
  /// trả lời DỨT KHOÁT là không: `nil` là chưa biết, và chưa biết thì không
  /// kết tội — không thì mỗi lần mở app nháy một cảnh báo sai.
  public static func isUsable(connected: Bool?, internetReachable: Bool?) -> Bool {
    if connected == false { return false }
    if internetReachable == false { return false }
    return true
  }
}

/// Bộ hẹn giờ của máy trạng thái — tách ra để test chạy trên đồng hồ ảo với
/// ĐÚNG hằng số của app (một hằng số chỉ tồn tại ở giá trị khác khi đang bị
/// kiểm là một hằng số chưa từng được kiểm).
@MainActor
public protocol NetTimers: AnyObject {
  /// Gọi `fire` một lần sau `millis`.
  func after(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken
  /// Gọi `fire` mỗi `millis` (lần đầu sau `millis`), như `setInterval`.
  func every(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken
  func cancel(_ token: NetTimerToken)
}

public struct NetTimerToken: Hashable, Sendable {
  public let id: Int
  public init(id: Int) { self.id = id }
}

/// Máy trạng thái ba nhánh (`applyNetInfo` / `beginReconnect` của RN).
@MainActor @Observable
public final class NetStatusMonitor {
  /// Trần cứng của "đang kết nối lại": một lượt tải treo không được giữ dải
  /// báo ở lại mãi (`RECONNECT_CAP_MS`).
  public static let reconnectCapMillis: Int64 = 12_000
  /// Sàn hiển thị: không có thì dải báo loé lên rồi tắt trước khi ai đọc kịp,
  /// và câu hỏi "còn gì đang tải" bị hỏi trước khi các lượt tải kịp bắt đầu
  /// (`RECONNECT_MIN_MS`).
  public static let reconnectMinMillis: Int64 = 600
  /// Nhịp hỏi "đã tải xong chưa" sau sàn (`SETTLE_POLL_MS`).
  public static let settlePollMillis: Int64 = 250

  public private(set) var status: NetStatus = .online

  /// "App còn đang tải phần đã lỡ không" — app đăng ký (`registerBusyProbe`).
  /// `nil` thì không có cách biết đã xong: về online ngay còn hơn kẹt ở một
  /// nhãn không bao giờ đổi.
  @ObservationIgnored public var busyProbe: (@MainActor () -> Bool)?
  /// Gọi mỗi lần trạng thái đổi.
  @ObservationIgnored public var onChange: (@MainActor (NetStatus) -> Void)?

  @ObservationIgnored private let timers: any NetTimers
  @ObservationIgnored private var settleTimer: NetTimerToken?
  @ObservationIgnored private var capTimer: NetTimerToken?
  @ObservationIgnored private var floorTimer: NetTimerToken?

  public init(timers: any NetTimers = TaskNetTimers()) {
    self.timers = timers
  }

  /// Một phép đo đi vào, trạng thái app đi ra.
  public func apply(connected: Bool?, internetReachable: Bool?) {
    apply(usable: NetReachability.isUsable(connected: connected, internetReachable: internetReachable))
  }

  public func apply(usable: Bool) {
    guard usable else {
      stopSettleWatch()
      emit(.offline)
      return
    }
    // Chỉ CHUYỂN TỪ mất mạng lên mới là "kết nối lại". Mạng vẫn tốt mà có một
    // phép đo nữa thì không có gì để bắt kịp.
    if status == .offline { beginReconnect() }
    // đang `reconnecting` — tự thoát khi tải xong hoặc hết trần.
  }

  private func emit(_ next: NetStatus) {
    guard next != status else { return }
    status = next
    onChange?(next)
  }

  private func stopSettleWatch() {
    for t in [settleTimer, capTimer, floorTimer].compactMap({ $0 }) { timers.cancel(t) }
    settleTimer = nil
    capTimer = nil
    floorTimer = nil
  }

  private func beginReconnect() {
    stopSettleWatch()
    emit(.reconnecting)
    guard busyProbe != nil else {
      emit(.online)
      return
    }
    // Nhịp dò chỉ BẮT ĐẦU sau sàn, nên dải báo không thể tắt sớm hơn nó.
    floorTimer = timers.after(Self.reconnectMinMillis) { [weak self] in
      guard let self else { return }
      self.floorTimer = nil
      guard self.status == .reconnecting else { return }
      self.settled()
      if self.status == .reconnecting {
        self.settleTimer = self.timers.every(Self.settlePollMillis) { [weak self] in self?.settled() }
      }
    }
    capTimer = timers.after(Self.reconnectCapMillis) { [weak self] in
      guard let self else { return }
      self.stopSettleWatch()
      if self.status == .reconnecting { self.emit(.online) }
    }
  }

  private func settled() {
    guard status == .reconnecting else {
      stopSettleWatch()
      return
    }
    if !(busyProbe?() ?? false) {
      stopSettleWatch()
      emit(.online)
    }
  }
}

/// Hẹn giờ thật trên `Task.sleep`, chạy ở main actor.
@MainActor
public final class TaskNetTimers: NetTimers {
  private var tasks: [Int: Task<Void, Never>] = [:]
  private var nextId = 1

  public init() {}

  public func after(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken {
    schedule { [weak self] id in
      try? await Task.sleep(for: .milliseconds(millis))
      guard !Task.isCancelled else { return }
      self?.tasks[id] = nil
      fire()
    }
  }

  public func every(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken {
    schedule { _ in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(millis))
        guard !Task.isCancelled else { return }
        fire()
      }
    }
  }

  public func cancel(_ token: NetTimerToken) {
    tasks.removeValue(forKey: token.id)?.cancel()
  }

  private func schedule(_ body: @escaping @MainActor (Int) async -> Void) -> NetTimerToken {
    let id = nextId
    nextId += 1
    tasks[id] = Task { @MainActor in await body(id) }
    return NetTimerToken(id: id)
  }
}
