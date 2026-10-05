// Khung màn Hôm nay — C sở hữu UI (#275).
//
// Presentation layer thuần: nhận `TodayDisplay` đã tính sẵn + 2 callback,
// không chứa workout-domain logic, không đọc database, không tính ngày.
// 5 trạng thái đúng baseline `dayStateOf` (week-strip.tsx:137).
import ASCNDDesignSystem
import SwiftUI

public struct TodayView: View {
  let state: TodayDisplay
  var onStart: () -> Void
  var onChoosePlan: () -> Void

  public init(
    state: TodayDisplay,
    onStart: @escaping () -> Void = {},
    onChoosePlan: @escaping () -> Void = {}
  ) {
    self.state = state
    self.onStart = onStart
    self.onChoosePlan = onChoosePlan
  }

  public var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.lg) {
          switch state.status {
          case .todo: todoView
          case .done: doneView
          case .missed: missedView
          case .rest: restView
          case .unplanned: unplannedView
          }
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(Text("tab.today"))
    }
    // VoiceOver đọc trạng thái + tên buổi (#275).
    .accessibilityLabel(Text(voiceOverLabel))
  }

  // MARK: - Nhãn đọc màn hình

  private var statusText: String {
    switch state.status {
    case .todo: String(localized: "today.status.todo")
    case .done: String(localized: "today.status.done")
    case .missed: String(localized: "today.status.missed")
    case .rest: String(localized: "today.status.rest")
    case .unplanned: String(localized: "today.status.unplanned")
    }
  }

  private var voiceOverLabel: String {
    if let name = state.templateName {
      return "\(statusText): \(name)"
    }
    return statusText
  }

  // MARK: - todo: có buổi, chưa tập

  private var todoView: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      DSSectionHeader(statusText)
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          HStack {
            if let name = state.templateName {
              Text(name)
                .font(DS.TextStyle.title2)
                .foregroundStyle(DS.Color.foreground.swiftUI)
            }
            Spacer()
            if state.isDeload {
              Text("today.deload")
                .font(DS.TextStyle.caption)
                .padding(.horizontal, DS.Spacing.sm)
                .padding(.vertical, DS.Spacing.xs)
                .background(DS.Color.secondary.swiftUI)
                .foregroundStyle(DS.Color.secondaryForeground.swiftUI)
                .clipShape(Capsule())
            }
          }
          if !state.exercises.isEmpty {
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              ForEach(state.exercises.indices, id: \.self) { i in
                exerciseRow(state.exercises[i])
              }
            }
          }
        }
      }
      DSButton(String(localized: "today.start"), style: .primary, action: onStart)
    }
  }

  private func exerciseRow(_ e: TodayExercise) -> some View {
    HStack {
      Text(e.name)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer()
      Text("\(e.sets)×\(e.reps) · \(Int(e.weightKg)) kg")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .monospacedDigit()
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      Text(
        String(
          format: String(localized: "today.exercise.accessibility"),
          e.name, e.sets, e.reps, Int(e.weightKg)
        )
      )
    )
  }

  // MARK: - done: đã tập xong

  private var doneView: some View {
    DSEmptyState(
      systemImage: "checkmark.circle.fill",
      title: statusText,
      message: state.templateName.map {
        String(format: String(localized: "today.done.message"), $0)
      }
    )
  }

  // MARK: - missed: bỏ lỡ

  private var missedView: some View {
    DSEmptyState(
      systemImage: "exclamationmark.circle",
      title: statusText,
      message: state.templateName.map {
        String(format: String(localized: "today.missed.message"), $0)
      },
      actionTitle: String(localized: "today.choosePlan"),
      action: onChoosePlan
    )
  }

  // MARK: - rest: ngày nghỉ đã chọn

  private var restView: some View {
    DSEmptyState(
      systemImage: "moon.zzz.fill",
      title: statusText,
      message: String(localized: "today.rest.message"),
      actionTitle: String(localized: "today.choosePlan"),
      action: onChoosePlan
    )
  }

  // MARK: - unplanned: chưa lên lịch (KHÁC ngày nghỉ, #215)

  private var unplannedView: some View {
    DSEmptyState(
      systemImage: "calendar.badge.plus",
      title: statusText,
      message: String(localized: "today.unplanned.message"),
      actionTitle: String(localized: "today.choosePlan"),
      action: onChoosePlan
    )
  }
}

// MARK: - Fixture (cùng hình dạng hợp đồng A6; không phải dữ liệu thật)

extension TodayDisplay {
  static func fixture(status: TodayStatus) -> TodayDisplay {
    let exercises = [
      TodayExercise(name: "Bench Press", sets: 3, reps: 8, weightKg: 60),
      TodayExercise(name: "Overhead Press", sets: 3, reps: 10, weightKg: 30),
      TodayExercise(name: "Triceps Pushdown", sets: 3, reps: 12, weightKg: 20),
    ]
    switch status {
    case .todo:
      return TodayDisplay(
        date: Date(), status: .todo,
        templateName: "Ngực – Vai – Tay", exercises: exercises
      )
    case .done:
      return TodayDisplay(
        date: Date(), status: .done,
        templateName: "Ngực – Vai – Tay", exercises: exercises
      )
    case .missed:
      return TodayDisplay(
        date: Date(), status: .missed,
        templateName: "Chân – Mông", exercises: exercises
      )
    case .rest:
      return TodayDisplay(date: Date(), status: .rest)
    case .unplanned:
      return TodayDisplay(date: Date(), status: .unplanned)
    }
  }
}

// MARK: - Preview: 5 trạng thái × light/dark × Dynamic Type XXXL

#Preview("todo — Light") {
  TodayView(state: .fixture(status: .todo)).preferredColorScheme(.light)
}
#Preview("todo — Dark") {
  TodayView(state: .fixture(status: .todo)).preferredColorScheme(.dark)
}
#Preview("done — Light") {
  TodayView(state: .fixture(status: .done)).preferredColorScheme(.light)
}
#Preview("done — Dark") {
  TodayView(state: .fixture(status: .done)).preferredColorScheme(.dark)
}
#Preview("missed — Light") {
  TodayView(state: .fixture(status: .missed)).preferredColorScheme(.light)
}
#Preview("missed — Dark") {
  TodayView(state: .fixture(status: .missed)).preferredColorScheme(.dark)
}
#Preview("rest — Light") {
  TodayView(state: .fixture(status: .rest)).preferredColorScheme(.light)
}
#Preview("rest — Dark") {
  TodayView(state: .fixture(status: .rest)).preferredColorScheme(.dark)
}
#Preview("unplanned — Light") {
  TodayView(state: .fixture(status: .unplanned)).preferredColorScheme(.light)
}
#Preview("unplanned — Dark") {
  TodayView(state: .fixture(status: .unplanned)).preferredColorScheme(.dark)
}
#Preview("Dynamic Type XXXL") {
  TodayView(state: .fixture(status: .todo))
    .dynamicTypeSize(.accessibility3)
}
