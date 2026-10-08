import ASCNDCore
import Testing

/// Hành vi native-only của phép dò internet (#530) — những chỗ golden NetInfo
/// không phủ vì RN không có hoặc cố ý khác. Phần còn lại là golden
/// (`NetStatusGoldenTests.netInfoMatchesRN`).
@MainActor
struct InternetReachabilityTests {
  /// Prober tay: test quyết lúc nào phép dò xong.
  final class ManualProber: ReachabilityProber {
    final class Probe: ReachabilityProbe {
      var cancelled = false
      var done: (@MainActor (Int?) -> Void)?
      func cancel() { cancelled = true }
      func finish(_ status: Int?) {
        guard !cancelled else { return }
        done?(status)
      }
    }
    private(set) var probes: [Probe] = []
    func start(_ config: ReachabilityConfig, _ done: @escaping @MainActor (Int?) -> Void) -> any ReachabilityProbe {
      let p = Probe()
      p.done = done
      probes.append(p)
      return p
    }
    var live: [Probe] { probes.filter { !$0.cancelled } }
  }

  @MainActor
  final class Harness {
    let clock = VirtualNetTimers()
    let prober = ManualProber()
    private(set) var observer: NetworkObserver!
    private(set) var states: [(Bool?, Bool?)] = []

    init() {
      observer = NetworkObserver(prober: prober, timers: clock) { [unowned self] in self.states.append(($0, $1)) }
    }
  }

  let wifi = NetPath(kind: .wifi)
  let cell = NetPath(kind: .cellular, isExpensive: true)

  /// Khác NetInfo có chủ đích: phép dò LẠI (sau 60 s) đang bay bị huỷ khi
  /// đường mạng đổi — kết quả cũ không được ghi đè trạng thái của đường mới.
  @Test func pathChangeCancelsAnInFlightRecheck() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.prober.probes[0].finish(204)
    #expect(h.observer.reachability == .reachable)
    h.clock.advance(to: ReachabilityConfig.netInfoDefault.longTimeoutMillis)
    #expect(h.prober.probes.count == 2)  // phép dò lại đã gửi
    let recheck = h.prober.probes[1]
    h.observer.pathChanged(NetPath(kind: .none))
    #expect(recheck.cancelled)
    #expect(h.observer.reachability == .unreachable)
    recheck.finish(204)  // về muộn: không được tính
    #expect(h.observer.reachability == .unreachable)
  }

  /// Vào nền: phép dò đang bay bị huỷ, giá trị GIỮ NGUYÊN (không nháy mất
  /// mạng vì iOS cắt mạng của app ở nền); không dò gì khi ở nền.
  @Test func suspendCancelsWithoutChangingTheValue() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.prober.probes[0].finish(204)
    h.clock.advance(to: 60_000)
    let inFlight = h.prober.probes[1]
    let before = h.states.count
    h.observer.suspend()
    #expect(inFlight.cancelled)
    #expect(h.observer.reachability == .reachable)
    #expect(h.states.count == before)
    h.clock.advance(to: 600_000)
    #expect(h.prober.live.allSatisfy { $0 !== inFlight })
    #expect(h.prober.probes.count == 2)  // không có phép dò nào ở nền
  }

  /// Quay lại tiền cảnh: đo lại và dò lại NGAY; đang có internet thì không
  /// về "chưa biết" (không nháy dải báo).
  @Test func resumeReprobesImmediatelyWithoutFlashing() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.prober.probes[0].finish(204)
    h.observer.suspend()
    h.observer.resume(wifi)
    #expect(h.prober.probes.count == 2)
    #expect(h.observer.reachability == .reachable)
    #expect(h.states.last! == (true, true))
    h.prober.probes[1].finish(200)  // cổng đăng nhập trong lúc ở nền
    #expect(h.observer.reachability == .unreachable)
  }

  /// Quay lại tiền cảnh trên một đường mạng khác (Wi-Fi → 4G lúc ở nền).
  @Test func resumeOnADifferentPathUsesTheNewPath() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.prober.probes[0].finish(204)
    h.observer.suspend()
    h.observer.resume(cell)
    #expect(h.observer.path == cell)
    #expect(h.prober.probes.count == 2)
  }

  /// `resume` không đi kèm `suspend` (mở app lần đầu) không dò thêm.
  @Test func resumeWithoutSuspendIsANoOp() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.observer.resume(wifi)
    #expect(h.prober.probes.count == 1)
  }

  /// Đường mạng báo lại y hệt (`RNCConnectionStateWatcher` không phát): không
  /// huỷ, không dò lại — không có bão phép dò khi `NWPath` báo dồn.
  @Test func samePathIsNotReprobed() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.observer.pathChanged(wifi)
    h.observer.pathChanged(wifi)
    #expect(h.prober.probes.count == 1)
    #expect(!h.prober.probes[0].cancelled)
  }

  /// Chỉ cờ "đắt" đổi (Wi-Fi thường → điểm phát 4G) vẫn là đường mới, như
  /// `isEqualToConnectionState`.
  @Test func expensiveFlagChangeIsANewPath() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.observer.pathChanged(NetPath(kind: .wifi, isExpensive: true))
    #expect(h.prober.probes.count == 2)
    #expect(h.prober.probes[0].cancelled)
  }

  /// Phép dò không về trong 15 s: bị huỷ và tính là không có internet; dò lại
  /// sau 5 s.
  @Test func requestTimeoutCancelsAndRetriesShort() {
    let h = Harness()
    h.observer.pathChanged(wifi)
    h.clock.advance(to: 15_000)
    #expect(h.prober.probes[0].cancelled)
    #expect(h.observer.reachability == .unreachable)
    h.clock.advance(to: 20_000)
    #expect(h.prober.probes.count == 2)
  }
}
