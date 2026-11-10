public import Foundation

/// Buổi tập trên Apple Watch — phép chiếu của buổi đang mở trên iPhone, cộng
/// hàng lệnh chưa được iPhone xác nhận.
///
/// iPhone là nơi ghi (`WorkoutSessionController` + outbox). Đồng hồ không có
/// bản thứ hai của buổi: nó vẽ `WatchWorkoutSnapshot` và gửi `WatchCommand`.
/// Mất liên lạc thì lệnh nằm trong `WatchCommandQueue` cho tới khi snapshot
/// xác nhận đúng `id` — gửi lại không tick hai lần, không bắt đầu lại quãng
/// nghỉ từ "bây giờ" (hợp đồng: đồng hồ nghỉ là thời điểm tuyệt đối).
///
/// Không WatchConnectivity, không SwiftUI: build và test trên Linux.
public enum WatchMirrorPolicy {
  /// Buổi có đang hiện trên cổ tay không.
  public enum Mode: Sendable, Hashable {
    /// Đang đọc điểm quay lại — giữ snapshot cũ.
    case hold
    /// Không có buổi đang tập.
    case idle
    /// Đang tập: set kế / quãng nghỉ.
    case live
    /// Vừa chốt, màn tập còn mở.
    case finished
  }

  public static func mode(
    hasSession: Bool, phase: WatchSessionPhase, workoutVisible: Bool, restLive: Bool
  ) -> Mode {
    guard hasSession else { return .idle }
    switch phase {
    case .loading: return .hold
    case .finished: return workoutVisible ? .finished : .idle
    case .active: return .live
    case .idle: return (workoutVisible || restLive) ? .live : .idle
    }
  }
}

public enum WatchSessionPhase: Sendable, Hashable {
  case loading, idle, active, finished
}

extension WorkoutSessionController.Phase {
  public var watchPhase: WatchSessionPhase {
    switch self {
    case .loading: .loading
    case .idle: .idle
    case .active: .active
    case .finished: .finished
    }
  }
}

/// Một set như cổ tay cần để vẽ và để ghi — không phải cả `PlannedSet`.
public struct WatchSetCue: Sendable, Hashable, Codable {
  public var key: String
  public var exerciseKey: String
  public var exerciseName: String
  public var warmup: Bool
  /// Số set làm việc trong bài; `nil` khi là khởi động.
  public var workingNumber: Int?
  public var workingTotal: Int
  public var weightText: String
  public var repsText: String
  public var rpe: Int
  public var restSeconds: Int
  public var done: Bool
  /// Ô tạ đã có chữ người dùng gõ — `carryForward` không đè.
  public var weightEdited: Bool
  public var repsEdited: Bool

  public init(
    key: String, exerciseKey: String, exerciseName: String, warmup: Bool, workingNumber: Int?, workingTotal: Int,
    weightText: String, repsText: String, rpe: Int, restSeconds: Int, done: Bool, weightEdited: Bool, repsEdited: Bool
  ) {
    self.key = key
    self.exerciseKey = exerciseKey
    self.exerciseName = exerciseName
    self.warmup = warmup
    self.workingNumber = workingNumber
    self.workingTotal = workingTotal
    self.weightText = weightText
    self.repsText = repsText
    self.rpe = rpe
    self.restSeconds = restSeconds
    self.done = done
    self.weightEdited = weightEdited
    self.repsEdited = repsEdited
  }
}

/// Ảnh buổi tập iPhone gửi sang đồng hồ (`updateApplicationContext`).
public struct WatchWorkoutSnapshot: Sendable, Hashable, Codable {
  /// Trần số set trong một ảnh. Buổi dài hơn thì giữ cửa sổ quanh set kế —
  /// lệnh vẫn theo `key`, không theo vị trí.
  public static let maxCues = 80

  public var revision: Int
  public var at: EpochMillis
  public var active: Bool
  public var finished: Bool
  public var templateName: String
  public var unit: WeightUnit
  public var sets: [WatchSetCue]
  public var rest: RestTimer?
  /// Id lệnh iPhone đã xử lý, mới nhất ở cuối. Hàng đợi đồng hồ không dài hơn
  /// số này, nên một ảnh luôn xoá hết lệnh đã xong.
  public var acked: [String]

  public init(
    revision: Int, at: EpochMillis, active: Bool, finished: Bool, templateName: String, unit: WeightUnit,
    sets: [WatchSetCue], rest: RestTimer?, acked: [String]
  ) {
    self.revision = revision
    self.at = at
    self.active = active
    self.finished = finished
    self.templateName = templateName
    self.unit = unit
    self.sets = sets
    self.rest = rest
    self.acked = acked
  }

  public static func idle(at: EpochMillis, revision: Int, acked: [String]) -> WatchWorkoutSnapshot {
    WatchWorkoutSnapshot(
      revision: revision, at: at, active: false, finished: false, templateName: "", unit: .kg, sets: [], rest: nil,
      acked: acked)
  }
}

/// Thẻ set cổ tay đang vẽ.
public struct WatchLoggingCard: Sendable, Hashable, Codable {
  public var key: String
  public var exerciseName: String
  public var warmup: Bool
  public var workingNumber: Int?
  public var workingTotal: Int
  public var weightText: String
  public var repsText: String
  public var rpe: Int
  public var restSeconds: Int
  public var unit: WeightUnit

  public var ready: Bool {
    guard !exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
    let entry = RepEntry.parse(repsText)
    return entry.reps > 0 || (entry.durationSec ?? 0) > 0
  }

  init(_ cue: WatchSetCue, unit: WeightUnit) {
    key = cue.key
    exerciseName = cue.exerciseName
    warmup = cue.warmup
    workingNumber = cue.workingNumber
    workingTotal = cue.workingTotal
    weightText = cue.weightText
    repsText = cue.repsText
    rpe = cue.rpe
    restSeconds = cue.restSeconds
    self.unit = unit
  }
}

public struct WatchRestCard: Sendable, Hashable {
  public var timer: RestTimer
  public var next: WatchLoggingCard?
}

public struct WatchDisplay: Sendable, Hashable {
  public enum Mode: Sendable, Hashable {
    case idle
    case finished(templateName: String)
    case logging(WatchLoggingCard)
    case resting(WatchRestCard)
  }

  public var mode: Mode
  public var pendingCount: Int
  public var templateName: String

  public var restTimer: RestTimer? {
    if case .resting(let card) = mode { return card.timer }
    return nil
  }
}

/// Một lệnh từ cổ tay. `id` là khoá bỏ trùng: iPhone xử lý đúng một lần.
public struct WatchCommand: Sendable, Hashable, Codable, Identifiable {
  public var id: String
  public var issuedAt: EpochMillis
  public var action: Action

  public enum Action: Sendable, Hashable, Codable {
    /// Sửa kg / reps / RPE của set chưa tick. Giá trị tuyệt đối, không phải bước.
    case draft(key: String, weightText: String, repsText: String, rpe: Int)
    /// Tick set. `rest` là quãng nghỉ đã bắt đầu trên cổ tay (có thể `nil`).
    case complete(key: String, weightText: String, repsText: String, rpe: Int, rest: RestTimer?)
    /// Quãng nghỉ muốn có. `nil` = bỏ qua.
    case rest(RestTimer?)
  }

  public init(id: String, issuedAt: EpochMillis, action: Action) {
    self.id = id
    self.issuedAt = issuedAt
    self.action = action
  }
}

/// Hàng lệnh chưa được xác nhận. Gộp bản nháp cùng set và các lệnh nghỉ:
/// chỉ bản mới nhất còn nghĩa. Không bao giờ bỏ lệnh tick khi còn chỗ cho nó.
public struct WatchCommandQueue: Sendable, Hashable, Codable {
  public static let limit = 48
  public private(set) var pending: [WatchCommand]

  public init(pending: [WatchCommand] = []) {
    self.pending = pending
  }

  public func appending(_ command: WatchCommand) -> WatchCommandQueue {
    guard !pending.contains(where: { $0.id == command.id }) else { return self }
    var next = pending
    switch command.action {
    case .draft(let key, _, _, _):
      next.removeAll { Self.isDraft($0, key: key) }
      if next.contains(where: { Self.isComplete($0, key: key) }) {
        return WatchCommandQueue(pending: Self.trimmed(next))
      }
    case .complete(let key, _, _, _, _):
      next.removeAll { Self.isDraft($0, key: key) }
    case .rest:
      next.removeAll { if case .rest = $0.action { return true } else { return false } }
    }
    next.append(command)
    return WatchCommandQueue(pending: Self.trimmed(next))
  }

  public func acknowledging(_ ids: some Sequence<String>) -> WatchCommandQueue {
    let drop = Set(ids)
    guard !drop.isEmpty else { return self }
    return WatchCommandQueue(pending: pending.filter { !drop.contains($0.id) })
  }

  private static func isDraft(_ command: WatchCommand, key: String) -> Bool {
    if case .draft(let k, _, _, _) = command.action { return k == key }
    return false
  }

  private static func isComplete(_ command: WatchCommand, key: String) -> Bool {
    if case .complete(let k, _, _, _, _) = command.action { return k == key }
    return false
  }

  static func trimmed(_ commands: [WatchCommand]) -> [WatchCommand] {
    guard commands.count > limit else { return commands }
    var items = commands
    while items.count > limit, let i = items.firstIndex(where: { if case .draft = $0.action { return true } else { return false } }) {
      items.remove(at: i)
    }
    while items.count > limit, let i = items.firstIndex(where: { if case .rest = $0.action { return true } else { return false } }) {
      items.remove(at: i)
    }
    while items.count > limit { items.removeFirst() }
    return items
  }
}

/// Ảnh gốc + lệnh chưa xác nhận. `displayed` áp lệnh lên ảnh để cổ tay vẽ
/// ngay, không chờ iPhone.
public struct WatchMirrorState: Sendable, Hashable, Codable {
  public var base: WatchWorkoutSnapshot
  public var queue: WatchCommandQueue

  public init(base: WatchWorkoutSnapshot, queue: WatchCommandQueue = WatchCommandQueue()) {
    self.base = base
    self.queue = queue
  }

  public static func empty(at: EpochMillis) -> WatchMirrorState {
    WatchMirrorState(base: .idle(at: at, revision: 0, acked: []))
  }

  public func performing(_ command: WatchCommand) -> WatchMirrorState {
    WatchMirrorState(base: base, queue: queue.appending(command))
  }

  public func receiving(_ snapshot: WatchWorkoutSnapshot) -> WatchMirrorState {
    WatchMirrorState(base: snapshot, queue: queue.acknowledging(snapshot.acked))
  }

  public func displayed(at now: EpochMillis) -> WatchDisplay {
    let folded = Self.fold(base, commands: queue.pending)
    let pending = queue.pending.count
    let resting = Self.resting(folded.rest, at: now)
    if folded.finished {
      if let resting {
        return WatchDisplay(
          mode: .resting(WatchRestCard(timer: resting, next: folded.next)), pendingCount: pending,
          templateName: folded.templateName)
      }
      if folded.next != nil, queue.pending.contains(where: { if case .complete = $0.action { return true } else { return false } }) {
        if let next = folded.next {
          return WatchDisplay(mode: .logging(next), pendingCount: pending, templateName: folded.templateName)
        }
      }
      return WatchDisplay(mode: .finished(templateName: folded.templateName), pendingCount: pending, templateName: folded.templateName)
    }
    guard folded.active else {
      return WatchDisplay(mode: .idle, pendingCount: pending, templateName: "")
    }
    if let resting {
      return WatchDisplay(
        mode: .resting(WatchRestCard(timer: resting, next: folded.next)), pendingCount: pending,
        templateName: folded.templateName)
    }
    if let next = folded.next {
      return WatchDisplay(mode: .logging(next), pendingCount: pending, templateName: folded.templateName)
    }
    return WatchDisplay(mode: .finished(templateName: folded.templateName), pendingCount: pending, templateName: folded.templateName)
  }

  private struct Fold {
    var rest: RestTimer?
    var active: Bool
    var finished: Bool
    var templateName: String
    var next: WatchLoggingCard?
  }

  private static func resting(_ timer: RestTimer?, at now: EpochMillis) -> RestTimer? {
    guard let timer else { return nil }
    switch timer.phase(at: now) {
    case .running, .done: return timer
    case .over: return nil
    }
  }

  private static func fold(_ base: WatchWorkoutSnapshot, commands: [WatchCommand]) -> Fold {
    var cues = base.sets
    var rest = base.rest
    for command in commands {
      switch command.action {
      case .draft(let key, let weight, let reps, let rpe):
        guard let i = cues.firstIndex(where: { $0.key == key }), !cues[i].done else { continue }
        cues[i].weightText = weight
        cues[i].repsText = reps
        cues[i].rpe = rpe
        cues[i].weightEdited = true
        cues[i].repsEdited = true
      case .complete(let key, let weight, let reps, let rpe, let restTimer):
        guard let i = cues.firstIndex(where: { $0.key == key }), !cues[i].done else { continue }
        // Chỉ coi là "đã gõ" khi khác kế hoạch đang vẽ — nếu không, kim tự tháp
        // bị san thành một mức (cùng luật `carryForward`: ô chưa gõ thì không mang).
        let weightWasEdited = cues[i].weightEdited || weight != cues[i].weightText
        let repsWasEdited = cues[i].repsEdited || reps != cues[i].repsText
        cues[i].weightText = weight
        cues[i].repsText = reps
        cues[i].rpe = rpe
        cues[i].weightEdited = weightWasEdited
        cues[i].repsEdited = repsWasEdited
        cues[i].done = true
        carryForward(&cues, from: i)
        rest = restTimer
      case .rest(let timer):
        rest = timer
      }
    }
    return Fold(
      rest: rest, active: base.active, finished: base.finished, templateName: base.templateName,
      next: cues.first { !$0.done }.map { WatchLoggingCard($0, unit: base.unit) })
  }

  /// Cùng luật `WorkoutDay.carryForward`: tạ / reps đã gõ sang set kế cùng
  /// bài, cùng loại, chỉ khi ô đó chưa gõ.
  private static func carryForward(_ cues: inout [WatchSetCue], from index: Int) {
    let done = cues[index]
    guard
      let target = cues[(index + 1)...].firstIndex(where: {
        $0.exerciseKey == done.exerciseKey && $0.warmup == done.warmup && !$0.done
      })
    else { return }
    if !cues[target].weightEdited, done.weightEdited, (Double(done.weightText) ?? 0) > 0 {
      cues[target].weightText = done.weightText
      cues[target].weightEdited = true
    }
    if !cues[target].repsEdited, done.repsEdited {
      cues[target].repsText = done.repsText
      cues[target].repsEdited = true
    }
  }
}

/// Nút trên cổ tay → một lệnh. Bước kg / reps là `WorkoutFocus`; quãng nghỉ
/// là `RestTimer` (không có công thức thứ hai).
public enum WatchWrist {
  public static func changeWeight(_ display: WatchDisplay, steps: Int, now: EpochMillis, id: String) -> WatchCommand? {
    guard let card = card(display) else { return nil }
    let text = WorkoutFocus.stepWeight(card.weightText, by: steps, unit: card.unit)
    guard text != card.weightText else { return nil }
    return draft(card, weight: text, reps: card.repsText, rpe: card.rpe, now: now, id: id)
  }

  public static func changeReps(_ display: WatchDisplay, steps: Int, now: EpochMillis, id: String) -> WatchCommand? {
    guard let card = card(display) else { return nil }
    let text = WorkoutFocus.stepReps(card.repsText, by: steps)
    guard text != card.repsText else { return nil }
    return draft(card, weight: card.weightText, reps: text, rpe: card.rpe, now: now, id: id)
  }

  public static func changeRPE(_ display: WatchDisplay, steps: Int, now: EpochMillis, id: String) -> WatchCommand? {
    guard let card = card(display) else { return nil }
    let rpe = min(10, max(1, card.rpe + steps))
    guard rpe != card.rpe else { return nil }
    return draft(card, weight: card.weightText, reps: card.repsText, rpe: rpe, now: now, id: id)
  }

  public static func complete(_ display: WatchDisplay, now: EpochMillis, id: String) -> WatchCommand? {
    guard case .logging(let card) = display.mode, card.ready else { return nil }
    let rest = RestTimer.start(seconds: card.restSeconds, at: now)
    return WatchCommand(
      id: id, issuedAt: now,
      action: .complete(
        key: card.key, weightText: card.weightText, repsText: card.repsText, rpe: card.rpe, rest: rest))
  }

  public static func skipRest(_ display: WatchDisplay, now: EpochMillis, id: String) -> WatchCommand? {
    guard case .resting = display.mode else { return nil }
    return WatchCommand(id: id, issuedAt: now, action: .rest(nil))
  }

  public static func nudgeRest(_ display: WatchDisplay, delta: Int, now: EpochMillis, id: String) -> WatchCommand? {
    guard case .resting(let card) = display.mode else { return nil }
    let next = card.timer.adjusted(by: delta, at: now)
    guard next != card.timer else { return nil }
    return WatchCommand(id: id, issuedAt: now, action: .rest(next))
  }

  public static func setRestPaused(_ display: WatchDisplay, paused: Bool, now: EpochMillis, id: String) -> WatchCommand? {
    guard case .resting(let card) = display.mode, card.timer.isPaused != paused else { return nil }
    let next = paused ? card.timer.paused(at: now) : card.timer.resumed(at: now)
    return WatchCommand(id: id, issuedAt: now, action: .rest(next))
  }

  private static func card(_ display: WatchDisplay) -> WatchLoggingCard? {
    switch display.mode {
    case .logging(let card): return card
    case .resting(let card): return card.next
    case .idle, .finished: return nil
    }
  }

  private static func draft(
    _ card: WatchLoggingCard, weight: String, reps: String, rpe: Int, now: EpochMillis, id: String
  ) -> WatchCommand {
    WatchCommand(
      id: id, issuedAt: now, action: .draft(key: card.key, weightText: weight, repsText: reps, rpe: rpe))
  }
}

public enum WatchHaptic: Sendable, Hashable {
  case restWarning
  case restDone
}

public struct WatchHapticMemory: Sendable, Hashable, Codable {
  public var warnedEndsAt: EpochMillis?
  public var doneEndsAt: EpochMillis?
  public init(warnedEndsAt: EpochMillis? = nil, doneEndsAt: EpochMillis? = nil) {
    self.warnedEndsAt = warnedEndsAt
    self.doneEndsAt = doneEndsAt
  }
}

/// Rung một lần khi vào 5 giây cuối, một lần khi hết giờ. Tạm dừng không rung
/// (đồng hồ không chạy — cùng `RestTimer.warns`).
public enum WatchHaptics {
  public static func events(memory: WatchHapticMemory, timer: RestTimer?, now: EpochMillis) -> (events: [WatchHaptic], memory: WatchHapticMemory) {
    guard let timer else { return ([], WatchHapticMemory()) }
    var memory = memory
    var events: [WatchHaptic] = []
    switch timer.phase(at: now) {
    case .running(let left):
      if RestTimer.warns(left: left, paused: timer.isPaused), memory.warnedEndsAt != timer.endsAt {
        events.append(.restWarning)
        memory.warnedEndsAt = timer.endsAt
      }
    case .done:
      if memory.doneEndsAt != timer.endsAt {
        events.append(.restDone)
        memory.doneEndsAt = timer.endsAt
      }
    case .over:
      break
    }
    return (events, memory)
  }
}

/// Quãng nghỉ iPhone đã nhận từ cổ tay, để lệnh tới muộn không đè lệnh mới hơn.
public struct WatchRestMark: Sendable, Hashable, Codable {
  public var at: EpochMillis
  public var timer: RestTimer?
  public init(at: EpochMillis, timer: RestTimer?) {
    self.at = at
    self.timer = timer
  }
}

/// Id đã xử lý và mốc thời gian bản nháp / quãng nghỉ. Giữ vừa đủ để phủ hàng
/// đợi trên cổ tay (`WatchCommandQueue.limit`).
public struct WatchApplyContext: Sendable, Hashable, Codable {
  public static let memory = 64
  public var applied: [String]
  public var lastDraftAt: [String: EpochMillis]
  public var latestRest: WatchRestMark?

  public init(applied: [String] = [], lastDraftAt: [String: EpochMillis] = [:], latestRest: WatchRestMark? = nil) {
    self.applied = applied
    self.lastDraftAt = lastDraftAt
    self.latestRest = latestRest
  }

  public func contains(_ id: String) -> Bool { applied.contains(id) }

  public mutating func settle(_ command: WatchCommand) {
    applied.removeAll { $0 == command.id }
    applied.append(command.id)
    if applied.count > Self.memory { applied.removeFirst(applied.count - Self.memory) }
    switch command.action {
    case .draft(let key, _, _, _):
      bumpDraft(key, command.issuedAt)
    case .complete(let key, _, _, _, let timer):
      bumpDraft(key, command.issuedAt)
      bumpRest(command.issuedAt, timer)
    case .rest(let timer):
      bumpRest(command.issuedAt, timer)
    }
  }

  private mutating func bumpDraft(_ key: String, _ at: EpochMillis) {
    if let last = lastDraftAt[key], at < last { return }
    lastDraftAt[key] = at
  }

  private mutating func bumpRest(_ at: EpochMillis, _ timer: RestTimer?) {
    if let latest = latestRest, at < latest.at { return }
    latestRest = WatchRestMark(at: at, timer: timer)
  }
}

/// Việc iPhone phải làm với một lệnh, trước khi đụng `WorkoutSessionController`.
public enum WatchPhonePlan {
  public enum Step: Sendable, Hashable {
    case weight(key: String, text: String)
    case reps(key: String, text: String)
    case rpe(key: String, value: Int)
    case complete(key: String)
    /// Chốt quãng nghỉ sau khi tick — xem `restUpdate`.
    case syncRest
  }

  public struct Resolution: Sendable, Hashable {
    public var steps: [Step]
    /// Không còn gì để làm (đã xử lý, set đã tick, hoặc không còn set ấy).
    public var settled: Bool
    public init(steps: [Step], settled: Bool) {
      self.steps = steps
      self.settled = settled
    }
  }

  public enum RestUpdate: Sendable, Hashable {
    /// Không đụng đồng hồ nghỉ.
    case leave
    /// Ghi đúng giá trị này (`nil` = huỷ).
    case adopt(RestTimer?)
  }

  public static func resolve(
    _ command: WatchCommand, rows: [PlannedSet], progress: DayProgress, unit: WeightUnit, context: WatchApplyContext
  ) -> Resolution {
    if context.contains(command.id) { return Resolution(steps: [], settled: true) }
    switch command.action {
    case .rest:
      return Resolution(steps: [.syncRest], settled: false)
    case .draft(let key, let weight, let reps, let rpe):
      guard let row = rows.first(where: { $0.key == key }) else { return Resolution(steps: [], settled: true) }
      if progress.done[key] == true { return Resolution(steps: [], settled: true) }
      if let last = context.lastDraftAt[key], command.issuedAt < last { return Resolution(steps: [], settled: true) }
      return Resolution(steps: fields(row, progress, unit, weight: weight, reps: reps, rpe: rpe), settled: false)
    case .complete(let key, let weight, let reps, let rpe, _):
      guard let row = rows.first(where: { $0.key == key }) else { return Resolution(steps: [], settled: true) }
      if progress.done[key] == true { return Resolution(steps: [], settled: true) }
      var steps = fields(row, progress, unit, weight: weight, reps: reps, rpe: rpe)
      steps.append(.complete(key: key))
      steps.append(.syncRest)
      return Resolution(steps: steps, settled: false)
    }
  }

  /// Lệnh nghỉ tới sau một lệnh mới hơn thì bỏ. Tick set thì lấy quãng nghỉ
  /// MỚI HƠN nếu cổ tay đã chỉnh sau lúc tick — `toggle` của iPhone vừa bắt
  /// đầu một quãng nghỉ từ "bây giờ", phải ghi đè bằng giá trị đúng.
  public static func restUpdate(for command: WatchCommand, latest: WatchRestMark?) -> RestUpdate {
    switch command.action {
    case .draft:
      return .leave
    case .rest(let timer):
      if let latest, command.issuedAt < latest.at { return .leave }
      return .adopt(timer)
    case .complete(_, _, _, _, let timer):
      if let latest, latest.at > command.issuedAt { return .adopt(latest.timer) }
      return .adopt(timer)
    }
  }

  private static func fields(
    _ row: PlannedSet, _ progress: DayProgress, _ unit: WeightUnit, weight: String, reps: String, rpe: Int
  ) -> [Step] {
    var steps: [Step] = []
    let clean = NumberInput.decimal(weight)
    let currentWeight = progress.weightText[row.key] ?? unit.seed(row.weightKg)
    if clean != NumberInput.decimal(currentWeight) { steps.append(.weight(key: row.key, text: clean)) }
    let currentReps = progress.repsText[row.key] ?? NumberInput.plannedReps(row.reps)
    if reps != currentReps { steps.append(.reps(key: row.key, text: reps)) }
    let currentRpe = progress.rpe[row.key] ?? row.plannedRpe
    if (1...10).contains(rpe), rpe != currentRpe { steps.append(.rpe(key: row.key, value: rpe)) }
    return steps
  }
}

/// Dựng ảnh từ buổi thật. Chữ tạ / reps cùng nguồn với ô trên iPhone.
public enum WatchWorkoutMirror {
  public static func make(
    mode: WatchMirrorPolicy.Mode, templateName: String, rows: [PlannedSet], progress: DayProgress, unit: WeightUnit,
    rest: RestTimer?, acked: [String], revision: Int, at: EpochMillis
  ) -> WatchWorkoutSnapshot? {
    switch mode {
    case .hold: return nil
    case .idle:
      return .idle(at: at, revision: revision, acked: acked)
    case .live, .finished:
      let cues = window(cues(rows, progress, unit))
      return WatchWorkoutSnapshot(
        revision: revision, at: at, active: mode == .live, finished: mode == .finished, templateName: templateName,
        unit: unit, sets: cues, rest: rest, acked: acked)
    }
  }

  static func cues(_ rows: [PlannedSet], _ progress: DayProgress, _ unit: WeightUnit) -> [WatchSetCue] {
    let groups = WorkoutFocus.exercises(rows, progress)
    return rows.map { row in
      let exerciseKey = WorkoutFocus.exerciseKey(row)
      let group = groups.first { $0.key == exerciseKey }
      let groupRows = group?.rows ?? [row]
      return WatchSetCue(
        key: row.key, exerciseKey: exerciseKey, exerciseName: row.exerciseName,
        warmup: WorkoutDay.isWarmup(row, progress),
        workingNumber: WorkoutDay.workingNumber(row, in: groupRows, progress),
        workingTotal: group?.total ?? row.of,
        weightText: progress.weightText[row.key] ?? unit.seed(row.weightKg),
        repsText: progress.repsText[row.key] ?? NumberInput.plannedReps(row.reps),
        rpe: progress.rpe[row.key] ?? row.plannedRpe,
        restSeconds: WorkoutDay.restSeconds(row, progress),
        done: progress.done[row.key] == true,
        weightEdited: progress.weightText[row.key] != nil,
        repsEdited: progress.repsText[row.key] != nil)
    }
  }

  static func window(_ cues: [WatchSetCue]) -> [WatchSetCue] {
    guard cues.count > WatchWorkoutSnapshot.maxCues else { return cues }
    let next = cues.firstIndex { !$0.done } ?? (cues.count - 1)
    var start = max(0, next - 2)
    if start + WatchWorkoutSnapshot.maxCues > cues.count {
      start = cues.count - WatchWorkoutSnapshot.maxCues
    }
    return Array(cues[start..<(start + WatchWorkoutSnapshot.maxCues)])
  }
}
