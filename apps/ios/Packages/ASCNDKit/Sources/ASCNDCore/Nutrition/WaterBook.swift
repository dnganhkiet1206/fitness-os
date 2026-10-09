public import Foundation
public import Observation

/// Đọc / xoá `water_logs` trên server (`ASCNDBackend.SupabaseWaterSource`).
public protocol WaterSource: Sendable {
  /// `useTodayWaterLogs`: `select id, amount_ml, logged_at, created_at` của
  /// (người, ngày). Thứ tự do `Water.newestFirst` đặt lại.
  func logs(userId: String, date: LocalDate) async throws -> [WaterLog]
  /// `useWaterWeek`: `select id, date, amount_ml … gte('date', from)`.
  func rows(userId: String, from: LocalDate) async throws -> [WaterRow]
  /// `useRemoveLastWater`: tìm lần uống mới nhất của ngày (`newestFirst`,
  /// `limit 1`) rồi xoá theo `id` + `user_id`. `nil` = không có hàng nào để
  /// bỏ (RN im lặng); còn lại là số hàng đã xoá (`confirmWrite`: 0 là lỗi).
  func removeNewest(userId: String, date: LocalDate) async throws -> Int?
}

/// Bản server lần đọc gần nhất, theo người dùng — mở màn lúc mất mạng vẫn có
/// số (RN giữ cache React Query trên đĩa).
public protocol WaterCache: Sendable {
  func load(userId: String) async throws -> WaterSnapshot?
  func save(userId: String, _ snapshot: WaterSnapshot) async throws
}

public struct WaterSnapshot: Sendable, Hashable, Codable {
  public let date: LocalDate
  public let logs: [WaterLog]
  public let rows: [WaterRow]

  public init(date: LocalDate, logs: [WaterLog], rows: [WaterRow]) {
    self.date = date
    self.logs = logs
    self.rows = rows
  }
}

/// Nước uống hôm nay + 7 ngày của MỘT người (`use-water.ts`).
///
/// RN behavior:
/// - thêm: lạc quan, đi qua hàng đợi bền (`OFFLINE_WRITE_KEY`), id và ngày
///   chọn lúc chạm; mất mạng thì nói "đã lưu — sẽ đồng bộ khi có mạng";
/// - "−": CHỈ online (`useOnlineMutation`, `now(3)`) — mất mạng thì từ chối,
///   không vá lạc quan; tìm lần mới nhất trên server rồi xoá, không có gì để
///   xoá thì im; xoá được 0 hàng là lỗi; lỗi thì trả lại bản vá;
/// - xong thì đọc lại ngày + tuần.
///
/// Native behavior:
/// - danh sách = bản server ⊕ lần uống còn trong outbox (cùng cách
///   `ExerciseLibrary`) — cú chạm lúc mất mạng vẫn hiện, kể cả sau khi tắt app
///   mở lại; biểu đồ tuần cũng cộng chúng;
/// - theo `userId`: sổ của người khác không bao giờ hiện; kết quả về sau
///   `close()` (đăng xuất / đổi tài khoản) hay sau một lượt đọc mới hơn bị bỏ.
@MainActor @Observable
public final class WaterBook {
  public enum AddOutcome: Sendable, Hashable {
    case saved
    /// Mất mạng lúc chạm: đã giữ trên máy, sẽ gửi (`logMealQueued`).
    case queued
  }

  public enum AddRefusal: Error, Sendable, Hashable {
    case invalidAmount
    /// Sổ đã đóng / app không đưa chỗ ghi.
    case unavailable
    case storage(LocalWriteError)
  }

  public enum RemoveOutcome: Sendable, Hashable {
    case removed
    /// Server không có lần nào của hôm nay — RN `if (!last) return`.
    case nothingToRemove
    /// Mất mạng: không gửi, không giữ lại (`errOnlineOnly`).
    case onlineOnly
    /// Tìm được mà xoá ra 0 hàng (`nCxNothingWrittenWater`).
    case nothingWritten
    case failed
  }

  public let userId: String
  /// "Hôm nay" của sổ — đổi khi qua nửa đêm (`clockTick`) hay khi ghi.
  public private(set) var date: LocalDate
  /// Mới nhất trước.
  public private(set) var logs: [WaterLog] = []
  /// 7 ngày, cũ → mới.
  public private(set) var week: [WaterDay] = []
  /// Đã có số thật (server hay bản lưu trên máy) — trước đó màn không nói "0".
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?
  /// Một lệnh "−" đang chạy (`removeLast.isPending`).
  public private(set) var removing = false

  public var totalMl: Int { logs.reduce(0) { $0 + $1.amountMl } }
  /// "−" bấm được: có lần uống và không lệnh nào đang chạy.
  public var canRemove: Bool { !logs.isEmpty && !removing }

  @ObservationIgnored private let source: any WaterSource
  @ObservationIgnored private let cache: any WaterCache
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var serverLogs: [WaterLog] = []
  @ObservationIgnored private var serverRows: [WaterRow] = []
  @ObservationIgnored private var edits: [(seq: Int, entry: OutboxEntry)] = []
  @ObservationIgnored private var editSeq = 0
  /// Lần uống đang được "−" bỏ (vá lạc quan), trả lại nếu lệnh hỏng.
  @ObservationIgnored private var hidden: String?
  /// Mỗi lượt đọc một số; lượt về sau lượt mới hơn thì bỏ.
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  /// - Parameters:
  ///   - store: outbox; `nil` = chỉ đọc.
  ///   - onEnqueued: hàng vừa bền — app gọi `sync.kick()`.
  public init(
    userId: String, source: any WaterSource, cache: any WaterCache, store: (any PlanWriteStore)? = nil,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
    date = LocalDate(clock.nowMillis(), in: timeZone)
  }

  /// Đăng xuất / đổi tài khoản: từ đây không lượt đọc / ghi nào của sổ này
  /// đổi màn nữa.
  public func close() {
    closed = true
    generation += 1
  }

  private func today() -> LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// Bản lưu trên máy trước (nếu chưa có số), rồi hỏi server.
  public func load() async {
    guard !closed else { return }
    if !loaded {
      let gen = generation
      if let cached = try? await cache.load(userId: userId), !closed, gen == generation, !loaded {
        let day = today()
        date = day
        serverLogs = cached.date == day ? cached.logs : []
        serverRows = cached.rows.filter { $0.date >= Water.weekStart(day) }
        loaded = true
        if let pending = await pendingEdits(), !closed, gen == generation { merge(pending, since: editSeq, replacing: false) }
        publish()
      }
    }
    await refresh()
  }

  /// Ra tiền cảnh / mỗi lần mở màn: qua nửa đêm thì "hôm nay" đổi — đọc lại.
  public func clockTick() async {
    guard !closed, today() != date else { return }
    await refresh()
  }

  /// Đọc ngày + tuần. Lệnh chưa gửi đọc TRƯỚC khi hỏi server (như
  /// `ExerciseLibrary.refresh`): lệnh đã tới server thì nằm trong bản server.
  public func refresh() async {
    guard !closed else { return }
    generation += 1
    let gen = generation
    let day = today()
    if day != date {
      date = day
      serverLogs = []
      hidden = nil
    }
    let mark = editSeq
    let pending = await pendingEdits()
    guard !closed, gen == generation else { return }
    let source = self.source, userId = self.userId
    do {
      async let dayLogs = source.logs(userId: userId, date: day)
      async let weekRows = source.rows(userId: userId, from: Water.weekStart(day))
      let (fresh, rows) = try await (dayLogs, weekRows)
      guard !closed, gen == generation else { return }
      serverLogs = fresh
      serverRows = rows
      loaded = true
      failure = nil
      if let pending { merge(pending, since: mark, replacing: true) }
      publish()
      try? await cache.save(userId: userId, WaterSnapshot(date: day, logs: fresh, rows: rows))
    } catch {
      guard !closed, gen == generation else { return }
      failure = TodayController.failure([error])
      if let pending { merge(pending, since: mark, replacing: false) }
      publish()
    }
  }

  // MARK: - Ghi

  /// Thêm một lần uống (`useAddWater`): `amountMl` đã quy ra ml.
  @discardableResult
  public func add(amountMl: Int, online: Bool) async throws(AddRefusal) -> AddOutcome {
    guard let store, !closed else { throw .unavailable }
    guard amountMl > 0 else { throw .invalidAmount }
    let now = clock.nowMillis()
    // Ngày đọc NGAY lúc chạm (`date: dayOf()` trong `mutate`, không phải ngày
    // màn render lần cuối) — app mở qua nửa đêm ghi vào ngày mới. Sổ đang hiện
    // ngày cũ thì chuyển sang.
    let day = LocalDate(now, in: timeZone)
    let entry = Water.entry(id: makeId(), userId: userId, amountMl: amountMl, date: day, at: now, createdAt: now)
    do {
      try await store.enqueue([entry])
    } catch {
      throw .storage(LocalWriteError("\(error)"))
    }
    guard !closed else { return online ? .saved : .queued }
    if !edits.contains(where: { $0.entry.id == entry.id }) {
      editSeq += 1
      edits.append((editSeq, entry))
    }
    let movedDay = day != date
    if movedDay {
      date = day
      serverLogs = []
      hidden = nil
    }
    publish()
    onEnqueued(entry)
    // Sang ngày mới: bản server của ngày ấy chưa đọc.
    if movedDay { Task { await self.refresh() } }
    return online ? .saved : .queued
  }

  /// Bỏ lần uống mới nhất của hôm nay (`useRemoveLastWater`) — chỉ online.
  public func removeLast(online: Bool) async -> RemoveOutcome {
    guard !closed, !removing else { return .failed }
    guard online else { return .onlineOnly }
    let day = today()
    removing = true
    // Vá lạc quan: bỏ đúng hàng server sẽ bỏ — hàng SERVER mới nhất của ngày
    // (lần còn trong outbox server chưa thấy, lệnh tìm không chạm tới nó).
    if day == date, let newest = Water.newestFirst(serverLogs).first {
      hidden = newest.id
      publish()
    }
    let outcome: RemoveOutcome
    do {
      switch try await source.removeNewest(userId: userId, date: day) {
      case nil: outcome = .nothingToRemove
      case 0?: outcome = .nothingWritten
      default: outcome = .removed
      }
    } catch {
      outcome = NetworkFailure.isOffline(error) ? .onlineOnly : .failed
    }
    guard !closed else { return outcome }
    removing = false
    if outcome != .removed {
      // Trả lại bản vá (`rollbackWater`).
      hidden = nil
      publish()
    }
    // `onSettled`: đọc lại ngày + tuần dù thành hay hỏng.
    await refresh()
    return outcome
  }

  // MARK: - Bản server ⊕ lệnh chưa gửi

  private func pendingEdits() async -> [OutboxEntry]? {
    guard let store else { return [] }
    guard let all = try? await store.pending(userId: userId) else { return nil }
    return all.filter { $0.userId == userId && $0.kind == Water.addKind }
  }

  /// Như `ExerciseLibrary.merge`: bản server vừa về thì lệnh đã gửi xong nằm
  /// trong nó — chỉ giữ thêm lệnh nhận SAU `mark`.
  private func merge(_ pending: [OutboxEntry], since mark: Int, replacing: Bool) {
    let kept = replacing ? edits.filter { $0.seq > mark } : edits
    var merged: [(seq: Int, entry: OutboxEntry)] = []
    var seen = Set<String>()
    for e in pending where seen.insert(e.id).inserted {
      merged.append((kept.first { $0.entry.id == e.id }?.seq ?? 0, e))
    }
    for k in kept where seen.insert(k.entry.id).inserted { merged.append(k) }
    edits = merged
  }

  private func publish() {
    let local = edits.compactMap { Water.pendingLog($0.entry) }
    let serverIds = Set(serverLogs.map(\.id)).union(serverRows.map(\.id))
    if let h = hidden, !serverLogs.contains(where: { $0.id == h }) { hidden = nil }
    let dayLocal = local.filter { $0.row.date == date && !serverIds.contains($0.log.id) }.map(\.log)
    logs = Water.newestFirst(serverLogs.filter { $0.id != hidden } + dayLocal)
    let start = Water.weekStart(date)
    let rows = serverRows.filter { $0.id != hidden }
      + local.filter { $0.row.date >= start && !serverIds.contains($0.row.id) }.map(\.row)
    week = Water.week(rows, today: date)
  }
}
