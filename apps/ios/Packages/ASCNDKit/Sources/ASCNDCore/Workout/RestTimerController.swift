public import Observation

/// Quãng nghỉ chuẩn bị cho set nào (RT-12). `nil` ở set cuối — không bịa.
public struct RestTarget: Sendable, Hashable, Codable {
  public let exerciseName: String
  public let setNumber: Int
  public let totalSets: Int
  public init(exerciseName: String, setNumber: Int, totalSets: Int) {
    self.exerciseName = exerciseName
    self.setNumber = setNumber
    self.totalSets = totalSets
  }
}

/// Những gì Live Activity / Dynamic Island cần — PHÉP CHIẾU của `RestTimer`,
/// không phải một trạng thái thứ hai (#227 H5). Island vẽ:
/// - chữ số: `Text(timerInterval: now...endsAt)` (hệ thống tự tick);
/// - vòng: `ProgressView(timerInterval: ringStart...endsAt, countsDown: true)`
///   với style HỆ THỐNG (#227 H3) — cùng hàm của `now` với vòng trong app (H4).
public struct RestActivityContent: Sendable, Hashable, Codable {
  public let endsAt: EpochMillis
  public let ringStart: EpochMillis
  public let totalSeconds: Int
  public let target: RestTarget?
  /// Đang tạm dừng: số giây đóng băng — Island vẽ chữ số / vòng TĨNH từ số
  /// này thay vì để hệ thống tick (RN `isPaused` + `pausedRemaining`).
  /// Tuỳ chọn: activity của bản trước không có trường này, đọc ra `nil`.
  public let pausedLeft: Int?

  public init(
    endsAt: EpochMillis, ringStart: EpochMillis, totalSeconds: Int, target: RestTarget?, pausedLeft: Int? = nil
  ) {
    self.endsAt = endsAt
    self.ringStart = ringStart
    self.totalSeconds = totalSeconds
    self.target = target
    self.pausedLeft = pausedLeft
  }
}

extension RestTimer {
  public func activityContent(target: RestTarget?) -> RestActivityContent {
    RestActivityContent(endsAt: endsAt, ringStart: ringStart, totalSeconds: total, target: target, pausedLeft: pausedLeft)
  }
}

/// Cầu sang ActivityKit. Bản thật nằm trong app (chỉ iOS); test dùng bản giả.
/// Mọi lời gọi đến từ `RestTimerController`, tuần tự — không bao giờ hai lời
/// gọi chồng nhau.
public protocol RestActivityDriver: Sendable {
  /// Activity đang hiện (nếu có) — đọc lúc mở app để đối chiếu.
  func current() async -> RestActivityContent?
  /// `true` khi activity THẬT đang hiện `content` sau lời gọi. `false` khi hệ
  /// thống từ chối (Live Activity bị tắt, app ở nền, hết hạn mức…): controller
  /// không được coi trạng thái mong muốn là trạng thái thật (#523 P1).
  func start(_ content: RestActivityContent) async -> Bool
  /// Như `start`; không còn activity để cập nhật thì driver tự `start`.
  func update(_ content: RestActivityContent) async -> Bool
  func end() async
}

/// Nguồn sự thật DUY NHẤT của quãng nghỉ: màn tập đọc nó, Live Activity là
/// phép chiếu của nó, nút ±15 trên Island (`LiveActivityIntent`, chạy trong
/// process của app) gọi vào chính `adjust(by:)` này.
///
/// ── vì sao một vòng đồng bộ, không phải gọi thẳng driver ──
///
/// Bản RN gọi bridge ngay ở mỗi thao tác, nên mọi cuộc đua đều phải vá tay:
/// `start` còn đang bay mà ±15 tới thì bị nuốt; `end` chen giữa thì activity
/// mồ côi (#198, #213). Ở đây mỗi thay đổi chỉ đặt "trạng thái mong muốn";
/// một vòng duy nhất đưa activity về trạng thái MỚI NHẤT — đang start mà ±15
/// tới thì vòng sau update; đang start mà huỷ thì vòng sau end. Không có lời
/// gọi nào cũ đè lên trạng thái mới.
@MainActor
@Observable
public final class RestTimerController {
  public private(set) var timer: RestTimer?
  public private(set) var target: RestTarget?

  @ObservationIgnored private let driver: any RestActivityDriver
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let persist: @MainActor (RestTimer?, RestTarget?) -> Void
  /// Đúng một lần mỗi quãng nghỉ kết thúc tự nhiên (RT-6: haptic success).
  @ObservationIgnored public var onRestFinished: (@MainActor () -> Void)?

  @ObservationIgnored private var shown: RestActivityContent?
  /// Chưa biết hệ thống đang hiện gì — hỏi `driver.current()` trước lời gọi
  /// đầu tiên. Mặc định `true`: process có thể vừa được hệ thống khởi động ở
  /// nền CHỈ để chạy nút ±15 (`LiveActivityIntent`), trước cả `reconcile()`.
  @ObservationIgnored private var needsRead = true
  /// Lần đồng bộ gần nhất hệ thống từ chối hiện activity. Đồng hồ trong app
  /// vẫn đúng (nguồn sự thật là `timer`); chỉ Island / màn khoá không có.
  public private(set) var activityFailed = false
  @ObservationIgnored private var syncing: Task<Void, Never>?

  /// - Parameters:
  ///   - restored: quãng nghỉ đã lưu trước khi app bị đóng (nếu có).
  ///   - persist: lưu trạng thái mỗi lần đổi — để mở lại app vẫn nghỉ tiếp.
  public init(
    driver: any RestActivityDriver,
    clock: any WallClock = SystemWallClock(),
    restored: (RestTimer, RestTarget?)? = nil,
    persist: @escaping @MainActor (RestTimer?, RestTarget?) -> Void = { _, _ in }
  ) {
    self.driver = driver
    self.clock = clock
    self.persist = persist
    if let (t, target) = restored, t.phase(at: clock.nowMillis()) != .over {
      timer = t
      self.target = target
    }
  }

  public func phase() -> RestPhase? { timer?.phase(at: clock.nowMillis()) }

  /// Tick xong / bỏ tick một set (`WorkoutDay.toggle`) hoặc Skip.
  public func handle(_ event: RestEvent, target: RestTarget? = nil) {
    let next = RestTimer.reduce(timer, event, at: clock.nowMillis())
    if case .start = event { self.target = target }
    set(next)
  }

  /// ±15 — từ nút trong app HAY từ Island; cùng một đường.
  public func adjust(by delta: Int) {
    handle(.adjust(delta: delta))
  }

  /// Tạm dừng / tiếp tục — từ nút trong app HAY từ Island; cùng một đường.
  /// Đặt trạng thái đích (không đảo): hai lần chạm dồn nhau không lật ngược.
  public func setPaused(_ paused: Bool) {
    handle(paused ? .pause : .resume)
  }

  /// Gọi theo nhịp (mỗi giây khi màn đang mở) và khi app quay lại foreground.
  /// Hết giờ quá 1 giây → đóng, báo `onRestFinished` đúng một lần.
  public func settle() {
    guard let t = timer, t.phase(at: clock.nowMillis()) == .over else { return }
    set(nil)
    onRestFinished?()
  }

  /// Lúc mở app: đối chiếu activity hệ thống đang hiện với nguồn sự thật.
  /// Có activity mà không còn quãng nghỉ → end (activity mồ côi, #213); có
  /// quãng nghỉ mà activity lệch hoặc mất → đưa về đúng.
  public func reconcile() async {
    // Đọc trong vòng đồng bộ, không đọc thẳng ở đây: một vòng đang bay (nút
    // ±15 tới trước) sẽ ghi `shown` sau khi ta đọc, và hai bên đè nhau.
    needsRead = true
    if let t = timer, t.phase(at: clock.nowMillis()) == .over {
      timer = nil
      target = nil
      persist(nil, nil)
    }
    scheduleSync()
    await syncing?.value
  }

  /// Lúc mở app, SAU khi biết phiên (C42, #252): không ai đăng nhập thì quãng
  /// nghỉ đã lưu là của người trước — huỷ (xoá cả bản lưu) rồi mới đối chiếu,
  /// nên Island không bao giờ phát lại tên bài của họ trên màn khoá.
  ///
  /// Đăng xuất trong app đã huỷ qua `onSessionEnded`; ca này là phiên mất khi
  /// app không chạy (token hết hạn, bị thu hồi) — `SessionStore` coi lần mở
  /// không phiên là `initialSession`, không chạy dọn.
  public func reconcile(signedIn: Bool) async {
    if !signedIn, timer != nil { handle(.cancel) }
    await reconcile()
  }

  /// Đợi vòng đồng bộ hiện tại xong (cho test và cho lúc app sắp vào nền).
  public func flush() async {
    while let s = syncing {
      await s.value
      if syncing == nil { break }
    }
  }

  private func set(_ next: RestTimer?) {
    timer = next
    if next == nil { target = nil }
    persist(timer, target)
    scheduleSync()
  }

  private var desired: RestActivityContent? { timer?.activityContent(target: target) }

  private func scheduleSync() {
    guard syncing == nil else { return }  // vòng đang chạy sẽ thấy trạng thái mới
    syncing = Task { [weak self] in
      while let self {
        if self.needsRead {
          self.needsRead = false
          self.shown = await self.driver.current()
          continue  // trạng thái mong muốn có thể đã đổi trong lúc đọc
        }
        guard self.shown != self.desired else { break }
        let want = self.desired
        let applied: Bool
        switch (self.shown, want) {
        case (nil, let w?): applied = await self.driver.start(w)
        case (_?, let w?): applied = await self.driver.update(w)
        case (_?, nil):
          await self.driver.end()
          applied = true
        case (nil, nil): applied = true
        }
        // Chỉ ghi `shown` khi driver xác nhận. Hỏng thì KHÔNG coi mong muốn là
        // thật, không quay vòng thử lại ngay (hệ thống từ chối sẽ từ chối
        // tiếp): thoát, và sự kiện kế (±15, tick, reconcile, settle) đọc lại
        // hệ thống trước khi thử.
        guard applied else {
          self.needsRead = true
          self.activityFailed = true
          break
        }
        self.shown = want
        self.activityFailed = false
      }
      self?.syncing = nil
    }
  }
}
