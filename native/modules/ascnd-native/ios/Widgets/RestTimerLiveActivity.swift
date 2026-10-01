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
// Interactivity: buttons are VISUAL ONLY in this revision (display-only per
// #195). They reserve layout space and complete the design system; wiring
// them needs AppIntents — a separate task.

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
          ExpandedBottom(context: context)
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

// MARK: - State helpers

@available(iOS 16.1, *)
private extension ActivityViewContext<RestTimerAttributes> {
  /// Elapsed fraction of the rest, 0 → 1. Drives the progress ring.
  var restProgress: Double {
    let total = Double(state.totalSeconds)
    guard total > 0 else { return 0 }
    let remaining = state.endDate.timeIntervalSince(Date.now)
    return min(max(1 - remaining / total, 0), 1)
  }

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
        ProgressRing(progress: context.restProgress, size: 22, lineWidth: 2.5)
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
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 1) {
          Text("Rest")
            .font(.caption)
            .fontWeight(.medium)
            .foregroundStyle(.white)
          Text(context.setLabel)
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
        Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
          .font(Island.timerFont(size: 17))
          .foregroundStyle(.white)
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
      ProgressRing(progress: context.restProgress, size: 20, lineWidth: 2.5)
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
      ZStack {
        ProgressRing(progress: context.restProgress, size: 76, lineWidth: 6)
        VStack(spacing: 0) {
          Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
            .font(Island.timerFont(size: 22, weight: .bold))
            .foregroundStyle(.white)
          Text("/ \(formattedTotal)")
            .font(.caption2)
            .foregroundStyle(Island.secondary)
        }
      }
    case .active:
      VStack(spacing: 0) {
        Text(timerInterval: Date.now...context.state.endDate, countsDown: false)
          .font(Island.timerFont(size: 26, weight: .bold))
          .foregroundStyle(.white)
        Text("/ \(formattedTotal)")
          .font(.caption2)
          .foregroundStyle(Island.secondary)
      }
    case .ready:
      ASCNDMark(size: 44)
        .opacity(0.9)
    }
  }

  private var formattedTotal: String {
    let m = context.state.totalSeconds / 60
    let s = context.state.totalSeconds % 60
    return String(format: "%d:%02d", m, s)
  }
}

@available(iOS 16.1, *)
private struct ExpandedBottom: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    switch context.state.activityState {
    case .resting:
      HStack(spacing: 12) {
        Spacer()
        IslandButton(icon: "pause.fill", label: "Pause")
        IslandButton(icon: "forward.fill", label: "Skip")
        Spacer()
      }
    case .active:
      HStack(spacing: 12) {
        Spacer()
        IslandButton(icon: "pause.fill", label: "Pause")
        IslandButton(icon: "checkmark", label: "Done", prominent: true)
        Spacer()
      }
    case .ready:
      // Nothing — calm.
      EmptyView()
    }
  }
}

/// Visual-only control. Layout-complete; needs AppIntents to act.
@available(iOS 16.1, *)
private struct IslandButton: View {
  var icon: String
  var label: String
  var prominent: Bool = false

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: icon)
        .font(.system(size: 13, weight: .semibold))
      Text(label)
        .font(.subheadline)
        .fontWeight(.medium)
    }
    .foregroundStyle(prominent ? .black : .white)
    .padding(.horizontal, 16)
    .padding(.vertical, 9)
    .background(
      Capsule().fill(prominent ? Island.gold : Color.white.opacity(0.16))
    )
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
        ProgressRing(progress: context.restProgress, size: 52, lineWidth: 5)
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
        Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
          .font(Island.timerFont(size: 30, weight: .bold))
          .foregroundStyle(.white)
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
