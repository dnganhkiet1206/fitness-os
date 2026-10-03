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
/// App Group + intent channel shared by the extension (intents, in
/// Widgets/RestTimerIntents.swift) and the app (relay, in AscndNativeModule).
/// Single source of truth — both targets compile this file, so the strings
/// can never drift. (The widget-data path keeps its own literal; not churned.)
enum IslandIntentChannel {
  static let appGroup = "group.com.ascnd.fitnessos"
  static let payloadKey = "ascnd.island.intent"
  static let seqKey = "ascnd.island.intent.seq"
  static let notificationName = "com.ascnd.fitnessos.island-intent"
}

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
    /// ABSOLUTE end time. The widget/Live Activity UI counts down to this date
    /// via `Text(timerInterval: now...max(now, endDate))` — `Date.now` read
    /// once forces the system to re-evaluate every render (stored startDate
    /// froze the digits); `max` avoids a range trap when expired (A #217).
    ///
    /// When `isPaused`, the countdown is frozen: digits show `pausedRemaining`
    /// as static text and the ring holds its position. Resume sets
    /// `startDate = now`, `endDate = now + pausedRemaining`.
    var endDate: Date
    /// Absolute start of the current countdown segment. The ring's progress is
    /// `(now - startDate) / (endDate - startDate)` — ±15s adjustments move
    /// `endDate` only, so the ring stays an honest fraction (same semantics
    /// as the in-app ring, day-plan.tsx `onAdjust`). Never used for the
    /// digits (stored dates freeze `Text(timerInterval:)` — 01/10/2026).
    var startDate: Date
    /// True after the Island pause button (AppIntent). Set natively — the
    /// bridge never sends it, so the 7-param bridge stays compact.
    var isPaused: Bool
    /// Seconds remaining captured at the pause moment. Frozen display while
    /// `isPaused`; the resume base when unpausing.
    var pausedRemaining: Double
    /// Localized "Rest" — the Island follows the app language (from TS i18n).
    var restingText: String
    /*
      NEXT-set label — "Hiệp tiếp theo" (vi) / "Next set" (en).

      Kiệt's correction 02/10/2026 (device shots): the old "Set 3/3" was
      WRONG — the rest precedes the NEXT set, and the app shows the upcoming
      one. The field is still named `setText` (renaming risks a missed site
      no Linux compiler can catch); its content is now the next-set label.
    */
    var setText: String
    /// Localized "Up next" — the Island shows the NEXT set.
    var nextText: String
  }

  /// Static branding, fixed at activity start.
  var brandName: String
}
