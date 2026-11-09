import ASCNDCore
import SwiftUI

struct WatchWorkoutView: View {
  var model: WatchWorkoutModel
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let now = EpochMillis(context.date)
      screen(model.state.displayed(at: now), now: now)
        .onChange(of: context.date) { _, date in model.tick(EpochMillis(date)) }
        .onChange(of: scenePhase) { _, phase in model.setForeground(phase == .active) }
    }
  }

  @ViewBuilder private func screen(_ display: WatchDisplay, now: EpochMillis) -> some View {
    switch display.mode {
    case .idle:
      message("watch.idle.title", "watch.idle.body", pending: display.pendingCount)
    case .finished:
      message("watch.finished.title", "watch.finished.body", pending: display.pendingCount)
    case .logging(let card):
      logging(card, pending: display.pendingCount)
    case .resting(let card):
      resting(card, now: now, pending: display.pendingCount)
    }
  }

  private func message(_ title: LocalizedStringKey, _ body: LocalizedStringKey, pending: Int) -> some View {
    VStack(spacing: 6) {
      Text(title).font(.headline).multilineTextAlignment(.center)
      Text(body).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
      pendingNote(pending)
    }
    .padding(.horizontal, 4)
  }

  private func logging(_ card: WatchLoggingCard, pending: Int) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text(card.exerciseName).font(.headline).lineLimit(2).minimumScaleFactor(0.7)
        setLabel(card).font(.caption).foregroundStyle(.secondary)
        stepper(
          shownWeight(card), less: "watch.weight.less", more: "watch.weight.more",
          down: { model.changeWeight(by: -1) }, up: { model.changeWeight(by: 1) })
        stepper(
          card.repsText.isEmpty ? "–" : card.repsText, less: "watch.reps.less", more: "watch.reps.more",
          down: { model.changeReps(by: -1) }, up: { model.changeReps(by: 1) })
        stepper(
          "RPE \(card.rpe)", less: "watch.rpe.less", more: "watch.rpe.more",
          down: { model.changeRPE(by: -1) }, up: { model.changeRPE(by: 1) })
        Button { model.complete() } label: {
          Text("watch.set.done").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!card.ready)
        .accessibilityIdentifier("watch.done")
        pendingNote(pending)
      }
    }
  }

  private func resting(_ card: WatchRestCard, now: EpochMillis, pending: Int) -> some View {
    let left = card.timer.remaining(at: now)
    let warn = RestTimer.warns(left: left, paused: card.timer.isPaused)
    ScrollView {
      VStack(spacing: 8) {
        ZStack {
          Circle()
            .stroke(Color.white.opacity(0.12), lineWidth: 6)
          Circle()
            .trim(from: 0, to: card.timer.ringFraction(at: now))
            .stroke(warn ? Color.orange : Color.green, style: StrokeStyle(lineWidth: 6, lineCap: .round))
            .rotationEffect(.degrees(-90))
          Text(RestTimer.label(seconds: left))
            .font(.title2.monospacedDigit().weight(.semibold))
            .foregroundStyle(warn ? Color.orange : Color.primary)
        }
        .frame(width: 84, height: 84)
        .accessibilityLabel(Text(RestTimer.label(seconds: left)))
        HStack {
          Button { model.nudgeRest(by: -15) } label: { Image(systemName: "minus") }
            .accessibilityLabel(Text("watch.rest.less"))
          Button { model.setRestPaused(!card.timer.isPaused) } label: {
            Image(systemName: card.timer.isPaused ? "play.fill" : "pause.fill")
          }
          .accessibilityLabel(Text(pauseLabel(card.timer.isPaused)))
          Button { model.nudgeRest(by: 15) } label: { Image(systemName: "plus") }
            .accessibilityLabel(Text("watch.rest.more"))
        }
        .buttonStyle(.bordered)
        Button { model.skipRest() } label: {
          Text("watch.rest.skip").frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("watch.rest.skip")
        if let next = card.next {
          VStack(alignment: .leading, spacing: 4) {
            Text("watch.next").font(.caption2).foregroundStyle(.secondary)
            Text(next.exerciseName).font(.footnote).lineLimit(1)
            Text("\(shownWeight(next)) · \(next.repsText.isEmpty ? "–" : next.repsText)")
              .font(.caption.monospacedDigit())
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        pendingNote(pending)
      }
    }
  }

  private func stepper(_ value: String, less: LocalizedStringKey, more: LocalizedStringKey, down: @escaping () -> Void, up: @escaping () -> Void) -> some View {
    HStack {
      Button(action: down) { Image(systemName: "minus") }
        .accessibilityLabel(Text(less))
      Spacer(minLength: 4)
      Text(value).font(.body.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.6)
      Spacer(minLength: 4)
      Button(action: up) { Image(systemName: "plus") }
        .accessibilityLabel(Text(more))
    }
    .buttonStyle(.bordered)
  }

  private func pauseLabel(_ paused: Bool) -> LocalizedStringKey {
    paused ? "watch.rest.resume" : "watch.rest.pause"
  }

  @ViewBuilder private func pendingNote(_ count: Int) -> some View {
    if count > 0 {
      Text("watch.queued").font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity)
    }
  }

  @ViewBuilder private func setLabel(_ card: WatchLoggingCard) -> some View {
    if card.warmup {
      Text("watch.set.warmup")
    } else if let number = card.workingNumber {
      Text("\(number)/\(card.workingTotal)")
    }
  }

  private func shownWeight(_ card: WatchLoggingCard) -> String {
    let separator = Locale.current.decimalSeparator ?? "."
    let number = card.weightText.isEmpty ? "–" : NumberInput.display(card.weightText, decimalSeparator: separator)
    return "\(number) \(card.unit.label)"
  }
}
