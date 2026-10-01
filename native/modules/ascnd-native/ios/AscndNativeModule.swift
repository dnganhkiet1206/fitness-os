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
    exerciseName: String,
    setNumber: Int,
    totalSets: Int,
    totalSeconds: Int,
    endDate: Date
  ) throws -> String {
    let attributes = RestTimerAttributes(brandName: "ASCND")
    let state = RestTimerAttributes.ContentState(
      exerciseName: exerciseName,
      setNumber: setNumber,
      totalSets: totalSets,
      totalSeconds: totalSeconds,
      endDate: endDate
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
    exerciseName: String,
    setNumber: Int,
    totalSets: Int,
    totalSeconds: Int,
    endDate: Date
  ) async throws {
    guard let activity = activities[id] else {
      throw AscndNativeError.activityNotFound(id)
    }
    let state = RestTimerAttributes.ContentState(
      exerciseName: exerciseName,
      setNumber: setNumber,
      totalSets: totalSets,
      totalSeconds: totalSeconds,
      endDate: endDate
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
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        totalSeconds: Int,
        endTimestamp: Double,
        promise: Promise
      ) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      do {
        let id = try RestActivityStore.shared.start(
          exerciseName: exerciseName,
          setNumber: setNumber,
          totalSets: totalSets,
          totalSeconds: totalSeconds,
          endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0)
        )
        promise.resolve(id)
      } catch {
        promise.reject(error)
      }
    }

    AsyncFunction("updateRestActivity") {
      (
        activityId: String,
        exerciseName: String,
        setNumber: Int,
        totalSets: Int,
        totalSeconds: Int,
        endTimestamp: Double,
        promise: Promise
      ) in
      guard #available(iOS 16.1, *) else {
        promise.reject(AscndNativeError.unsupportedOS)
        return
      }
      Task {
        do {
          try await RestActivityStore.shared.update(
            id: activityId,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets,
            totalSeconds: totalSeconds,
            endDate: Date(timeIntervalSince1970: endTimestamp / 1000.0)
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
