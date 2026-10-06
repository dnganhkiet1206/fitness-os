// Container Workout Builder — C sở hữu (#407).
//
// Nối list + form qua navigation. Mọi thao tác ghi là callbacks.
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Container chính của Workout Builder.
public struct WorkoutBuilderView: View {
  @State private var templates: [MockTemplate]
  @State private var navigationPath = NavigationPath()
  @State private var isLoading: Bool
  @State private var loadError: String?
  @State private var isOffline: Bool

  var onSaveTemplate: (_ template: MockTemplate) -> Void
  var onDeleteTemplate: (_ id: String) -> Void
  /// Thử lại khi tải danh sách lỗi — presentation-only, tầng trên quyết định.
  var onRetry: () -> Void

  public init(
    templates: [MockTemplate] = [],
    isLoading: Bool = false,
    loadError: String? = nil,
    isOffline: Bool = false,
    onSaveTemplate: @escaping (_ template: MockTemplate) -> Void = { _ in },
    onDeleteTemplate: @escaping (_ id: String) -> Void = { _ in },
    onRetry: @escaping () -> Void = {}
  ) {
    self._templates = State(initialValue: templates)
    self.isLoading = isLoading
    self.loadError = loadError
    self.isOffline = isOffline
    self.onSaveTemplate = onSaveTemplate
    self.onDeleteTemplate = onDeleteTemplate
    self.onRetry = onRetry
  }

  public var body: some View {
    NavigationStack(path: $navigationPath) {
      Group {
        if isLoading {
          loadingView
        } else if let error = loadError {
          errorView(error)
        } else {
          VStack(spacing: 0) {
            if isOffline {
              offlineBanner
            }
            TemplateListView<MockTemplate>(
              templates: templates,
              onSelect: { template in
                navigationPath.append(BuilderRoute.edit(template))
              },
              onCreate: {
                navigationPath.append(BuilderRoute.create)
              },
              onDelete: { template in
                onDeleteTemplate(template.id)
              }
            )
          }
        }
      }
      .navigationDestination(for: BuilderRoute.self) { route in
        switch route {
        case .create:
          TemplateFormView(
            onSave: { name, exercises, weekdays in
              let template = MockTemplate(
                name: name,
                exercises: exercises,
                assignedWeekdays: weekdays
              )
              onSaveTemplate(template)
              navigationPath.removeLast()
            },
            onCancel: {
              navigationPath.removeLast()
            }
          )
        case .edit(let template):
          TemplateFormView(
            template: template,
            onSave: { name, exercises, weekdays in
              let updated = MockTemplate(
                id: template.id,
                name: name,
                exercises: exercises,
                assignedWeekdays: weekdays
              )
              onSaveTemplate(updated)
              navigationPath.removeLast()
            },
            onDelete: {
              onDeleteTemplate(template.id)
              navigationPath.removeLast()
            },
            onCancel: {
              navigationPath.removeLast()
            }
          )
        }
      }
    }
  }

  private var loadingView: some View {
    VStack {
      ProgressView(String(localized: "builder.loading"))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
  }

  private func errorView(_ message: String) -> some View {
    VStack(spacing: 16) {
      Image(systemName: "exclamationmark.triangle")
        .font(.largeTitle)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(message)
        .multilineTextAlignment(.center)
      Button(String(localized: "common.retry")) {
        onRetry()
      }
      .buttonStyle(.bordered)
      .frame(minHeight: 44)
    }
    .padding()
  }

  private var offlineBanner: some View {
    HStack(spacing: 8) {
      Image(systemName: "wifi.slash")
        .accessibilityHidden(true)
      Text(String(localized: "builder.offline"))
        .font(.caption)
    }
    .foregroundStyle(.secondary)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity)
    .background(.secondary.opacity(0.2))
    .accessibilityElement(children: .combine)
  }
}

/// Route cho navigation trong Builder.
/// `MockTemplate` chứa `[TemplateExerciseProtocol]` nên không auto-synthesize
/// Hashable được — so sánh/hash theo `id` (định danh tự nhiên của template).
private enum BuilderRoute: Hashable {
  case create
  case edit(MockTemplate)

  static func == (lhs: BuilderRoute, rhs: BuilderRoute) -> Bool {
    switch (lhs, rhs) {
    case (.create, .create):
      return true
    case (.edit(let a), .edit(let b)):
      return a.id == b.id
    default:
      return false
    }
  }

  func hash(into hasher: inout Hasher) {
    switch self {
    case .create:
      hasher.combine(0)
    case .edit(let template):
      hasher.combine(1)
      hasher.combine(template.id)
    }
  }
}

// MARK: - Previews

#Preview("WorkoutBuilder — Loading") {
  WorkoutBuilderView(isLoading: true)
}

#Preview("WorkoutBuilder — Error") {
  WorkoutBuilderView(loadError: "Không tải được danh sách")
}

#Preview("WorkoutBuilder — Offline") {
  WorkoutBuilderView(
    templates: [
      MockTemplate(name: "Push Day", exercises: [
        MockTemplateExercise(name: "Bench Press", sets: 4, reps: 8),
      ])
    ],
    isOffline: true
  )
}
