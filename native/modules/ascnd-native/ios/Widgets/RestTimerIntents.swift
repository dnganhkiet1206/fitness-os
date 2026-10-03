import ActivityKit
import AppIntents
import Foundation
import os.log

private let islandLog = OSLog(subsystem: "com.ascnd.fitnessos", category: "IslandIntent")

// MARK: - ASCND Dynamic Island intents (interactive, 02/10/2026)
//
// Kiệt's call after device testing: the Island is no longer display-only.
// −15s/+15s mirror the in-app rest card (pause was removed 03/10/2026 —
// the in-app rest screen has no pause button, so the Island matches the
// app: [-15][+15][Ring]). This file lives in the WIDGET EXTENSION target
// (added to SWIFT_SOURCES in plugins/with-ascnd-widgets.js) — intents run
// out of process, inside the extension, which is exactly why they must:
//
//   (a) mutate the ActivityKit ContentState directly (the app may be
//       suspended — no bridge round-trip), and
//   (b) report back to the main app so the in-app timer stays in sync.
//       The Darwin notification ALWAYS fires; the main app reads the
//       authoritative state straight from ActivityKit — NO App Group
//       entitlement required (03/10/2026: the App Group was never
//       provisioned, so the old payload write silently no-oped and the
//       Darwin ping never fired — the buttons "did nothing").
//
// The bridge stays 7 params: pause state travels inside ContentState and the
// intent payload, never as new bridge params (Kiệt's compact-bridge rule).

/// Ping the main app. The Darwin notification ALWAYS fires — the app reads
/// the authoritative ActivityKit state on receipt, so this works with or
/// without the App Group entitlement. The payload write is best-effort
/// (kept for a future where the group is provisioned).
private func notifyMainApp(_ payload: [String: Any]) {
  if let defaults = UserDefaults(suiteName: IslandIntentChannel.appGroup) {
    var full = payload
    let seq = defaults.integer(forKey: IslandIntentChannel.seqKey) + 1
    defaults.set(seq, forKey: IslandIntentChannel.seqKey)
    full["seq"] = seq
    if let data = try? JSONSerialization.data(withJSONObject: full),
      let json = String(data: data, encoding: .utf8)
    {
      defaults.set(json, forKey: IslandIntentChannel.payloadKey)
    }
  } else {
    os_log("IslandIntent: App Group unavailable, payload skipped (notification still fires)", log: islandLog, type: .info)
  }
  let center = CFNotificationCenterGetDarwinNotifyCenter()
  CFNotificationCenterPostNotification(
    center,
    CFNotificationName(IslandIntentChannel.notificationName as CFString),
    nil, nil, true)
  os_log("IslandIntent: Darwin notification posted", log: islandLog, type: .info)
}

private func currentRestActivity() -> Activity<RestTimerAttributes>? {
  // The extension only ever has one rest activity (the store ends stale ones
  // on start), so `first` is unambiguous here.
  let activity = Activity<RestTimerAttributes>.activities.first
  if activity == nil {
    os_log("IslandIntent: no rest activity found in extension", log: islandLog, type: .error)
  }
  return activity
}

private func pushState(_ state: RestTimerAttributes.ContentState) async {
  guard let activity = currentRestActivity() else { return }
  // Paused: the stale horizon is relative to now (endDate is frozen mid-air).
  let horizon =
    state.isPaused
    ? Date().addingTimeInterval(state.pausedRemaining + 60)
    : state.endDate.addingTimeInterval(60)
  do {
    try await activity.update(ActivityContent(state: state, staleDate: horizon))
    os_log("IslandIntent: activity.update ok", log: islandLog, type: .info)
  } catch {
    os_log("IslandIntent: activity.update FAILED: %{public}@", log: islandLog, type: .error, String(describing: error))
  }
}

// MARK: - −15s / +15s

/// Mirrors the in-app rest card's ±15s. Works paused or running:
/// paused adjusts the frozen remainder, running moves the absolute end.
/// (Pause button removed 03/10/2026 — Kiệt: the in-app rest screen has no
/// pause, so the Island matches the app: [-15][+15][Ring].)
@available(iOS 16.1, *)
struct AdjustRestIntent: AppIntent {
  static var title: LocalizedStringResource = "Adjust rest timer"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Seconds")
  var seconds: Int

  /// AppIntent requires a parameterless `init()` — adding ONLY `init(seconds:)`
  /// removes the synthesized `init()` and breaks protocol conformance
  /// ("does not conform to protocol 'AppIntent'"). Keep both.
  init() {}

  /// Explicit init: without this, the synthesized memberwise init expects
  /// `IntentParameter<Int>` and `AdjustRestIntent(seconds: 15)` fails to
  /// compile ("cannot convert value of type 'Int'..."). Assigning the wrapped
  /// value here initializes the parameter wrapper correctly.
  init(seconds: Int) {
    self.seconds = seconds
  }

  func perform() async throws -> some IntentResult {
    os_log("IslandIntent: AdjustRestIntent perform() entered (seconds=%d)", log: islandLog, type: .info, seconds)

    // 03/10/2026 diagnostic — Kiệt: logo missing in widget bundle?
    // One tap answers it definitively in Console.app (Mac).
    if let logoURL = Bundle.main.url(forResource: "ascnd-mark", withExtension: "png") {
      os_log("IslandIntent: logo PRESENT in widget bundle: %{public}@", log: islandLog, type: .info, logoURL.path)
    } else {
      os_log("IslandIntent: logo MISSING from widget bundle (ascnd-mark.png not found)", log: islandLog, type: .error)
    }

    let matches = Activity<RestTimerAttributes>.activities
    os_log("IslandIntent: Activity<RestTimerAttributes>.activities.count=%d", log: islandLog, type: .info, matches.count)
    guard let activity = matches.first else {
      os_log("IslandIntent: adjust aborted — no rest activity visible from extension process", log: islandLog, type: .error)
      return .result()
    }
    // An ended/dismissed activity rejects updates — log it so we can see it.
    os_log("IslandIntent: activity id=%{public}@ activityState=%{public}@", log: islandLog, type: .info, activity.id, String(describing: activity.activityState))
    var state = activity.content.state
    let now = Date()
    if state.isPaused {
      let oldRemaining = state.pausedRemaining
      let remaining = max(state.pausedRemaining + Double(seconds), 1)
      state.pausedRemaining = remaining
      os_log("IslandIntent: paused adjust: remaining %.1fs -> %.1fs", log: islandLog, type: .info, oldRemaining, remaining)
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
      let oldEnd = state.endDate
      let flooredEnd = max(
        state.endDate.addingTimeInterval(Double(seconds)),
        now.addingTimeInterval(1))
      state.endDate = flooredEnd
      let remaining = max(flooredEnd.timeIntervalSince(now), 0)
      os_log("IslandIntent: running adjust: endDate %{public}@ -> %{public}@ (remaining %.1fs)", log: islandLog, type: .info, String(describing: oldEnd), String(describing: flooredEnd), remaining)
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
