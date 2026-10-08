public import Observation

/// "Mạng ấy có ra được internet không" — port của NetInfo 12
/// (`internetReachability.ts` + `state.ts`), thứ app RN chạy trên iOS (#530).
///
/// iOS (`NWPath`, như `RNCNetInfo`) chỉ trả lời "có nối vào một mạng không".
/// Wi-Fi quán cà phê chưa bấm đồng ý, khách sạn bắt đăng nhập, 4G hết dung
/// lượng đều là "có nối". NetInfo trả lời câu thứ hai bằng một phép DÒ: HEAD
/// tới generate_204, chỉ mã 204 mới là có internet — cổng đăng nhập trả trang
/// HTML (200 / chuyển hướng) nên đọc ra KHÔNG. Ở đây là đúng phép dò ấy, cùng
/// nhịp:
/// - dò khi đường mạng đổi (Wi-Fi ↔ 4G, mất / có sóng), huỷ phép đang bay;
/// - một phép dò quá 15 s là không có internet (timeout);
/// - có internet → dò lại sau 60 s; không → sau 5 s;
/// - đang có internet mà đường mạng đổi thì KHÔNG về "chưa biết" (không nháy
///   dải báo khi chuyển Wi-Fi sang 4G); trước đó không có thì về "chưa biết".
///
/// Golden (`NetStatusGoldenTests.netInfoMatchesRN`) là output của CHÍNH mã
/// NetInfo trong `native/node_modules` chạy trên đồng hồ ảo với `fetch` giả.
public struct ReachabilityConfig: Sendable, Hashable {
  public var url: String
  public var method: String
  public var requestTimeoutMillis: Int64
  public var shortTimeoutMillis: Int64
  public var longTimeoutMillis: Int64

  /// `DEFAULT_CONFIGURATION` của NetInfo — app RN không gọi `configure`.
  public static let netInfoDefault = ReachabilityConfig(
    url: "https://clients3.google.com/generate_204", method: "HEAD",
    requestTimeoutMillis: 15_000, shortTimeoutMillis: 5_000, longTimeoutMillis: 60_000)

  /// `reachabilityTest` mặc định: chỉ 204.
  public static func isReachable(status: Int) -> Bool { status == 204 }
}

/// Một phép dò đang bay — huỷ được.
@MainActor
public protocol ReachabilityProbe: AnyObject {
  func cancel()
}

/// Gửi phép dò. `done(status)`: mã HTTP; `done(nil)`: lỗi mạng. Không gọi
/// `done` sau `cancel()`.
@MainActor
public protocol ReachabilityProber: AnyObject {
  func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe
}

@MainActor
public final class InternetReachability {
  /// `undefined` / `null` / `true` / `false` của NetInfo.
  public enum Value: Sendable, Hashable {
    case unset
    case unknown
    case reachable
    case unreachable

    public var bool: Bool? {
      switch self {
      case .unset, .unknown: nil
      case .reachable: true
      case .unreachable: false
      }
    }
  }

  public private(set) var value: Value = .unset
  private let config: ReachabilityConfig
  private let prober: any ReachabilityProber
  private let timers: any NetTimers
  private let listener: @MainActor (Value) -> Void
  private var inFlight: (any ReachabilityProbe)?
  private var requestTimer: NetTimerToken?
  private var nextCheck: NetTimerToken?

  public init(
    config: ReachabilityConfig = .netInfoDefault, prober: any ReachabilityProber, timers: any NetTimers,
    listener: @escaping @MainActor (Value) -> Void
  ) {
    self.config = config
    self.prober = prober
    self.timers = timers
    self.listener = listener
  }

  /// Native báo trạng thái (`update`): iOS không gửi `isInternetReachable`,
  /// nên luôn đi qua phép dò.
  public func update(isConnected: Bool?) {
    tearDown()
    if isConnected == true {
      if value != .reachable { set(.unknown) }
      check()
    } else {
      set(.unreachable)
    }
  }

  /// Huỷ phép dò đang bay và lần dò đã hẹn, KHÔNG đổi giá trị.
  public func tearDown() {
    inFlight?.cancel()
    inFlight = nil
    if let t = requestTimer { timers.cancel(t) }
    requestTimer = nil
    if let t = nextCheck { timers.cancel(t) }
    nextCheck = nil
  }

  private func set(_ next: Value) {
    guard next != value else { return }
    value = next
    listener(next)
  }

  /// Khác NetInfo, có chủ đích: NetInfo chỉ giữ tay cầm của phép dò bắt đầu
  /// từ `update`; phép dò LẠI (sau 5 / 60 s) không huỷ được, nên đổi đường mạng
  /// giữa lúc nó bay thì kết quả cũ của nó vẫn ghi đè giá trị mới. Ở đây mọi
  /// phép dò đều huỷ được (`InternetReachabilityTests`).
  private func check() {
    nextCheck = nil
    var settled = false
    let probe = prober.start(config) { [weak self] status in
      guard let self, !settled else { return }
      settled = true
      self.finish(status.map(ReachabilityConfig.isReachable(status:)) ?? false)
    }
    inFlight = probe
    requestTimer = timers.after(config.requestTimeoutMillis) { [weak self] in
      guard let self, !settled else { return }
      settled = true
      probe.cancel()
      self.finish(false)
    }
  }

  private func finish(_ reachable: Bool) {
    inFlight = nil
    if let t = requestTimer { timers.cancel(t) }
    requestTimer = nil
    set(reachable ? .reachable : .unreachable)
    let wait = reachable ? config.longTimeoutMillis : config.shortTimeoutMillis
    nextCheck = timers.after(wait) { [weak self] in self?.check() }
  }
}

/// Đường mạng như `RNCConnectionState`: loại + đắt (`isExpensive`). Có nối khi
/// loại không phải `none` / `unknown`.
public struct NetPath: Sendable, Hashable {
  public enum Kind: String, Sendable, Hashable {
    case none, unknown, wifi, cellular, ethernet, other
  }

  public var kind: Kind
  public var isExpensive: Bool

  public init(kind: Kind, isExpensive: Bool = false) {
    self.kind = kind
    self.isExpensive = isExpensive
  }

  public var isConnected: Bool { kind != .none && kind != .unknown }
}

/// Lớp trạng thái của NetInfo (`state.ts`): ghép "có nối" của native với "ra
/// được internet" của phép dò thành MỘT trạng thái, phát cho `NetStatusMonitor`.
///
/// Ngoài NetInfo (native-only, có lý do): `suspend()` khi app vào nền huỷ phép
/// dò đang bay mà KHÔNG đổi giá trị — iOS cắt mạng của app ở nền, và một phép dò
/// bị cắt không phải bằng chứng là mất mạng; `resume()` khi quay lại tiền cảnh
/// đo lại đường mạng và dò lại ngay (đang có internet thì không về "chưa biết").
@MainActor @Observable
public final class NetworkObserver {
  public private(set) var path: NetPath?
  public private(set) var reachability: InternetReachability.Value = .unset

  @ObservationIgnored private var reach: InternetReachability!
  @ObservationIgnored private let onState: @MainActor (_ connected: Bool?, _ reachable: Bool?) -> Void
  @ObservationIgnored private var suspended = false

  public init(
    config: ReachabilityConfig = .netInfoDefault, prober: any ReachabilityProber, timers: any NetTimers,
    onState: @escaping @MainActor (_ connected: Bool?, _ reachable: Bool?) -> Void
  ) {
    self.onState = onState
    reach = InternetReachability(config: config, prober: prober, timers: timers) { [weak self] value in
      self?.reachabilityChanged(value)
    }
  }

  /// Native báo đường mạng (`_handleNativeStateUpdate`). Đường không đổi (cùng
  /// loại, cùng "đắt") thì như `RNCConnectionStateWatcher`: không phát gì.
  public func pathChanged(_ next: NetPath) {
    guard next != path else { return }
    apply(next)
  }

  /// Đo lại (`NetInfo.refresh` — nút "Thử lại"): luôn chạy lại, kể cả đường
  /// mạng không đổi. Trả về trạng thái để `retryNow` áp tiếp.
  @discardableResult
  public func refresh(_ current: NetPath) -> (connected: Bool?, reachable: Bool?) {
    apply(current)
    return (current.isConnected, reachability.bool)
  }

  public func suspend() {
    suspended = true
    reach.tearDown()
  }

  public func resume(_ current: NetPath) {
    guard suspended else { return }
    suspended = false
    apply(current)
  }

  private func apply(_ next: NetPath) {
    // Thứ tự của `state.ts`: phép dò cập nhật TRƯỚC (có thể phát với trạng
    // thái cũ), rồi trạng thái mới phát với giá trị dò hiện tại.
    reach.update(isConnected: next.isConnected)
    path = next
    reachability = reach.value
    onState(next.isConnected, reach.value.bool)
  }

  private func reachabilityChanged(_ value: InternetReachability.Value) {
    // `_handleInternetReachabilityUpdate`: chưa có trạng thái nào thì im.
    guard let path else { return }
    reachability = value
    onState(path.isConnected, value.bool)
  }
}
