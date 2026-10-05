// Hàng extra exercise — C sở hữu (#408).
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Hàng thêm/sửa extra exercise.
///
/// Align D-24 (#413 vectors):
/// - AH-1/AH-3: mọi callback key theo `exercise.id` ổn định — xoá theo id,
///   đổi tên giữ id (không key theo tên hay index).
/// - AH-2: trần 20 sets chặn ở UI seam (`1...maxExtraSets`); model seam
///   là contract A20 #399 (chưa có — không bịa).
public struct ExtraExerciseRow: View {
  let exercise: MockExtraExercise
  @State private var editedName: String
  @State private var showingDeleteConfirm = false

  var onRename: (_ id: String, _ name: String) -> Void
  var onSetCountChange: (_ id: String, _ count: Int) -> Void
  var onDelete: (_ id: String) -> Void

  public init(
    exercise: MockExtraExercise,
    onRename: @escaping (_ id: String, _ name: String) -> Void = { _, _ in },
    onSetCountChange: @escaping (_ id: String, _ count: Int) -> Void = { _, _ in },
    onDelete: @escaping (_ id: String) -> Void = { _ in }
  ) {
    self.exercise = exercise
    self._editedName = State(initialValue: exercise.name)
    self.onRename = onRename
    self.onSetCountChange = onSetCountChange
    self.onDelete = onDelete
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Tên bài tập (editable)
      TextField(
        String(localized: "extra.exercise.name.placeholder"),
        text: $editedName,
        onCommit: {
          onRename(exercise.id, editedName)
        }
      )
      .textFieldStyle(.roundedBorder)
      .accessibilityLabel(String(localized: "extra.exercise.name.label"))

      // Set count stepper với max-20
      HStack {
        Text(String(localized: "extra.exercise.sets.label"))
          .font(.subheadline)
          // Stepper đã có accessibilityLabel riêng — ẩn chữ tĩnh cho gọn.
          .accessibilityHidden(true)
        Spacer()
        Stepper(
          "\(exercise.sets)",
          value: Binding(
            get: { exercise.sets },
            set: { onSetCountChange(exercise.id, $0) }
          ),
          in: 1...maxExtraSets
        )
        .accessibilityLabel(String(localized: "extra.exercise.sets.label"))
        .accessibilityValue("\(exercise.sets)")
      }

      // Hiển thị max constraint
      if exercise.sets >= maxExtraSets {
        Text(
          String(
            format: String(localized: "extra.exercise.sets.max.format"),
            maxExtraSets
          )
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      // Trạng thái incomplete
      if exercise.state == .incomplete {
        Text(String(localized: "extra.exercise.incomplete"))
          .font(.caption)
          .foregroundStyle(.orange)
      }

      // Nút xoá — 44pt theo HIG, cả chiều rộng hàng để dễ bấm.
      Button(role: .destructive) {
        showingDeleteConfirm = true
      } label: {
        Label(
          String(localized: "extra.exercise.delete"),
          systemImage: "trash"
        )
        .font(.caption)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      }
    }
    .padding()
    .background(.secondary.opacity(0.1))
    .cornerRadius(12)
    .confirmationDialog(
      String(localized: "extra.exercise.delete.confirm.title"),
      isPresented: $showingDeleteConfirm,
      titleVisibility: .visible
    ) {
      Button(
        String(localized: "extra.exercise.delete.confirm"),
        role: .destructive
      ) {
        onDelete(exercise.id)
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
    .accessibilityElement(children: .contain)
    // Đồng bộ khi parent đổi tên từ bên ngoài (cùng id): @State init chỉ chạy
    // một lần nên không có dòng này TextField giữ tên cũ.
    .onChange(of: exercise.name) { _, newName in
      editedName = newName
    }
  }
}

// MARK: - Previews

#Preview("ExtraExercise — New") {
  ExtraExerciseRow(
    exercise: MockExtraExercise(state: .new)
  )
  .padding()
}

#Preview("ExtraExercise — Editing") {
  ExtraExerciseRow(
    exercise: MockExtraExercise(
      name: "Incline Dumbbell Press",
      sets: 4,
      state: .editing
    )
  )
  .padding()
}

#Preview("ExtraExercise — Incomplete") {
  ExtraExerciseRow(
    exercise: MockExtraExercise(
      name: "",
      sets: 0,
      state: .incomplete
    )
  )
  .padding()
}

#Preview("ExtraExercise — Max 20") {
  ExtraExerciseRow(
    exercise: MockExtraExercise(
      name: "Cable Fly",
      sets: 20,
      state: .atMaxSets
    )
  )
  .padding()
}
