import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thư viện bài tập (#527 Phase 2) — `app/exercises.tsx` @ fac9ac2, trên
/// `ExerciseLibrary` (bản server ⊕ lệnh thêm / xoá chưa gửi, đi qua outbox).
///
/// RN behavior (giữ nguyên):
/// - gộp theo NHÃN nhóm cơ ("Ngực" cũ và "chest" mới chung một mục), tìm theo
///   tên với độ trễ 250 ms (P2-12);
/// - mở từ một ô nhóm cơ (`group`) thì chỉ hiện nhóm ấy, lọc theo khoá hình
///   cơ chứ không theo chữ;
/// - mở từ builder khi tìm trượt (`create`) thì form thêm bài mở sẵn, tên là
///   chữ đã tìm;
/// - form thêm: tên (bắt buộc), nhóm cơ (11 nhóm, mặc định Ngực), loại động
///   tác (mặc định CHƯA CHỌN, chạm lại để bỏ), dụng cụ (không bắt buộc);
/// - hàng hiện loại đã khai báo (không hiện gì khi chưa khai báo) và dụng cụ;
///   chỉ bài của mình mới có nút xoá, xoá hỏi lại trước;
/// - lỗi đọc ≠ thư viện trống (`LoadFailed`).
///
/// Native behavior: bản trên máy hiện ngay, kể cả offline, nên lỗi làm mới chỉ
/// chiếm màn khi chưa có bài nào để hiện (cùng luật với builder).
struct ExercisesView: View {
  let library: ExerciseLibrary
  /// Chỉ hiện một nhóm (ô nhóm cơ của tab Tập luyện, `muscle-grid.tsx:156`).
  var only: MuscleGroup?

  @Environment(\.locale) private var locale
  @State private var search = ""
  @State private var debounced = ""
  @State private var adding: Bool
  @State private var form: AddForm
  @State private var pendingDelete: LibraryExercise?
  @State private var deleteFailed = false

  /// - Parameter create: chữ builder đã tìm mà không thấy — mở sẵn form với tên ấy.
  init(library: ExerciseLibrary, only: MuscleGroup? = nil, create: String? = nil) {
    self.library = library
    self.only = only
    _adding = State(initialValue: create != nil)
    _form = State(initialValue: AddForm(name: create ?? ""))
  }

  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: locale) }
  private var sections: [ExerciseCatalog.Section] {
    ExerciseCatalog.sections(library.exercises, query: debounced, muscle: only, lang: lang)
  }

  var body: some View {
    content
      .navigationTitle(Text("ex.title"))
      .searchable(text: $search, prompt: Text("ex.search"))
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button {
            adding.toggle()
          } label: {
            Label(String(localized: "ex.add"), systemImage: "plus")
          }
        }
      }
      .task(id: search) {
        // Debounce như RN: lọc + gộp ~200 hàng mỗi phím là thừa.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        debounced = search.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      .task {
        if !library.loaded { await library.load() }
      }
      .refreshable { await library.refresh() }
      .sheet(isPresented: $adding) {
        AddExerciseSheet(library: library, form: $form) { adding = false }
      }
      .confirmationDialog(
        pendingDelete.map { String(localized: "ex.delete.confirm \($0.name)") } ?? "",
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
        titleVisibility: .visible,
        presenting: pendingDelete
      ) { e in
        Button(String(localized: "ex.delete"), role: .destructive) {
          Task { await delete(e) }
        }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .alert(String(localized: "workout.finishError.generic"), isPresented: $deleteFailed) {
        Button(String(localized: "workout.ok")) {}
      }
  }

  @ViewBuilder private var content: some View {
    if !library.loaded, library.exercises.isEmpty, library.failure == nil {
      DSLoadingView()
    } else if library.exercises.isEmpty, library.failure != nil {
      // Lỗi đọc ≠ thư viện trống: "không có bài nào" sẽ là một câu về tài khoản.
      DSErrorView(message: String(localized: "history.loadFailed")) {
        Task { await library.refresh() }
      }
    } else if sections.isEmpty {
      DSEmptyState(
        systemImage: "dumbbell", title: String(localized: "ex.empty"), message: String(localized: "ex.empty.hint"))
    } else {
      List {
        ForEach(sections) { section in
          Section {
            ForEach(section.exercises) { e in
              row(e)
            }
          } header: {
            Text(verbatim: section.title)
          }
        }
      }
    }
  }

  private func row(_ e: LibraryExercise) -> some View {
    let own = e.userId?.lowercased() == library.userId.lowercased()
    return HStack(spacing: DS.Spacing.sm) {
      Text(verbatim: e.name)
        .font(DS.TextStyle.body)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      // Loại đã khai báo: không hiện gì khi chưa ai nói.
      if let kind = e.kind.flatMap(ExerciseKind.init(rawValue:)) {
        Text(verbatim: AddExerciseSheet.kindName(kind))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .padding(.horizontal, 7)
          .padding(.vertical, 1)
          .overlay(Capsule().stroke(DS.Color.border.swiftUI))
      }
      if let gear = e.equipment, !gear.isEmpty {
        Text(verbatim: Equipment.label(gear, lang))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      // Chỉ bài của mình mới xoá được (bài mẫu là của chung).
      if own {
        Button {
          pendingDelete = e
        } label: {
          Image(systemName: "trash")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(String(localized: "ex.delete.a11y \(e.name)")))
      }
    }
    .frame(minHeight: 44)
  }

  private func delete(_ e: LibraryExercise) async {
    do throws(ExerciseLibrary.Refusal) {
      try await library.delete(id: e.id)
    } catch {
      deleteFailed = true
    }
  }
}

/// Nội dung form thêm bài; giữ ở màn mẹ để đóng sheet rồi mở lại không mất chữ.
struct AddForm: Equatable {
  var name = ""
  var group: ExerciseCatalog.PickGroup = .chest
  var kind: ExerciseKind?
  var equipment = ""
  /// Một id cho cả lần thêm: bấm Thêm lại không thành hai bài.
  var id: String?
}

/// Form thêm bài — một sheet, không chen vào trang (`FormSheet`): mở form
/// không đẩy thư viện đang xem xuống.
struct AddExerciseSheet: View {
  let library: ExerciseLibrary
  @Binding var form: AddForm
  let close: () -> Void

  @State private var saving = false
  @State private var failure: String?
  @FocusState private var nameFocused: Bool

  private var canSave: Bool { !form.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !saving }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(text: $form.name) { Text("ex.name.placeholder") }
            .focused($nameFocused)
            .submitLabel(.done)
            .onSubmit { Task { await save() } }
        } header: {
          Text("ex.name")
        } footer: {
          Text("ex.name.hint")
        }

        Section {
          chips(ExerciseCatalog.PickGroup.allCases, selected: { form.group == $0 }, title: Self.groupName) {
            form.group = $0
          }
        } header: {
          Text("ex.group")
        } footer: {
          Text("ex.group.hint")
        }

        Section {
          // Chạm lại loại đang chọn là bỏ chọn: "chưa ai nói" vẫn quay về được.
          chips(ExerciseKind.allCases, selected: { form.kind == $0 }, title: Self.kindName) { k in
            form.kind = form.kind == k ? nil : k
          }
        } header: {
          Text("ex.kind")
        } footer: {
          Text("ex.kind.hint")
        }

        Section {
          TextField(text: $form.equipment) { Text("ex.gear.placeholder") }
            .submitLabel(.done)
            .onSubmit { Task { await save() } }
        } header: {
          Text("ex.gear")
        } footer: {
          Text("ex.gear.hint")
        }

        if let failure {
          Text(verbatim: failure)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
      }
      .navigationTitle(Text("ex.add.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { close() }
        }
      }
      .safeAreaInset(edge: .bottom) {
        DSButton(saving ? String(localized: "wb.saving") : String(localized: "ex.add.button"), style: .primary) {
          Task { await save() }
        }
        .disabled(!canSave)
        .opacity(canSave ? 1 : 0.4)
        .accessibilityLabel(Text(String(localized: "ex.add.button")))
        .padding(DS.Spacing.md)
        .background(.bar)
      }
      .onAppear { nameFocused = true }
      .onChange(of: failure) { _, message in
        if let message { AccessibilityNotification.Announcement(message).post() }
      }
    }
    .presentationDetents([.large])
  }

  private func chips<T: Hashable>(
    _ all: [T], selected: @escaping (T) -> Bool, title: @escaping (T) -> String, pick: @escaping (T) -> Void
  ) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.xs) {
        ForEach(all, id: \.self) { item in
          let on = selected(item)
          Button {
            pick(item)
          } label: {
            Text(verbatim: title(item))
              .font(DS.TextStyle.footnote.weight(on ? .bold : .regular))
              .padding(.horizontal, DS.Spacing.sm)
              .frame(minHeight: 44)
              .background(on ? DS.Color.primary.swiftUI.opacity(0.15) : DS.Color.secondary.swiftUI, in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        }
      }
    }
    .sensoryFeedback(.selection, trigger: form)
  }

  private func save() async {
    guard canSave else { return }
    let id = form.id ?? library.newExerciseId()
    form.id = id
    saving = true
    defer { saving = false }
    failure = nil
    do throws(ExerciseLibrary.Refusal) {
      try await library.create(
        id: id, name: form.name, muscleGroup: form.group.stored, equipment: form.equipment, kind: form.kind)
      form = AddForm()
      close()
    } catch {
      failure = String(localized: "workout.finishError.generic")
    }
  }

  static func groupName(_ g: ExerciseCatalog.PickGroup) -> String {
    switch g {
    case .chest: String(localized: "muscle.chest")
    case .back: String(localized: "muscle.back")
    case .shoulders: String(localized: "muscle.shoulders")
    case .biceps: String(localized: "muscle.biceps")
    case .triceps: String(localized: "muscle.triceps")
    case .quads: String(localized: "muscle.quads")
    case .hamstrings: String(localized: "muscle.hamstrings")
    case .glutes: String(localized: "muscle.glutes")
    case .abs: String(localized: "muscle.abs")
    case .fullBody: String(localized: "muscle.fullBody")
    case .cardio: String(localized: "muscle.cardio")
    }
  }

  static func kindName(_ k: ExerciseKind) -> String {
    switch k {
    case .compound: String(localized: "ex.kind.compound")
    case .isolation: String(localized: "ex.kind.isolation")
    case .bodyweight: String(localized: "ex.kind.bodyweight")
    case .timed: String(localized: "ex.kind.timed")
    }
  }
}
