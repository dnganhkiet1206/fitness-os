import ASCNDCore
import Foundation
import Testing

/// Golden trạng thái mạng (#527 Phase 1 · 1.11): `Fixtures/net-status-golden.json`
/// là output của CHÍNH `native/src/lib/net-status.ts` chạy trên đồng hồ ảo
/// (`apps/ios/tools/net-status-golden/gen.mjs`; bước cổng `verify.sh` sinh lại
/// và so từng byte). Ở đây cùng chuỗi sự kiện chạy qua `NetStatusMonitor` trên
/// một đồng hồ ảo cùng luật, và phải đổi trạng thái ở ĐÚNG các mốc mili giây ấy
/// — với đúng hằng số của app (600 / 250 / 12 000).
@MainActor
struct NetStatusGoldenTests {
  struct Golden: Decodable {
    struct State: Decodable {
      let isConnected: Bool?
      let isInternetReachable: Bool?
    }
    struct Row: Decodable {
      let name: String
      let state: State
      let usable: Bool
    }
    struct Event: Decodable {
      let at: Int64
      let state: State
    }
    struct Transition: Decodable, Equatable, CustomStringConvertible {
      let at: Int64
      let status: String
      var description: String { "\(status)@\(at)" }
    }
    struct Case: Decodable {
      let name: String
      let events: [Event]
      let busyUntil: Int64?
      let probe: Bool
      let until: Int64
      let transitions: [Transition]
    }
    let table: [Row]
    let cases: [Case]
    let netinfo: NetInfo
  }

  /// Phần 2 của golden: NetInfo THẬT (`state.ts` + `internetReachability.ts`)
  /// nối với `net-status.ts`, `fetch` giả theo lịch.
  struct NetInfo: Decodable {
    struct Config: Decodable {
      let url: String
      let method: String
      let requestTimeout: Int64
      let shortTimeout: Int64
      let longTimeout: Int64
    }
    struct Path: Decodable {
      let type: String
      let isConnected: Bool
    }
    struct Event: Decodable {
      let at: Int64
      let native: Path?
      let retry: Bool?
    }
    struct Outcome: Decodable {
      let from: Int64
      let status: Int?
      let error: Bool?
      let hang: Bool?
      let after: Int64?
    }
    struct Reach: Decodable, Equatable, CustomStringConvertible {
      let at: Int64
      let value: Bool?
      var description: String { "\(value.map(String.init) ?? "nil")@\(at)" }
    }
    struct Probe: Decodable, Equatable, CustomStringConvertible {
      let at: Int64
      let result: ProbeResult?
      var description: String { "\(at):\(result.map { "\($0)" } ?? "bay")" }
    }
    enum ProbeResult: Decodable, Equatable {
      case status(Int)
      case word(String)
      init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { self = .status(n) } else { self = .word(try c.decode(String.self)) }
      }
    }
    struct Case: Decodable {
      let name: String
      let initial: Path
      let events: [Event]
      let probeSchedule: [Outcome]
      let until: Int64
      let transitions: [Golden.Transition]
      let reachability: [Reach]
      let probes: [Probe]
      let url: String?
      let method: String?
    }
    let config: Config
    let cases: [Case]
  }

  static func golden() throws -> Golden {
    let url = try #require(
      Bundle.module.url(forResource: "net-status-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(Golden.self, from: Data(contentsOf: url))
  }

  @Test func isUsableMatchesRN() throws {
    let g = try Self.golden()
    #expect(g.table.count >= 6)
    for row in g.table {
      let got = NetReachability.isUsable(connected: row.state.isConnected, internetReachable: row.state.isInternetReachable)
      #expect(got == row.usable, "\(row.name)")
    }
  }

  @Test func stateMachineMatchesRN() throws {
    let g = try Self.golden()
    #expect(g.cases.count >= 10)
    for c in g.cases {
      let clock = VirtualNetTimers()
      let monitor = NetStatusMonitor(timers: clock)
      if c.probe {
        monitor.busyProbe = { c.busyUntil == nil || clock.now < c.busyUntil! }
      }
      var seen = [Golden.Transition(at: 0, status: monitor.status.rawValue)]
      monitor.onChange = { seen.append(.init(at: clock.now, status: $0.rawValue)) }
      for e in c.events {
        clock.advance(to: e.at)
        monitor.apply(connected: e.state.isConnected, internetReachable: e.state.isInternetReachable)
      }
      clock.advance(to: c.until)
      #expect(seen == c.transitions, "\(c.name)")
    }
  }

  /// Cấu hình phép dò = mặc định của NetInfo bản đang cài (app RN không gọi
  /// `configure`).
  @Test func reachabilityConfigMatchesNetInfo() throws {
    let c = try Self.golden().netinfo.config
    let mine = ReachabilityConfig.netInfoDefault
    #expect(mine.url == c.url)
    #expect(mine.method == c.method)
    #expect(mine.requestTimeoutMillis == c.requestTimeout)
    #expect(mine.shortTimeoutMillis == c.shortTimeout)
    #expect(mine.longTimeoutMillis == c.longTimeout)
  }

  /// Toàn bộ đường đi: đường mạng → phép dò → trạng thái app, như app RN trên
  /// iOS. Cùng mốc đổi trạng thái, cùng chuỗi giá trị "ra được internet", cùng
  /// các phép dò không bị huỷ (lúc gửi + kết quả: 204, 200 của cổng đăng nhập,
  /// lỗi mạng, timeout 15 s).
  @Test func netInfoMatchesRN() throws {
    let g = try Self.golden().netinfo
    #expect(g.cases.count >= 10)
    for c in g.cases {
      let clock = VirtualNetTimers()
      let prober = ScheduledProber(clock: clock, schedule: c.probeSchedule, timeout: g.config.requestTimeout)
      let monitor = NetStatusMonitor(timers: clock)
      monitor.busyProbe = { false }
      var seen = [Golden.Transition(at: 0, status: monitor.status.rawValue)]
      monitor.onChange = { seen.append(.init(at: clock.now, status: $0.rawValue)) }
      var reach: [NetInfo.Reach] = []
      let observer = NetworkObserver(prober: prober, timers: clock) { connected, reachable in
        if reach.last?.value != reachable || reach.isEmpty { reach.append(.init(at: clock.now, value: reachable)) }
        monitor.apply(connected: connected, internetReachable: reachable)
      }
      var current = NetPath(rnType: c.initial.type)
      observer.pathChanged(current)
      for e in c.events {
        clock.advance(to: e.at)
        if let p = e.native {
          current = NetPath(rnType: p.type)
          #expect(current.isConnected == p.isConnected, "\(c.name)")
          observer.pathChanged(current)
        }
        if e.retry == true {
          let s = observer.refresh(current)
          monitor.apply(connected: s.connected, internetReachable: s.reachable)
        }
      }
      clock.advance(to: c.until)
      #expect(seen == c.transitions, "\(c.name)")
      #expect(reach == c.reachability, "\(c.name)")
      #expect(prober.kept == c.probes, "\(c.name)")
      if let url = c.url { #expect(prober.urls.allSatisfy { $0 == url }) }
    }
  }

  /// Golden phải chạm cả ba hằng số — không thì một máy trạng thái sai ở hằng
  /// số không ai chạm vẫn xanh: về online đúng ở SÀN (600), ở một NHỊP DÒ sau
  /// sàn (600 + k·250, k ≥ 1) và ở TRẦN (12 000 sau lúc bắt đầu kết nối lại).
  @Test func goldenCoversFloorPollAndCap() throws {
    let g = try Self.golden()
    var floor = false, poll = false, cap = false
    for c in g.cases {
      guard let start = c.transitions.last(where: { $0.status == "reconnecting" })?.at,
        let end = c.transitions.last, end.status == "online", end.at > start
      else { continue }
      let d = end.at - start
      if d == NetStatusMonitor.reconnectMinMillis { floor = true }
      if d > NetStatusMonitor.reconnectMinMillis, d < NetStatusMonitor.reconnectCapMillis,
        (d - NetStatusMonitor.reconnectMinMillis) % NetStatusMonitor.settlePollMillis == 0
      {
        poll = true
      }
      if d == NetStatusMonitor.reconnectCapMillis { cap = true }
    }
    #expect(floor && poll && cap)
  }
}

/// Hẹn giờ ảo — đúng luật của đồng hồ ảo trong `gen.mjs`: tới hạn sớm nhất chạy
/// trước, cùng hạn thì cái đặt trước chạy trước; `every` hẹn lại từ hạn cũ.
@MainActor
final class VirtualNetTimers: NetTimers {
  private struct Timer {
    let id: Int
    var at: Int64
    let every: Int64
    let fire: @MainActor () -> Void
  }

  private(set) var now: Int64 = 0
  private var timers: [Timer] = []
  private var nextId = 1

  func after(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken {
    add(Timer(id: nextId, at: now + millis, every: 0, fire: fire))
  }

  func every(_ millis: Int64, _ fire: @escaping @MainActor () -> Void) -> NetTimerToken {
    add(Timer(id: nextId, at: now + millis, every: millis, fire: fire))
  }

  func cancel(_ token: NetTimerToken) {
    timers.removeAll { $0.id == token.id }
  }

  func advance(to t: Int64) {
    while let due = timers.filter({ $0.at <= t }).min(by: { ($0.at, $0.id) < ($1.at, $1.id) }) {
      now = due.at
      if due.every > 0, let i = timers.firstIndex(where: { $0.id == due.id }) {
        timers[i].at += due.every
      } else {
        timers.removeAll { $0.id == due.id }
      }
      due.fire()
    }
    now = t
  }

  private func add(_ timer: Timer) -> NetTimerToken {
    nextId += 1
    timers.append(timer)
    return NetTimerToken(id: timer.id)
  }
}

extension NetPath {
  /// Loại của `RNCConnectionState` (`type` của NetInfo).
  init(rnType: String) {
    self.init(kind: Kind(rawValue: rnType) ?? .other)
  }
}

/// `fetch` giả của golden, dịch sang Swift: phép dò BẮT ĐẦU ở mốc t nhận kết
/// quả của dòng lịch cuối có mốc ≤ t; trả kết quả sau `after` ms trên đồng hồ
/// ảo. Ghi lại các phép dò không bị huỷ — phép dò treo bị cắt đúng ở mốc
/// timeout là "timeout", như gen.mjs.
@MainActor
final class ScheduledProber: ReachabilityProber {
  final class Probe: ReachabilityProbe {
    let at: Int64
    let hang: Bool
    var result: NetStatusGoldenTests.NetInfo.ProbeResult?
    var cancelled = false
    weak var owner: ScheduledProber?
    var token: NetTimerToken?
    init(at: Int64, hang: Bool) {
      self.at = at
      self.hang = hang
    }
    func cancel() {
      guard let owner, result == nil else { return }
      if hang, owner.clock.now - at == owner.timeout {
        result = .word("timeout")
      } else {
        cancelled = true
      }
      if let token { owner.clock.cancel(token) }
    }
  }

  let clock: VirtualNetTimers
  let schedule: [NetStatusGoldenTests.NetInfo.Outcome]
  let timeout: Int64
  private(set) var all: [Probe] = []
  private(set) var urls: [String] = []

  init(clock: VirtualNetTimers, schedule: [NetStatusGoldenTests.NetInfo.Outcome], timeout: Int64) {
    self.clock = clock
    self.schedule = schedule
    self.timeout = timeout
  }

  var kept: [NetStatusGoldenTests.NetInfo.Probe] {
    all.filter { !$0.cancelled }.map { .init(at: $0.at, result: $0.result) }
  }

  func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe {
    urls.append(config.url)
    let o = schedule.last { $0.from <= clock.now }
    let hang = o == nil || o?.hang == true
    let p = Probe(at: clock.now, hang: hang)
    p.owner = self
    all.append(p)
    if let o, !hang {
      p.token = clock.after(o.after ?? 300) { [weak p] in
        guard let p, !p.cancelled, p.result == nil else { return }
        if o.error == true {
          p.result = .word("error")
          done(nil)
        } else {
          p.result = .status(o.status ?? 0)
          done(o.status)
        }
      }
    }
    return p
  }
}
