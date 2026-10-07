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
