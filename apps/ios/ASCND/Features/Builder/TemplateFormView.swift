// Form tạo/sửa template — C sở hữu (#407).
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif
#if canImport(UIKit)
import UIKit
#endif

/// Thông báo VoiceOver khi trạng thái lưu/lỗi thay đổi mà focus không tự di chuyển.
fileprivate func announceForVoiceOver(_ message: String) {
  #if canImport(UIKit)
    UIAccessibility.post(notification: .announcement, argument: message)
  #endif
}

/// Form tạo hoặc sửa template.
public struct TemplateFormView: View {
  @State private var name: String
  @State private var exercises: [MockTemplateExercise]
  @State private var assignedWeekdays: Set<Int>
  @State private var showingDeleteConfirm = false
  @State private var validationError: String?

  var isEditing: Bool
  var isSaving: Bool
  var saveError: String?

  var onSave: (_ name: String, _ exercises: [MockTemplateExercise], _ weekdays: Set<Int>) -> Void
  var onDelete: () -> Void
  var onCancel: () -> Void
  var onAddExercise: () -> Void

  public init(
    template: MockTemplate? = nil,
    isSaving: Bool = false,
    saveError: String? = nil,
    onSave: @escaping (_ name: String, _ exercises: [MockTemplateExercise], _ weekdays: Set<Int>) -> Void = { _, _, _ in },
    onDelete: @escaping () -> Void = {},
    onCancel: @escaping () -> Void = {},
    onAddExercise: @escaping () -> Void = {}
  ) {
    self.isEditing = template != nil
    self._name = State(initialValue: template?.name ?? "")
    self._exercises = State(initialValue: template?.exercises.compactMap { $0 as? MockTemplateExercise } ?? [])
    self._assignedWeekdays = State(initialValue: template?.assignedWeekdays ?? [])
    self.isSaving = isSaving
    self.saveError = saveError
    self.onSave = onSave
    self.onDelete = onDelete
    self.onCancel = onCancel
    self.onAddExercise = onAddExercise
  }

  public var body: some View {
    Form {
      // Tên template
      Section {
        TextField(
          String(localized: "builder.form.name.placeholder"),
          text: $name
        )
        .accessibilityLabel(String(localized: "builder.form.name.label"))
      } header: {
        Text(String(localized: "builder.form.name.header"))
      }

      // Bài tập
      Section {
        ForEach(exercises) { exercise in
          ExerciseConfigRow(exercise: exercise)
        }
        Button {
          onAddExercise()
        } label: {
          Label(
            String(localized: "builder.form.add.exercise"),
            systemImage: "plus.circle"
          )
        }
      } header: {
        Text(String(localized: "builder.form.exercises.header"))
      }

      // Ngày trong tuần
      Section {
        WeekdayAssignmentView(selected: $assignedWeekdays)
      } header: {
        Text(String(localized: "builder.form.weekdays.header"))
      }

      // Lỗi validation
      if let error = validationError {
        Section {
          Text(error)
            .foregroundStyle(.red)
            .font(.caption)
        }
      }

      // Lỗi lưu
      if let error = saveError {
        Section {
          Text(error)
            .foregroundStyle(.red)
            .font(.caption)
        }
      }

      // Xoá (chỉ khi sửa)
      if isEditing {
        Section {
          Button(role: .destructive) {
            showingDeleteConfirm = true
          } label: {
            Text(String(localized: "builder.delete"))
          }
        }
      }
    }
    .navigationTitle(
      isEditing
        ? String(localized: "builder.edit.title")
        : String(localized: "builder.create.title")
    )
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(String(localized: "common.cancel")) {
          onCancel()
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(String(localized: "common.save")) {
          validateAndSave()
        }
        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .overlay {
      if isSaving {
        savingOverlay
      }
    }
    .confirmationDialog(
      String(localized: "builder.delete.confirm.title"),
      isPresented: $showingDeleteConfirm,
      titleVisibility: .visible
    ) {
      Button(String(localized: "builder.delete.confirm"), role: .destructive) {
        onDelete()
      }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: {
      Text(String(localized: "builder.delete.confirm.message"))
    }
    .disabled(isSaving)
    // VoiceOver: overlay lỗi/lưu xuất hiện mà focus không di chuyển → thông báo rõ.
    .onChange(of: isSaving) { _, newValue in
      if newValue {
        announceForVoiceOver(String(localized: "builder.saving"))
      }
    }
    .onChange(of: saveError) { _, newValue in
      if let message = newValue {
        announceForVoiceOver(message)
      }
    }
    .onChange(of: validationError) { _, newValue in
      if let message = newValue {
        announceForVoiceOver(message)
      }
    }
  }

  private var savingOverlay: some View {
    ZStack {
      Color.black.opacity(0.3)
        .ignoresSafeArea()
      ProgressView(String(localized: "builder.saving"))
        .padding()
        .background(.regularMaterial)
        .cornerRadius(12)
        // Dynamic Type lớn: cho card cao thêm thay vì cắt chữ.
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
  }

  private func validateAndSave() {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty {
      validationError = String(localized: "builder.validation.name.required")
      return
    }
    if exercises.isEmpty {
      validationError = String(localized: "builder.validation.exercises.required")
      return
    }
    validationError = nil
    onSave(trimmed, exercises, assignedWeekdays)
  }
}

/// Một hàng cấu hình exercise (sets/reps).
public struct ExerciseConfigRow: View {
  let exercise: MockTemplateExercise

  public init(exercise: MockTemplateExercise) {
    self.exercise = exercise
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(exercise.name)
        .font(.headline)
      HStack {
        Text("\(exercise.sets) × \(exercise.reps)")
          .font(.subheadline)
        if let weight = exercise.weightKg {
          Text("· \(weight, format: .number) kg")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
      .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Previews

#Preview("TemplateForm — Create") {
  NavigationStack {
    TemplateFormView()
  }
}

#Preview("TemplateForm — Edit") {
  NavigationStack {
    TemplateFormView(
      template: MockTemplate(
        name: "Push Day",
        exercises: [
          MockTemplateExercise(name: "Bench Press", sets: 4, reps: 8, weightKg: 60),
        ],
        assignedWeekdays: [2, 5]
      )
    )
  }
}

#Preview("TemplateForm — Saving") {
  NavigationStack {
    TemplateFormView(isSaving: true)
  }
}

#Preview("TemplateForm — Save Error") {
  NavigationStack {
    TemplateFormView(saveError: "Không lưu được, thử lại")
  }
}
