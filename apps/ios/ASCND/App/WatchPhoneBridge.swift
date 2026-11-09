import ASCNDCore
import Foundation
import Observation
import os
import WatchConnectivity

/// Đưa buổi tập đang mở sang Apple Watch và áp lệnh ngược lại.
///
/// Ảnh đi bằng `updateApplicationContext` (luôn là bản mới nhất). Lệnh từ cổ
/// tay đi bằng tin nhắn hoặc `transferUserInfo`. Mỗi lệnh một `id`: xử lý
/// một lần, rồi đưa id vào ảnh kế để đồng hồ xoá khỏi hàng đợi. iPhone vẫn
/// là chỗ ghi — cầu này chỉ gọi `WorkoutSessionController` và `RestTimer`.
@MainActor
final class WatchPhoneBridge: NSObject {
  @MainActor static weak var current: WatchPhoneBridge?

  private var flow: WorkoutFlow?
  private var rest: RestTimerController?
  private var workoutVisible = false
  private var context = WatchApplyContext()
  private var inbox: [WatchCommand] = []
  private var observe: Task<Void, Never>?
  private var wake: Wake?
  private var lastFingerprint: String?
  private var revision = 0
  private let defaults: UserDefaults
  private let contextKey = "ascnd.watch.apply"
  private let inboxKey = "ascnd.watch.inbox"

  override init() {
    defaults = .standard
    super.init()
    Self.current = self
    if let data = defaults.data(forKey: contextKey),
      let saved = try? JSONDecoder().decode(WatchApplyContext.self, from: data)
    {
      context = saved
    }
    if let data = defaults.data(forKey: inboxKey),
      let saved = try? JSONDecoder().decode([WatchCommand].self, from: data)
    {
      inbox = saved
    }
    link.activate()
  }

  private let link = PhoneWatchLink()

  func attach(flow: WorkoutFlow, rest: RestTimerController) {
    self.flow = flow
    self.rest = rest
    startObserving()
    Task { await self.drain() }
  }

  func detach() {
    flow = nil
    rest = nil
    workoutVisible = false
    inbox.removeAll()
    defaults.removeObject(forKey: inboxKey)
    observe?.cancel()
    wake?.fire()
    wake = nil
    push()
  }

  func setWorkoutVisible(_ visible: Bool) {
    guard workoutVisible != visible else { return }
    workoutVisible = visible
    push()
  }

  fileprivate func activated() {
    Task { await self.drain() }
  }

  fileprivate func ingest(commandsJSON: String?) {
    guard let commandsJSON, let data = commandsJSON.data(using: .utf8),
      let commands = try? JSONDecoder().decode([WatchCommand].self, from: data)
    else { return }
    for command in commands where !context.contains(command.id) && !inbox.contains(where: { $0.id == command.id }) {
      inbox.append(command)
    }
    inbox.sort { $0.issuedAt < $1.issuedAt }
    persistInbox()
    Task { await self.drain() }
  }

  private func startObserving() {
    observe?.cancel()
    wake?.fire()
    observe = Task { @MainActor [weak self] in
      while let self, !Task.isCancelled {
        await self.waitForChange()
        if Task.isCancelled { return }
        await self.drain()
      }
    }
  }

  private func waitForChange() async {
    let token = Wake()
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      let gate = OSAllocatedUnfairLock(initialState: false)
      let resume: @Sendable () -> Void = {
        let first = gate.withLock { done -> Bool in
          if done { return false }
          done = true
          return true
        }
        if first { cont.resume() }
      }
      token.arm(resume)
      wake = token
      withObservationTracking {
        self.touchModels()
      } onChange: {
        resume()
      }
    }
    if wake === token { wake = nil }
  }

  private func touchModels() {
    _ = flow?.session?.loaded
    _ = flow?.session?.phase
    _ = flow?.session?.progress
    _ = flow?.session?.weightUnit
    _ = flow?.session?.loggedSessionId
    _ = flow?.session?.rows.count
    _ = rest?.timer
  }

  private func drain() async {
    guard flow?.session?.loaded == true else {
      push()
      return
    }
    var still: [WatchCommand] = []
    for command in inbox {
      if await apply(command) {
        continue
      }
      still.append(command)
    }
    inbox = still
    persistInbox()
    push()
  }

  /// `true` khi lệnh đã xong (kể cả không áp được vì set không còn).
  private func apply(_ command: WatchCommand) async -> Bool {
    guard let session = flow?.session, session.loaded else { return false }
    let resolution = WatchPhonePlan.resolve(
      command, rows: session.rows, progress: session.progress, unit: session.weightUnit, context: context)
    if resolution.settled {
      if !context.contains(command.id) { context.settle(command) }
      persistContext()
      return true
    }
    for step in resolution.steps {
      switch step {
      case .weight(let key, let text):
        let ok = await session.setWeightText(text, for: key)
        if !ok, session.unsaved != nil { return false }
      case .reps(let key, let text):
        let ok = await session.setRepsText(text, for: key)
        if !ok, session.unsaved != nil { return false }
      case .rpe(let key, let value):
        let ok = await session.setRpe(value, for: key)
        if !ok, session.unsaved != nil { return false }
      case .complete(let key):
        let ok = await session.toggle(key)
        if session.unsaved != nil, session.progress.done[key] != true { return false }
        if !ok, session.progress.done[key] != true { break }
      case .syncRest:
        if case .complete(let key, _, _, _, _) = command.action, session.progress.done[key] != true {
          break
        }
        guard let rest else { break }
        switch WatchPhonePlan.restUpdate(for: command, latest: context.latestRest) {
        case .leave: break
        case .adopt(let timer): rest.adopt(timer)
        }
      }
    }
    context.settle(command)
    persistContext()
    return true
  }

  private func push() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    guard let snapshot = makeSnapshot() else { return }
    guard let fingerprint = encode(snapshot, stable: true), fingerprint != lastFingerprint else { return }
    revision += 1
    var outgoing = snapshot
    outgoing.revision = revision
    outgoing.at = EpochMillis(Date())
    guard let stamped = encode(outgoing, stable: false) else { return }
    do {
      try WCSession.default.updateApplicationContext(["snapshot": stamped])
      lastFingerprint = fingerprint
    } catch {
      lastFingerprint = nil
    }
  }

  private func makeSnapshot() -> WatchWorkoutSnapshot? {
    let now = EpochMillis(Date())
    let acked = context.applied
    guard let workout = flow?.session else {
      return .idle(at: now, revision: revision, acked: acked)
    }
    let restLive: Bool = {
      guard let timer = rest?.timer else { return false }
      switch timer.phase(at: now) {
      case .running, .done: return true
      case .over: return false
      }
    }()
    let mode = WatchMirrorPolicy.mode(
      hasSession: true, phase: workout.phase.watchPhase, workoutVisible: workoutVisible, restLive: restLive)
    return WatchWorkoutMirror.make(
      mode: mode, templateName: workout.plan.templateName, rows: workout.rows, progress: workout.progress,
      unit: workout.weightUnit, rest: rest?.timer, acked: acked, revision: revision, at: now)
  }

  private func encode(_ snapshot: WatchWorkoutSnapshot, stable: Bool) -> String? {
    var copy = snapshot
    if stable {
      copy.revision = 0
      copy.at = EpochMillis(0)
    }
    guard let data = try? JSONEncoder().encode(copy) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func persistContext() {
    if let data = try? JSONEncoder().encode(context) { defaults.set(data, forKey: contextKey) }
  }

  private func persistInbox() {
    if let data = try? JSONEncoder().encode(inbox) { defaults.set(data, forKey: inboxKey) }
  }
}

/// Một lần chờ thay đổi. `fire` chỉ chạy đúng một lần; task cũ không xoá
/// token mà task mới vừa gắn.
private final class Wake: @unchecked Sendable {
  private let lock = NSLock()
  private var resume: (@Sendable () -> Void)?

  func arm(_ resume: @escaping @Sendable () -> Void) {
    lock.lock()
    self.resume = resume
    lock.unlock()
  }

  func fire() {
    lock.lock()
    let resume = self.resume
    self.resume = nil
    lock.unlock()
    resume?()
  }
}

/// WCSession gọi delegate ngoài main actor. Lớp này không giữ trạng thái —
/// mọi việc nhảy về `WatchPhoneBridge.current`.
final class PhoneWatchLink: NSObject, WCSessionDelegate {
  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  nonisolated func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?
  ) {
    Task { @MainActor in WatchPhoneBridge.current?.activated() }
  }

  nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

  nonisolated func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    let json = message["commands"] as? String
    Task { @MainActor in WatchPhoneBridge.current?.ingest(commandsJSON: json) }
  }

  nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    let json = userInfo["commands"] as? String
    Task { @MainActor in WatchPhoneBridge.current?.ingest(commandsJSON: json) }
  }
}
