#if DEBUG
import ASCNDCore
import SwiftUI

/// Màn thử quãng nghỉ — CHỈ có trong bản Debug ("ASCND Dev"), để Kiệt kiểm
/// trên iPhone thật các giả thuyết của #227 trước khi màn tập thật có:
///
/// - H1: bấm ±15 trên Dynamic Island → số trong app đổi theo, và ngược lại;
/// - H3: vòng trên Island chạy MƯỢT, không nhảy theo đợt;
/// - H4: vòng trong app (dưới đây) và vòng trên Island luôn bằng nhau.
///
/// Vòng ở đây vẽ bằng ĐÚNG `ringFraction(at:)` — cùng công thức với
/// `ProgressView(timerInterval: ringStart...endsAt)` của Island.
struct RestLabView: View {
  @Environment(RestTimerController.self) private var rest

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 28) {
          TimelineView(.animation) { context in
            let now = EpochMillis(context.date)
            let fraction = rest.timer?.ringFraction(at: now) ?? 0
            let left = rest.timer?.remaining(at: now) ?? 0
            ZStack {
              Circle().stroke(.quaternary, lineWidth: 10)
              Circle()
                .trim(from: 0, to: fraction)
                .stroke(RestTimer.warns(left: left) ? Color.red : Color.accentColor,
                        style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
              Text(RestTimer.label(seconds: left))
                .font(.system(.largeTitle, design: .rounded).weight(.semibold).monospacedDigit())
                .contentTransition(.numericText(countsDown: true))
            }
            .frame(width: 220, height: 220)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("lab.remaining \(left)"))
          }

          HStack(spacing: 12) {
            Button("−15") { rest.adjust(by: -15) }
              .accessibilityLabel(Text("lab.minus15"))
            Button("+15") { rest.adjust(by: 15) }
              .accessibilityLabel(Text("lab.plus15"))
          }
          .font(.title3.monospacedDigit().weight(.semibold))
          .buttonStyle(.bordered)
          .controlSize(.large)
          .disabled(rest.timer == nil)

          HStack(spacing: 12) {
            Button("lab.start90") {
              rest.handle(.start(seconds: 90), target: RestTarget(exerciseName: "Bench Press", setNumber: 2, totalSets: 3))
            }
            .buttonStyle(.borderedProminent)
            Button("lab.skip", role: .destructive) { rest.handle(.cancel) }
              .buttonStyle(.bordered)
              .disabled(rest.timer == nil)
          }
          .controlSize(.large)

          Text("lab.hint")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
      }
      .navigationTitle(Text("lab.title"))
      // Đóng quãng nghỉ đã hết (RT-5) — nhịp 1 giây chỉ khi màn đang mở.
      .task {
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(1))
          rest.settle()
        }
      }
    }
  }
}
#endif
