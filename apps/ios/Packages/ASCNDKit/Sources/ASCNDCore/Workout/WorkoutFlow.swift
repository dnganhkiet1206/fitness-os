public import Foundation
public import Observation

/// Luồng tập của người đang đăng nhập (#272): một chỗ duy nhất nối
///
///     TodayController ─▶ WorkoutSessionController ─▶ (bền) ─▶ outbox ─▶ sync
///            ▲                   │        │
///            └── "đã tập" ◀──────┘        └─▶ quãng nghỉ (RestTimerController / Island)
///                RecordBook / PerformanceBook ◀── buổi vừa chốt
///
/// Trước đây phần nối này nằm trong `WorkoutLabView` (chỉ có ở bản Debug), nên
/// bản Release không có đường nào đi trọn luồng. Giờ nó là tầng ứng dụng, test
/// được không cần SwiftUI; màn Today/Workout của C và Lab cùng đọc từ đây, không
/// ai tự dựng controller.
///
/// Không giữ state trình bày (màn nào đang mở, sheet Summary): đó là việc của C.
/// Ở đây chỉ có: kế hoạch hôm nay, buổi tập đang sống, và hai bảng lịch sử.
@MainActor @Observable
public final class WorkoutFlow {
  public let today: TodayController
  public let records: RecordBook
  public let performance: PerformanceBook
  /// Buổi tập của hôm nay; `nil` khi hôm nay không có buổi (nghỉ / chưa lên
  /// lịch) và không có kế hoạch tự do.
  public private(set) var session: WorkoutSessionController?

  @ObservationIgnored private let store: any WorkoutStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let onRest: @MainActor (RestEvent, RestTarget?) -> Void
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var adHoc: (@MainActor (LocalDate) -> WorkoutSessionController.Plan)?
  @ObservationIgnored private var absorbing: Task<Void, Never>?

  /// - Parameters:
  ///   - onRest: nối vào `RestTimerController.handle(_:target:)`.
  ///   - onEnqueued: hàng outbox vừa bền — app gọi `sync.kick()`.
  public init(
    today: TodayController, records: RecordBook, performance: PerformanceBook, store: any WorkoutStore,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    onRest: @escaping @MainActor (RestEvent, RestTarget?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.today = today
    self.records = records
    self.performance = performance
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.onRest = onRest
    self.onEnqueued = onEnqueued
  }

  /// Mở màn: kế hoạch trước (cache rồi server) để màn tập có ngay; hai bảng
  /// lịch sử đọc song song — `bests` được hỏi lúc chốt, không lúc dựng, nên
  /// chúng tới muộn vẫn kịp.
  public func start() async {
    async let records: Void = self.records.load()
    async let performance: Void = self.performance.load()
    await today.load()
    await install()
    _ = await (records, performance)
  }

  /// Kéo để làm mới.
  public func refresh() async {
    await today.refresh()
    await install()
    async let records: Void = self.records.refresh()
    async let performance: Void = self.performance.refresh()
    _ = await (records, performance)
  }

  /// App ra tiền cảnh: qua nửa đêm thì "hôm nay" đổi, và màn tập theo.
  public func becameActive() async {
    await today.clockTick()
    await install()
  }

  /// Kế hoạch tự do cho ngày không có buổi (chỉ Lab dùng). `nil` để tắt.
  public func setAdHoc(_ plan: (@MainActor (LocalDate) -> WorkoutSessionController.Plan)?) async {
    adHoc = plan
    await install()
  }

  /// Chốt buổi. Ngày đã chốt ở chỗ khác trên máy này (`alreadyLogged`) cũng
  /// là "đã tập" — không có hàng outbox nào để báo điều đó.
  public func finish() async throws(WorkoutSessionController.FinishRefusal) -> WorkoutSummary {
    guard let session else { throw .loading }
    do throws(WorkoutSessionController.FinishRefusal) {
      return try await session.finish()
    } catch {
      if case .alreadyLogged = error { await today.markTrained(session.plan.date) }
      throw error
    }
  }

  /// Nối set mới vào buổi đã chốt (#296).
  public func append() async throws(WorkoutSessionController.FinishRefusal) -> WorkoutSummary {
    guard let session else { throw .loading }
    return try await session.append()
  }

  /// Chờ các bảng lịch sử nuốt xong buổi vừa chốt (test, và màn Summary nếu
  /// cần "lần trước" mới ngay).
  public func settled() async {
    await absorbing?.value
  }

  /// Set kế tiếp → thứ quãng nghỉ hiện (RT-12).
  public static func restTarget(_ next: PlannedSet?) -> RestTarget? {
    next.map { RestTarget(exerciseName: $0.exerciseName, setNumber: $0.ordinal, totalSets: $0.of) }
  }

  /// Dựng màn tập cho kế hoạch hiện tại. Không bao giờ bỏ một buổi đang tập
  /// dở: kế hoạch mới (server sau cache, sửa template ở máy khác, qua nửa đêm)
  /// chỉ thay buổi chưa được chạm, hoặc buổi đã chốt của một ngày đã qua.
  private func install() async {
    let next = makeSession()
    if let current = session {
      if let next, current.plan == next.plan, current.loggedElsewhere == next.loggedElsewhere {
        // Cùng buổi mà lần đọc trước hỏng: thử đọc lại, không dựng mới.
        if current.loadFailed { await current.load() }
        return
      }
      guard Self.replaceable(current, today: today.today) else { return }
    }
    session = next
    await next?.load()
  }

  /// Buổi chưa chạm thì thay được. Buổi đã chốt thì chỉ khi nó thuộc một ngày
  /// đã qua — trong ngày nó còn là màn Summary và nút nối thêm set. Buổi đang
  /// tập dở: không bao giờ, kể cả qua nửa đêm (chốt muộn vẫn ghi đúng ngày).
  static func replaceable(_ current: WorkoutSessionController, today: LocalDate) -> Bool {
    switch current.phase {
    case .idle, .loading: true
    case .finished: current.plan.date != today
    case .active: false
    }
  }

  private func makeSession() -> WorkoutSessionController? {
    let onRest = self.onRest
    let rest: @MainActor (RestEvent, PlannedSet?) -> Void = { event, next in onRest(event, Self.restTarget(next)) }
    let bests: @MainActor () -> PersonalRecords.Bests? = { [records] in records.bests }
    if let s = today.makeSession(bests: bests, onRest: rest, onEnqueued: enqueued(for: today.today)) {
      return s
    }
    guard let adHoc else { return nil }
    let plan = adHoc(today.today)
    return WorkoutSessionController(
      plan: plan, userId: today.userId, store: store, clock: clock, timeZone: timeZone,
      bests: bests, onRest: rest, onEnqueued: enqueued(for: plan.date))
  }

  /// Hàng outbox vừa bền: vòng sync thử gửi ngay; ngày thành "đã tập"; buổi
  /// thành lịch sử cho kỷ lục và "lần trước" — buổi sau không nổ lại cùng kỷ
  /// lục, kể cả offline. Bản ghi lại (#296) mang cả hàng, nuốt lại là idempotent
  /// (lấy max / thay theo id).
  private func enqueued(for date: LocalDate) -> @MainActor (OutboxEntry) -> Void {
    { [weak self] entry in
      guard let self else { return }
      self.onEnqueued(entry)
      let previous = absorbing
      absorbing = Task {
        await previous?.value
        await self.today.markTrained(date)
        await self.records.absorb(setsJSON: entry.payload["sets"])
        await self.performance.absorb(row: entry.payload)
      }
    }
  }
}
