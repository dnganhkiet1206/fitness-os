public import Foundation
public import Observation

extension WorkoutSessionRecord {
  /// `kind` của hàng outbox — cùng tên với hàng đợi bền của baseline
  /// (`offline-write.ts`, `kind: 'workout'`).
  public static let outboxKind = "workout"
}

/// Tầng ứng dụng của màn tập một ngày: UI gọi vào đây, đây gọi domain
/// (`WorkoutDay`, `WorkoutSessionRecord`) và cổng lưu (`WorkoutStore`). Không
/// UI, không mạng — build và test trên Linux.
///
/// ── luật ghi ──
///
/// Mỗi thao tác đổi trạng thái trên bộ nhớ NGAY (màn phản hồi tức thì), rồi
/// ghi bản chụp xuống máy qua một chuỗi ghi TUẦN TỰ. Hàm trả về khi bản chụp
/// ấy đã bền; `unsaved` nói thật khi ghi máy hỏng. Tuần tự là bắt buộc chứ
/// không phải cho gọn: hai bản chụp hạ cánh sai thứ tự thì bản cũ đè bản mới —
/// và nếu bản cũ đè lên lần chốt buổi thì ngày "chưa chốt" trở lại, nút Chốt
/// sáng lại, và lần bấm sau là một buổi thứ hai.
///
/// ── chốt buổi ──
///
/// kiểm → dựng bản ghi → MỘT giao dịch ghi (hàng outbox + ngày đã chốt) → trả
/// tổng kết. Không đợi mạng: gửi lên server là việc của vòng sync. Id buổi sinh
/// MỘT lần và giữ qua các lần thử lại, nên bấm hai lần, ghi hỏng rồi bấm lại,
/// hay app chết giữa chừng rồi bấm lại đều không thể thành hai buổi.
///
/// ── chưa làm ở bản này (baseline có) ──
///
/// Nối thêm set vào buổi đã chốt (`appending`, `useAppendToSession`): baseline
/// chỉ cho nối khi online vì phải đọc hàng hiện tại. Ở đây ngày đã chốt là chỉ
/// đọc. Kỷ lục cá nhân: luôn `false`, như đường offline của baseline (WS-10).
@MainActor @Observable
public final class WorkoutSessionController {
  public struct Plan: Sendable, Hashable {
    public let date: LocalDate
    public let templateId: String
    public let templateName: String
    public let rows: [PlannedSet]

    public init(date: LocalDate, templateId: String, templateName: String, rows: [PlannedSet]) {
      self.date = date
      self.templateId = templateId
      self.templateName = templateName
      self.rows = rows
    }
  }

  public enum Phase: Sendable, Hashable {
    /// Đang đọc điểm quay lại từ máy.
    case loading
    /// Chưa tick set nào.
    case idle
    /// Đã tick ít nhất một set, chưa chốt. Đang nghỉ hay không là việc của
    /// `RestTimerController` — một nguồn sự thật cho quãng nghỉ (#227 H5).
    case active
    case finished(sessionId: String)
  }

  public enum FinishRefusal: Error, Sendable, Hashable {
    case loading
    /// Đang có một lần chốt chạy — lần bấm thứ hai không làm gì.
    case inProgress
    /// Ngày trong tương lai: tick được, ghi thì chờ tới ngày (baseline `future`).
    case futureDay
    case nothingDone
    /// Ngày đã chốt từ trước (mở lại app sau khi chốt) — không có tổng kết
    /// trong bộ nhớ để trả lại.
    case alreadyLogged(sessionId: String)
    /// Giao dịch ghi máy hỏng: KHÔNG có gì được ghi, bấm lại là an toàn và
    /// dùng lại đúng id cũ.
    case storage(LocalWriteError)
  }

  public let plan: Plan
  public let userId: String
  public private(set) var progress = DayProgress()
  public private(set) var loggedSessionId: String?
  public private(set) var loaded = false
  /// Lần ghi máy gần nhất hỏng: những gì trên màn CHƯA bền.
  public private(set) var unsaved: LocalWriteError?
  /// Tổng kết của lần chốt trong phiên này (màn Tổng kết của C đọc nó).
  public private(set) var summary: WorkoutSummary?
  private var finishing = false
  /// Id của lần chốt chưa thành — giữ để lần thử lại không sinh buổi mới.
  private var pendingId: String?

  private let store: any WorkoutStore
  private let clock: any WallClock
  private let timeZone: TimeZone
  private let makeId: @Sendable () -> String
  private let onRest: @MainActor (RestEvent, PlannedSet?) -> Void
  private let onEnqueued: @MainActor (OutboxEntry) -> Void
  private var writes: Task<(any Error)?, Never>?
  private var issued = 0
  private var settled = 0

  /// - Parameters:
  ///   - onRest: tick/bỏ tick sinh ra việc cho quãng nghỉ; app nối nó vào
  ///     `RestTimerController.handle(_:target:)`. Hàng kèm theo là set KẾ TIẾP
  ///     mà quãng nghỉ chuẩn bị cho (RT-12).
  ///   - onEnqueued: hàng outbox vừa bền — vòng sync nên thử gửi.
  public init(
    plan: Plan, userId: String, store: any WorkoutStore, clock: any WallClock = SystemWallClock(),
    timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onRest: @escaping @MainActor (RestEvent, PlannedSet?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.plan = plan
    self.userId = userId
    self.store = store
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onRest = onRest
    self.onEnqueued = onEnqueued
  }

  public var key: String { DayProgressStore.key(date: plan.date, templateId: plan.templateId) }

  public var phase: Phase {
    if !loaded { return .loading }
    if let id = loggedSessionId { return .finished(sessionId: id) }
    return progress.done.values.contains(true) ? .active : .idle
  }

  public var isFuture: Bool { plan.date > LocalDate(clock.nowMillis(), in: timeZone) }

  /// Nút Chốt sáng khi nào (baseline `canFinish`, nhánh ghi mới).
  public var canFinish: Bool {
    loaded && loggedSessionId == nil && !finishing && !isFuture
      && plan.rows.contains { progress.done[$0.key] == true }
  }

  public func performed(_ row: PlannedSet, toKg: (Double) -> Double = { $0 }) -> PerformedSet {
    WorkoutDay.performed(row, progress, toKg: toKg)
  }

  // MARK: - đọc

  /// Mở lại ngày từ máy — local-first, không đợi mạng. Đọc hỏng thì màn mở
  /// trống và `unsaved` nói lý do, chứ không treo ở `.loading`.
  public func load() async {
    do {
      if let s = try await store.loadDay(key) {
        progress = s.progress
        loggedSessionId = s.loggedSessionId
      }
    } catch {
      unsaved = LocalWriteError("load: \(error)")
    }
    loaded = true
  }

  // MARK: - ghi

  /// Tick / bỏ tick. Tick BẬT một hàng chưa đủ (không tên, không reps) bị từ
  /// chối như baseline (`rowReady`). Trả `true` khi thay đổi đã bền.
  @discardableResult
  public func toggle(_ key: String) async -> Bool {
    guard editable, let row = row(key) else { return false }
    let on = !(progress.done[key] ?? false)
    if on && !WorkoutDay.isReady(row, progress) { return false }
    let event = WorkoutDay.toggle(row, &progress)
    onRest(event, WorkoutDay.next(after: row, in: plan.rows))
    return await persist()
  }

  @discardableResult
  public func setWeightText(_ text: String, for key: String) async -> Bool {
    guard editable, row(key) != nil else { return false }
    progress.weightText[key] = text
    return await persist()
  }

  @discardableResult
  public func setRepsText(_ text: String, for key: String) async -> Bool {
    guard editable, row(key) != nil else { return false }
    progress.repsText[key] = text
    return await persist()
  }

  /// Thời gian nghỉ của hàng, kẹp [0, 600] (RT-16).
  @discardableResult
  public func setRest(_ seconds: Int, for key: String) async -> Bool {
    guard editable, let row = row(key) else { return false }
    WorkoutDay.setRest(seconds, for: row, &progress)
    return await persist()
  }

  /// RPE 1…10; ngoài khoảng là dữ liệu hỏng, không ghi.
  @discardableResult
  public func setRpe(_ value: Int, for key: String) async -> Bool {
    guard editable, row(key) != nil, (1...10).contains(value) else { return false }
    progress.rpe[key] = value
    return await persist()
  }

  /// Chốt buổi. Trả tổng kết khi hàng outbox ĐÃ bền — không sớm hơn.
  /// Gọi lại sau khi đã chốt trả lại đúng tổng kết cũ, không ghi gì thêm.
  public func finish(toKg: (Double) -> Double = { $0 }) async throws(FinishRefusal) -> WorkoutSummary {
    if let id = loggedSessionId {
      if let s = summary, s.sessionId == id { return s }
      throw .alreadyLogged(sessionId: id)
    }
    guard loaded else { throw .loading }
    guard !finishing else { throw .inProgress }
    guard !isFuture else { throw .futureDay }
    let now = clock.nowMillis()
    let id = pendingId ?? makeId()
    guard let record = WorkoutSessionRecord(
      id: id, userId: userId,
      dateTime: WorkoutSessionRecord.stamp(
        for: plan.date, today: LocalDate(now, in: timeZone), now: now, timeZone: timeZone),
      templateId: plan.templateId, templateName: plan.templateName,
      sets: WorkoutDay.sessionSets(plan.rows, progress, toKg: toKg))
    else { throw .nothingDone }

    pendingId = id
    finishing = true
    defer { finishing = false }
    let entry = OutboxEntry(
      id: id, userId: userId, kind: WorkoutSessionRecord.outboxKind, payload: record.row, createdAt: now)
    // Điểm quay lại GIỮ NGUYÊN, khoá bằng `loggedSessionId`: mở lại app lúc
    // offline vẫn thấy đã làm gì. Baseline xoá nó vì "đã chốt" của baseline
    // đọc từ server; ở đây nó là read model của chính ngày ấy.
    let state = DayState(progress: progress, loggedSessionId: id)
    let store = self.store, key = self.key
    if let failure = await write({ _ = try await store.commitFinish(key, state, entry) }) {
      if let logged = failure as? DayAlreadyLogged {
        pendingId = nil
        throw .alreadyLogged(sessionId: logged.sessionId)
      }
      throw .storage(LocalWriteError("\(failure)"))
    }
    pendingId = nil
    loggedSessionId = id
    let result = WorkoutSummary(record)
    summary = result
    onEnqueued(entry)
    return result
  }

  // MARK: - nội bộ

  private var editable: Bool { loaded && loggedSessionId == nil && !finishing }

  private func row(_ key: String) -> PlannedSet? { plan.rows.first { $0.key == key } }

  private func persist() async -> Bool {
    let state = DayState(progress: progress, loggedSessionId: loggedSessionId)
    let store = self.store, key = self.key
    return await write({ try await store.saveDay(key, state) }) == nil
  }

  /// Xếp một lần ghi vào sau mọi lần ghi trước, đợi nó bền. `nil` = thành.
  ///
  /// `unsaved` chỉ nghe lần ghi MỚI NHẤT đã xong: bản chụp sau chứa mọi thứ
  /// của bản trước, nên một lần cũ hỏng được lần mới thành "chữa", còn một lần
  /// cũ thành không được xoá lỗi của lần mới hơn. Tầng lưu báo ngày đã bị chốt
  /// ở nơi khác thì màn chuyển sang đã chốt — đó không phải dữ liệu chưa bền.
  private func write(_ op: @escaping @Sendable () async throws -> Void) async -> (any Error)? {
    issued += 1
    let ticket = issued
    let previous = writes
    let task = Task<(any Error)?, Never> {
      _ = await previous?.value
      do {
        try await op()
        return nil
      } catch {
        return error
      }
    }
    writes = task
    let failure = await task.value
    if let logged = failure as? DayAlreadyLogged {
      loggedSessionId = logged.sessionId
    }
    if ticket > settled {
      settled = ticket
      unsaved = failure.flatMap { $0 is DayAlreadyLogged ? nil : LocalWriteError("\($0)") }
    }
    return failure
  }
}
