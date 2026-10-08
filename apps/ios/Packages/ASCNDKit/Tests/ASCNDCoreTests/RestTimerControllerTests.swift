import ASCNDCore
import Foundation
import Testing

/// Driver giả: ghi lại mọi lời gọi; `start` có thể chậm để dựng lại cuộc đua
/// mà bản RN đã gặp trên máy thật (#198, #213).
private final class FakeDriver: RestActivityDriver, @unchecked Sendable {
  enum Call: Equatable { case start(RestActivityContent), update(RestActivityContent), end }
  private let lock = NSLock()
  private var _calls: [Call] = []
  private var _showing: RestActivityContent?
  let startDelayNanos: UInt64
  /// Hệ thống từ chối `start` (Live Activity bị tắt, app ở nền).
  private var _refuseStarts: Bool

  init(showing: RestActivityContent? = nil, startDelayNanos: UInt64 = 0, refuseStarts: Bool = false) {
    _showing = showing
    self.startDelayNanos = startDelayNanos
    _refuseStarts = refuseStarts
  }

  var refuseStarts: Bool {
    get { lock.withLock { _refuseStarts } }
    set { lock.withLock { _refuseStarts = newValue } }
  }

  private var _startsBegun = 0

  var calls: [Call] { lock.withLock { _calls } }
  var showing: RestActivityContent? { lock.withLock { _showing } }

  /// Đợi tới khi một `start` đã vào driver (đang bay).
  func untilStartBegins() async {
    while lock.withLock({ _startsBegun }) == 0 { await Task.yield() }
  }

  func current() async -> RestActivityContent? { showing }
  func start(_ c: RestActivityContent) async -> Bool {
    lock.withLock { _startsBegun += 1 }
    if startDelayNanos > 0 { try? await Task.sleep(nanoseconds: startDelayNanos) }
    return lock.withLock {
      _calls.append(.start(c))
      if _refuseStarts { return false }
      _showing = c
      return true
    }
  }
  func update(_ c: RestActivityContent) async -> Bool {
    lock.withLock { _calls.append(.update(c)); _showing = c }
    return true
  }
  func end() async { lock.withLock { _calls.append(.end); _showing = nil } }
}

private final class TestClock: WallClock, @unchecked Sendable {
  private let lock = NSLock()
  private var ms: Int64
  init(_ ms: Int64) { self.ms = ms }
  func now() -> Date { lock.withLock { EpochMillis(ms).date } }
  func advance(_ d: Int64) { lock.withLock { ms += d } }
}

private let squat = RestTarget(exerciseName: "Squat", setNumber: 2, totalSets: 3)

@MainActor
struct RestTimerControllerTests {
  @Test func startProjectsOntoActivity() async throws {
    let driver = FakeDriver()
    let c = RestTimerController(driver: driver, clock: TestClock(0))
    c.handle(.start(seconds: 90), target: squat)
    await c.flush()
    let shown = try #require(driver.showing)
    #expect(shown == RestActivityContent(endsAt: EpochMillis(90_000), ringStart: EpochMillis(0), totalSeconds: 90, target: squat))
    #expect(driver.calls.count == 1)
  }

  /// #213 (2): ±15 bấm khi `start` còn đang bay KHÔNG bị nuốt — Island kết
  /// thúc ở đúng trạng thái mới nhất.
  @Test func adjustDuringSlowStartLandsOnIsland() async throws {
    let clock = TestClock(0)
    let driver = FakeDriver(startDelayNanos: 30_000_000)
    let c = RestTimerController(driver: driver, clock: clock)
    c.handle(.start(seconds: 90), target: squat)
    await driver.untilStartBegins()
    clock.advance(60_000)
    c.adjust(by: 15)
    await c.flush()
    #expect(driver.showing == c.timer?.activityContent(target: squat))
    #expect(driver.showing?.endsAt == EpochMillis(105_000))
    // H4: vòng của Island neo lại theo mẫu số mới, không giữ startDate cũ.
    #expect(driver.showing?.ringStart == EpochMillis(15_000))
  }

  /// #213 (1): huỷ khi `start` còn đang bay → activity bị END, không mồ côi.
  @Test func cancelDuringSlowStartLeavesNoOrphan() async {
    let driver = FakeDriver(startDelayNanos: 30_000_000)
    let c = RestTimerController(driver: driver, clock: TestClock(0))
    c.handle(.start(seconds: 90), target: squat)
    await driver.untilStartBegins()
    c.handle(.cancel)
    await c.flush()
    #expect(driver.showing == nil)
    #expect(driver.calls.last == .end)
  }

  /// Bấm ±15 dồn dập: Island luôn kết thúc ở trạng thái cuối, và không có lời
  /// gọi nào sau đó đè lên bằng giá trị cũ.
  @Test func rapidAdjustsConvergeToLatest() async {
    let clock = TestClock(0)
    let driver = FakeDriver()
    let c = RestTimerController(driver: driver, clock: clock)
    c.handle(.start(seconds: 60), target: nil)
    for _ in 0..<7 { c.adjust(by: 15) }
    c.adjust(by: -15)
    await c.flush()
    #expect(driver.showing == c.timer?.activityContent(target: nil))
    #expect(c.timer?.remaining(at: EpochMillis(0)) == 150)
    if case .update(let last)? = driver.calls.last { #expect(last.totalSeconds == 165) }
  }

  /// RT-5/RT-6: hết giờ quá 1 giây → đóng; haptic đúng MỘT lần.
  @Test func settleEndsExactlyOnce() async {
    let clock = TestClock(0)
    let driver = FakeDriver()
    let c = RestTimerController(driver: driver, clock: clock)
    var finished = 0
    c.onRestFinished = { finished += 1 }
    c.handle(.start(seconds: 30), target: nil)
    clock.advance(30_500)
    c.settle()
    #expect(c.timer != nil, "đang ở giây 'xong' thì chưa đóng")
    clock.advance(600)
    c.settle()
    c.settle()
    await c.flush()
    #expect(c.timer == nil)
    #expect(finished == 1)
    #expect(driver.showing == nil)
  }

  /// Skip không phải là "hết giờ tự nhiên": không haptic success.
  @Test func cancelIsNotAFinish() async {
    let c = RestTimerController(driver: FakeDriver(), clock: TestClock(0))
    var finished = 0
    c.onRestFinished = { finished += 1 }
    c.handle(.start(seconds: 30), target: nil)
    c.handle(.cancel)
    c.settle()
    #expect(finished == 0)
  }

  /// Mở app: activity còn hiện mà quãng nghỉ không còn → end (mồ côi).
  @Test func reconcileEndsOrphanActivity() async {
    let orphan = RestActivityContent(endsAt: EpochMillis(1), ringStart: EpochMillis(0), totalSeconds: 1, target: nil)
    let driver = FakeDriver(showing: orphan)
    let c = RestTimerController(driver: driver, clock: TestClock(100_000))
    await c.reconcile()
    #expect(driver.showing == nil)
    #expect(driver.calls == [.end])
  }

  /// Mở app sau khi bị kill giữa quãng nghỉ: nghỉ tiếp đúng `endsAt` cũ, và
  /// Island được dựng lại nếu hệ thống đã gỡ nó.
  @Test func reconcileRestoresRestAfterKill() async throws {
    let t = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    let driver = FakeDriver()
    let c = RestTimerController(driver: driver, clock: TestClock(40_000), restored: (t, squat))
    await c.reconcile()
    #expect(c.timer?.remaining(at: EpochMillis(40_000)) == 50)
    #expect(driver.showing == t.activityContent(target: squat))
  }

  /// C42 (#252): A nghỉ giữa chừng → app bị kill → phiên mất khi app không
  /// chạy → mở lại ở trạng thái đăng xuất. Quãng nghỉ của A không được phát
  /// lại; Island A để lại bị end; bản lưu bị xoá.
  @Test func signedOutLaunchDropsThePreviousUsersRest() async throws {
    let t = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    let left = t.activityContent(target: squat)
    let driver = FakeDriver(showing: left)
    var saved: RestTimer? = t
    let c = RestTimerController(
      driver: driver, clock: TestClock(40_000), restored: (t, squat), persist: { t, _ in saved = t })
    await c.reconcile(signedIn: false)
    #expect(c.timer == nil && c.target == nil)
    #expect(saved == nil)
    #expect(driver.showing == nil)
    #expect(!driver.calls.contains { if case .start = $0 { true } else { false } })
  }

  /// Còn phiên: nghỉ tiếp như cũ.
  @Test func signedInLaunchKeepsTheRest() async throws {
    let t = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    let driver = FakeDriver()
    let c = RestTimerController(driver: driver, clock: TestClock(40_000), restored: (t, squat))
    await c.reconcile(signedIn: true)
    #expect(c.timer == t)
    #expect(driver.showing == t.activityContent(target: squat))
  }

  /// Quãng nghỉ đã hết hẳn trong lúc app bị đóng: không hồi sinh, không haptic.
  @Test func reconcileDropsRestThatEndedWhileKilled() async throws {
    let t = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    var saved: RestTimer? = t
    let c = RestTimerController(driver: FakeDriver(), clock: TestClock(200_000), restored: (t, nil), persist: { t, _ in saved = t })
    await c.reconcile()
    #expect(c.timer == nil)
    #expect(saved == t, "khôi phục mà đã quá hạn thì không có gì để lưu lại")
  }

  /// #274: app đã bị kill, người dùng bấm +15 trên màn khoá. Hệ thống khởi
  /// động app Ở NỀN chỉ để chạy intent — trước cả `reconcile()`. Activity đang
  /// hiện phải được UPDATE. Bản trước coi "chưa đọc" là "không có gì" và gọi
  /// `start`: driver thật end mọi activity rồi `Activity.request`, mà request
  /// từ nền bị ActivityKit từ chối → Island BIẾN MẤT đúng lúc người dùng chạm.
  @Test func coldBackgroundIntentUpdatesTheShownActivity() async throws {
    let t = try #require(RestTimer.start(seconds: 90, at: EpochMillis(0)))
    let driver = FakeDriver(showing: t.activityContent(target: squat))
    let c = RestTimerController(driver: driver, clock: TestClock(40_000), restored: (t, squat))
    c.adjust(by: 15)
    await c.flush()
    #expect(driver.calls.count == 1)
    guard case .update(let shown)? = driver.calls.first else {
      Issue.record("phải là update, không start/end: \(driver.calls)")
      return
    }
    #expect(shown.endsAt == EpochMillis(105_000))
    #expect(shown.target == squat)
  }

  /// `reconcile()` gọi khi một vòng đồng bộ đang bay: đọc lại hệ thống TRONG
  /// vòng, không đè `shown` từ bên ngoài — không start hai lần, không mồ côi.
  @Test func reconcileDuringInFlightStartStartsOnce() async {
    let driver = FakeDriver(startDelayNanos: 30_000_000)
    let c = RestTimerController(driver: driver, clock: TestClock(0))
    c.handle(.start(seconds: 90), target: squat)
    await driver.untilStartBegins()
    await c.reconcile()
    await c.flush()
    #expect(driver.calls.count == 1)
    #expect(driver.showing == c.timer?.activityContent(target: squat))
  }

  /// #523 P1: hệ thống từ chối `Activity.request` (Live Activity tắt, app ở
  /// nền). Controller KHÔNG được coi mong muốn là thật: không ghi `shown`,
  /// không quay vòng thử lại; lần sự kiện sau đọc lại hệ thống rồi `start` lại.
  @Test func refusedStartIsNotRecordedAsShown() async {
    let driver = FakeDriver(refuseStarts: true)
    let c = RestTimerController(driver: driver, clock: TestClock(0))
    c.handle(.start(seconds: 90), target: squat)
    await c.flush()
    #expect(driver.showing == nil)
    #expect(driver.calls.count == 1, "một lần thử, không quay vòng")
    #expect(c.activityFailed)
    #expect(c.timer != nil, "đồng hồ trong app vẫn chạy — nguồn sự thật là timer")

    // Hệ thống cho phép lại (người dùng bật Live Activity, app ra tiền cảnh).
    driver.refuseStarts = false
    c.adjust(by: 15)
    await c.flush()
    // Bản cũ đã ghi shown = mong muốn ở lần 1 nên lần này gọi `update` vào một
    // activity không tồn tại. Giờ: đọc lại (không có gì) → `start` mới.
    guard case .start(let shown)? = driver.calls.last else {
      Issue.record("phải start lại sau khi bị từ chối: \(driver.calls)")
      return
    }
    #expect(driver.showing == shown)
    #expect(shown.endsAt == EpochMillis(105_000))
    #expect(!c.activityFailed)
  }

  @Test func persistsEveryChange() async {
    var saved: [RestTimer?] = []
    let c = RestTimerController(driver: FakeDriver(), clock: TestClock(0), persist: { t, _ in saved.append(t) })
    c.handle(.start(seconds: 60), target: nil)
    c.adjust(by: 15)
    c.handle(.cancel)
    #expect(saved.count == 3)
    #expect(saved[1]?.total == 75)
    #expect(saved.last! == nil)
  }
}
