import ActivityKit
import AppIntents
import Foundation

// MARK: - ASCND Dynamic Island intents (interactive, 02/10/2026)
//
// Kiệt's call after device testing: the Island is no longer display-only.
// Pause actually pauses (no deep-link into the app), −15s/+15s mirror the
// in-app rest card. This file lives in the WIDGET EXTENSION target (added to
// SWIFT_SOURCES in plugins/with-ascnd-widgets.js) — intents run out of
// process, inside the extension, which is exactly why they must:
//
//   (a) mutate the ActivityKit ContentState directly (the app may be
//       suspended — no bridge round-trip), and
//   (b) report back to the main app so the in-app timer stays in sync:
//       JSON payload -> App Group shared defaults -> Darwin notification.
//       The Expo module (AscndNativeModule, app target) observes the
//       notification and re-emits it to JavaScript.
//
// The bridge stays 7 params: pause state travels inside ContentState and the
// intent payload, never as new bridge params (Kiệt's compact-bridge rule).

/// Write the intent payload where the main app can read it, then ping it.
/// `seq` lets the app ignore replays/duplicates.
private func notifyMainApp(_ payload: [String: Any]) {
  guard let defaults = UserDefaults(suiteName: IslandIntentChannel.appGroup) else { return }
  var full = payload
  let seq = defaults.integer(forKey: IslandIntentChannel.seqKey) + 1
  defaults.set(seq, forKey: IslandIntentChannel.seqKey)
  full["seq"] = seq
  guard let data = try? JSONSerialization.data(withJSONObject: full),
    let json = String(data: data, encoding: .utf8)
  else { return }
  defaults.set(json, forKey: IslandIntentChannel.payloadKey)
  let center = CFNotificationCenterGetDarwinNotifyCenter()
  CFNotificationCenterPostNotification(
    center,
    CFNotificationName(IslandIntentChannel.notificationName as CFString),
    nil, nil, true)
}

private func currentRestActivity() -> Activity<RestTimerAttributes>? {
  // The extension only ever has one rest activity (the store ends stale ones
  // on start), so `first` is unambiguous here.
  Activity<RestTimerAttributes>.activities.first
}

private func pushState(_ state: RestTimerAttributes.ContentState) async {
  guard let activity = currentRestActivity() else { return }
  // Paused: the stale horizon is relative to now (endDate is frozen mid-air).
  let horizon =
    state.isPaused
    ? Date().addingTimeInterval(state.pausedRemaining + 60)
    : state.endDate.addingTimeInterval(60)
  await activity.update(ActivityContent(state: state, staleDate: horizon))
}

// MARK: - Pause / resume

/// The Island pause button. Toggles: running -> frozen, frozen -> resumed.
/// Runs entirely in the extension — the app is never foregrounded.
@available(iOS 16.1, *)
struct ToggleRestPauseIntent: AppIntent {
  static var title: LocalizedStringResource = "Pause rest timer"
  /// Explicit: tapping pause must NOT deep-link into the app (Kiệt 02/10/2026).
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    guard let activity = currentRestActivity() else { return .result() }
    var state = activity.content.state
    let now = Date()
    if state.isPaused {
      // Resume: the frozen remainder becomes a fresh countdown from now.
      let remaining = max(state.pausedRemaining, 1)
      state.startDate = now
      state.endDate = now.addingTimeInterval(remaining)
      state.isPaused = false
      notifyMainApp([
        "action": "resume",
        "remainingSeconds": remaining,
        "endTimestamp": state.endDate.timeIntervalSince1970 * 1000,
      ])
    } else {
      // Pause: capture the true remainder; digits+ring freeze on it.
      let remaining = max(state.endDate.timeIntervalSince(now), 0)
      state.pausedRemaining = remaining
      state.isPaused = true
      notifyMainApp([
        "action": "pause",
        "remainingSeconds": remaining,
      ])
    }
    await pushState(state)
    return .result()
  }
}

// MARK: - −15s / +15s

/// Mirrors the in-app rest card's ±15s. Works paused or running:
/// paused adjusts the frozen remainder, running moves the absolute end.
@available(iOS 16.1, *)
struct AdjustRestIntent: AppIntent {
  static var title: LocalizedStringResource = "Adjust rest timer"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Seconds")
  var seconds: Int

  func perform() async throws -> some IntentResult {
    guard let activity = currentRestActivity() else { return .result() }
    var state = activity.content.state
    let now = Date()
    if state.isPaused {
      let remaining = max(state.pausedRemaining + Double(seconds), 1)
      state.pausedRemaining = remaining
      notifyMainApp([
        "action": "adjust",
        "adjustSeconds": seconds,
        "remainingSeconds": remaining,
        "paused": true,
      ])
    } else {
      // Same honesty rule as the in-app card: adding time grows the total
      // (ring stays a fraction); taking time keeps it (the rest was cut).
      // startDate is untouched, so the ring math needs no other change.
      let flooredEnd = max(
        state.endDate.addingTimeInterval(Double(seconds)),
        now.addingTimeInterval(1))
      state.endDate = flooredEnd
      let remaining = max(flooredEnd.timeIntervalSince(now), 0)
      notifyMainApp([
        "action": "adjust",
        "adjustSeconds": seconds,
        "remainingSeconds": remaining,
        "endTimestamp": flooredEnd.timeIntervalSince1970 * 1000,
        "paused": false,
      ])
    }
    await pushState(state)
    return .result()
  }
}
