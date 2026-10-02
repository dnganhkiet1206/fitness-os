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
// Interactivity: the pause control is VISUAL ONLY (display-only per #195).
// It is a plain view, not a Button, so taps fall through and open the app.
// Wiring it needs AppIntents — a separate task.

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

/// The geometric "A" — drawn, not typed, so it stays crisp at any size.
/// Cream, per the reference design (the mark reads champagne, not white).
@available(iOS 16.1, *)
private struct ASCNDMark: View {
  var size: CGFloat = 20

  var body: some View {
    Canvas { ctx, sz in
      let w = sz.width, h = sz.height
      var path = Path()
      // Outer A: apex top-center, feet at bottom corners.
      path.move(to: CGPoint(x: w * 0.5, y: h * 0.08))
      path.addLine(to: CGPoint(x: w * 0.92, y: h * 0.92))
      path.addLine(to: CGPoint(x: w * 0.72, y: h * 0.92))
      path.addLine(to: CGPoint(x: w * 0.5, y: h * 0.42))
      path.addLine(to: CGPoint(x: w * 0.28, y: h * 0.92))
      path.addLine(to: CGPoint(x: w * 0.08, y: h * 0.92))
      path.closeSubpath()
      // Crossbar cutout.
      path.move(to: CGPoint(x: w * 0.38, y: h * 0.68))
      path.addLine(to: CGPoint(x: w * 0.62, y: h * 0.68))
      path.addLine(to: CGPoint(x: w * 0.56, y: h * 0.80))
      path.addLine(to: CGPoint(x: w * 0.44, y: h * 0.80))
      path.closeSubpath()
      ctx.fill(path, with: .color(Island.cream))
    }
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

/// Countdown ring whose progress is recomputed on a 1s native timeline.
/// (A progress value captured at render time freezes — the timer text ticks
/// via the system clock without re-rendering the view.)
@available(iOS 16.1, *)
private struct RestRing: View {
  let endDate: Date
  let totalSeconds: Int
  var size: CGFloat = 22
  var lineWidth: CGFloat = 2.5

  var body: some View {
    TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
      ProgressRing(
        progress: restProgress(endDate: endDate, totalSeconds: totalSeconds, at: timeline.date),
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
/// LAYOUT WARNING — read before changing the frame: the timer view reports
/// a WIDE intrinsic box (~130pt, measured) but paints its glyphs at the
/// box's LEADING edge. Unconstrained, the digits sat 42pt left of the ring
/// centre on-device (01/10/2026, derived: box 130 − glyphs 46 = 84 / 2).
/// The `.frame(width:)` below constrains the box to the digits' true width
/// ("m:ss" is always 4 chars with monospaced digits, so width ≈ 2.1×font),
/// which makes the leading edge irrelevant and centres the digits.
/// Do NOT "fix" this by widening the frame to the ring size — that
/// reintroduces the 42pt shift.
@available(iOS 16.1, *)
private struct TimerDigits: View {
  let endDate: Date
  var fontSize: CGFloat = 22
  var weight: Font.Weight = .bold
  var countsDown: Bool = true

  var body: some View {
    Text(timerInterval: Date.now...endDate, countsDown: countsDown)
      .font(Island.timerFont(size: fontSize, weight: weight))
      .foregroundStyle(.white)
      .multilineTextAlignment(.center)
      .frame(width: fontSize * 2.1)
  }
}

/// The visual anchor: a thin cream ring with the countdown centred inside
/// it, per the reference design. The ring's progress is coarse (TimelineView
/// cadence — see the header note); the digits above it are exact.
@available(iOS 16.1, *)
private struct RestRingTimer: View {
  let endDate: Date
  let totalSeconds: Int
  var size: CGFloat = 76
  var lineWidth: CGFloat = 5
  var fontSize: CGFloat = 22
  var showTotal: Bool = true
  var countsDown: Bool = true

  var body: some View {
    TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
      ProgressRing(
        progress: restProgress(endDate: endDate, totalSeconds: totalSeconds, at: timeline.date),
        size: size,
        lineWidth: lineWidth
      )
    }
    .overlay {
      VStack(spacing: 1) {
        // TimerDigits constrains its own box (see its LAYOUT WARNING);
        // the overlay centres that narrow box on the ring.
        TimerDigits(endDate: endDate, fontSize: fontSize, countsDown: countsDown)
        if showTotal {
          Text("/ \(formatTotal(seconds: totalSeconds))")
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      }
    }
  }
}

// MARK: - State helpers

@available(iOS 16.1, *)
private extension ActivityViewContext<RestTimerAttributes> {
  var setLabel: String {
    "Set \(state.setNumber) of \(state.totalSets)"
  }
}

// MARK: - Compact (minimized) — glanceable in under a second

@available(iOS 16.1, *)
private struct CompactLeading: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    HStack(spacing: 8) {
      ASCNDMark(size: 18)
      switch context.state.activityState {
      case .resting:
        VStack(alignment: .leading, spacing: 1) {
          Text("Rest")
            .font(.caption)
            .fontWeight(.medium)
            .foregroundStyle(.white)
          Text(context.setLabel)
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      case .active:
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(.white)
        VStack(alignment: .leading, spacing: 1) {
          Text(context.state.exerciseName)
            .font(.caption)
            .fontWeight(.medium)
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(context.setLabel)
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      case .ready:
        EmptyView()
      }
    }
  }
}

@available(iOS 16.1, *)
private struct CompactTrailing: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    // The ring is the right-hand anchor, with the live timer inside it —
    // per the reference design. Nothing else lives in trailing.
    switch context.state.activityState {
    case .resting:
      RestRingTimer(
        endDate: context.state.endDate,
        totalSeconds: context.state.totalSeconds,
        size: 32, lineWidth: 2.5, fontSize: 10, showTotal: false
      )
    case .active:
      RestRingTimer(
        endDate: context.state.endDate,
        totalSeconds: context.state.totalSeconds,
        size: 32, lineWidth: 2.5, fontSize: 10, showTotal: false,
        countsDown: false
      )
    case .ready:
      // Calm: the mark alone. Nothing to report yet.
      EmptyView()
    }
  }
}

@available(iOS 16.1, *)
private struct MinimalView: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    switch context.state.activityState {
    case .resting:
      RestRing(endDate: context.state.endDate, totalSeconds: context.state.totalSeconds, size: 20, lineWidth: 2.5)
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
      Text(context.attributes.brandName.uppercased())
        .font(.caption2)
        .fontWeight(.medium)
        .tracking(1.2)
        .foregroundStyle(Island.tertiary)

      switch context.state.activityState {
      case .resting:
        Text("Resting")
          .font(.title3)
          .fontWeight(.semibold)
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
      // Per the reference: pause first, ring LAST — the ring hugs the far
      // right edge as the visual anchor. No Skip: the Island is not a
      // media player (Kiệt's spec 01/10/2026).
      HStack(spacing: 14) {
        IslandCircleButton(icon: "pause.fill")
        RestRingTimer(endDate: context.state.endDate, totalSeconds: context.state.totalSeconds)
      }
    case .active:
      HStack(spacing: 14) {
        IslandCircleButton(icon: "pause.fill")
        RestRingTimer(
          endDate: context.state.endDate,
          totalSeconds: context.state.totalSeconds,
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

/// Visual-only circular control (display-only per #195 — no AppIntent wired).
/// A plain view, not a Button, so taps fall through and open the app.
@available(iOS 16.1, *)
private struct IslandCircleButton: View {
  var icon: String

  var body: some View {
    Image(systemName: icon)
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: 44, height: 44)
      .background(Circle().fill(Color.white.opacity(0.16)))
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
          Text("REST")
            .font(.caption)
            .fontWeight(.semibold)
            .tracking(1.5)
            .foregroundStyle(Island.gold)
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
        RestRingTimer(
          endDate: context.state.endDate,
          totalSeconds: context.state.totalSeconds,
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
          totalSeconds: context.state.totalSeconds,
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
