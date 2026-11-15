import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Mẫu buổi tập (n)": 3 mẫu mới nhất, "Xem tất cả", "Tạo buổi tập", menu ⋯
/// (gán hôm nay, nhân bản, xoá). Tách khỏi trang gốc Tập luyện 15/11 (Kiệt:
/// thư viện ra trang chính, mẫu buổi tập đổi chỗ cho thư viện) — nay nằm
/// trong "Mẫu buổi tập & lịch sử".
struct TemplatesSection: View {
  let flow: WorkoutFlow
  @State private var showsBuilder = false
  /// Mẫu đang chờ xác nhận xoá (menu ⋯ của hàng mẫu, 14/10).
  @State private var deletingTemplate: WorkoutTemplate?
  @State private var templateFailed = false

  private var templates: [WorkoutTemplate] {
    (flow.today.library?.templates ?? []).sorted(by: WorkoutTemplate.newestFirst)
  }

  var body: some View {
    content
      .sheet(isPresented: $showsBuilder) { TemplateFormView(flow: flow) }
      .alert(
        String(localized: "wb.delete.title"),
        isPresented: Binding(get: { deletingTemplate != nil }, set: { if !$0 { deletingTemplate = nil } }),
        presenting: deletingTemplate
      ) { t in
        Button(String(localized: "common.cancel"), role: .cancel) {}
        Button(String(localized: "wb.delete.title"), role: .destructive) {
          // swiftlint:disable:next unhandled_throwing_task - templateAction tự bắt lỗi
          Task { await templateAction { try await $0.delete(templateId: t.id) } }
        }
      } message: { t in
        Text(String(localized: "wh.tpl.deleteMessage \(t.name)"))
      }
      .alert(String(localized: "workout.finishError.generic"), isPresented: $templateFailed) {
        Button(String(localized: "workout.ok")) {}
      }
  }

  @ViewBuilder private var content: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text("workoutshome.templates \(templates.count.formatted(.number.locale(.app)))")
          .font(DS.TextStyle.title)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        if !templates.isEmpty {
          NavigationLink {
            TemplateListView(flow: flow)
          } label: {
            Text("workoutshome.seeall")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(WorkoutsHomeView.accent)
              .frame(minHeight: 44)
          }
        }
      }
      .padding(.horizontal, 4)
      .padding(.top, DS.Spacing.sm)
      if flow.today.library == nil, flow.today.failure != nil {
        DSErrorView(message: String(localized: "history.loadFailed")) {
          Task { await flow.refresh() }
        }
      } else {
        VStack(spacing: 0) {
          if templates.isEmpty {
            Text("workoutshome.notemplates")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 52)
          }
          ForEach(Array(templates.prefix(3).enumerated()), id: \.element.id) { i, t in
            if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
            templateRow(t)
          }
          if flow.plan != nil {
            if !templates.isEmpty { Divider().padding(.leading, 58).opacity(0.6) }
            Button {
              showsBuilder = true
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "plus")
                  .font(.body.weight(.semibold))
                  .foregroundStyle(WorkoutsHomeView.accent)
                  .frame(width: 32, height: 32)
                  .background(WorkoutsHomeView.accent.opacity(0.12), in: Circle())
                  .accessibilityHidden(true)
                Text("wh.createWorkout")
                  .font(DS.TextStyle.body.weight(.semibold))
                  .foregroundStyle(WorkoutsHomeView.accent)
                Spacer()
              }
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 56)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard()
      }
    }
  }

  private func templateRow(_ t: WorkoutTemplate) -> some View {
    let sets = t.exercises.reduce(0) { $0 + $1.sets }
    return HStack(spacing: 12) {
      Image(systemName: "dumbbell.fill")
        .font(.footnote)
        .foregroundStyle(WorkoutsHomeView.accent)
        .frame(width: 32, height: 32)
        .background(WorkoutsHomeView.accent.opacity(0.12), in: Circle())
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: t.name)
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Text(String(localized: "wb.list.meta \(t.exercises.count) \(sets)"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
      if flow.plan != nil {
        Menu {
          templateMenu(t)
        } label: {
          Image(systemName: "ellipsis")
            .font(.body.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text(String(localized: "wh.tpl.actions \(t.name)")))
      }
    }
    .padding(.leading, DS.Spacing.md)
    .padding(.trailing, DS.Spacing.xs)
    .frame(minHeight: 60)
    .contentShape(Rectangle())
    .contextMenu { if flow.plan != nil { templateMenu(t) } }
  }

  /// Thao tác nhanh của một mẫu (14/10): gán cho thứ hôm nay (kế hoạch tuần
  /// là lịch lặp — nói rõ "mọi Thứ X"), nhân bản, xoá (hỏi lại). Mẫu không sửa
  /// tại chỗ được: builder chỉ TẠO (như RN), nhân bản là đường sửa an toàn.
  @ViewBuilder private func templateMenu(_ t: WorkoutTemplate) -> some View {
    let day = WorkoutPlanning.routineIndex(flow.today.today)
    Button {
      // swiftlint:disable:next unhandled_throwing_task - templateAction tự bắt lỗi
      Task { await templateAction { try await $0.assign(day: day, templateId: t.id) } }
    } label: {
      Label(String(localized: "wh.tpl.assignToday \(WorkoutsHomeView.longWeekday(flow.today.today))"), systemImage: "calendar.badge.plus")
    }
    Button {
      // swiftlint:disable:next unhandled_throwing_task - templateAction tự bắt lỗi
      Task {
        await templateAction { editor in
          try await editor.create(
            id: editor.newTemplateId(), name: String(localized: "wh.tpl.copyName \(t.name)"),
            type: t.type ?? PlanEdit.defaultType, exercises: t.exercises)
        }
      }
    } label: {
      Label(String(localized: "wh.tpl.duplicate"), systemImage: "plus.square.on.square")
    }
    Divider()
    Button(role: .destructive) {
      deletingTemplate = t
    } label: {
      Label(String(localized: "wb.delete.short"), systemImage: "trash")
    }
  }

  private func templateAction(_ op: (PlanEditor) async throws -> Void) async {
    guard let editor = flow.plan else { return }
    do {
      try await op(editor)
    } catch {
      templateFailed = true
    }
  }

}

/// "Mẫu buổi tập & lịch sử" (15/11): chỗ cũ của "Thư viện & lịch sử" — mẫu
/// buổi tập trước, các buổi đã ghi sau.
struct TemplatesHistoryView: View {
  let flow: WorkoutFlow

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        TemplatesSection(flow: flow)
        if let history = flow.history {
          NavigationLink { WorkoutHistoryView(book: history) } label: {
            WorkoutsHomeView.toolRow(
              "clock.arrow.circlepath", String(localized: "history.title"),
              sub: history.entries.isEmpty ? nil : String(localized: "wh.sessions \(history.entries.count)"))
          }
          .buttonStyle(.plain)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
          .todayCard()
        }
      }
      .padding(DS.Spacing.md)
    }
    .refreshable { await flow.refresh() }
    .navigationTitle(String(localized: "wh.templatesHistory"))
    .navigationBarTitleDisplayMode(.large)
    .ascndPage()
  }
}
