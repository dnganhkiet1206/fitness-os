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
// Visual rules (from the redesign brief):
// - Near-black background, SF Pro typography, strong hierarchy, few elements
// - ASCND gold (#E8B23A) appears ONLY in the progress ring / active indicator
// - Never a mini dashboard: weight, reps, RPE stay in the app
// - Timer is always rounded + monospacedDigit, the numerical focal point
//
// Interactivity: controls are VISUAL ONLY in this revision (display-only per
// #195). They match the mockup as circular icon-only buttons and reserve the
// layout; wiring them needs AppIntents — a separate task. They are plain
// views, not Buttons, so taps fall through and open the app.
//
// Countdown rendering: driven by a 1s native TimelineView, NOT
// Text(timerInterval:). The Live Activity render server gives the timer-text
// view an oversized, misaligned layout box (observed on-device 01/10/2026:
// the digits sat ~37pt left of the ring centre while "/ total" centred
// correctly). A plain Text fed by TimelineView has a stable intrinsic size,
// and the same tick drives the ring progress. Still no JS bridge ticks:
// endDate stays absolute, Swift owns rendering.

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
  /// ASCND gold — the ONLY accent. Lives in the progress ring.
  static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)
  static let secondary = Color.white.opacity(0.6)
  static let tertiary = Color.white.opacity(0.4)

  static func timerFont(size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight, design: .rounded).monospacedDigit()
  }
}

// MARK: - ASCND mark

/// The geometric "A" — drawn, not typed, so it stays crisp at any size.
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
      ctx.fill(path, with: .color(.white))
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
        .stroke(Island.gold, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .animation(.easeInOut(duration: 0.3), value: progress)
    }
    .frame(width: size, height: size)
  }
}

// MARK: - Rest countdown — one native timeline drives text + ring

/// Formats remaining seconds as m:ss, ceiling so the display only reaches
/// 0:00 exactly at endDate.
private func formatCountdown(_ remaining: Double) -> String {
  let total = max(Int(ceil(remaining)), 0)
  return String(format: "%d:%02d", total / 60, total % 60)
}

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

/// Expanded-island anchor: the ring with the countdown centred inside it.
/// The text is an overlay on the fixed-size ring (not a ZStack sibling), so
/// region layout can never separate them again.
@available(iOS 16.1, *)
private struct RestRingTimer: View {
  let endDate: Date
  let totalSeconds: Int

  var body: some View {
    TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
      let remaining = max(endDate.timeIntervalSince(timeline.date), 0)
      ProgressRing(
        progress: restProgress(endDate: endDate, totalSeconds: totalSeconds, at: timeline.date),
        size: 76,
        lineWidth: 6
      )
      .overlay {
        VStack(spacing: 0) {
          Text(formatCountdown(remaining))
            .font(Island.timerFont(size: 22, weight: .bold))
            .foregroundStyle(.white)
          Text("/ \(formatTotal(seconds: totalSeconds))")
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      }
    }
  }
}

/// Plain countdown text for the compact island — stable layout box.
@available(iOS 16.1, *)
private struct RestCompactTimer: View {
  let endDate: Date

  var body: some View {
    TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
      Text(formatCountdown(max(endDate.timeIntervalSince(timeline.date), 0)))
        .font(Island.timerFont(size: 17))
        .foregroundStyle(.white)
    }
  }
}

// MARK: - State helpers

@available(iOS 16.1, *)
private extension ActivityViewContext<RestTimerAttributes> {
  var setLabel: String {
    "Set \(state.setNumber) of \(state.totalSets)"
  }

  /// Glanceable form for the compact island ("Set 3/3"). The compact
  /// trailing region is narrow — the full "Set 3 of 3" truncates on-device
  /// ("Set 3…").
  var compactSetLabel: String {
    "Set \(state.setNumber)/\(state.totalSets)"
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
        RestRing(endDate: context.state.endDate, totalSeconds: context.state.totalSeconds, size: 22, lineWidth: 2.5)
      case .active:
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(.white)
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
    switch context.state.activityState {
    case .resting:
      HStack(spacing: 8) {
        VStack(alignment: .leading, spacing: 1) {
          Text("Rest")
            .font(.caption)
            .fontWeight(.medium)
            .foregroundStyle(.white)
          Text(context.compactSetLabel)
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
        RestCompactTimer(endDate: context.state.endDate)
      }
    case .active:
      HStack(spacing: 10) {
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
        Text(timerInterval: Date.now...context.state.endDate, countsDown: false)
          .font(Island.timerFont(size: 17))
          .foregroundStyle(.white)
      }
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
      // One row, per the mockup: ring-with-timer, then circular controls.
      HStack(spacing: 14) {
        RestRingTimer(endDate: context.state.endDate, totalSeconds: context.state.totalSeconds)
        HStack(spacing: 10) {
          IslandCircleButton(icon: "pause.fill")
          IslandCircleButton(icon: "forward.fill")
        }
      }
    case .active:
      HStack(spacing: 14) {
        VStack(spacing: 0) {
          Text(timerInterval: Date.now...context.state.endDate, countsDown: false)
            .font(Island.timerFont(size: 26, weight: .bold))
            .foregroundStyle(.white)
          Text("/ \(formatTotal(seconds: context.state.totalSeconds))")
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
        HStack(spacing: 10) {
          IslandCircleButton(icon: "pause.fill")
          IslandCircleButton(icon: "checkmark", prominent: true)
        }
      }
    case .ready:
      ASCNDMark(size: 44)
        .opacity(0.9)
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
  var prominent: Bool = false

  var body: some View {
    Image(systemName: icon)
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(prominent ? .black : .white)
      .frame(width: 44, height: 44)
      .background(Circle().fill(prominent ? Island.gold : Color.white.opacity(0.16)))
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
        RestRing(endDate: context.state.endDate, totalSeconds: context.state.totalSeconds, size: 52, lineWidth: 5)
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
        TimelineView(.periodic(from: Date(), by: 1.0)) { timeline in
          Text(formatCountdown(max(context.state.endDate.timeIntervalSince(timeline.date), 0)))
            .font(Island.timerFont(size: 30, weight: .bold))
            .foregroundStyle(.white)
        }
      }
      .padding()
    case .active:
      HStack(spacing: 14) {
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 26))
          .foregroundStyle(Island.gold)
          .frame(width: 52)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.exerciseName)
            .font(.headline)
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(context.setLabel)
            .font(.caption)
            .foregroundStyle(Island.secondary)
        }
        Spacer()
        Text(timerInterval: Date.now...context.state.endDate, countsDown: false)
          .font(Island.timerFont(size: 30, weight: .bold))
          .foregroundStyle(.white)
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
