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
///
/// Đang tạm dừng (#235): chữ số và vòng TĨNH từ `pausedLeft` — đồng hồ hệ
/// thống vẫn chạy nên không được giao cho nó (RN `isPaused`).
///
/// Giao diện (20/10, Kiệt duyệt mock `docs/design/mocks/rest-live-activity.html`):
/// cùng chất liệu widget Koa — titan đen chải ngang, quầng cam góc trên trái, số
/// Menlo, màu Tập (hồng đỏ) là điểm nhấn duy nhất; tạm dừng chuyển xám.
struct RestLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { context in
      RestLockScreen(state: context.state)
        .environment(\.locale, WidgetDataStore().locale)
        .environment(\.colorScheme, .dark)
        .activityBackgroundTint(.clear)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          RestLabel(state: context.state, compact: true)
            .environment(\.locale, WidgetDataStore().locale)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          RestDigits(state: context.state)
            .font(RestInk.mono(30))
            .foregroundStyle(RestInk.ink)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 10) {
            RestBar(state: context.state)
            AdjustButtons(paused: context.state.pausedLeft != nil, height: 36)
              .environment(\.locale, WidgetDataStore().locale)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        HStack(spacing: 6) {
          RestRing(state: context.state, size: 20, lineWidth: 3)
          Group {
            if context.state.pausedLeft != nil { Text("rest.compact.paused") } else { Text("rest.title") }
          }
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(context.state.pausedLeft != nil ? RestInk.paused : .white)
        }
        .environment(\.locale, WidgetDataStore().locale)
      } compactTrailing: {
        RestDigits(state: context.state)
          .font(RestInk.mono(15))
          .foregroundStyle(RestInk.accent(context.state))
          .frame(maxWidth: 46)
      } minimal: {
        RestRing(state: context.state, size: 22, lineWidth: 3)
      }
      .keylineTint(RestInk.rose)
    }
  }
}

/// Bảng màu — chép từ `KoaWidgetInk` (dark): màu Tập là điểm nhấn.
enum RestInk {
  static let rose = KoaWidgetInk.tube(3, true)
  static let roseDeep = KoaWidgetInk.rgb(184, 48, 68)
  static let ink = KoaWidgetInk.ink(true)
  static let muted = KoaWidgetInk.muted(true)
  static let paused = KoaWidgetInk.rgb(201, 196, 189)
  static let track = Color.white.opacity(0.13)
  static func accent(_ s: RestActivityContent) -> Color { s.pausedLeft != nil ? paused : rose }
  static func mono(_ size: CGFloat) -> Font { .custom("Menlo", size: size).weight(.bold) }
}

/// Chữ số do hệ thống tick. Khoảng phải không ngược: `now...endsAt` sau khi
/// đã hết giờ là một khoảng rỗng và làm widget crash (#217) — kẹp ở `now`.
struct RestDigits: View {
  let state: RestActivityContent
  var alignment: TextAlignment = .trailing
  var body: some View {
    Group {
      if let left = state.pausedLeft {
        Text(verbatim: Self.clock(left))
      } else {
        let now = Date()
        Text(timerInterval: now...max(now, state.endsAt.date), countsDown: true)
      }
    }
    .monospacedDigit()
    .multilineTextAlignment(alignment)
  }

  /// "1:05" — cùng dạng `Text(timerInterval:)` vẽ khi đang chạy.
  static func clock(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return "\(s / 60):\(s % 60 < 10 ? "0" : "")\(s % 60)"
  }
}

/// Vòng do hệ thống chạy (`.circular`), tô màu Tập; tạm dừng: tĩnh, xám.
struct RestRing: View {
  let state: RestActivityContent
  var size: CGFloat
  var lineWidth: CGFloat = 4
  var showsDigits = false
  var body: some View {
    Group {
      if let left = state.pausedLeft {
        ProgressView(value: Double(min(left, max(state.totalSeconds, 1))), total: Double(max(state.totalSeconds, 1))) {
          EmptyView()
        } currentValueLabel: {
          if showsDigits { RestDigits(state: state).font(RestInk.mono(size * 0.24)) }
        }
      } else {
        ProgressView(timerInterval: state.ringStart.date...state.endsAt.date, countsDown: true) {
          EmptyView()
        } currentValueLabel: {
          if showsDigits { RestDigits(state: state).font(RestInk.mono(size * 0.24)) }
        }
      }
    }
    .progressViewStyle(.circular)
    .tint(RestInk.accent(state))
    .frame(width: size, height: size)
  }
}

/// Thanh thời gian của Island mở rộng — hệ thống chạy (`.linear`).
struct RestBar: View {
  let state: RestActivityContent
  var body: some View {
    Group {
      if let left = state.pausedLeft {
        ProgressView(value: Double(min(left, max(state.totalSeconds, 1))), total: Double(max(state.totalSeconds, 1)))
      } else {
        ProgressView(timerInterval: state.ringStart.date...state.endsAt.date, countsDown: true) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
      }
    }
    .progressViewStyle(.linear)
    .tint(RestInk.accent(state))
    .labelsHidden()
  }
}

/// Nhãn · tên bài · "set 3/4" · vạch set.
struct RestLabel: View {
  let state: RestActivityContent
  var big = false
  /// Island: chỉ nhãn + tên bài (dòng set nằm ở vùng dưới).
  var compact = false
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 6) {
        Circle().fill(RestInk.accent(state)).frame(width: 7, height: 7)
        Group {
          if state.pausedLeft != nil { Text("rest.title.paused") } else { Text("rest.title.between") }
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(RestInk.muted)
      }
      if let t = state.target {
        Text(t.exerciseName)
          .font(.system(size: big ? 21 : 18, weight: .bold))
          .foregroundStyle(RestInk.ink)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
        if compact {
          // Island: bản ngắn "Set 2/3" — vùng trái hẹp, câu dài bị cắt.
          Text("rest.set \(t.setNumber) \(t.totalSets)")
            .font(.system(size: 12.5))
            .foregroundStyle(RestInk.muted)
        } else {
          Text("rest.next \(t.setNumber) \(t.totalSets)")
            .font(.system(size: 12.5))
            .foregroundStyle(RestInk.muted)
          SetPips(done: max(0, t.setNumber - 1), total: t.totalSets, color: RestInk.accent(state))
            .padding(.top, 3)
        }
      }
    }
  }
}

/// Vạch set: đã xong tô màu, còn lại mờ (tối đa 8 vạch).
struct SetPips: View {
  let done: Int
  let total: Int
  let color: Color
  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<min(max(total, 0), 8), id: \.self) { i in
        Capsule().fill(i < done ? color : RestInk.track).frame(width: 16, height: 4)
      }
    }
    .accessibilityHidden(true)
  }
}

/// ±15 và tạm dừng — `LiveActivityIntent`, chạy trong process của app (#227 H1).
/// Nút giữa là nút chính: hồng khi chạy (tạm dừng), trắng khi đã dừng (tiếp tục).
struct AdjustButtons: View {
  let paused: Bool
  var height: CGFloat = 42
  var body: some View {
    HStack(spacing: 8) {
      Button(intent: AdjustRestIntent(seconds: -15)) {
        Text(verbatim: "−15").font(RestInk.mono(15)).foregroundStyle(RestInk.ink)
          .frame(maxWidth: .infinity, minHeight: height)
          .background(Color.white.opacity(0.12), in: Capsule())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("rest.minus15"))
      Button(intent: SetRestPausedIntent(paused: !paused)) {
        Image(systemName: paused ? "play.fill" : "pause.fill")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(paused ? Color.black : .white)
          .frame(maxWidth: .infinity, minHeight: height)
          .background(paused ? RestInk.ink : RestInk.rose, in: Capsule())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(paused ? Text("rest.resume") : Text("rest.pause"))
      Button(intent: AdjustRestIntent(seconds: 15)) {
        Text(verbatim: "+15").font(RestInk.mono(15)).foregroundStyle(RestInk.ink)
          .frame(maxWidth: .infinity, minHeight: height)
          .background(Color.white.opacity(0.12), in: Capsule())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("rest.plus15"))
    }
  }
}

/// Màn khoá: thẻ titan đen như widget Koa, quầng cam góc TRÊN trái (Kiệt, 20/10).
struct RestLockScreen: View {
  let state: RestActivityContent
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 6) {
        Image("BrandMark").resizable().interpolation(.high).frame(width: 12, height: 12).opacity(0.7)
        Text(verbatim: "ASCND").font(.system(size: 11, weight: .heavy)).tracking(0.9)
        Text(verbatim: "·")
        Group {
          if state.pausedLeft != nil { Text("rest.title.paused") } else { Text("rest.title.between") }
        }
        .font(.system(size: 11, weight: .heavy)).textCase(.uppercase).tracking(0.9)
      }
      .foregroundStyle(RestInk.muted)
      HStack(alignment: .center, spacing: 14) {
        if let t = state.target {
          VStack(alignment: .leading, spacing: 3) {
            Text(t.exerciseName).font(.system(size: 21, weight: .bold)).foregroundStyle(RestInk.ink)
              .lineLimit(1).minimumScaleFactor(0.75)
            Text("rest.next \(t.setNumber) \(t.totalSets)").font(.system(size: 12.5)).foregroundStyle(RestInk.muted)
            SetPips(done: max(0, t.setNumber - 1), total: t.totalSets, color: RestInk.accent(state)).padding(.top, 3)
          }
        } else {
          Text("rest.title").font(.system(size: 21, weight: .bold)).foregroundStyle(RestInk.ink)
        }
        Spacer(minLength: 0)
        ZStack {
          RestRing(state: state, size: 72, lineWidth: 6)
          RestDigits(state: state, alignment: .center).font(RestInk.mono(16))
            .foregroundStyle(state.pausedLeft != nil ? RestInk.paused : RestInk.ink)
            .frame(width: 56)
        }
      }
      AdjustButtons(paused: state.pausedLeft != nil)
    }
    .padding(16)
    .background { RestMetal() }
  }
}

/// Titan đen chải ngang + vệt sáng mép trên + quầng cam góc trên trái.
struct RestMetal: View {
  var body: some View {
    ZStack {
      LinearGradient(colors: [Color(white: 0.15), Color(white: 0.08), Color(white: 0.06)], startPoint: .top, endPoint: .bottom)
      RadialGradient(
        colors: [KoaWidgetInk.halo(true).opacity(0.24), .clear], center: UnitPoint(x: 0.06, y: 0.0),
        startRadius: 0, endRadius: 170)
      Canvas { ctx, size in
        var y: CGFloat = 0
        var i = 0
        while y < size.height {
          var p = Path()
          p.move(to: CGPoint(x: 0, y: y))
          p.addLine(to: CGPoint(x: size.width, y: y))
          ctx.stroke(p, with: .color(.white.opacity(i % 3 == 0 ? 0.045 : 0.022)), lineWidth: 0.5)
          y += 2
          i += 1
        }
      }
      LinearGradient(stops: [.init(color: .white.opacity(0.10), location: 0), .init(color: .clear, location: 0.2)], startPoint: .top, endPoint: .bottom)
    }
  }
}
