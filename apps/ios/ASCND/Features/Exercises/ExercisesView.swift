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
  /// Nhóm đang lọc (chip); mở từ ô nhóm cơ thì chọn sẵn nhóm ấy.
  @State private var group: MuscleGroup?
  @State private var debounced = ""
  @State private var adding: Bool
  @State private var form: AddForm
  @State private var pendingDelete: LibraryExercise?
  @State private var deleteFailed = false

  /// - Parameter create: chữ builder đã tìm mà không thấy — mở sẵn form với tên ấy.
  init(library: ExerciseLibrary, only: MuscleGroup? = nil, create: String? = nil) {
    self.library = library
    self.only = only
    _group = State(initialValue: only)
    _adding = State(initialValue: create != nil)
    _form = State(initialValue: AddForm(name: create ?? ""))
  }

  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: locale) }
  private var sections: [ExerciseCatalog.Section] {
    ExerciseCatalog.sections(library.exercises, query: debounced, muscle: group, lang: lang)
  }

  var body: some View {
    content
      .navigationTitle(Text("ex.title"))
      .ascndPage()
      // Ô tìm ghim trên đầu danh sách: `.searchable` của iOS 26 nằm ở đáy màn và
      // bị thanh tab của app che (18/10, chủ dự án: "thêm mục tìm kiếm").
      .safeAreaInset(edge: .top, spacing: 0) {
        VStack(spacing: 0) {
          searchField
          groupChips
        }
      }
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
      .alert(
        pendingDelete.map { String(localized: "ex.delete.confirm \($0.name)") } ?? "",
        isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
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

  /// Viên tìm như ô lọc món (`FoodListView`): tên vi / en / es, gõ không dấu cũng ra.
  private var searchField: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(MascotRoomView.signalColor(.workout))
        .accessibilityHidden(true)
      TextField(text: $search, prompt: Text(String(localized: "ex.search"))) {
        Text(String(localized: "ex.search"))
      }
      .autocorrectionDisabled()
      .textInputAutocapitalization(.never)
      .submitLabel(.search)
      if !search.isEmpty {
        Button { search = "" } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "community.search.clear")))
      }
    }
    .padding(.leading, 18)
    .padding(.trailing, search.isEmpty ? 18 : 4)
    .frame(minHeight: 52)
    .background(Capsule().fill(.regularMaterial))
    .overlay(Capsule().strokeBorder(MascotRoomView.signalColor(.workout).opacity(0.55), lineWidth: 1.5))
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
  }

  /// Lọc theo nhóm cơ — danh sách ~900 bài, cuộn tìm theo mục là quá dài.
  private var groupChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.xs) {
        chip(String(localized: "wb.all"), on: group == nil) { group = nil }
        ForEach(MuscleGroup.allCases, id: \.self) { g in
          chip(g.label(lang), on: group == g) { group = group == g ? nil : g }
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.bottom, DS.Spacing.xs)
    }
  }

  /// Chip đang chọn: nền màu Tập luyện, chữ trắng; chưa chọn: nền kính + viền.
  private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
    let rose = MascotRoomView.signalColor(.workout)
    return Button(action: action) {
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(on ? .bold : .medium))
        .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 40)
        .background(Capsule().fill(on ? AnyShapeStyle(rose) : AnyShapeStyle(.regularMaterial)))
        .overlay(Capsule().strokeBorder(on ? Color.clear : DS.Color.border.swiftUI, lineWidth: 1))
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
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
        // Đang tìm: "không tìm thấy" là đủ — câu đồng bộ từ web chỉ đúng khi thư viện trống.
        systemImage: "dumbbell", title: String(localized: "ex.empty"),
        message: debounced.isEmpty && group == nil ? String(localized: "ex.empty.hint") : nil)
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
      // Bài thư viện: tên theo ngôn ngữ app, tên gốc tiếng Anh nhỏ bên dưới (dễ đối
      // chiếu với video / tài liệu). Bài của mình: đúng tên đã đặt.
      VStack(alignment: .leading, spacing: 3) {
        Text(verbatim: e.displayName)
          .font(DS.TextStyle.body)
          .lineLimit(2)
        if e.displayName != e.name {
          Text(verbatim: e.name)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        // Thẻ dưới tên (18/10, chủ dự án: "thẻ phân loại hơi khó nhìn"): thiết bị
        // tô màu Tập luyện, loại bài nền xám; trùng chữ thì chỉ một thẻ ("Không tạ").
        let gear = e.equipment.flatMap { $0.isEmpty ? nil : Equipment.label($0, lang) }
        let kind = e.kind.flatMap(ExerciseKind.init(rawValue:)).map(AddExerciseSheet.kindName)
        if gear != nil || kind != nil {
          HStack(spacing: 6) {
            if let gear { tag(gear, tinted: true) }
            if let kind, kind != gear { tag(kind, tinted: false) }
          }
          .padding(.top, 2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
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

  private func tag(_ text: String, tinted: Bool) -> some View {
    let rose = MascotRoomView.signalColor(.workout)
    return Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.semibold))
      .foregroundStyle(tinted ? rose : DS.Color.foreground.swiftUI.opacity(0.75))
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Capsule().fill(tinted ? rose.opacity(0.12) : DS.Color.secondary.swiftUI))
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
      .ascndPage()
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
