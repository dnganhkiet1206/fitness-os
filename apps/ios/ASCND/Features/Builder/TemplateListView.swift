import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Danh sách buổi tập đã lưu (#527 Phase 2) — `app/templates.tsx` @ fac9ac2,
/// trên kế hoạch của `TodayController.library` (server ⊕ lệnh chưa gửi) và
/// `PlanEditor` để xoá.
///
/// RN behavior (giữ nguyên):
/// - mới trước (`newestFirst`); ô tìm chỉ hiện khi có hơn 6 buổi;
/// - tìm theo tên hoặc loại; tìm trượt thì nói đúng chữ đã tìm và KHÔNG mời
///   tạo buổi (`:105`) — trống thật thì mời tạo;
/// - xoá hỏi lại trước (`Alert`); lỗi đọc ≠ trống (`LoadFailed`);
/// - nút "Tạo mới" luôn ở cuối.
struct TemplateListView: View {
  let flow: WorkoutFlow
  @Environment(\.weightUnit) private var unit
  @State private var search = ""
  @State private var pendingDelete: WorkoutTemplate?
  @State private var showsBuilder = false
  @State private var deleteFailed = false

  private var templates: [WorkoutTemplate] { flow.today.library?.templates ?? [] }
  private var shown: [WorkoutTemplate] { TemplateDraft.listed(templates, search: search) }
  private var query: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    content
      .navigationTitle(Text("wb.list.title"))
      .safeAreaInset(edge: .bottom) {
        DSButton(String(localized: "wb.createNew"), style: .primary) { showsBuilder = true }
          .disabled(flow.plan == nil)
          .padding(DS.Spacing.md)
          .background(.bar)
      }
      .sheet(isPresented: $showsBuilder) {
        TemplateFormView(flow: flow)
      }
      .confirmationDialog(
        String(localized: "wb.delete.title"),
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible,
        presenting: pendingDelete
      ) { t in
        Button(String(localized: "wb.delete.title"), role: .destructive) {
          Task { await delete(t) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .alert(String(localized: "workout.finishError.generic"), isPresented: $deleteFailed) {
        Button(String(localized: "workout.ok")) {}
      }
      .refreshable { await flow.refresh() }
  }

  @ViewBuilder private var content: some View {
    if !shown.isEmpty {
      List {
        ForEach(shown, id: \.id) { t in
          row(t)
        }
      }
      .modifier(SearchWhenMany(count: templates.count, search: $search))
    } else if flow.today.library == nil, flow.today.failure != nil {
      DSErrorView(message: String(localized: "history.loadFailed")) {
        Task { await flow.refresh() }
      }
    } else if !query.isEmpty {
      // Tìm trượt: nói đúng chữ đã tìm, không mời tạo buổi.
      DSEmptyState(systemImage: "magnifyingglass", title: String(localized: "wb.list.noMatch \(query)"))
        .modifier(SearchWhenMany(count: templates.count, search: $search))
    } else {
      DSEmptyState(
        systemImage: "dumbbell", title: String(localized: "wb.list.empty"),
        actionTitle: flow.plan == nil ? nil : String(localized: "wb.createNew"),
        action: flow.plan == nil ? nil : { showsBuilder = true })
    }
  }

  private func row(_ t: WorkoutTemplate) -> some View {
    let sets = t.exercises.reduce(0) { $0 + $1.sets }
    return DisclosureGroup {
      ForEach(Array(t.exercises.enumerated()), id: \.offset) { _, e in
        HStack {
          Text(verbatim: e.exerciseName)
            .font(DS.TextStyle.footnote)
          Spacer()
          Text(verbatim: prescription(e))
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .accessibilityElement(children: .combine)
      }
    } label: {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: t.name)
            .font(DS.TextStyle.headline)
          Text(String(localized: "wb.list.meta \(t.exercises.count) \(sets)"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer()
        Button {
          pendingDelete = t
        } label: {
          Image(systemName: "trash")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .disabled(flow.plan == nil)
        .accessibilityLabel(Text(String(localized: "wb.delete.a11y \(t.name)")))
      }
    }
    .swipeActions {
      Button(role: .destructive) { pendingDelete = t } label: {
        Label(String(localized: "wb.delete.short"), systemImage: "trash")
      }
    }
  }

  /// "3 × 10 · 60 kg" — tạ 0 không hiện.
  private func prescription(_ e: TemplateExercise) -> String {
    let base = "\(e.sets) × \(e.reps)"
    guard let load = unit.localizedLoad(e.weightKg) else { return base }
    return "\(base) · \(load)"
  }

  private func delete(_ t: WorkoutTemplate) async {
    guard let plan = flow.plan else { return }
    do throws(PlanEditor.Refusal) {
      try await plan.delete(templateId: t.id)
    } catch {
      deleteFailed = true
    }
  }
}

/// Ô tìm chỉ khi có hơn 6 buổi (`templates.tsx:72`).
private struct SearchWhenMany: ViewModifier {
  let count: Int
  @Binding var search: String

  @ViewBuilder func body(content: Content) -> some View {
    if count > 6 {
      content.searchable(text: $search, prompt: Text("wb.list.search"))
    } else {
      content
    }
  }
}
