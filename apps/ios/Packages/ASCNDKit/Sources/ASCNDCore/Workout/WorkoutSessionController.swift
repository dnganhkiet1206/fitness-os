public import Foundation
public import Observation

extension WorkoutSessionRecord {
  /// `kind` của hàng outbox — cùng tên với hàng đợi bền của baseline
  /// (`offline-write.ts`, `kind: 'workout'`).
  public static let outboxKind = "workout"
  /// Bản ghi lại toàn bộ hàng sau khi nối thêm / gỡ set (#296, #398): upsert
  /// GHI ĐÈ theo `id` buổi. Id hàng outbox là `"<buổi>@r<n>"`, `n` đếm bền trong
  /// `DayState.loggedRevision` — bản ghi bền cùng giao dịch với số đếm, nên phát
  /// lại không nhân đôi, và hai bản khác nhau không bao giờ trùng id.
  public static let revisionKind = "workout-revision"
  /// Gỡ set CUỐI CÙNG của buổi: xoá cả hàng (`use-fitness-data.ts:746`). Payload
  /// chỉ có `id`; id hàng outbox cùng dạng `"<buổi>@r<n>"`.
  public static let deleteKind = "workout-delete"
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

  /// Bỏ tick một set ĐÃ nằm trong buổi đã chốt (#398) — hoàn tác được trong
  /// `undoWindowMillis`.
  public struct Removal: Sendable, Hashable {
    public let key: String
    public let sessionId: String
    public let expiresAt: EpochMillis
    /// Đó là set cuối cùng: cả hàng buổi bị xoá (hoàn tác dựng lại nó).
    public let deletedSession: Bool
  }

  public enum RemoveRefusal: Error, Sendable, Hashable {
    case loading
    /// Đang có một lần ghi buổi (chốt / nối / gỡ / hoàn tác) chạy — chặn ở cửa
    /// như baseline (`cutSet.isPending`, `day-plan.tsx:1181`).
    case inProgress
    /// Hàng không nằm trong buổi đã chốt — không có gì để gỡ.
    case notLogged
    /// Buổi ghi từ máy khác: không có bản đầy đủ của hàng để ghi lại.
    case loggedElsewhere
    /// Hết cửa sổ hoàn tác, hoặc buổi đã đổi từ lúc gỡ.
    case expired
    case storage(LocalWriteError)
  }

  /// Cửa sổ hoàn tác: `ACTION_HIDE_MS` của baseline (`day-plan.tsx:1236`).
  public static let undoWindowMillis: Int64 = 8_000

  public let plan: Plan
  public let userId: String
  public private(set) var progress = DayProgress()
  public private(set) var loggedSessionId: String?
  /// Các hàng đã nằm trong buổi đã chốt (#296).
  public private(set) var loggedKeys: Set<String> = []
  private var loggedAt: EpochMillis?
  private var loggedPR = false
  private var loggedRevision = 0
  private var loggedRpe: Int?
  public private(set) var loaded = false
  /// Lần đọc gần nhất từ máy hỏng (lỗi SQLite, không phải "chưa có gì"). Màn
  /// hình nói "Không đọc được buổi đã lưu" và cho thử lại; mọi thao tác ghi bị
  /// từ chối cho tới khi đọc được.
  public private(set) var loadFailed = false
  /// Template của buổi đã bị xoá khi buổi còn mở (#401). Buổi vẫn tập / chốt /
  /// nối thêm bình thường, nhưng hàng ghi lên KHÔNG trỏ vào nó nữa.
  ///
  /// RN BUG FOUND: xoá template (`templates.tsx`) trong lúc màn ngày tập của
  /// nó còn mở, rồi chốt → `insert workout_sessions` mang `template_id` của
  /// hàng đã mất → 23503 (FK) / RLS "Session points at own template" → lỗi
  /// vĩnh viễn; bản offline vào thẳng `dead`. Mất cả buổi tập.
  /// NATIVE FIX: buổi chốt sau khi template bị xoá ghi `template_id = null` —
  /// đúng thứ server tự làm với buổi chốt TRƯỚC đó (`ON DELETE SET NULL`).
  /// (test `deletedTemplateDetachesTheOpenSession`.)
  public private(set) var templateDetached = false
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

  /// Mọi hàng của ngày: theo kế hoạch, rồi các bài thêm (#399).
  public var rows: [PlannedSet] { plan.rows + WorkoutPlanning.adHocRows(progress.extra) }

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
      && rows.contains { progress.done[$0.key] == true }
  }

  /// Hàng tick sau khi chốt, chưa có trong buổi (`pendingRows`, `day-plan.tsx:1260`).
  public var pendingRows: [PlannedSet] {
    guard loggedSessionId != nil else { return [] }
    return rows.filter { progress.done[$0.key] == true && !loggedKeys.contains($0.key) }
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
        loggedRevision = s.loggedRevision ?? 0
        loggedRpe = s.loggedRpe
        // Buổi đã bị xoá từ lịch sử (#400): không còn gì để tổng kết.
        if loggedKeys.isEmpty { summary = nil }
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
    onRest(event, WorkoutDay.next(after: row, in: rows))
    return await persist()
  }

  /// Ô tạ lọc qua `decText` như `day-plan.tsx:1979`: máy tiếng Việt gõ `71,5`,
  /// lưu nguyên thì `performed()` đọc ra 0 kg — mất tạ mà không báo gì.
  @discardableResult
  public func setWeightText(_ text: String, for key: String) async -> Bool {
    guard editable(key), row(key) != nil else { return false }
    progress.weightText[key] = NumberInput.decimal(text)
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
      templateId: recordTemplateId, templateName: plan.templateName,
      sets: WorkoutDay.sessionSets(rows, progress, toKg: toKg))
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
    let keys = rows.filter { progress.done[$0.key] == true }.map(\.key)
    let state = DayState(
      progress: progress, loggedSessionId: id, loggedKeys: keys, loggedAt: record.dateTime,
      loggedPR: record.prDetected, loggedRevision: 0, loggedRpe: record.sessionRpe)
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
    loggedRevision = 0
    loggedRpe = record.sessionRpe
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
    let added = WorkoutDay.sessionSets(pending, progress, toKg: toKg).map {
      RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weightKg, reps: $0.reps, warmup: $0.warmup, durationSec: $0.durationSec)
    }
    let records = bests().map { PersonalRecords.findRecords(added, bests: $0) } ?? []
    let pr = loggedPR || !records.isEmpty
    let outcome: Revised
    do throws(RevisionFailure) {
      outcome = try await revise(sessionId: sessionId, keys: allKeys, pr: pr, toKg: toKg)
    } catch {
      switch error {
      case .alreadyLogged(let id): throw .alreadyLogged(sessionId: id)
      case .storage(let e): throw .storage(e)
      }
    }
    guard let record = outcome.record else { throw .nothingToAppend }
    let result = WorkoutSummary(record, records: records)
    summary = result
    return result
  }

  // MARK: - bài thêm ngoài kế hoạch (#399)

  /// Thêm một bài trống, một hiệp (`addExercise`, `day-plan.tsx:987`). Trả id
  /// của bài — màn đặt con trỏ vào ô tên của nó.
  @discardableResult
  public func addExercise() async -> String? {
    guard loaded, !finishing else { return nil }
    let id = makeId()
    progress.extra.append(AdHocExercise(id: id))
    return await persist() ? id : nil
  }

  /// Đổi tên bài thêm. Bị từ chối khi bài đã có set nằm trong buổi đã chốt —
  /// xem `adHocLocked`.
  @discardableResult
  public func renameExercise(_ id: String, to name: String) async -> Bool {
    guard loaded, !finishing, !adHocLocked(id), let i = progress.extra.firstIndex(where: { $0.id == id }) else {
      return false
    }
    progress.extra[i].name = name
    return await persist()
  }

  /// Thêm một hiệp cho bài thêm, trần 20 (`addSet`, `:994`). Được cả sau khi
  /// chốt: hiệp mới là hàng nối thêm (#296).
  @discardableResult
  public func addSet(to id: String) async -> Bool {
    guard loaded, !finishing, let i = progress.extra.firstIndex(where: { $0.id == id }),
      progress.extra[i].sets < WorkoutPlanning.maxSets
    else { return false }
    progress.extra[i].sets += 1
    return await persist()
  }

  /// Bỏ một bài thêm (`removeExtra`, `:998`), cùng mọi ghi đè của các hàng của
  /// nó — không thì dấu tích mồ côi giữ `phase` ở `.active` cho hàng không còn.
  @discardableResult
  public func removeExercise(_ id: String) async -> Bool {
    guard loaded, !finishing, !adHocLocked(id), progress.extra.contains(where: { $0.id == id }) else { return false }
    let keys = Set(rows.filter { $0.adHoc == id }.map(\.key))
    progress.extra.removeAll { $0.id == id }
    for k in keys {
      progress.done[k] = nil
      progress.rpe[k] = nil
      progress.rest[k] = nil
      progress.weightText[k] = nil
      progress.repsText[k] = nil
    }
    return await persist()
  }

  /// Bài thêm có set đã nằm trong buổi đã chốt: không đổi tên, không bỏ được.
  ///
  /// RN behavior: đổi tên / bỏ bài lúc nào cũng được — chỉ đổi màn, còn
  ///   `workout_sessions` vẫn giữ các set cũ dưới tên cũ: màn và buổi đã lưu
  ///   nói hai điều khác nhau.
  /// Native behavior: gỡ các set ấy trước (`removeLoggedSet`, #398), rồi mới
  ///   đổi tên / bỏ bài — buổi đã lưu luôn khớp với màn.
  public func adHocLocked(_ id: String) -> Bool {
    loggedSessionId != nil && rows.contains { $0.adHoc == id && loggedKeys.contains($0.key) }
  }

  // MARK: - gỡ set đã chốt (#398)

  /// Gỡ được hàng này không: nằm trong buổi đã chốt của chính máy này.
  public func canRemove(_ key: String) -> Bool {
    loaded && !finishing && !loggedElsewhere && loggedSessionId != nil && loggedKeys.contains(key)
  }

  /// Bỏ tick một set đã nằm trong buổi (`useRemoveSetFromSession`). Màn hình hỏi
  /// lại TRƯỚC khi gọi (hộp destructive, `day-plan.tsx:1206`).
  ///
  /// RN behavior: đọc hàng trên server, gỡ set CUỐI cùng tên bài, `update` (hoặc
  ///   `delete` nếu hết set); chỉ online; hoàn tác = upsert ảnh chụp hàng cũ.
  /// Native behavior: gỡ ĐÚNG set của hàng bị bỏ tick — native biết hàng nào
  ///   là set nào (`loggedKeys`), còn RN chỉ có tên bài nên phải chọn "set cuối"
  ///   để các dấu tích không nhảy chỗ (`:700`). Ghi lại TOÀN BỘ hàng qua outbox
  ///   (cùng đường với nối thêm, #296): chạy cả offline, idempotent, không có
  ///   cuộc đua đọc–sửa–ghi. Set cuối cùng → hàng outbox xoá buổi.
  /// Giữ như RN: `session_rpe` không đổi; volume tính lại, bỏ khởi động.
  public func removeLoggedSet(_ key: String, toKg: (Double) -> Double = { $0 }) async throws(RemoveRefusal) -> Removal {
    guard loaded else { throw .loading }
    guard !finishing else { throw .inProgress }
    guard !loggedElsewhere else { throw .loggedElsewhere }
    guard let sessionId = loggedSessionId, loggedKeys.contains(key) else { throw .notLogged }
    let wasDone = progress.done[key]
    progress.done[key] = false
    let keys = loggedKeys.subtracting([key])
    let outcome: Revised
    do throws(RevisionFailure) {
      outcome = try await revise(sessionId: sessionId, keys: keys, pr: loggedPR, toKg: toKg)
    } catch {
      progress.done[key] = wasDone
      switch error {
      case .alreadyLogged: throw .expired
      case .storage(let e): throw .storage(e)
      }
    }
    summary = outcome.record.map { WorkoutSummary($0, records: []) }
    onRest(.cancel, nil)
    return Removal(
      key: key, sessionId: sessionId, expiresAt: clock.nowMillis() + Self.undoWindowMillis,
      deletedSession: outcome.record == nil)
  }

  /// Hoàn tác một lần gỡ trong cửa sổ 8 giây: set trở lại buổi, hàng được ghi
  /// lại (dựng lại nếu đã bị xoá).
  public func undo(_ removal: Removal, toKg: (Double) -> Double = { $0 }) async throws(RemoveRefusal) {
    guard loaded else { throw .loading }
    guard !finishing else { throw .inProgress }
    guard clock.nowMillis() < removal.expiresAt, removal.sessionId == loggedSessionId,
      !loggedKeys.contains(removal.key), row(removal.key) != nil
    else { throw .expired }
    let wasDone = progress.done[removal.key]
    progress.done[removal.key] = true
    let outcome: Revised
    do throws(RevisionFailure) {
      outcome = try await revise(
        sessionId: removal.sessionId, keys: loggedKeys.union([removal.key]), pr: loggedPR, toKg: toKg)
    } catch {
      progress.done[removal.key] = wasDone
      switch error {
      case .alreadyLogged: throw .expired
      case .storage(let e): throw .storage(e)
      }
    }
    summary = outcome.record.map { WorkoutSummary($0, records: []) }
  }

  /// Template đã bị xoá trên máy này (lệnh xoá đã bền). Không phải template
  /// của buổi thì không làm gì.
  public func templateDeleted(_ id: String) {
    if plan.templateId?.lowercased() == id.lowercased() { templateDetached = true }
  }

  private var recordTemplateId: String? { templateDetached ? nil : plan.templateId }

  private struct Revised {
    /// `nil` = không còn set nào: hàng buổi bị xoá.
    let record: WorkoutSessionRecord?
  }

  private enum RevisionFailure: Error {
    case alreadyLogged(String)
    case storage(LocalWriteError)
  }

  /// Ghi lại TOÀN BỘ hàng buổi từ các hàng `keys`, cùng `id` buổi và cùng dấu
  /// thời gian, qua outbox — một giao dịch với trạng thái ngày. Không còn set
  /// nào → hàng outbox xoá buổi.
  private func revise(
    sessionId: String, keys: Set<String>, pr: Bool, toKg: (Double) -> Double
  ) async throws(RevisionFailure) -> Revised {
    let kept = rows.filter { keys.contains($0.key) && progress.done[$0.key] == true }
    let stamp = loggedAt ?? clock.nowMillis()
    let record = WorkoutSessionRecord(
      id: sessionId, userId: userId, dateTime: stamp, templateId: recordTemplateId,
      templateName: plan.templateName, sets: WorkoutDay.sessionSets(kept, progress, toKg: toKg),
      prDetected: pr, sessionRpeFloor: loggedRpe)
    let revision = loggedRevision + 1
    let entry = OutboxEntry(
      id: "\(sessionId)@r\(revision)", userId: userId,
      kind: record == nil ? WorkoutSessionRecord.deleteKind : WorkoutSessionRecord.revisionKind,
      payload: record?.row ?? WorkoutSessionRecord.deletePayload(id: sessionId, at: stamp), createdAt: clock.nowMillis())
    let rpe = record?.sessionRpe ?? loggedRpe
    let state = DayState(
      progress: progress, loggedSessionId: sessionId, loggedKeys: keys.sorted(), loggedAt: stamp,
      loggedPR: pr, loggedRevision: revision, loggedRpe: rpe)
    finishing = true
    defer { finishing = false }
    let store = self.store, key = self.key
    if let failure = await write({ _ = try await store.commitFinish(key, state, entry) }) {
      if let logged = failure as? DayAlreadyLogged { throw .alreadyLogged(logged.sessionId) }
      throw .storage(LocalWriteError("\(failure)"))
    }
    loggedKeys = keys
    loggedPR = pr
    loggedRevision = revision
    loggedRpe = rpe
    onEnqueued(entry)
    return Revised(record: record)
  }

  // MARK: - nội bộ

  /// Ngày chưa chốt: mọi hàng sửa được. Đã chốt: chỉ hàng CHƯA nằm trong buổi
  /// (hàng sẽ được nối thêm). Bỏ tick hàng đã ghi đi qua `removeLoggedSet`
  /// (có hộp hỏi lại và hoàn tác), không qua `toggle`.
  private func editable(_ key: String) -> Bool {
    loaded && !finishing && (loggedSessionId == nil || !loggedKeys.contains(key))
  }

  private func row(_ key: String) -> PlannedSet? { rows.first { $0.key == key } }

  private var dayState: DayState {
    DayState(
      progress: progress, loggedSessionId: loggedSessionId,
      loggedKeys: loggedSessionId == nil ? nil : loggedKeys.sorted(), loggedAt: loggedAt,
      loggedPR: loggedSessionId == nil ? nil : loggedPR,
      loggedRevision: loggedSessionId == nil ? nil : loggedRevision, loggedRpe: loggedRpe)
  }

  private func persist() async -> Bool {
    let state = dayState
    let store = self.store, key = self.key, userId = self.userId
    return await write({ try await store.saveDay(key, state, userId: userId) }) == nil
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
