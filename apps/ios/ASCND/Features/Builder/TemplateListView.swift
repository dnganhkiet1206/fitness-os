// Danh sách template — C sở hữu (#407).
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Danh sách template với empty state.
public struct TemplateListView<Template: WorkoutTemplateProtocol>: View {
  let templates: [Template]
  var onSelect: (Template) -> Void
  var onCreate: () -> Void
  var onDelete: (Template) -> Void

  public init(
    templates: [Template],
    onSelect: @escaping (Template) -> Void = { _ in },
    onCreate: @escaping () -> Void = {},
    onDelete: @escaping (Template) -> Void = { _ in }
  ) {
    self.templates = templates
    self.onSelect = onSelect
    self.onCreate = onCreate
    self.onDelete = onDelete
  }

  public var body: some View {
    Group {
      if templates.isEmpty {
        emptyState
      } else {
        List {
          ForEach(templates) { template in
            Button {
              onSelect(template)
            } label: {
              TemplateRowView(template: template)
            }
            .buttonStyle(.plain)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                  onDelete(template)
                } label: {
                  Label(
                    String(localized: "builder.delete"),
                    systemImage: "trash"
                  )
                }
              }
          }
        }
      }
    }
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          onCreate()
        } label: {
          Label(
            String(localized: "builder.create"),
            systemImage: "plus"
          )
        }
      }
    }
    .navigationTitle(String(localized: "builder.title"))
  }

  private var emptyState: some View {
    VStack(spacing: 16) {
      Image(systemName: "dumbbell")
        .font(.system(size: 48))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(String(localized: "builder.empty.title"))
        .font(.headline)
      Text(String(localized: "builder.empty.message"))
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Button(String(localized: "builder.create")) {
        onCreate()
      }
      .buttonStyle(.borderedProminent)
    }
    .padding()
    .accessibilityElement(children: .combine)
  }
}

/// Một hàng template trong danh sách.
public struct TemplateRowView<Template: WorkoutTemplateProtocol>: View {
  let template: Template

  public init(template: Template) {
    self.template = template
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(template.name)
        .font(.headline)
      HStack {
        Text(exerciseCountText)
          .font(.caption)
          .foregroundStyle(.secondary)
        if !template.assignedWeekdays.isEmpty {
          Text(weekdaySummary)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
  }

  /// Số bài tập đã localize — "1 exercise" / "N exercises" (en/vi/es).
  /// Row giữ thuần presentation; Button bọc ngoài cung cấp semantics trợ năng.
  private var exerciseCountText: String {
    let count = template.exercises.count
    if count == 1 {
      return String(localized: "builder.exercise.count.one")
    }
    return String(localized: "builder.exercise.count.other \(count)")
  }

  private var weekdaySummary: String {
    let names = template.assignedWeekdays.sorted().map { weekdayName($0) }
    return names.joined(separator: ", ")
  }

  private func weekdayName(_ day: Int) -> String {
    // 1=CN, 2=T2, ..., 7=T7
    let key = "weekday.\(day)"
    return String(localized: "\(key)")
  }
}

// MARK: - Previews

#Preview("TemplateList — Empty") {
  NavigationStack {
    TemplateListView<MockTemplate>(templates: [])
  }
}

#Preview("TemplateList — With Templates") {
  NavigationStack {
    TemplateListView<MockTemplate>(templates: [
      MockTemplate(
        name: "Push Day",
        exercises: [
          MockTemplateExercise(name: "Bench Press", sets: 4, reps: 8, weightKg: 60),
          MockTemplateExercise(name: "Overhead Press", sets: 3, reps: 10),
        ],
        assignedWeekdays: [2, 5]
      ),
      MockTemplate(
        name: "Pull Day",
        exercises: [
          MockTemplateExercise(name: "Deadlift", sets: 5, reps: 5, weightKg: 100),
        ],
        assignedWeekdays: [3, 6]
      ),
    ])
  }
}
