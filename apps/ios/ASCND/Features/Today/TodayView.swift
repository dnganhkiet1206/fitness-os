// Khung màn Hôm nay — C sở hữu UI (#275).
//
// Presentation layer thuần: nhận `TodayDisplay` đã tính sẵn + 2 callback,
// không chứa workout-domain logic, không đọc database, không tính ngày.
// 5 trạng thái đúng baseline `dayStateOf` (week-strip.tsx:137).
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

public struct TodayView: View {
  let state: TodayDisplay
  /// Nút chính của thẻ (`TodayRules.cta`, RN `todayCta`).
  let cta: TodayCta
  var onStart: () -> Void
  /// Ghi buổi tự do / buổi phát sinh (`/log-workout`). `nil` = không hiện nút.
  var onLogWorkout: (() -> Void)?
  /// Mở màn chọn kế hoạch. `nil` = chưa có màn ấy ở bản này: nút "Chọn kế
  /// hoạch" ẩn đi thay vì là một nút không làm gì (#527).
  var onChoosePlan: (() -> Void)?
  /// Mở Cài đặt (RN: avatar tài khoản trên Today). `nil` = không hiện nút.
  var onOpenSettings: (() -> Void)?

  public init(
    state: TodayDisplay,
    cta: TodayCta? = nil,
    onStart: @escaping () -> Void = {},
    onLogWorkout: (() -> Void)? = nil,
    onChoosePlan: (() -> Void)? = nil,
    onOpenSettings: (() -> Void)? = nil
  ) {
    self.state = state
    self.cta = cta ?? Self.previewCta(state.status)
    self.onStart = onStart
    self.onLogWorkout = onLogWorkout
    self.onChoosePlan = onChoosePlan
    self.onOpenSettings = onOpenSettings
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
          ctaButton
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(Text("tab.today"))
      .toolbar {
        if let onOpenSettings {
          ToolbarItem(placement: .topBarTrailing) {
            Button(action: onOpenSettings) {
              Image(systemName: "person.crop.circle")
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(Text("settings.title"))
          }
        }
      }
    }
    // Không gắn accessibilityLabel lên cả cây: container không gộp thì nhãn
    // đè xuống từng phần tử con (nút Bắt đầu, từng bài đều đọc thành
    // "Hôm nay: …"). Trạng thái đã có ở DSSectionHeader / tiêu đề DSEmptyState.
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
    }
  }

  // MARK: - Nút chính (`today-training.tsx:338`)

  /// Một nút theo `cta`: "Bắt đầu" đặc; ba nút còn lại nhẹ; chưa biết lịch thì
  /// không có nút. Bắt đầu và Chọn buổi tập mở kế hoạch của hôm nay; Ghi buổi
  /// (ngày nghỉ) và Ghi thêm buổi phát sinh (đã tập) mở màn ghi tay.
  @ViewBuilder private var ctaButton: some View {
    switch cta {
    case .none:
      EmptyView()
    case .start:
      DSButton(String(localized: "today.start"), style: .primary, action: onStart)
    case .extra:
      if let onLogWorkout {
        DSButton(String(localized: "today.cta.extra"), style: .secondary, action: onLogWorkout)
      }
    case .logFree:
      if let onLogWorkout {
        DSButton(String(localized: "today.cta.logFree"), style: .secondary, action: onLogWorkout)
      }
    case .pick:
      if let onChoosePlan {
        DSButton(String(localized: "today.choosePlan"), style: .secondary, action: onChoosePlan)
      }
    }
  }

  /// Bản xem trước không có controller: nút theo trạng thái như `todayCta`.
  static func previewCta(_ status: TodayStatus) -> TodayCta {
    switch status {
    case .todo, .missed: .start
    case .done: .extra
    case .rest: .logFree
    case .unplanned: .pick
    }
  }

  /// Đơn vị tạ của tài khoản (#527 1.9-B) — kế hoạch vẫn lưu kg.
  @Environment(\.weightUnit) private var unit

  private func exerciseRow(_ e: TodayExercise) -> some View {
    HStack {
      Text(e.name)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer()
      Text(weightText(e).map { "\(e.sets)×\(e.reps) · \($0)" } ?? "\(e.sets)×\(e.reps)")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .monospacedDigit()
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(exerciseAccessibility(e)))
  }

  /// Mức tạ theo locale và theo đơn vị của tài khoản (#527 1.9-B), một chữ
  /// số lẻ như RN `displayWeight` (`day-plan.tsx:1820`): "62,5 kg", "137,8 lb"
  /// — không cắt `Int` thành 62. `nil` = bài không tạ, không hiện "0 kg".
  private func weightText(_ e: TodayExercise) -> String? {
    unit.localizedLoad(e.weightKg)
  }

  private func exerciseAccessibility(_ e: TodayExercise) -> String {
    if let w = weightText(e) {
      return String(
        format: String(localized: "today.exercise.accessibility"),
        e.name, e.sets, e.reps, w)
    }
    return String(
      format: String(localized: "today.exercise.accessibility.noWeight"),
      e.name, e.sets, e.reps)
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
      }
    )
  }

  // MARK: - rest: ngày nghỉ đã chọn

  private var restView: some View {
    DSEmptyState(
      systemImage: "moon.zzz.fill",
      title: statusText,
      message: String(localized: "today.rest.message")
    )
  }

  // MARK: - unplanned: chưa lên lịch (KHÁC ngày nghỉ, #215)

  private var unplannedView: some View {
    DSEmptyState(
      systemImage: "calendar.badge.plus",
      title: statusText,
      message: String(localized: "today.unplanned.message")
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
