import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Bắt đầu với ASCND" (15/10, audit giữ chân người dùng — chủ dự án chọn): ngày đầu
/// không là một trang toàn số 0. Ba việc để Koa và coach hiểu người dùng — kết nối
/// Apple Health, ghi bữa đầu tiên, ghi buổi tập đầu tiên — mỗi việc một chạm.
///
/// Hiện trong 7 ngày đầu kể từ lần đầu thấy Hôm nay trên máy này (theo tài khoản);
/// ẩn khi đủ ba việc hoặc người dùng bấm ẩn. Việc đã xong được nhớ (một bữa ghi hôm
/// qua vẫn là "đã ghi bữa đầu tiên").
struct TodayStartCard: View {
  let userId: String
  /// Tín hiệu hôm nay (bữa / buổi tập đã ghi).
  let signals: DailySignals?
  let onMeal: () -> Void
  let onWorkout: (() -> Void)?

  @Environment(AppServices.self) private var services
  @State private var healthDone = false
  @State private var connecting = false
  @AppStorage private var firstSeen: Double
  @AppStorage private var hidden: Bool
  @AppStorage private var mealDone: Bool
  @AppStorage private var workoutDone: Bool

  static let days = 7.0

  init(userId: String, signals: DailySignals?, onMeal: @escaping () -> Void, onWorkout: (() -> Void)?) {
    self.userId = userId
    self.signals = signals
    self.onMeal = onMeal
    self.onWorkout = onWorkout
    _firstSeen = AppStorage(wrappedValue: 0, "start.firstSeen.\(userId)")
    _hidden = AppStorage(wrappedValue: false, "start.hidden.\(userId)")
    _mealDone = AppStorage(wrappedValue: false, "start.meal.\(userId)")
    _workoutDone = AppStorage(wrappedValue: false, "start.workout.\(userId)")
  }

  private var healthShown: Bool { services.health.isAvailable }
  private var meal: Bool { mealDone || (signals?.kcal ?? 0) > 0 }
  private var workout: Bool { workoutDone || (signals?.workoutCount ?? 0) > 0 }
  private var allDone: Bool { meal && workout && (healthDone || !healthShown) }
  private var fresh: Bool {
    firstSeen == 0 || Date().timeIntervalSince1970 - firstSeen < Self.days * 86_400
  }

  var body: some View {
    Group {
      if !hidden, fresh, !allDone {
        card
      }
    }
    .task {
      if firstSeen == 0 { firstSeen = Date().timeIntervalSince1970 }
      if healthShown { healthDone = await services.health.isConnected() }
    }
    .onChange(of: meal, initial: true) { _, on in if on { mealDone = true } }
    .onChange(of: workout, initial: true) { _, on in if on { workoutDone = true } }
  }

  private var card: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text("today.start.title")
            .font(.system(size: 20, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .accessibilityAddTraits(.isHeader)
          Text("today.start.sub")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        Button {
          Telemetry.capture(.startCardAction, ["item": "hide"])
        withAnimation(.easeOut(duration: 0.2)) { hidden = true }
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
        }
        .accessibilityLabel(Text("today.start.hide"))
      }
      if healthShown {
        row(
          done: healthDone, symbol: "heart.fill", tint: Color(red: 1, green: 0.22, blue: 0.37),
          title: "today.start.health", sub: "today.start.health.sub", busy: connecting
        ) {
          Telemetry.capture(.startCardAction, ["item": "health"])
          connecting = true
          Task {
            try? await services.health.syncNow(userId: userId, lang: AppServices.appLang)
            healthDone = await services.health.isConnected()
            connecting = false
          }
        }
      }
      row(
        done: meal, symbol: "fork.knife", tint: DS.Color.metricOrangeGraphic.swiftUI, title: "today.start.meal",
        sub: "today.start.meal.sub", busy: false
      ) {
        Telemetry.capture(.startCardAction, ["item": "meal"])
        onMeal()
      }
      if let onWorkout {
        row(
          done: workout, symbol: "dumbbell.fill", tint: DS.Color.metricRose.swiftUI, title: "today.start.workout",
          sub: "today.start.workout.sub", busy: false
        ) {
          Telemetry.capture(.startCardAction, ["item": "workout"])
          onWorkout()
        }
      }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard()
  }

  private func row(
    done: Bool, symbol: String, tint: Color, title: LocalizedStringKey, sub: LocalizedStringKey, busy: Bool,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: DS.Spacing.md) {
        Image(systemName: done ? "checkmark" : symbol)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(done ? DS.Color.background.swiftUI : tint)
          .frame(width: 38, height: 38)
          .background(done ? DS.Color.readinessGreen.swiftUI : tint.opacity(0.14), in: Circle())
        VStack(alignment: .leading, spacing: 1) {
          Text(title)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(done ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
            .strikethrough(done)
          Text(sub)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        if busy {
          ProgressView()
        } else if !done {
          Image(systemName: "chevron.right")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
      }
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .disabled(done || busy)
    .accessibilityElement(children: .combine)
    .accessibilityValue(Text(done ? "today.start.doneA11y" : ""))
  }
}
