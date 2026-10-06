// Set row — C sở hữu (#384).
//
// Hardened set row: normal/focused/completed/locked/saving/error states,
// inline validation, focus preservation, double-submit prevention.
import ASCNDDesignSystem
import SwiftUI

/// Trạng thái của một set row.
public enum SetRowState: Hashable, Sendable {
  case normal
  case focused
  case completed
  case locked
  case saving
  case error(String)
}

/// Dữ liệu hiển thị của set row.
public struct SetRowDisplay: Hashable, Sendable {
  public let key: String
  public let ordinal: Int
  public let total: Int
  public let exerciseName: String
  public let state: SetRowState
  public let weightText: String
  public let repsText: String
  public let weightError: String?
  public let repsError: String?

  public init(
    key: String,
    ordinal: Int,
    total: Int,
    exerciseName: String,
    state: SetRowState = .normal,
    weightText: String = "",
    repsText: String = "",
    weightError: String? = nil,
    repsError: String? = nil
  ) {
    self.key = key
    self.ordinal = ordinal
    self.total = total
    self.exerciseName = exerciseName
    self.state = state
    self.weightText = weightText
    self.repsText = repsText
    self.weightError = weightError
    self.repsError = repsError
  }
}

public struct SetRow: View {
  let display: SetRowDisplay
  var onWeightChange: (String) -> Void
  var onRepsChange: (String) -> Void
  var onToggle: () -> Void
  /// Focus state từ parent (để giữ focus khi weight → reps).
  @FocusState.Binding var focusedField: WorkoutFieldFocus?
  /// Local editable state — đồng bộ từ display, gọi callback khi đổi.
  @State private var weightText: String
  @State private var repsText: String

  public init(
    display: SetRowDisplay,
    focusedField: FocusState<WorkoutFieldFocus?>.Binding,
    onWeightChange: @escaping (String) -> Void = { _ in },
    onRepsChange: @escaping (String) -> Void = { _ in },
    onToggle: @escaping () -> Void = {}
  ) {
    self.display = display
    self._focusedField = focusedField
    self._weightText = State(initialValue: display.weightText)
    self._repsText = State(initialValue: display.repsText)
    self.onWeightChange = onWeightChange
    self.onRepsChange = onRepsChange
    self.onToggle = onToggle
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: DS.Spacing.sm) {
        // Toggle completed
        Button(action: onToggle) {
          Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(
              isCompleted
                ? DS.Color.readinessGreen.swiftUI
                : DS.Color.mutedForeground.swiftUI
            )
        }
        .frame(minWidth: 44, minHeight: 44)
        .disabled(isLocked || isSaving)
        .accessibilityLabel(
          Text(
            isCompleted
              ? String(localized: "setrow.completed")
              : String(localized: "setrow.notCompleted")
          )
        )

        Text("\(display.ordinal)/\(display.total)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 36)

        // Weight field
        VStack(alignment: .trailing, spacing: 2) {
          TextField("", text: $weightText)
            .onChange(of: weightText) { _, newValue in
              onWeightChange(newValue)
            }
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .font(DS.TextStyle.body.monospacedDigit())
            .frame(width: 64)
            .frame(minHeight: 44)
            .padding(.horizontal, DS.Spacing.xs)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
            .focused($focusedField, equals: .weight(display.key))
            .disabled(isLocked || isSaving)
            .accessibilityLabel(Text(String(localized: "setrow.weight")))
          if let error = display.weightError {
            Text(error)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
        }

        Text("×")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)

        // Reps field
        VStack(alignment: .trailing, spacing: 2) {
          TextField("", text: $repsText)
            .onChange(of: repsText) { _, newValue in
              onRepsChange(newValue)
            }
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .font(DS.TextStyle.body.monospacedDigit())
            .frame(width: 64)
            .frame(minHeight: 44)
            .padding(.horizontal, DS.Spacing.xs)
            .background(fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
            .focused($focusedField, equals: .reps(display.key))
            .disabled(isLocked || isSaving)
            .accessibilityLabel(Text(String(localized: "setrow.reps")))
          if let error = display.repsError {
            Text(error)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
        }

        if isSaving {
          ProgressView()
            .controlSize(.small)
            .accessibilityLabel(Text(String(localized: "setrow.saving")))
        }

        Spacer(minLength: 0)
      }

      if case .error(let message) = display.state {
        Text(message)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .accessibilityLabel(Text(message))
      }
    }
    .opacity(isLocked ? 0.5 : 1.0)
  }

  private var isCompleted: Bool {
    if case .completed = display.state { return true }
    return false
  }

  private var isLocked: Bool {
    if case .locked = display.state { return true }
    return false
  }

  private var isSaving: Bool {
    if case .saving = display.state { return true }
    return false
  }

  private var fieldBackground: Color {
    if case .error = display.state {
      return DS.Color.destructive.swiftUI.opacity(0.1)
    }
    return DS.Color.secondary.swiftUI
  }
}

/// Focus identifier cho Workout fields.
public enum WorkoutFieldFocus: Hashable {
  case weight(String)
  case reps(String)
}

// MARK: - Preview

/// `@FocusState.Binding` không có `.constant` — preview cần một view chủ giữ
/// `@FocusState` thật rồi truyền binding xuống.
private struct SetRowPreviewHost: View {
  let display: SetRowDisplay
  @FocusState private var focus: WorkoutFieldFocus?

  var body: some View {
    SetRow(display: display, focusedField: $focus)
      .padding()
  }
}

#Preview("SetRow — normal") {
  SetRowPreviewHost(
    display: .init(
      key: "s1", ordinal: 1, total: 4,
      exerciseName: "Bench Press",
      weightText: "60", repsText: "8"
    )
  )
}

#Preview("SetRow — error") {
  SetRowPreviewHost(
    display: .init(
      key: "s1", ordinal: 1, total: 4,
      exerciseName: "Bench Press",
      state: .error("Giá trị không hợp lệ"),
      weightText: "-5", repsText: "8",
      weightError: "Tạ phải ≥ 0"
    )
  )
}

#Preview("SetRow — completed") {
  SetRowPreviewHost(
    display: .init(
      key: "s1", ordinal: 1, total: 4,
      exerciseName: "Bench Press",
      state: .completed,
      weightText: "60", repsText: "8"
    )
  )
}
