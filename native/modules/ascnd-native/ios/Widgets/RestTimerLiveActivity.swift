import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Display-only rest timer Live Activity UI (spike #195)
//
// Rendering only: Lock Screen + Dynamic Island. No buttons, no actions —
// interactivity was explicitly deferred (Kiệt's call on #195).
//
// The countdown is derived natively from `ContentState.endDate` via
// `Text(timerInterval:countsDown:)` — the system ticks the UI itself, so
// TypeScript sends state only on start/update/end, never per-second.

@available(iOS 16.1, *)
struct RestTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestTimerAttributes.self) { context in
      // Lock Screen / banner presentation.
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(context.attributes.brandName)
            .font(.caption2)
            .foregroundStyle(.secondary)
          Spacer()
          Text("Set \(context.state.setNumber) of \(context.state.totalSets)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Text(context.state.exerciseName)
          .font(.headline)
          .lineLimit(1)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .monospacedDigit()
          Text("rest")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.85))
      .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading) {
            Text(context.attributes.brandName)
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(context.state.exerciseName)
              .font(.headline)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
            .font(.title3)
            .monospacedDigit()
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Set \(context.state.setNumber) of \(context.state.totalSets) · resting")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Text("ASCND")
          .font(.caption2)
      } compactTrailing: {
        Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
          .font(.caption)
          .monospacedDigit()
      } minimal: {
        Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
          .monospacedDigit()
      }
    }
  }
}
