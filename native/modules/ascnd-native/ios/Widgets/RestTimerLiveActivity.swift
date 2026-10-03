import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - ASCND Dynamic Island / Live Activity — premium redesign
//
// Design system: minimal, native iOS, Apple-quality. The Island answers one
// question — "what's happening right now?" — in under a second.
//
// Three states, one visual language:
//   .resting — circular progress ring is the anchor, REST is the word
//   .active  — exercise name leads, dumbbell mark, subtle progress
//   .ready   — calm, almost empty; the mark does the talking
//
// Visual rules (from the redesign brief + Kiệt's spec 01/10/2026):
// - Near-black background, SF Pro typography, strong hierarchy, few elements
// - Cream/warm-white ring (#F5EEDB-ish) — the ring feels like part of the Island
// - ASCND gold appears ONLY in the tiny "REST" eyebrow accent, never the ring
// - Never a mini dashboard: weight, reps, RPE stay in the app
// - Timer is always rounded + monospacedDigit, the numerical focal point
//
// Countdown rendering — READ THIS before touching the timer.
//
// Root cause of the frozen timer (found 01/10/2026, Kiệt's device shots):
// `TimelineView(.periodic(from:now, by:1))` does NOT deliver per-second
// entries inside a Live Activity render context — the digits sat frozen at
// the start value ("a snapshot of the start moment"). The timeline is a
// best-effort redraw request there, not a clock.
//
// The digits therefore use `Text(timerInterval:countsDown:)` — the
// system ticks it every second OUT OF PROCESS, with zero re-renders and
// zero bridge traffic. It stays exact in foreground, background, lock
// screen, and with the app killed, because endDate is absolute.
//
// The RING cannot use that primitive (no circular timer view exists), so it
// stays on the coarse TimelineView (~30s cadence on iOS 26): it moves, just
// not smoothly. The digits are the source of truth; the ring is the visual
// anchor. This is a platform limitation, not a bug in our code.
//
// Visual direction (Kiệt's spec 01/10/2026, from the reference design):
// - The ring is the visual anchor and sits at the FAR RIGHT everywhere.
// - NO Skip/Next button — the Island is not a media player. Pause only.
// - NO music/media controls. Workout focus only.
// - Ring: thin, cream/warm-white, subtle track contrast, timer centred in
//   the ring, total smaller beneath it.
// - Compact: [mark] Rest/Set info … [ring with timer inside, right].
// - Expanded: left = ASCND / title / set; right = [pause] [ring], ring last.
// - States (idle/resting/working) share one design language.
//
// Interactivity (Kiệt's call 02/10/2026, device shots): the Island is NO
// LONGER display-only. Pause really pauses via AppIntent (no deep-link into
// the app), −15s/+15s mirror the in-app rest card. Intents live in
// RestTimerIntents.swift (widget extension target): they mutate the
// ActivityKit ContentState directly, then report back to the main app via
// App Group shared defaults + Darwin notification so the in-app timer
// stays in sync. See AscndNativeModule.swift (relay) and
// src/native/ios/rest-live-activity.ts (TS listener).
//
// Ring honesty note: the render server will NOT give us 60fps — TimelineView
// entries in a Live Activity are best-effort (~30s cadence on iOS 26). The
// ring is therefore computed from absolute startDate/endDate on every entry
// so it is always CORRECT, and updates as often as the system allows. The
// digits (system-ticked Text(timerInterval:)) are the exact source of truth;
// the ring is the visual anchor. Do not promise in-app smoothness here.

@available(iOS 16.1, *)
struct RestTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestTimerAttributes.self) { context in
      // Lock Screen / banner — keep it calm and scannable.
      LockScreenView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.85))
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ExpandedLeading(context: context)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ExpandedTrailing(context: context)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ExpandedBottom()
        }
      } compactLeading: {
        CompactLeading(context: context)
      } compactTrailing: {
        CompactTrailing(context: context)
      } minimal: {
        MinimalView(context: context)
      }
    }
  }
}

// MARK: - Design tokens

@available(iOS 16.1, *)
private enum Island {
  /// Warm white — the ring colour per Kiệt's visual spec (01/10/2026).
  /// Cream, not gold: the ring should feel like part of the Island.
  static let cream = Color(red: 0.96, green: 0.93, blue: 0.86)
  /// ASCND gold — now ONLY the tiny "REST" eyebrow accent. Never the ring.
  static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)
  static let secondary = Color.white.opacity(0.6)
  static let tertiary = Color.white.opacity(0.4)

  static func timerFont(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight, design: .rounded).monospacedDigit()
  }
}

// MARK: - ASCND mark

/// The real ASCND mark — `splash-icon.png`, the same artwork as the app icon
/// (white on transparent). NOT redrawn: `brand-lockup.tsx` documents why a
/// hand-drawn second version always drifts from the original, and Kiệt's spec
/// (01/10/2026) requires the exact asset. Bundled into the widget target's
/// Resources by `with-ascnd-widgets.js`; tinted cream via template mode.
@available(iOS 16.1, *)
private struct ASCNDMark: View {
  var size: CGFloat = 20

  var body: some View {
    Image("ascnd-mark")
      .renderingMode(.template)
      .resizable()
      .aspectRatio(contentMode: .fit)
      .foregroundStyle(Island.cream)
      .frame(width: size, height: size)
  }
}

// MARK: - Progress ring

/// Circular countdown — the visual anchor of the resting state.
@available(iOS 16.1, *)
private struct ProgressRing: View {
  var progress: Double // 0 → 1, elapsed
  var size: CGFloat = 28
  var lineWidth: CGFloat = 3

  var body: some View {
    ZStack {
      Circle()
        .stroke(Color.white.opacity(0.18), lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: min(max(progress, 0.01), 1))
        .stroke(Island.cream, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .animation(.easeInOut(duration: 0.3), value: progress)
    }
    .frame(width: size, height: size)
  }
}

// MARK: - Countdown primitives: system-ticked digits + coarse ring

private func formatTotal(seconds: Int) -> String {
  String(format: "%d:%02d", seconds / 60, seconds % 60)
}

private func restProgress(endDate: Date, totalSeconds: Int, at date: Date) -> Double {
  let total = max(Double(totalSeconds), 1)
  let remaining = max(endDate.timeIntervalSince(date), 0)
  return min(max(1 - remaining / total, 0), 1)
}

/// Segment-based progress: (now − start) / (end − start). ±15s moves `end`
/// only, so adding time grows the whole (ring stays a fraction — same honesty
/// rule as the in-app card) and cutting time keeps it. Frozen while paused.
private func restProgress(startDate: Date, endDate: Date, at date: Date) -> Double {
  let total = max(endDate.timeIntervalSince(startDate), 1)
  let elapsed = max(date.timeIntervalSince(startDate), 0)
  return min(max(elapsed / total, 0), 1)
}

private func pausedProgress(pausedRemaining: Double, totalSeconds: Int) -> Double {
  1 - min(max(pausedRemaining / max(Double(totalSeconds), 1), 0), 1)
}

/// Countdown ring whose progress is recomputed on a 1s native timeline.
/// (A progress value captured at render time freezes — the timer text ticks
/// via the system clock without re-rendering the view.)
///
/// PROGRESS SOURCE (02/10/2026): segment-based from startDate/endDate, so
/// ±15s adjustments keep the ring honest with no extra updates. Paused holds
/// the frozen fraction. TimelineView entries are best-effort in a Live
/// Activity (~30s on iOS 26) — the ring is always CORRECT, just not 60fps.
@available(iOS 16.1, *)
private struct RestRing: View {
  let endDate: Date
  let startDate: Date
  let totalSeconds: Int
  var isPaused: Bool = false
  var pausedRemaining: Double = 0
  var size: CGFloat = 22
  var lineWidth: CGFloat = 2.5

  var body: some View {
    TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
      let progress: Double =
        isPaused
        ? pausedProgress(pausedRemaining: pausedRemaining, totalSeconds: totalSeconds)
        : restProgress(startDate: startDate, endDate: endDate, at: timeline.date)
      ProgressRing(
        progress: progress,
        size: size,
        lineWidth: lineWidth
      )
    }
  }
}

/// The digits. System-ticked via `Text(timerInterval:countsDown:)` — the
/// ONLY mechanism that counts down every second inside a Live Activity.
/// The render server animates it out of process: exact in foreground,
/// background, lock screen, and with the app killed. Zero bridge traffic;
/// endDate stays absolute (TypeScript owns it, Swift only renders).
///
/// LAYOUT — read before changing the frame:
/// The timer view reports a WIDE intrinsic box (~130pt, measured). Constrain
/// it with `.frame(width:)` and it lays out its glyphs inside that width:
/// - `.frame(width: fontSize * 3.0)` reserves room for "12:00" — 5 monospaced
///   chars at 0.6em each. The old 2.1× multiplier only fit 4 chars ("m:ss"):
///   "1:20" needs ~24pt at 10pt font but got 21pt, so it wrapped to two lines
///   on-device (01/10/2026). Never shrink the font to fit; give it space.
/// - `.lineLimit(1)` is the hard guarantee: the timer NEVER wraps.
/// - Do NOT add `.fixedSize(horizontal: true)`: this is a live-updating view
///   with no stable ideal width — fixedSize collapses it to zero and the
///   digits vanish entirely (01/10/2026, Kiệt's device: empty rings).
///
/// The interval MUST be `Date.now...endDate`. We tried stored
/// `startDate...endDate` (Dawnly pattern) — the system caches views with
/// fixed dates and the digits FREEZE. `Date.now` forces re-evaluation every
/// render. (01/10/2026, Kiệt's device: frozen 0:53/1:01/1:08.)
///
/// ANTI-CRASH (02/10/2026, A cross-check #217): `Date.now...endDate` TRAPS
/// ("Range requires lowerBound <= upperBound", uncatchable) the instant
/// `Date.now > endDate`. That happens in the normal flow: the rest ends while
/// the app is backgrounded, JS never runs `restLiveActivityEnded()`, and the
/// activity lives until `staleDate = endDate + 60s` — any redraw in that
/// window kills the widget extension and the Island/lock screen goes blank
/// (looks exactly like the old "timer disappeared" bugs). So the range is
/// `now...max(now, endDate)`: when expired it shows "0:00" instead of
/// crashing, and the stale activity is removed 60s later.
/// Read `Date.now` ONCE — two calls can race so the second reads larger.
@available(iOS 16.1, *)
private struct TimerDigits: View {
  let endDate: Date
  var fontSize: CGFloat = 22
  var weight: Font.Weight = .bold
  var countsDown: Bool = true
  /// When paused the system ticker would keep running — show the frozen
  /// remainder as static text instead (ceil, matching the in-app `left`).
  var isPaused: Bool = false
  var pausedRemaining: Double = 0

  var body: some View {
    Group {
      if isPaused {
        Text(formatTotal(seconds: Int(ceil(pausedRemaining))))
      } else {
        let now = Date.now
        Text(timerInterval: now...max(now, endDate), countsDown: countsDown)
      }
    }
    .font(Island.timerFont(size: fontSize, weight: weight))
    .foregroundStyle(.white)
    .lineLimit(1)
    .multilineTextAlignment(.center)
    .frame(width: fontSize * 3.0, alignment: .center)
  }
}

/// The visual anchor: a thin cream ring with the countdown centred inside
/// it, per the reference design. The ring's progress is coarse (TimelineView
/// cadence — see the header note); the digits above it are exact.
///
/// LAYOUT (02/10/2026, Kiệt's compact shot): ZStack + explicit outer frame,
/// NOT overlay. The overlay version let the timer's wide intrinsic box fight
/// the region sizing in compactTrailing and the ring rendered oversized and
/// clipped. The ZStack sizes to the fixed frame; nothing can blow it out.
@available(iOS 16.1, *)
private struct RestRingTimer: View {
  let endDate: Date
  let startDate: Date
  let totalSeconds: Int
  var isPaused: Bool = false
  var pausedRemaining: Double = 0
  var size: CGFloat = 80
  var lineWidth: CGFloat = 5
  var fontSize: CGFloat = 23
  var showTotal: Bool = true
  var countsDown: Bool = true

  var body: some View {
    ZStack {
      TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
        let progress: Double =
          isPaused
          ? pausedProgress(pausedRemaining: pausedRemaining, totalSeconds: totalSeconds)
          : restProgress(startDate: startDate, endDate: endDate, at: timeline.date)
        ProgressRing(progress: progress, size: size, lineWidth: lineWidth)
      }
      VStack(spacing: 1) {
        // TimerDigits constrains its own box (see its LAYOUT comment);
        // the stack centres that narrow box on the ring.
        TimerDigits(
          endDate: endDate, fontSize: fontSize, countsDown: countsDown,
          isPaused: isPaused, pausedRemaining: pausedRemaining)
        if showTotal {
          Text("/ \(formatTotal(seconds: totalSeconds))")
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      }
    }
    .frame(width: size, height: size)
  }
}

// MARK: - State helpers

@available(iOS 16.1, *)
private extension ActivityViewContext<RestTimerAttributes> {
  /// Next-set label — "Hiệp tiếp theo" (vi) / "Next set" (en).
  /// Kiệt 02/10/2026: the rest precedes the NEXT set; "Set 3/3" was wrong.
  /// The Island follows the app language; never hardcode English here.
  var setLabel: String {
    state.setText
  }

  /// Shorthand for the pause-aware countdown params threading every view.
  var pauseParams: (isPaused: Bool, pausedRemaining: Double) {
    (state.isPaused, state.pausedRemaining)
  }
}

// MARK: - Compact (minimized) — glanceable in under a second
//
// Apple-style minimal: the mark leading, the timer ring trailing, nothing
// in between. The countdown IS the content — no labels fighting it for
// space. Details live in the expanded view. (01/10/2026, Kiệt's call.)
@available(iOS 16.1, *)
private struct CompactLeading: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    ASCNDMark(size: 17)
  }
}

@available(iOS 16.1, *)
private struct CompactTrailing: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    // The ring is the right-hand anchor, with the live timer inside it —
    // per the reference design. Nothing else lives in trailing.
    //
    // CLIPPING FIX (02/10/2026, Kiệt's compact shot): the ring rendered
    // oversized and clipped in compactTrailing. RestRingTimer now uses a
    // ZStack with an explicit outer frame instead of overlay, and the box
    // here is fixed at 36pt — the ring can never exceed it, whatever the
    // region proposes. 30pt ring leaves 3pt breathing room per side.
    let pause = context.pauseParams
    ZStack {
      switch context.state.activityState {
      case .resting:
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: pause.isPaused,
          pausedRemaining: pause.pausedRemaining,
          size: 30, lineWidth: 2.5, fontSize: 9, showTotal: false
        )
      case .active:
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: pause.isPaused,
          pausedRemaining: pause.pausedRemaining,
          size: 30, lineWidth: 2.5, fontSize: 9, showTotal: false,
          countsDown: false
        )
      case .ready:
        // Calm: the mark alone. Nothing to report yet.
        EmptyView()
      }
    }
    .frame(width: 36, height: 36)
  }
}

@available(iOS 16.1, *)
private struct MinimalView: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    switch context.state.activityState {
    case .resting:
      RestRing(
        endDate: context.state.endDate,
        startDate: context.state.startDate,
        totalSeconds: context.state.totalSeconds,
        isPaused: context.state.isPaused,
        pausedRemaining: context.state.pausedRemaining,
        size: 20, lineWidth: 2.5)
    case .active:
      Image(systemName: "dumbbell.fill")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.white)
    case .ready:
      ASCNDMark(size: 16)
    }
  }
}

// MARK: - Expanded — its own hierarchy, not a blown-up compact

@available(iOS 16.1, *)
private struct ExpandedLeading: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        ASCNDMark(size: 14)
        Text(context.attributes.brandName.uppercased())
          .font(.caption2)
          .fontWeight(.medium)
          .tracking(1.2)
          .foregroundStyle(Island.tertiary)
      }

      switch context.state.activityState {
      case .resting:
        Text(context.state.restingText)
          .font(.system(size: 19, weight: .semibold))
          .foregroundStyle(.white)
        Text(context.setLabel)
          .font(.subheadline)
          .foregroundStyle(Island.secondary)
      case .active:
        Label {
          Text(context.state.exerciseName)
            .font(.title3)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .lineLimit(1)
        } icon: {
          Image(systemName: "dumbbell.fill")
            .font(.system(size: 14))
            .foregroundStyle(Island.secondary)
        }
        Text(context.setLabel)
          .font(.subheadline)
          .foregroundStyle(Island.secondary)
      case .ready:
        Text("Ready to train")
          .font(.title3)
          .fontWeight(.semibold)
          .foregroundStyle(.white)
        Text("Open the app to start")
          .font(.subheadline)
          .foregroundStyle(Island.secondary)
      }
    }
  }
}

@available(iOS 16.1, *)
private struct ExpandedTrailing: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    switch context.state.activityState {
    case .resting:
      // Kiệt 02/10/2026: [−15] [Pause/Play] [+15] [Ring], ring far-right.
      // Real AppIntent buttons — taps run in the extension, the app is never
      // foregrounded (the old visual-only button deep-linked on tap).
      HStack(spacing: 10) {
        IslandAdjustButton(seconds: -15)
        IslandPauseButton(isPaused: context.state.isPaused)
        IslandAdjustButton(seconds: 15)
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: context.state.isPaused,
          pausedRemaining: context.state.pausedRemaining
        )
      }
    case .active:
      HStack(spacing: 10) {
        IslandAdjustButton(seconds: -15)
        IslandPauseButton(isPaused: context.state.isPaused)
        IslandAdjustButton(seconds: 15)
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: context.state.isPaused,
          pausedRemaining: context.state.pausedRemaining,
          countsDown: false
        )
      }
    case .ready:
      // Reference panel 4: the mark sits in an app-icon tile — champagne A
      // on dark bronze — not a bare glyph.
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color(red: 0.24, green: 0.20, blue: 0.12))
        .frame(width: 60, height: 60)
        .overlay {
          ASCNDMark(size: 34)
        }
    }
  }
}

/// The island is a single row — actions sit beside the ring in .trailing,
/// per the mockup. Nothing belongs down here.
@available(iOS 16.1, *)
private struct ExpandedBottom: View {
  var body: some View {
    EmptyView()
  }
}

/// Real interactive controls (AppIntent, 02/10/2026 — Kiệt's call).
/// `Button(intent:)` runs inside the widget extension: no deep-link, the app
/// is never foregrounded. `.buttonStyle(.plain)` keeps our cream-on-dark
/// Island language instead of the default button chrome.
@available(iOS 16.1, *)
private struct IslandPauseButton: View {
  var isPaused: Bool

  var body: some View {
    Button(intent: ToggleRestPauseIntent()) {
      Image(systemName: isPaused ? "play.fill" : "pause.fill")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 44, height: 44)
        .background(Circle().fill(Color.white.opacity(0.16)))
    }
    .buttonStyle(.plain)
  }
}

/// −15s / +15s — mirrors the in-app rest card (Kiệt 02/10/2026).
@available(iOS 16.1, *)
private struct IslandAdjustButton: View {
  var seconds: Int // -15 or +15

  var body: some View {
    Button(intent: AdjustRestIntent(seconds: seconds)) {
      Text(seconds > 0 ? "+15" : "−15")
        .font(.system(size: 12, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(.white)
        .frame(width: 38, height: 38)
        .background(Circle().fill(Color.white.opacity(0.12)))
    }
    .buttonStyle(.plain)
  }
}

// MARK: - Lock Screen

@available(iOS 16.1, *)
private struct LockScreenView: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    switch context.state.activityState {
    case .resting:
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.restingText.uppercased())
            .font(.caption2)
            .fontWeight(.semibold)
            .tracking(1.2)
            .foregroundStyle(Island.gold.opacity(0.85))
          Text(context.state.exerciseName)
            .font(.headline)
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(context.setLabel)
            .font(.caption)
            .foregroundStyle(Island.secondary)
        }
        Spacer()
        // Ring at the far right with the live timer inside — same language
        // as the Island. Digits are system-ticked; the ring is coarse.
        // Pause-aware: frozen when the Island pause button was used.
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: context.state.isPaused,
          pausedRemaining: context.state.pausedRemaining,
          size: 52, lineWidth: 4, fontSize: 16
        )
      }
      .padding()
    case .active:
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 2) {
          Label {
            Text(context.state.exerciseName)
              .font(.headline)
              .foregroundStyle(.white)
              .lineLimit(1)
          } icon: {
            Image(systemName: "dumbbell.fill")
              .font(.system(size: 14))
              .foregroundStyle(Island.secondary)
          }
          Text(context.setLabel)
            .font(.caption)
            .foregroundStyle(Island.secondary)
        }
        Spacer()
        RestRingTimer(
          endDate: context.state.endDate,
          startDate: context.state.startDate,
          totalSeconds: context.state.totalSeconds,
          isPaused: context.state.isPaused,
          pausedRemaining: context.state.pausedRemaining,
          size: 52, lineWidth: 4, fontSize: 16,
          countsDown: false
        )
      }
      .padding()
    case .ready:
      HStack {
        ASCNDMark(size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text("Ready to train")
            .font(.headline)
            .foregroundStyle(.white)
          Text("Open the app to start")
            .font(.caption)
            .foregroundStyle(Island.secondary)
        }
        Spacer()
      }
      .padding()
    }
  }
}
