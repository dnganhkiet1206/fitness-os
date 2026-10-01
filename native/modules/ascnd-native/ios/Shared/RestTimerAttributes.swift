import ActivityKit
import Foundation

/// ActivityKit attributes for the ASCND rest timer Live Activity (spike #195).
///
/// SINGLE SOURCE OF TRUTH: this file is compiled into BOTH
///   - the app target, via the `ascnd-native` Expo module (ios/ autolinked), and
///   - the ASCNDWidgets extension target, via plugins/with-ascnd-widgets.js
///     (which copies this file at prebuild time).
/// There is only one file on disk — both targets compile identical code, so the
/// attributes can never drift between the starter (app) and the renderer (widget).
struct RestTimerAttributes: ActivityAttributes {
  /// Minimal display state. The countdown is derived natively from `endDate`
  /// (see RestTimerLiveActivity.swift via `Text(timerInterval:)`) — TypeScript
  /// never sends per-second ticks, keeping bridge traffic at start/update/end only.
  public struct ContentState: Codable, Hashable {
    /// Current exercise, e.g. "Bench Press".
    var exerciseName: String
    /// 1-based set number just completed (the rest precedes the next set).
    var setNumber: Int
    /// Total sets in the exercise, for "Set x of y".
    var totalSets: Int
    /// Planned rest duration in seconds (display fallback).
    var totalSeconds: Int
    /// ABSOLUTE end time. The widget/Live Activity UI counts down to this date.
    var endDate: Date
  }

  /// Static branding, fixed at activity start.
  var brandName: String
}
