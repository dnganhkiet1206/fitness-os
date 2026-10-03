import ActivityKit
import ExpoModulesCore
import UIKit
import WidgetKit

/// Errors surfaced to TypeScript from the #195 native spike.
private enum AscndNativeError: Error, LocalizedError {
  case unsupportedOS
  case activityNotFound(String)
  case invalidWidgetKey(String)
  case invalidWidgetJSON

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Live Activities require iOS 16.1 or later."
    case .activityNotFound(let id):
      return "No rest activity with id \(id)."
    case .invalidWidgetKey(let key):
      return "Unknown widget data key: \(key)."
    case .invalidWidgetJSON:
      return "Widget data is not valid UTF-8 JSON."
    }
  }
}

/// Localized Island strings, keyed by app language. The bridge passes only
/// the language code (1 param, not N strings) — Swift looks up the table.
/// The next-set label ("Hiệp tiếp theo"/"Next set") replaced "Set {n}/{t}"
/// per Kiệt 02/10/2026: the rest precedes the NEXT set, so numbering the
/// finished set was wrong.
private func islandStrings(for languageCode: String) -> (resting: String, nextSet: String) {
  switch languageCode {
  case "vi":
    return ("Nghỉ", "Hiệp tiếp theo")
  default:
    return ("Rest", "Next set")
  }
}

/// ActivityKit state store for the display-only rest timer (spike #195).
///
/// iOS 16.1+ only. All module entry points guard with `#available`, so the app
/// still launches and runs on the app's existing (lower) deployment target —
/// Live Activity calls simply throw `unsupportedOS` there.
///
/// Display-only by design: start / update / end. No buttons, no actions, no
/// user interaction flows in this spike.
@available(iOS 16.1, *)
private final class RestActivityStore {
  static let shared = RestActivityStore()
  private var activities: [String: Activity<RestTimerAttributes>] = [:]
  private init() {}

  func start(
    activityState: RestTimerAttributes.ActivityState,
    exerciseName: String,
    setNumber: Int,
    totalSets: Int,
    totalSeconds: Int,
    endDate: Date,
    languageCode: String
  ) async throws -> String {
    /*
      Only one rest activity may exist at a time. The TS side ends the
      previous one by id — but that id is lost when the app is killed or
      the JS thread was suspended at 0:00 (the end call never fired), leaving
      a stale "0:00" activity that iOS keeps showing instead of the new one.
      Ending everything of this type first makes start idempotent: no orphan
      can ever outlive the rest it belonged to. (01/10/2026, Kiệt's device.)
    */
    for activity in Activity<RestTimerAttributes>.activities {
      activities.removeValue(forKey: activity.id)
      // Never let a stale end block the new activity — if this throws,
      // the Island would never appear at all.
      try? await activity.end(nil, dismissalPolicy: .immediate)
    }
    // Fresh rest: drop any intent payload from a previous rest (see
    // IslandIntentRelay.invalidatePayload).
    IslandIntentRelay.shared.invalidatePayload()
    let attributes = RestTimerAttributes(brandName: "ASCND")
    let strings = islandStrings(for: languageCode)
    let now = Date()
    let state = RestTimerAttributes.ContentState(
      activityState: activityState,
      exerciseName: exerciseName,
      setNumber: setNumber,
      totalSets: totalSets,
      totalSeconds: totalSeconds,
      endDate: endDate,
      startDate: now,
      isPaused: false,
      pausedRemaining: 0,
      restingText: strings.resting,
      setText: strings.nextSet,
      nextText: strings.nextSet
    )
    // staleDate lets the system replace a stale activity if updates stop.
    let content = ActivityContent(state: state, staleDate: endDate.addingTimeInterval(60))
    let activity = try Activity<RestTimerAttributes>.request(
      attributes: attributes,
      content: content,
      pushType: nil
    )
    activities[activity.id] = activity
    return activity.id
  }

  func update(
    id: String,
    activityState: RestTimerAttributes.ActivityState,
    exerciseName: String,
    setNumber: Int,
    totalSets: Int,
    totalSeconds: Int,
    endDate: Date,
    languageCode: String
  ) async throws {
    guard let activity = activities[id] else {
      throw AscndNativeError.activityNotFound(id)
    }
    let strings = islandStrings(for: languageCode)
    let now = Date()
    var state = activity.content.state
    /*
      Pause-aware update (02/10/2026, interactive Island): the ±15s intents
      mutate pause state natively. A TS-side update landing while paused
      (in-app ±15s during an island pause) must adjust the FROZEN remainder,
      not the endDate — otherwise resume would jump. The bridge sends an
      absolute endTimestamp either way; pausedRemaining re-derives from it.
    */
    if state.isPaused {
      state.pausedRemaining = max(endDate.timeIntervalSince(now), 0)
    } else {
      state.endDate = endDate
    }
    state.activityState = activityState
    state.exerciseName = exerciseName
    state.setNumber = setNumber
    state.totalSets = totalSets
    state.totalSeconds = totalSeconds
    state.restingText = strings.resting
    state.setText = strings.nextSet
    state.nextText = strings.nextSet
    // startDate is NEVER reset here: it anchors the ring's segment math.
    // Only the pause intent (resume) re-anchors it.
    let horizon =
      state.isPaused
      ? now.addingTimeInterval(state.pausedRemaining + 60)
      : state.endDate.addingTimeInterval(60)
    await activity.update(ActivityContent(state: state, staleDate: horizon))
  }

  func end(id: String) async {
    guard let activity = activities.removeValue(forKey: id) else { return }
    await activity.end(nil, dismissalPolicy: .immediate)
    IslandIntentRelay.shared.invalidatePayload()
  }
}

/// Bridge back from the widget extension to JavaScript (02/10/2026).
///
/// The Island intents run out of process (widget extension) and report via
/// App Group shared defaults + Darwin notification:
///   "com.ascnd.fitnessos.island-intent" -> key "ascnd.island.intent" (JSON).
/// This relay observes the Darwin notification and re-emits it to JS as
/// `onIslandRestIntent`, so the in-app rest timer can follow island taps.
/// Wired lazily on the first rest start — intents can't exist before one.
///
/// `seq` in the payload lets JS ignore replays/duplicates.
private final class IslandIntentRelay {
  static let shared = IslandIntentRelay()
  private weak var module: AscndNativeModule?
  private var observing = false
  private init() {}

  func attach(_ module: AscndNativeModule) {
    self.module = module
    guard !observing else { return }
    observing = true
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterAddObserver(
      center,
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        Unmanaged<IslandIntentRelay>.fromOpaque(observer)
          .takeUnretainedValue().fire()
      },
      IslandIntentChannel.notificationName as CFString,
      nil,
      .deliverImmediately)
  }

  private func fire() {
    guard
      let defaults = UserDefaults(suiteName: IslandIntentChannel.appGroup),
      let json = defaults.string(forKey: IslandIntentChannel.payloadKey),
      let data = json.data(using: .utf8),
      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    module?.sendEvent("onIslandRestIntent", obj)
  }

  /// Last intent payload, for foreground reconcile (JS may have missed the
  /// Darwin ping while suspended). Returns the raw JSON string or nil.
  func lastPayload() -> String? {
    UserDefaults(suiteName: IslandIntentChannel.appGroup)?
      .string(forKey: IslandIntentChannel.payloadKey)
  }

  /// A fresh rest (or a finished one) invalidates any intent payload from a
  /// previous rest — otherwise a foreground reconcile after app restart
  /// could replay yesterday's pause onto today's rest. `seq` stays
  /// monotonic; only the payload is dropped.
  func invalidatePayload() {
    UserDefaults(suiteName: IslandIntentChannel.appGroup)?
      .removeObject(forKey: IslandIntentChannel.payloadKey)
  }
}

/// `AscndNative` — the #195 spike's native module.
///
/// React Native remains the source of truth for workout/rest state; this module
/// only forwards display state to iOS frameworks. No business logic lives here.
public final class AscndNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AscndNative")

    // JS-subscribable: island intent events (pause/resume/adjust from the
    // Dynamic Island). See IslandIntentRelay above.
    Events("onIslandRestIntent")

    // MARK: - Haptics (bridge validation only)
    // Product haptics stay in TypeScript — see src/lib/haptics.ts (#194).
    // This exists only so the spike can prove RN -> Swift calls end-to-end
    // without ActivityKit in the loop.
    Function("playHaptic") { (style: String) in
      let feedbackStyle: UIImpactFeedbackGenerator.FeedbackStyle
      if style == "heavy" {
        feedbackStyle = .heavy
      } else if style == "medium" {
        feedbackStyle = .medium
      } else {
        feedbackStyle = .light
      }
      DispatchQueue.main.async {
        UIImpactFeedbackGenerator(style: feedbackStyle).impactOccurred()
      }
    }

    // MARK: - Live Activity (display-only)
    //
    // NOTE: AsyncFunction closures are `(Args) throws -> ReturnType` — NOT
    // async. Async ActivityKit calls use the Promise style with Task below.
    Function("areLiveActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startRestActivity") {
      (
        activityState: String,
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        totalSeconds: Int,
        endTimestamp: Double,
        languageCode: String,
        promise: Promise
      ) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      // The island can now receive taps — make sure intent events reach JS.
      IslandIntentRelay.shared.attach(self)
      Task {
        do {
          let state = RestTimerAttributes.ActivityState(rawValue: activityState) ?? .resting
          let id = try await RestActivityStore.shared.start(
            activityState: state,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            totalSeconds: totalSeconds,
            endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0),
            languageCode: languageCode
          )
          promise.resolve(id)
        } catch {
          promise.reject(error)
        }
      }
    }

    AsyncFunction("updateRestActivity") {
      (
        activityId: String,
        activityState: String,
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        totalSeconds: Int,
        endTimestamp: Double,
        languageCode: String,
        promise: Promise
      ) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      Task {
        do {
          let state = RestTimerAttributes.ActivityState(rawValue: activityState) ?? .resting
          try await RestActivityStore.shared.update(
            id: activityId,
            activityState: state,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            totalSeconds: totalSeconds,
            endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0),
            languageCode: languageCode
          )
          promise.resolve()
        } catch {
          promise.reject(error)
        }
      }
    }

    AsyncFunction("endRestActivity") { (activityId: String, promise: Promise) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      Task {
        await RestActivityStore.shared.end(id: activityId)
        promise.resolve()
      }
    }

    // MARK: - Island intent relay (interactive Island, 02/10/2026)
    //
    // The Darwin observer is attached lazily on first rest start — before
    // that no intent can exist, so there's nothing to observe.
    AsyncFunction("getIslandRestState") { (promise: Promise) in
      IslandIntentRelay.shared.attach(self)
      promise.resolve(IslandIntentRelay.shared.lastPayload())
    }

    // MARK: - Widget data (production wiring, replaces SPIKE-ONLY mock)
    //
    // TypeScript -> updateWidgetData(key, json) -> App Group shared
    // UserDefaults -> WidgetDataStore.read*() -> widgets.
    // The App Group ("group.com.ascnd.fitnessos") must be provisioned in the
    // Apple Developer portal AND added to both the app and ASCNDWidgets
    // entitlements — without it, UserDefaults(suiteName:) returns nil and the
    // write below silently no-ops (widgets keep showing mock data).
    // [WIP] Uncompiled on Linux — needs Xcode to verify.
    AsyncFunction("updateWidgetData") { (key: String, json: String, promise: Promise) in
      guard key == "ascnd.widget.todayWorkout" || key == "ascnd.widget.streakReadiness" else {
        promise.reject(AscndNativeError.invalidWidgetKey(key))
        return
      }
      guard let data = json.data(using: .utf8) else {
        promise.reject(AscndNativeError.invalidWidgetJSON)
        return
      }
      guard let defaults = UserDefaults(suiteName: "group.com.ascnd.fitnessos") else {
        // App Group not provisioned — silent no-op by design (widgets fall
        // back to mock). Not an error: the app works without widgets.
        promise.resolve(false)
        return
      }
      defaults.set(data, forKey: key)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      promise.resolve(true)
    }
  }
}
