public import Foundation
public import Observation

extension WorkoutSessionRecord {
  /// `kind` của hàng outbox — cùng tên với hàng đợi bền của baseline
  /// (`offline-write.ts`, `kind: 'workout'`).
  public static let outboxKind = "workout"
  /// Bản ghi lại toàn bộ hàng sau khi nối thêm set (#296): upsert GHI ĐÈ theo
  /// `id` buổi. Id hàng outbox là `"<buổi>@<số hàng>"` — nối lại cùng tập hàng
  /// cho cùng id, nên phát lại không bao giờ nhân đôi.
  public static let revisionKind = "workout-revision"
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
    /// Khoá ngày của buổi không theo template nào.
    public static let adHocKey = "adhoc"

    public let date: LocalDate
    /// Id hàng `workout_templates`, hoặc `nil` cho buổi tự do. Đây là KHOÁ
    /// NGOẠI trên server (`workout_sessions.template_id`): id bịa là 23503,
    /// lỗi vĩnh viễn — buổi tập vào `dead`. Không có template thật thì để nil,
    /// như sheet ghi tự do của baseline.
    public let templateId: String?
    public let templateName: String
    public let rows: [PlannedSet]

    public init(date: LocalDate, templateId: String?, templateName: String, rows: [PlannedSet]) {
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
    /// Server đã có buổi của ngày này (ghi từ app RN, máy khác) — baseline
    /// `logged = sessions.length > 0` cũng tắt nút Chốt (`day-plan.tsx:1297`).
    case loggedElsewhere
    /// Nối thêm: không có hàng mới nào, hoặc có hàng chưa đủ (`pendingReady`).
    case nothingToAppend
    /// Giao dịch ghi máy hỏng: KHÔNG có gì được ghi, bấm lại là an toàn và
    /// dùng lại đúng id cũ.
    case storage(LocalWriteError)
  }

  public let plan: Plan
  public let userId: String
  public private(set) var progress = DayProgress()
  public private(set) var loggedSessionId: String?
  /// Các hàng đã nằm trong buổi đã chốt (#296).
  public private(set) var loggedKeys: Set<String> = []
  private var loggedAt: EpochMillis?
  private var loggedPR = false
  public private(set) var loaded = false
  /// Lần đọc gần nhất từ máy hỏng (lỗi SQLite, không phải "chưa có gì"). Màn
  /// hình nói "Không đọc được buổi đã lưu" và cho thử lại; mọi thao tác ghi bị
  /// từ chối cho tới khi đọc được.
  public private(set) var loadFailed = false
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
  /// Ngày này đã có buổi trên server. Tick vẫn được (xem lại, chuẩn bị), chốt
  /// thì không — nối thêm vào buổi đã có (`appending`) chưa có ở native.
  public let loggedElsewhere: Bool
  /// Bảng tốt-nhất để so kỷ lục lúc chốt (#295); `nil` = chưa biết lịch sử →
  /// không nhận kỷ lục (như baseline khi đọc lịch sử lỗi).
  private let bests: @MainActor () -> PersonalRecords.Bests?
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
    timeZone: TimeZone = .current, loggedElsewhere: Bool = false,
    bests: @escaping @MainActor () -> PersonalRecords.Bests? = { nil },
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
    self.loggedElsewhere = loggedElsewhere
    self.bests = bests
  }

  public var key: String {
    DayProgressStore.key(date: plan.date, templateId: plan.templateId ?? Plan.adHocKey)
  }

  public var phase: Phase {
    if !loaded { return .loading }
    if let id = loggedSessionId { return .finished(sessionId: id) }
    return progress.done.values.contains(true) ? .active : .idle
  }

  public var isFuture: Bool { plan.date > LocalDate(clock.nowMillis(), in: timeZone) }

  /// Nút Chốt sáng khi nào (baseline `canFinish`, nhánh ghi mới).
  public var canFinish: Bool {
    loaded && loggedSessionId == nil && !loggedElsewhere && !finishing && !isFuture
      && plan.rows.contains { progress.done[$0.key] == true }
  }

  /// Hàng tick sau khi chốt, chưa có trong buổi (`pendingRows`, `day-plan.tsx:1260`).
  public var pendingRows: [PlannedSet] {
    guard loggedSessionId != nil else { return [] }
    return plan.rows.filter { progress.done[$0.key] == true && !loggedKeys.contains($0.key) }
  }

  /// Nút "nối thêm" sáng khi nào (baseline `appending`, `day-plan.tsx:1329`):
  /// buổi của chính máy này, có hàng mới và MỌI hàng mới đều đủ.
  ///
  /// RN behavior: chỉ khi online (đọc hàng hiện tại rồi `update`).
  /// Native behavior: cả khi offline — bản ghi lại toàn bộ hàng đi qua outbox.
  /// Buổi ghi từ máy khác (`loggedElsewhere`) thì không: native không có bản
  /// đầy đủ của hàng ấy để ghi lại, và ghi đè sẽ làm mất set của máy kia.
  public var canAppend: Bool {
    let pending = pendingRows
    return loaded && loggedSessionId != nil && !loggedElsewhere && !finishing && !isFuture
      && !pending.isEmpty && pending.allSatisfy { WorkoutDay.isReady($0, progress) }
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
        // Blob trước #296 không có `loggedKeys`: mọi hàng đã tick lúc ấy.
        loggedKeys = Set(s.loggedKeys ?? s.progress.done.filter(\.value).map(\.key))
        loggedAt = s.loggedAt
        loggedPR = s.loggedPR ?? false
      }
    } catch {
      // Không đọc được ≠ không có gì. Coi là "chưa có gì" thì lần tick đầu
      // tiên ghi một ngày rỗng ĐÈ lên các set đã lưu (RN còn tệ hơn: ghi đè
      // ngay khi đọc hỏng, chưa cần chạm). Ở lại `.loading`, không cho sửa;
      // `load()` gọi lại được (`WorkoutFlow` thử lại khi ra tiền cảnh / làm mới).
      loadFailed = true
      return
    }
    loadFailed = false
    loaded = true
  }

  // MARK: - ghi

  /// Tick / bỏ tick. Tick BẬT một hàng chưa đủ (không tên, không reps) bị từ
  /// chối như baseline (`rowReady`). Trả `true` khi thay đổi đã bền.
  @discardableResult
  public func toggle(_ key: String) async -> Bool {
    guard editable(key), let row = row(key) else { return false }
    let on = !(progress.done[key] ?? false)
    if on && !WorkoutDay.isReady(row, progress) { return false }
    let event = WorkoutDay.toggle(row, &progress)
    onRest(event, WorkoutDay.next(after: row, in: plan.rows))
    return await persist()
  }

  @discardableResult
  public func setWeightText(_ text: String, for key: String) async -> Bool {
    guard editable(key), row(key) != nil else { return false }
    progress.weightText[key] = text
    return await persist()
  }

  @discardableResult
  public func setRepsText(_ text: String, for key: String) async -> Bool {
    guard editable(key), row(key) != nil else { return false }
    progress.repsText[key] = text
    return await persist()
  }

  /// Thời gian nghỉ của hàng, kẹp [0, 600] (RT-16).
  @discardableResult
  public func setRest(_ seconds: Int, for key: String) async -> Bool {
    guard editable(key), let row = row(key) else { return false }
    WorkoutDay.setRest(seconds, for: row, &progress)
    return await persist()
  }

  /// RPE 1…10; ngoài khoảng là dữ liệu hỏng, không ghi.
  @discardableResult
  public func setRpe(_ value: Int, for key: String) async -> Bool {
    guard editable(key), row(key) != nil, (1...10).contains(value) else { return false }
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
    guard !loggedElsewhere else { throw .loggedElsewhere }
    let now = clock.nowMillis()
    let id = pendingId ?? makeId()
    guard let draft = WorkoutSessionRecord(
      id: id, userId: userId,
      dateTime: WorkoutSessionRecord.stamp(
        for: plan.date, today: LocalDate(now, in: timeZone), now: now, timeZone: timeZone),
      templateId: plan.templateId, templateName: plan.templateName,
      sets: WorkoutDay.sessionSets(plan.rows, progress, toKg: toKg))
    else { throw .nothingDone }
    // Kỷ lục: so với lịch sử TRƯỚC buổi này (`use-fitness-data.ts:350`), một
    // lần, lúc chốt — `pr_detected` nằm trong hàng outbox, phát lại không đổi.
    let records = bests().map { PersonalRecords.findRecords(draft.recordSets, bests: $0) } ?? []
    let record = WorkoutSessionRecord(
      id: draft.id, userId: draft.userId, dateTime: draft.dateTime, templateId: draft.templateId,
      templateName: draft.templateName, sets: draft.sets, prDetected: !records.isEmpty)!

    pendingId = id
    finishing = true
    defer { finishing = false }
    let entry = OutboxEntry(
      id: id, userId: userId, kind: WorkoutSessionRecord.outboxKind, payload: record.row, createdAt: now)
    // Điểm quay lại GIỮ NGUYÊN, khoá bằng `loggedSessionId`: mở lại app lúc
    // offline vẫn thấy đã làm gì. Baseline xoá nó vì "đã chốt" của baseline
    // đọc từ server; ở đây nó là read model của chính ngày ấy.
    let keys = plan.rows.filter { progress.done[$0.key] == true }.map(\.key)
    let state = DayState(
      progress: progress, loggedSessionId: id, loggedKeys: keys, loggedAt: record.dateTime,
      loggedPR: record.prDetected)
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
    loggedKeys = Set(keys)
    loggedAt = record.dateTime
    loggedPR = record.prDetected
    let result = WorkoutSummary(record, records: records)
    summary = result
    onEnqueued(entry)
    return result
  }

  /// Nối các hàng mới vào buổi đã chốt (#296, `useAppendToSession`). Trả về
  /// tổng kết của CẢ buổi sau khi nối, khi bản ghi lại đã bền.
  ///
  /// RN behavior: đọc hàng trên server, CỘNG mảng `sets`, `update`
  ///   (`use-fitness-data.ts:599`) — không idempotent: timeout sau khi server
  ///   đã ghi, lần thử lại nối set HAI LẦN; chỉ online.
  /// Native behavior: dựng lại TOÀN BỘ hàng (hàng đã có + hàng mới) cùng `id`
  ///   buổi và cùng dấu thời gian, upsert ghi đè qua outbox. Id hàng outbox xác
  ///   định theo số hàng → phát lại / bấm lại không nhân đôi; chạy cả offline;
  ///   volume, RPE, số set tính lại từ đủ set (không cộng dồn lệch).
  /// Kỷ lục: chỉ xét set MỚI, so với bảng đã gồm phần đầu của buổi; `pr_detected`
  ///   chỉ bật lên, không tắt (baseline).
  public func append(toKg: (Double) -> Double = { $0 }) async throws(FinishRefusal) -> WorkoutSummary {
    guard loaded else { throw .loading }
    guard !finishing else { throw .inProgress }
    guard let sessionId = loggedSessionId, canAppend else {
      if loggedElsewhere { throw .loggedElsewhere }
      throw .nothingToAppend
    }
    let pending = pendingRows
    let allKeys = loggedKeys.union(pending.map(\.key))
    let rows = plan.rows.filter { allKeys.contains($0.key) && progress.done[$0.key] == true }
    let stamp = loggedAt ?? clock.nowMillis()
    guard let draft = WorkoutSessionRecord(
      id: sessionId, userId: userId, dateTime: stamp, templateId: plan.templateId,
      templateName: plan.templateName, sets: WorkoutDay.sessionSets(rows, progress, toKg: toKg))
    else { throw .nothingToAppend }
    let added = WorkoutDay.sessionSets(pending, progress, toKg: toKg).map {
      RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weightKg, reps: $0.reps, warmup: $0.warmup, durationSec: $0.durationSec)
    }
    let records = bests().map { PersonalRecords.findRecords(added, bests: $0) } ?? []
    let pr = loggedPR || !records.isEmpty
    let record = WorkoutSessionRecord(
      id: draft.id, userId: draft.userId, dateTime: draft.dateTime, templateId: draft.templateId,
      templateName: draft.templateName, sets: draft.sets, prDetected: pr)!

    finishing = true
    defer { finishing = false }
    let entry = OutboxEntry(
      id: "\(sessionId)@\(record.sets.count)", userId: userId, kind: WorkoutSessionRecord.revisionKind,
      payload: record.row, createdAt: clock.nowMillis())
    let state = DayState(
      progress: progress, loggedSessionId: sessionId, loggedKeys: allKeys.sorted(), loggedAt: stamp, loggedPR: pr)
    let store = self.store, key = self.key
    if let failure = await write({ _ = try await store.commitFinish(key, state, entry) }) {
      if let logged = failure as? DayAlreadyLogged { throw .alreadyLogged(sessionId: logged.sessionId) }
      throw .storage(LocalWriteError("\(failure)"))
    }
    loggedKeys = allKeys
    loggedPR = pr
    let result = WorkoutSummary(record, records: records)
    summary = result
    onEnqueued(entry)
    return result
  }

  // MARK: - nội bộ

  /// Ngày chưa chốt: mọi hàng sửa được. Đã chốt: chỉ hàng CHƯA nằm trong buổi
  /// (hàng sẽ được nối thêm). Bỏ tick / sửa hàng đã ghi ở baseline là gỡ set
  /// khỏi server (`useRemoveSetFromSession`) — chưa port, nên khoá.
  private func editable(_ key: String) -> Bool {
    loaded && !finishing && (loggedSessionId == nil || !loggedKeys.contains(key))
  }

  private func row(_ key: String) -> PlannedSet? { plan.rows.first { $0.key == key } }

  private var dayState: DayState {
    DayState(
      progress: progress, loggedSessionId: loggedSessionId,
      loggedKeys: loggedSessionId == nil ? nil : loggedKeys.sorted(), loggedAt: loggedAt,
      loggedPR: loggedSessionId == nil ? nil : loggedPR)
  }

  private func persist() async -> Bool {
    let state = dayState
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
