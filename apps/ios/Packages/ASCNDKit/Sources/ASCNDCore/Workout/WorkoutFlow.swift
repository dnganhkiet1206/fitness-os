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
  /// Lịch sử buổi tập (#400) — `nil` khi app chưa dựng màn lịch sử.
  public let history: HistoryBook?
  /// Phân tích bài tập (#419) — `nil` khi app chưa dựng màn phân tích.
  public let insights: InsightBook?
  /// Buổi tập của hôm nay; `nil` khi hôm nay không có buổi (nghỉ / chưa lên
  /// lịch) và không có kế hoạch tự do.
  public private(set) var session: WorkoutSessionController?
  /// Ghi kế hoạch (#401): builder, danh sách template, màn Plan. `nil` khi app
  /// không đưa chỗ ghi.
  public private(set) var plan: PlanEditor?

  @ObservationIgnored private let store: any WorkoutStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let onRest: @MainActor (RestEvent, RestTarget?) -> Void
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private var adHoc: (@MainActor (LocalDate) -> WorkoutSessionController.Plan)?
  @ObservationIgnored private var absorbing: Task<Void, Never>?
  /// Lượt làm mới đang chạy — gọi chồng (kéo làm mới đúng lúc ra tiền cảnh)
  /// chờ chung một lượt, không bắn hai lượt truy vấn.
  @ObservationIgnored private var refreshing: Task<Void, Never>?
  /// Lần cuối dữ liệu server về đủ (`TodayController.failure == nil`).
  @ObservationIgnored private var freshAt: EpochMillis?
  /// Phiên đã kết thúc (`close`): không làm mới, không nuốt gì nữa.
  @ObservationIgnored private var closed = false

  /// `staleTime` của baseline (`query-client.ts:85`): một phút. Cũ hơn thì
  /// ra tiền cảnh / có mạng lại là làm mới.
  public static let staleAfterMillis: Int64 = 60_000

  /// - Parameters:
  ///   - onRest: nối vào `RestTimerController.handle(_:target:)`.
  ///   - onEnqueued: hàng outbox vừa bền — app gọi `sync.kick()`.
  public init(
    today: TodayController, records: RecordBook, performance: PerformanceBook, history: HistoryBook? = nil,
    insights: InsightBook? = nil,
    store: any WorkoutStore, planStore: (any PlanWriteStore)? = nil,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onRest: @escaping @MainActor (RestEvent, RestTarget?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.today = today
    self.records = records
    self.performance = performance
    self.history = history
    self.insights = insights
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.onRest = onRest
    self.onEnqueued = onEnqueued
    self.makeId = makeId
    history?.onDeleted = { [weak self] id, at in await self?.sessionDeleted(id, at: at) }
    if let planStore {
      plan = PlanEditor(
        userId: today.userId, store: planStore, current: { [weak today] in today?.library }, clock: clock,
        makeId: makeId, onEnqueued: { [weak self] entries in await self?.planEdited(entries) })
    }
  }

  /// Lệnh sửa kế hoạch vừa bền (#401): vòng sync gửi; Today áp lên kế hoạch
  /// ngay (TW-6b); màn tập dựng lại theo luật thay buổi — buổi đang tập dở
  /// KHÔNG đổi (TW-6a). Template của buổi đang mở bị xoá thì buổi tách khỏi nó.
  func planEdited(_ entries: [OutboxEntry]) async {
    for e in entries { onEnqueued(e) }
    guard !closed else { return }
    for e in entries where e.kind == PlanEdit.templateDeleteKind {
      if let id = e.payload["id"]?.stringValue { session?.templateDeleted(id) }
    }
    await today.adopt(entries)
    await install()
  }

  /// Một buổi bị xoá từ lịch sử (#400): ngày ấy thôi "đã tập", "lần trước"
  /// quên nó, và buổi tập đang mở (nếu chính là nó) đọc lại trạng thái đã mở
  /// khoá — không thì lần nối thêm sau dựng lại đúng buổi vừa xoá từ bộ nhớ.
  func sessionDeleted(_ id: String, at: EpochMillis) async {
    await today.markUntrained(LocalDate(at, in: timeZone))
    await performance.forget(sessionId: id)
    await insights?.forget(sessionId: id)
    if let session, session.loggedSessionId == id { await session.load() }
  }

  /// Mở màn: kế hoạch trước (cache rồi server) để màn tập có ngay; hai bảng
  /// lịch sử đọc song song — `bests` được hỏi lúc chốt, không lúc dựng, nên
  /// chúng tới muộn vẫn kịp.
  ///
  /// Chạy như một lượt làm mới (`refreshing`): ra tiền cảnh / có mạng lại
  /// trong lúc nó còn bay thì chờ chung, không bắn lượt thứ hai.
  public func start() async {
    await coalesced { await self.initialLoad() }
  }

  private func initialLoad() async {
    async let records: Void = self.records.load()
    async let performance: Void = self.performance.load()
    async let history: Void = self.loadHistory()
    async let insights: Void = self.loadInsights()
    await today.load()
    markFresh()
    await install()
    _ = await (records, performance, history, insights)
  }

  private func loadHistory() async { await history?.load() }
  private func refreshHistory() async { await history?.refresh() }
  private func loadInsights() async { await insights?.load() }
  private func refreshInsights() async { await insights?.refresh() }

  /// Phiên kết thúc (đăng xuất, đổi tài khoản): huỷ lượt làm mới đang bay —
  /// truy vấn mạng bị huỷ thì không có gì để ghi vào cache của người vừa rời
  /// đi. Lượt nào lọt qua khe vẫn bị `clearAll(except:)` dọn ở lần đăng nhập.
  public func close() {
    closed = true
    refreshing?.cancel()
    absorbing?.cancel()
  }

  /// Kéo để làm mới. Gọi chồng thì chờ lượt đang chạy.
  public func refresh() async {
    guard !closed else { return }
    await coalesced { await self.fetch() }
  }

  /// Một lượt tải tại một thời điểm: đang có lượt bay thì chờ nó.
  private func coalesced(_ work: @escaping @MainActor () async -> Void) async {
    if let running = refreshing {
      await running.value
      return
    }
    let task = Task { await work() }
    refreshing = task
    await task.value
    refreshing = nil
  }

  /// App ra tiền cảnh (`focusManager` của baseline): qua nửa đêm thì "hôm nay"
  /// đổi; dữ liệu cũ hơn một phút thì làm mới — template sửa ở máy khác hiện
  /// ra mà không cần kéo.
  public func becameActive() async {
    guard !closed else { return }
    await today.clockTick()
    // "Bỏ lâu" / "N ngày trước" của phân tích đếm theo hôm nay.
    insights?.recompute()
    if isStale {
      await refresh()
    } else {
      await install()
    }
  }

  /// Có mạng lại (`refetchOnReconnect` của baseline).
  public func reconnected() async {
    if !closed, isStale { await refresh() }
  }

  /// Chưa từng về đủ, lần cuối hỏng, hoặc quá một phút.
  public var isStale: Bool {
    guard let freshAt else { return true }
    return clock.nowMillis().millis - freshAt.millis >= Self.staleAfterMillis
  }

  private func fetch() async {
    await today.refresh()
    markFresh()
    await install()
    async let records: Void = self.records.refresh()
    async let performance: Void = self.performance.refresh()
    async let history: Void = self.refreshHistory()
    async let insights: Void = self.refreshInsights()
    _ = await (records, performance, history, insights)
  }

  private func markFresh() {
    freshAt = today.failure == nil ? clock.nowMillis() : nil
  }

  /// Màn "Ghi buổi tập" thủ công (#418) cho hôm nay: gợi ý kế hoạch hôm nay,
  /// kỷ lục so với cùng bảng, và buổi ghi xong đi đúng đường của buổi theo kế
  /// hoạch — Today "đã tập", lịch sử, kỷ lục, "lần trước" theo ngay.
  /// Gọi `load()` trước khi hiện form.
  public func makeManualLog() -> ManualLogController {
    let date = today.today
    return ManualLogController(
      userId: today.userId, date: date, store: store,
      todaysTemplate: { [weak today] in today?.plan.flatMap { $0.date == date ? $0.template : nil } },
      loggedToday: { [weak today] in today?.trained.contains(date) ?? false },
      bests: { [records] in records.bests }, clock: clock, makeId: makeId,
      onEnqueued: enqueued(for: date))
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

  @ObservationIgnored private var installing: Task<Void, Never>?

  /// Các lượt dựng màn chạy NỐI TIẾP (đề xuất audit của C, 05/10): lượt sau
  /// chỉ xét buổi khi lượt trước đã đọc xong nó. Chạy chồng thì lượt sau thấy
  /// buổi còn `.loading` — chưa biết đã có tiến độ hay chưa — và coi là "chưa
  /// chạm", thay mất một buổi có thể đang tập dở.
  private func install() async {
    let previous = installing
    let task = Task {
      await previous?.value
      await self.installNow()
    }
    installing = task
    await task.value
  }

  /// Dựng màn tập cho kế hoạch hiện tại. Không bao giờ bỏ một buổi đang tập
  /// dở: kế hoạch mới (server sau cache, sửa template ở máy khác, qua nửa đêm)
  /// chỉ thay buổi chưa được chạm, hoặc buổi đã chốt của một ngày đã qua.
  private func installNow() async {
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
      guard !closed else { return }
      let previous = absorbing
      absorbing = Task {
        await previous?.value
        await self.history?.absorb(entry)
        if entry.kind == WorkoutSessionRecord.deleteKind {
          // Gỡ set cuối cùng (#398): buổi không còn. Bảng kỷ lục giữ nguyên —
          // tốt-nhất là phép max, không gỡ được; lần làm mới sau sửa lại.
          await self.today.markUntrained(date)
          if let id = entry.payload["id"]?.stringValue {
            await self.performance.forget(sessionId: id)
            await self.insights?.forget(sessionId: id)
          }
          return
        }
        await self.today.markTrained(date)
        await self.records.absorb(setsJSON: entry.payload["sets"])
        await self.performance.absorb(row: entry.payload)
        await self.insights?.absorb(row: entry.payload)
      }
    }
  }
}
