import ASCNDCore
import Foundation
import Observation
import UserNotifications
import WatchConnectivity
import WatchKit

/// Trạng thái cổ tay: ảnh iPhone cộng lệnh chưa được xác nhận.
@MainActor
@Observable
final class WatchWorkoutModel {
  private(set) var state: WatchMirrorState
  private var hapticMemory = WatchHapticMemory()
  private var armedEndsAt: EpochMillis?
  /// Đang mở trên mặt đồng hồ thì rung trong app; hạ cổ tay thì để thông báo rung.
  private var foreground = true
  private var handedOff: Set<String> = []
  private let link = WatchLink()
  private let storageKey = "ascnd.watch.mirror"

  init() {
    if let data = UserDefaults.standard.data(forKey: storageKey),
      let saved = try? JSONDecoder().decode(WatchMirrorState.self, from: data)
    {
      state = saved
    } else {
      state = .empty(at: EpochMillis(Date()))
    }
  }

  func start() {
    WatchLink.model = self
    link.activate()
    Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) }
    if WCSession.isSupported(), let json = WCSession.default.receivedApplicationContext["snapshot"] as? String {
      receive(snapshotJSON: json)
    }
    flush()
  }

  func setForeground(_ on: Bool) {
    guard foreground != on else { return }
    foreground = on
    armedEndsAt = nil
    if on { WatchRestNotifier.sync(nil, now: now()) }
    tick(now())
  }

  func tick(_ now: EpochMillis) {
    let timer = state.displayed(at: now).restTimer
    if foreground {
      let fired = WatchHaptics.events(memory: hapticMemory, timer: timer, now: now)
      hapticMemory = fired.memory
      for event in fired.events {
        switch event {
        case .restWarning: WKInterfaceDevice.current().play(.directionDown)
        case .restDone: WKInterfaceDevice.current().play(.notification)
        }
      }
    }
    let alarm = foreground || timer?.isPaused == true ? nil : timer?.endsAt
    guard alarm != armedEndsAt else { return }
    armedEndsAt = alarm
    WatchRestNotifier.sync(foreground ? nil : timer, now: now)
  }

  func changeWeight(by steps: Int) { send(WatchWrist.changeWeight(current(), steps: steps, now: now(), id: Self.makeId())) }
  func changeReps(by steps: Int) { send(WatchWrist.changeReps(current(), steps: steps, now: now(), id: Self.makeId())) }
  func changeRPE(by steps: Int) { send(WatchWrist.changeRPE(current(), steps: steps, now: now(), id: Self.makeId())) }
  func complete() { send(WatchWrist.complete(current(), now: now(), id: Self.makeId())) }
  func skipRest() { send(WatchWrist.skipRest(current(), now: now(), id: Self.makeId())) }
  func nudgeRest(by delta: Int) { send(WatchWrist.nudgeRest(current(), delta: delta, now: now(), id: Self.makeId())) }
  func setRestPaused(_ paused: Bool) { send(WatchWrist.setRestPaused(current(), paused: paused, now: now(), id: Self.makeId())) }

  fileprivate func receive(snapshotJSON: String?) {
    guard let snapshotJSON, let data = snapshotJSON.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WatchWorkoutSnapshot.self, from: data)
    else { return }
    state = state.receiving(snapshot)
    handedOff = handedOff.intersection(state.queue.pending.map(\.id))
    persist()
    tick(now())
    flush()
  }

  fileprivate func activated() {
    flush()
  }

  fileprivate func becameReachable() {
    handedOff.subtract(state.queue.pending.map(\.id))
    flush()
  }

  private func current() -> WatchDisplay { state.displayed(at: now()) }
  private func now() -> EpochMillis { EpochMillis(Date()) }

  private func send(_ command: WatchCommand?) {
    guard let command else { return }
    state = state.performing(command)
    persist()
    WKInterfaceDevice.current().play(.click)
    flush()
    tick(now())
  }

  private func flush() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    let fresh = state.queue.pending.filter { !handedOff.contains($0.id) }
    guard !fresh.isEmpty, let data = try? JSONEncoder().encode(fresh), let json = String(data: data, encoding: .utf8) else { return }
    handedOff.formUnion(fresh.map(\.id))
    let payload = ["commands": json]
    let session = WCSession.default
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { _ in
        Task { @MainActor in _ = WCSession.default.transferUserInfo(payload) }
      }
    } else {
      session.transferUserInfo(payload)
    }
  }

  private func persist() {
    if let data = try? JSONEncoder().encode(state) {
      UserDefaults.standard.set(data, forKey: storageKey)
    }
  }

  private static func makeId() -> String { UUID().uuidString.lowercased() }
}

/// Báo hết nghỉ khi cổ tay đã hạ — thông báo cục bộ, không phải một buổi HealthKit.
enum WatchRestNotifier {
  static let id = "ascnd.watch.rest"

  static func sync(_ timer: RestTimer?, now: EpochMillis) {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [id])
    guard let timer, !timer.isPaused else { return }
    let left = timer.remaining(at: now)
    guard left > 0 else { return }
    let content = UNMutableNotificationContent()
    content.title = String(localized: "watch.rest.done")
    content.body = String(localized: "watch.rest.done.body")
    content.sound = .default
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(left), repeats: false)
    center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
  }
}

final class WatchLink: NSObject, WCSessionDelegate {
  @MainActor static weak var model: WatchWorkoutModel?

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  nonisolated func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?
  ) {
    let json = session.receivedApplicationContext["snapshot"] as? String
    Task { @MainActor in
      WatchLink.model?.receive(snapshotJSON: json)
      WatchLink.model?.activated()
    }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    let json = applicationContext["snapshot"] as? String
    Task { @MainActor in WatchLink.model?.receive(snapshotJSON: json) }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    let reachable = session.isReachable
    Task { @MainActor in
      if reachable { WatchLink.model?.becameReachable() }
    }
  }
}
