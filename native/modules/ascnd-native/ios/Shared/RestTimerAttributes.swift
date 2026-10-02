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
  /// Which moment of the workout this activity represents. The Island renders
  /// a distinct visual identity per state — one design system, three faces.
  public enum ActivityState: String, Codable, Hashable {
    /// Between sets. The progress ring is the anchor.
    case resting
    /// Mid-set. The exercise name leads.
    case active
    /// Waiting to start. Calm, almost empty.
    case ready
  }

  /// Minimal display state. The countdown is derived natively from `endDate`
  /// (see RestTimerLiveActivity.swift via `Text(timerInterval:)`) — TypeScript
  /// never sends per-second ticks, keeping bridge traffic at start/update/end only.
  public struct ContentState: Codable, Hashable {
    /// What the Island is showing right now.
    var activityState: ActivityState
    /// Current exercise, e.g. "Bench Press".
    var exerciseName: String
    /// 1-based set number just completed (the rest precedes the next set).
    var setNumber: Int
    /// Total sets in the exercise, for "Set x of y".
    var totalSets: Int
    /// Planned rest duration in seconds (display fallback).
    var totalSeconds: Int
    /// ABSOLUTE start time. Paired with `endDate` for `Text(timerInterval:)`:
    /// the range must be two STORED dates, never `Date.now...endDate` — if iOS
    /// re-renders the view after the countdown finished, `Date.now` is past
    /// `endDate` and the backwards range wedges the display at 0:00.
    var startDate: Date
    /// ABSOLUTE end time. The widget/Live Activity UI counts down to this date.
    var endDate: Date
    /// Localized "Rest" — the Island follows the app language (from TS i18n).
    var restingText: String
    /// Localized "Set {n}/{t}", pre-formatted by TS.
    var setText: String
    /// Localized "Up next" — the Island shows the NEXT set.
    var nextText: String
  }

  /// Static branding, fixed at activity start.
  var brandName: String
}
