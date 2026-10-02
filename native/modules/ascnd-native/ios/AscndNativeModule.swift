import ActivityKit
import ExpoModulesCore
import UIKit

/// Errors surfaced to TypeScript from the #195 native spike.
private enum AscndNativeError: Error, LocalizedError {
  case unsupportedOS
  case activityNotFound(String)

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Live Activities require iOS 16.1 or later."
    case .activityNotFound(let id):
      return "No rest activity with id \(id)."
    }
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
    startDate: Date,
    endDate: Date,
    restingText: String,
    setText: String,
    nextText: String
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
    let attributes = RestTimerAttributes(brandName: "ASCND")
    let state = RestTimerAttributes.ContentState(
      activityState: activityState,
      exerciseName: exerciseName,
      setNumber: setNumber,
      totalSets: totalSets,
      totalSeconds: totalSeconds,
      startDate: startDate,
      endDate: endDate,
      restingText: restingText,
      setText: setText,
      nextText: nextText
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
    startDate: Date,
    endDate: Date,
    restingText: String,
    setText: String,
    nextText: String
  ) async throws {
    guard let activity = activities[id] else {
      throw AscndNativeError.activityNotFound(id)
    }
    let state = RestTimerAttributes.ContentState(
      activityState: activityState,
      exerciseName: exerciseName,
      setNumber: setNumber,
      totalSets: totalSets,
      totalSeconds: totalSeconds,
      startDate: startDate,
      endDate: endDate,
      restingText: restingText,
      setText: setText,
      nextText: nextText
    )
    await activity.update(
      ActivityContent(state: state, staleDate: endDate.addingTimeInterval(60))
    )
  }

  func end(id: String) async {
    guard let activity = activities.removeValue(forKey: id) else { return }
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}

/// `AscndNative` — the #195 spike's native module.
///
/// React Native remains the source of truth for workout/rest state; this module
/// only forwards display state to iOS frameworks. No business logic lives here.
public final class AscndNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AscndNative")

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
        startTimestamp: Double,
        endTimestamp: Double,
        restingText: String,
        setText: String,
        nextText: String,
        promise: Promise
      ) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      Task {
        do {
          let state = RestTimerAttributes.ActivityState(rawValue: activityState) ?? .resting
          let id = try await RestActivityStore.shared.start(
            activityState: state,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            totalSeconds: totalSeconds,
            startDate: Date(timeIntervalSince1970: startTimestamp / 1000.0),
            endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0),
            restingText: restingText,
            setText: setText,
            nextText: nextText
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
        startTimestamp: Double,
        endTimestamp: Double,
        restingText: String,
        setText: String,
        nextText: String,
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
            startDate: Date(timeIntervalSince1970: startTimestamp / 1000.0),
            endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0),
            restingText: restingText,
            setText: setText,
            nextText: nextText
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
  }
}
