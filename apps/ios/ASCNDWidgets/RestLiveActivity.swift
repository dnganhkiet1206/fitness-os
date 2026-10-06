import ActivityKit
import ASCNDCore
import ASCNDLiveActivity
import SwiftUI
import WidgetKit

/// Live Activity / Dynamic Island của quãng nghỉ (#227).
///
/// Mọi thứ chuyển động ở đây đều do HỆ THỐNG tự chạy từ hai mốc tuyệt đối —
/// không TimelineView, không cập nhật theo nhịp, không style tự vẽ:
/// - chữ số: `Text(timerInterval:countsDown:)`;
/// - vòng: `ProgressView(timerInterval: ringStart...endsAt, countsDown: true)`
///   với `.circular` của hệ thống (H3: style tự vẽ chỉ nhận một ảnh chụp lúc
///   render nên nhảy theo đợt). `ringStart = endsAt − total` nên vòng này và
///   vòng trong app là cùng một hàm của thời gian (H4).
struct RestLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { context in
      RestLockScreen(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.85))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          RestLabel(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestRing(state: context.state, size: 56)
        }
        DynamicIslandExpandedRegion(.bottom) {
          AdjustButtons()
        }
      } compactLeading: {
        Image(systemName: "timer")
          .accessibilityHidden(true)
      } compactTrailing: {
        RestDigits(state: context.state)
          .frame(maxWidth: 44)
      } minimal: {
        RestRing(state: context.state, size: 22, showsDigits: false)
      }
    }
  }
}

/// Chữ số do hệ thống tick. Khoảng phải không ngược: `now...endsAt` sau khi
/// đã hết giờ là một khoảng rỗng và làm widget crash (#217) — kẹp ở `now`.
struct RestDigits: View {
  let state: RestActivityContent
  var body: some View {
    let now = Date()
    Text(timerInterval: now...max(now, state.endsAt.date), countsDown: true)
      .monospacedDigit()
      .multilineTextAlignment(.trailing)
  }
}

struct RestRing: View {
  let state: RestActivityContent
  var size: CGFloat
  var showsDigits = true
  var body: some View {
    ProgressView(timerInterval: state.ringStart.date...state.endsAt.date, countsDown: true) {
      EmptyView()
    } currentValueLabel: {
      if showsDigits { RestDigits(state: state).font(.caption2.weight(.semibold)) }
    }
    .progressViewStyle(.circular)
    .tint(.white)
    .frame(width: size, height: size)
  }
}

struct RestLabel: View {
  let state: RestActivityContent
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("rest.title")
        .font(.caption)
        .foregroundStyle(.secondary)
      if let t = state.target {
        Text(t.exerciseName)
          .font(.headline)
          .lineLimit(1)
        Text("rest.set \(t.setNumber) \(t.totalSets)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }
}

/// ±15 — `LiveActivityIntent`, chạy trong process của app (#227 H1).
struct AdjustButtons: View {
  var body: some View {
    HStack(spacing: 12) {
      Button(intent: AdjustRestIntent(seconds: -15)) {
        Text("−15")
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .accessibilityLabel(Text("rest.minus15"))
      Button(intent: AdjustRestIntent(seconds: 15)) {
        Text("+15")
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .accessibilityLabel(Text("rest.plus15"))
    }
    .font(.headline.monospacedDigit())
    .buttonStyle(.bordered)
    .tint(.white)
  }
}

struct RestLockScreen: View {
  let state: RestActivityContent
  var body: some View {
    VStack(spacing: 12) {
      HStack {
        RestLabel(state: state)
        Spacer()
        RestRing(state: state, size: 64)
      }
      AdjustButtons()
    }
    .padding()
  }
}
