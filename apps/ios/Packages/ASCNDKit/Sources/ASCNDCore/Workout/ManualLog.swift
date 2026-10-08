public import Foundation
public import Observation

/// Ghi buổi tập thủ công (#418) — màn "Ghi buổi tập" (`app/log-workout.tsx`).
///
/// Nguồn baseline (`fac9ac2`):
/// - form: tên, RPE buổi (6…10, mặc định 7), các hàng set `{bài, kg, reps
///   ("10" hoặc "45s"), khởi động}` (`log-workout.tsx:62`);
/// - gợi ý kế hoạch hôm nay (`todaysPlan`, `:136`): chỉ khi hôm nay có
///   template, không nghỉ, CHƯA có buổi nào, và chưa dùng; một chạm điền tên +
///   mỗi set một hàng (`rowsFromTemplate`, `:94`) + RPE = đầu trên của
///   `effortRange`, kẹp 6…10;
/// - hàng được ghi = hàng có reps hoặc thời gian giữ (`validSets`, `:458`);
///   cận `lift_kg` 0…600, `set_reps` 1…500 chỉ trên các hàng ấy;
/// - ghi: `template_id = null`, `session_rpe` = RPE đã chọn, mỗi set `rpe: null`.
///
/// Native: một đường ghi duy nhất — `WorkoutSessionRecord` → `commitFinish`
/// (cùng giao dịch, cùng outbox với màn tập theo kế hoạch). Bản nháp bền trong
/// `DayState.manual`: app bị kill giữa lúc nhập, mở lại còn nguyên.
public struct ManualDraft: Sendable, Hashable, Codable {
  public var name: String
  public var rpe: Int
  public var rows: [ManualSetRow]
  /// Đã dùng gợi ý kế hoạch — không gợi ý lại.
  public var planUsed: Bool

  public init(name: String = "", rpe: Int = 7, rows: [ManualSetRow], planUsed: Bool = false) {
    self.name = name
    self.rpe = rpe
    self.rows = rows
    self.planUsed = planUsed
  }
}

/// Một hàng của form. Chữ giữ nguyên như người dùng gõ; đổi ra số lúc ghi.
public struct ManualSetRow: Sendable, Hashable, Codable, Identifiable {
  /// Khoá ổn định cho màn (thêm / bỏ hàng không làm ô nhảy chỗ).
  public let id: String
  /// Id bài trong thư viện; rỗng = bài gõ tay.
  public var exerciseId: String
  public var exerciseName: String
  /// Theo đơn vị hiển thị (kg / lb).
  public var weight: String
  /// "10" hoặc "45s" (`RepEntry`).
  public var reps: String
  public var warmup: Bool

  public init(
    id: String, exerciseId: String = "", exerciseName: String = "", weight: String = "", reps: String = "",
    warmup: Bool = false
  ) {
    self.id = id
    self.exerciseId = exerciseId
    self.exerciseName = exerciseName
    self.weight = weight
    self.reps = reps
    self.warmup = warmup
  }
}

@MainActor @Observable
public final class ManualLogController {
  public nonisolated static let rpeValues = 6...10
  public nonisolated static let defaultRpe = 7
  /// `BOUNDS.lift_kg` (`plausible.ts:167`).
  public static let liftKg = 0.0...600.0
  /// `BOUNDS.set_reps` (`plausible.ts:175`).
  public static let setReps = 1...500
  /// Khoá ngày của buổi thủ công thứ `n` trong ngày.
  public nonisolated static func slotKey(date: LocalDate, _ n: Int) -> String {
    DayProgressStore.key(date: date, templateId: "manual-\(n)")
  }

  public enum Field: Sendable, Hashable { case weight, reps }

  public enum SaveRefusal: Error, Sendable, Hashable {
    case loading
    case inProgress
    /// Không có hàng nào có reps / thời gian giữ.
    case nothingDone
    /// Có hàng ngoài cận (`firstSetError`) — nút Lưu tắt.
    case outOfRange
    case alreadyLogged(sessionId: String)
    case storage(LocalWriteError)
  }

  public let userId: String
  public let date: LocalDate
  public private(set) var name = ""
  public private(set) var rpe = ManualLogController.defaultRpe
  public private(set) var rows: [ManualSetRow]
  public private(set) var planUsed = false
  public private(set) var loaded = false
  /// Buổi đã ghi từ bản nháp này; form khoá.
  public private(set) var loggedSessionId: String?
  public private(set) var summary: WorkoutSummary?
  /// Lần ghi nháp mới nhất chưa bền.
  public private(set) var unsaved: LocalWriteError?

  @ObservationIgnored private let store: any WorkoutStore
  @ObservationIgnored private let todaysTemplate: @MainActor () -> WorkoutTemplate?
  @ObservationIgnored private let loggedToday: @MainActor () -> Bool
  @ObservationIgnored private let bests: @MainActor () -> PersonalRecords.Bests?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var slot = 0
  @ObservationIgnored private var pendingId: String?
  @ObservationIgnored private var saving = false
  @ObservationIgnored private var writes: Task<(any Error)?, Never>?
  @ObservationIgnored private var issued = 0
  @ObservationIgnored private var settled = 0

  /// - Parameters:
  ///   - todaysTemplate: template của hôm nay theo kế hoạch (`nil` khi nghỉ /
  ///     chưa lên lịch) — `TodayController.plan?.template`.
  ///   - loggedToday: hôm nay đã có buổi (server hoặc máy này).
  ///   - bests: bảng tốt-nhất để nhận kỷ lục lúc ghi; `nil` = không nhận.
  public init(
    userId: String, date: LocalDate, store: any WorkoutStore,
    todaysTemplate: @escaping @MainActor () -> WorkoutTemplate? = { nil },
    loggedToday: @escaping @MainActor () -> Bool = { false },
    bests: @escaping @MainActor () -> PersonalRecords.Bests? = { nil },
    clock: any WallClock = SystemWallClock(),
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.date = date
    self.store = store
    self.todaysTemplate = todaysTemplate
    self.loggedToday = loggedToday
    self.bests = bests
    self.clock = clock
    self.makeId = makeId
    self.onEnqueued = onEnqueued
    rows = [ManualSetRow(id: makeId())]
  }

  // MARK: - Mở

  /// Tìm bản nháp đang dở của hôm nay (app bị kill giữa lúc nhập) — không có
  /// thì mở form trống ở ô kế tiếp. Ô đã ghi bị khoá: buổi thứ hai trong ngày
  /// là buổi MỚI (tập hai buổi một ngày là có thật), không bao giờ ghi đè.
  public func load() async {
    var n = 0
    while true {
      let state: DayState?
      do {
        state = try await store.loadDay(Self.slotKey(date: date, n))
      } catch {
        // Không đọc được: mở form trống ở ô này. Ghi vào ô đã khoá thì tầng lưu
        // từ chối (`DayAlreadyLogged`), không ghi đè buổi nào.
        state = nil
      }
      guard let state else { break }
      if state.loggedSessionId == nil {
        if let draft = state.manual { restore(draft) }
        break
      }
      n += 1
    }
    slot = n
    loaded = true
  }

  /// Ghi xong, mở form trống cho buổi kế tiếp trong ngày.
  public func startNew() async {
    guard loggedSessionId != nil else { return }
    loggedSessionId = nil
    summary = nil
    name = ""
    rpe = Self.defaultRpe
    rows = [ManualSetRow(id: makeId())]
    planUsed = false
    slot += 1
  }

  private func restore(_ d: ManualDraft) {
    name = d.name
    rpe = Self.rpeValues.contains(d.rpe) ? d.rpe : Self.defaultRpe
    rows = d.rows.isEmpty ? [ManualSetRow(id: makeId())] : d.rows
    planUsed = d.planUsed
  }

  // MARK: - Kế hoạch hôm nay

  /// Gợi ý điền từ kế hoạch: chỉ khi chưa dùng, hôm nay chưa có buổi nào, và
  /// form còn mở — một lời mời ghi lần hai đúng buổi vừa ghi là sai (`:144`).
  public var planOffer: WorkoutTemplate? {
    guard loaded, loggedSessionId == nil, !planUsed, !loggedToday() else { return nil }
    return todaysTemplate()
  }

  /// `usePlan`: tên, mỗi set một hàng, RPE = đầu trên của `effortRange`.
  /// - Parameter display: kg → đơn vị hiển thị (`displayWeight`).
  @discardableResult
  public func usePlan(display: (Double) -> Double = { $0 }) async -> Bool {
    guard let tpl = planOffer else { return false }
    name = tpl.name
    rows = Self.rows(from: tpl.exercises, display: display, makeId: makeId)
    if let top = tpl.exercises.map(\.rpe).max() {
      rpe = min(Self.rpeValues.upperBound, max(Self.rpeValues.lowerBound, top))
    }
    planUsed = true
    return await persist()
  }

  /// `rowsFromTemplate`: mỗi set một hàng; tạ 0 → ô trống (bodyweight, không
  /// phải "0 kg" ai đó gõ); reps 0 → trống; không bao giờ là khởi động.
  /// Native giữ `exerciseId` của template (baseline để rỗng) — cùng bài trong
  /// thư viện, để tổng kết đếm bài theo id như màn tập theo kế hoạch.
  static func rows(
    from exercises: [TemplateExercise], display: (Double) -> Double, makeId: () -> String
  ) -> [ManualSetRow] {
    var out: [ManualSetRow] = []
    for ex in exercises {
      for _ in 0..<min(WorkoutPlanning.maxSets, max(1, ex.sets)) {
        out.append(ManualSetRow(
          id: makeId(), exerciseId: ex.exerciseId ?? "", exerciseName: ex.exerciseName,
          weight: ex.weightKg != 0 ? jsNumber((display(ex.weightKg) * 10).rounded() / 10) : "",
          reps: ex.reps != 0 ? String(ex.reps) : ""))
      }
    }
    return out.isEmpty ? [ManualSetRow(id: makeId())] : out
  }

  /// `String(n)` của JS cho số đã làm tròn một chữ số: 60 → "60", 82.5 → "82.5".
  static func jsNumber(_ v: Double) -> String {
    v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : String(v)
  }

  // MARK: - Sửa form

  @discardableResult
  public func setName(_ text: String) async -> Bool {
    guard editable else { return false }
    name = text
    return await persist()
  }

  @discardableResult
  public func setRpe(_ value: Int) async -> Bool {
    guard editable, Self.rpeValues.contains(value) else { return false }
    rpe = value
    return await persist()
  }

  /// Gõ tên bài bỏ bài đã chọn từ thư viện (`updateSet`, `:368`).
  @discardableResult
  public func setExerciseName(_ text: String, row id: String) async -> Bool {
    await edit(id) {
      $0.exerciseName = text
      $0.exerciseId = ""
    }
  }

  @discardableResult
  public func pickExercise(id exerciseId: String, name: String, row id: String) async -> Bool {
    await edit(id) {
      $0.exerciseId = exerciseId
      $0.exerciseName = name
    }
  }

  /// Lọc `decText` như `log-workout.tsx:787`: máy tiếng Việt gõ `71,5`, lưu
  /// nguyên thì `weightKg` đọc ra 0 — buổi ghi bodyweight mà không báo gì.
  @discardableResult
  public func setWeight(_ text: String, row id: String) async -> Bool {
    await edit(id) { $0.weight = NumberInput.decimal(text) }
  }

  @discardableResult
  public func setReps(_ text: String, row id: String) async -> Bool {
    await edit(id) { $0.reps = text }
  }

  @discardableResult
  public func toggleWarmup(row id: String) async -> Bool {
    await edit(id) { $0.warmup.toggle() }
  }

  /// Set kế: chép bài và tạ của hàng cuối, reps trống, KHÔNG chép cờ khởi
  /// động — set sau khởi động thường là set thật (`addSet`, `:394`).
  @discardableResult
  public func addSet() async -> Bool {
    guard editable else { return false }
    let last = rows.last
    rows.append(ManualSetRow(
      id: makeId(), exerciseId: last?.exerciseId ?? "", exerciseName: last?.exerciseName ?? "",
      weight: last?.weight ?? ""))
    return await persist()
  }

  /// Hàng trống — bài kế tiếp (`addExercise`).
  @discardableResult
  public func addExercise() async -> Bool {
    guard editable else { return false }
    rows.append(ManualSetRow(id: makeId()))
    return await persist()
  }

  /// Bỏ một hàng; luôn còn ít nhất một (`removeSet`).
  @discardableResult
  public func removeRow(_ id: String) async -> Bool {
    guard editable, rows.count > 1, rows.contains(where: { $0.id == id }) else { return false }
    rows.removeAll { $0.id == id }
    return await persist()
  }

  private var editable: Bool { loaded && loggedSessionId == nil && !saving }

  private func edit(_ id: String, _ change: (inout ManualSetRow) -> Void) async -> Bool {
    guard editable, let i = rows.firstIndex(where: { $0.id == id }) else { return false }
    change(&rows[i])
    return await persist()
  }

  // MARK: - Đọc form

  /// Hàng sẽ được ghi: có reps hoặc thời gian giữ.
  public var validRows: [ManualSetRow] {
    rows.filter { RepEntry.parse($0.reps).isEntered }
  }

  /// Lỗi cận của các hàng SẼ ĐƯỢC GHI (hàng chưa điền xong không chặn nút Lưu,
  /// `:466`). Tạ so theo kg.
  ///
  /// RN BUG FOUND: `outOfRangeMessage('set_reps', "45s")` — mẫu số thập phân
  /// không nhận "45s", nên MỌI set giữ là "ngoài cận" và nút Lưu tắt: màn này
  /// đọc được set giữ (`parseRepEntry`) mà không bao giờ ghi được nó.
  /// NATIVE FIX: cận reps chỉ áp cho set đếm reps; set giữ đã có cận của
  /// `RepEntry` (1…3600 s). (test `holdSetsCanBeSaved`.)
  public func errors(toKg: (Double) -> Double = { $0 }) -> [String: Set<Field>] {
    var out: [String: Set<Field>] = [:]
    for r in validRows {
      var bad = Set<Field>()
      if !Self.liftKg.contains(Self.weightKg(r.weight, toKg: toKg)) { bad.insert(.weight) }
      let entry = RepEntry.parse(r.reps)
      if entry.durationSec == nil, !Self.setReps.contains(entry.reps) { bad.insert(.reps) }
      if !bad.isEmpty { out[r.id] = bad }
    }
    return out
  }

  public func canSave(toKg: (Double) -> Double = { $0 }) -> Bool {
    editable && !validRows.isEmpty && errors(toKg: toKg).isEmpty
  }

  /// Số thứ tự set trong bài của từng hàng: đếm lại khi tên đổi (`setNumbers`).
  public var setNumbers: [String: Int] {
    var out: [String: Int] = [:]
    var n = 0
    var prev: String?
    for r in rows {
      let key = r.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if key != prev {
        n = 0
        prev = key
      }
      n += 1
      out[r.id] = n
    }
    return out
  }

  /// Ô tạ → kg. Trống / không phải số → 0 (`Number(x) || 0`: bodyweight).
  /// Ô đã qua `decText` nên không gõ được số âm; âm (nháp cũ) vẫn để cận báo.
  static func weightKg(_ text: String, toKg: (Double) -> Double) -> Double {
    let t = text.trimmingCharacters(in: .whitespaces)
    guard let v = Double(t), v.isFinite else { return 0 }
    return v == 0 ? 0 : toKg(v)
  }

  // MARK: - Ghi

  /// Ghi buổi. Trả tổng kết khi hàng outbox ĐÃ bền. Bấm lại (mạng chậm, chạm
  /// hai lần, ghi máy hỏng rồi thử lại) dùng CÙNG id — không bao giờ hai buổi.
  ///
  /// RN BUG FOUND (hai chỗ, cùng một gốc: hai đường ghi):
  /// - offline (`queue.mutate`, `:984`) dựng set riêng: bỏ `warmup` và
  ///   `durationSec`, `reps: Number("45s")` = NaN → `null`, volume tính cả set
  ///   khởi động — buổi ghi ở phòng tập không sóng mất set giữ và cờ khởi động;
  /// - online (`useLogWorkoutSession`) gọi `findRecords` với set đã BỎ cờ
  ///   `warmup` — set khởi động vẫn nổ kỷ lục reps, đúng điều chú thích của
  ///   màn này nói không được xảy ra.
  /// NATIVE FIX: một đường — `WorkoutSessionRecord` (giữ cờ, volume bỏ khởi
  /// động) → `commitFinish`, online hay offline như nhau; kỷ lục so bằng
  /// `recordSets` (giữ cờ). (tests `offlineKeepsHoldsAndWarmups`,
  /// `warmupNeverPostsARecord`.)
  public func save(toKg: (Double) -> Double = { $0 }) async throws(SaveRefusal) -> WorkoutSummary {
    if let id = loggedSessionId {
      if let s = summary, s.sessionId == id { return s }
      throw .alreadyLogged(sessionId: id)
    }
    guard loaded else { throw .loading }
    guard !saving else { throw .inProgress }
    let valid = validRows
    guard !valid.isEmpty else { throw .nothingDone }
    guard errors(toKg: toKg).isEmpty else { throw .outOfRange }

    let now = clock.nowMillis()
    let id = pendingId ?? makeId()
    let sets = valid.map { r in
      let entry = RepEntry.parse(r.reps)
      return SessionSet(
        exerciseId: r.exerciseId, exerciseName: r.exerciseName,
        weightKg: Self.weightKg(r.weight, toKg: toKg), reps: entry.reps,
        rpe: 0,  // màn này không hỏi RPE từng set → `rpe: null`
        warmup: r.warmup, durationSec: entry.durationSec)
    }
    // `session_rpe` = RPE đã chọn: các set không mang RPE nào (0), nên sàn là nó.
    guard let draft = WorkoutSessionRecord(
      id: id, userId: userId, dateTime: now, templateId: nil, templateName: name, sets: sets,
      sessionRpeFloor: rpe)
    else { throw .nothingDone }
    let records = bests().map { PersonalRecords.findRecords(draft.recordSets, bests: $0) } ?? []
    let record = WorkoutSessionRecord(
      id: id, userId: userId, dateTime: now, templateId: nil, templateName: name, sets: sets,
      prDetected: !records.isEmpty, sessionRpeFloor: rpe)!

    pendingId = id
    saving = true
    defer { saving = false }
    let entry = OutboxEntry(
      id: id, userId: userId, kind: WorkoutSessionRecord.outboxKind, payload: record.row, createdAt: now)
    let state = DayState(
      loggedSessionId: id, loggedAt: now, loggedPR: record.prDetected, loggedRevision: 0,
      loggedRpe: record.sessionRpe, manual: snapshot)
    let store = self.store, key = Self.slotKey(date: date, slot)
    if let failure = await write({ _ = try await store.commitFinish(key, state, entry) }) {
      if let logged = failure as? DayAlreadyLogged {
        // Ô này đã được ghi ở nơi khác (màn khác cùng mở): không ghi đè.
        pendingId = nil
        loggedSessionId = logged.sessionId
        throw .alreadyLogged(sessionId: logged.sessionId)
      }
      throw .storage(LocalWriteError("\(failure)"))
    }
    pendingId = nil
    loggedSessionId = id
    let result = WorkoutSummary(record, records: records)
    summary = result
    onEnqueued(entry)
    return result
  }

  // MARK: - Bền

  private var snapshot: ManualDraft {
    ManualDraft(name: name, rpe: rpe, rows: rows, planUsed: planUsed)
  }

  private func persist() async -> Bool {
    let state = DayState(manual: snapshot)
    let store = self.store, key = Self.slotKey(date: date, slot), userId = self.userId
    return await write({ try await store.saveDay(key, state, userId: userId) }) == nil
  }

  /// Các lần ghi nối tiếp nhau; `unsaved` chỉ nghe lần mới nhất (như
  /// `WorkoutSessionController.write`).
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
    if ticket > settled {
      settled = ticket
      unsaved = failure.flatMap { $0 is DayAlreadyLogged ? nil : LocalWriteError("\($0)") }
    }
    return failure
  }
}
