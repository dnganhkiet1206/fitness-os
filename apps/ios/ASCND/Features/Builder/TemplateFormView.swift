import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Builder buổi tập (#527 Phase 2) — `app/workout-builder.tsx` +
/// `components/ascnd/workout-set-sheet.tsx` @ fac9ac2. Luật ở
/// `TemplateDraft`; ghi qua `PlanEditor.create` (một id cho cả lần mở — bấm
/// Lưu lại không thành hai buổi, TW-5a).
///
/// RN behavior (giữ nguyên):
/// - bước 1 chọn bài: tìm theo tên, lọc theo nhóm cơ (lọc tại chỗ, không rời
///   builder), chạm để thêm / bỏ; "Tiếp" tắt khi chưa chọn bài nào;
/// - bước 2: tên gợi ý từ nhóm cơ (gõ thì tên gõ thắng), tóm tắt bài / set /
///   phút, loại gợi ý (chọn đè được), danh sách bài — chạm để sửa số;
/// - sửa một bài: set 1…20, rep 1…100, tạ theo đơn vị (bước 2.5 kg / 5 lb),
///   nghỉ 0…600 giây (bước 15), gắng sức 5…10; đưa lên / xuống; bỏ khỏi buổi;
/// - nút trái: bước 1 đóng, bước 2 quay lại bước 1 (không vứt buổi đang dựng).
///
/// - tìm trượt / cuối danh sách: "Tạo “…”" mở thư viện bài tập với form thêm
///   bài mang sẵn chữ đã tìm (`openLibrary`).
///
/// Chưa có (ghi ở #527): hình nhóm cơ (`MuscleArt`), toast "Đã thêm vào Plan".
struct TemplateFormView: View {
  let flow: WorkoutFlow
  /// Mở từ một ngày của Plan: lưu xong gán luôn vào ngày ấy (0 = Thứ Hai).
  var scheduleOn: Int?

  @Environment(\.dismiss) private var dismiss
  @Environment(\.weightUnit) private var unit
  @State private var draft = TemplateDraft()
  @State private var step = 1
  @State private var search = ""
  @State private var group: MuscleGroup?
  @State private var editing: Int?
  @State private var templateId: String?
  @State private var saving = false
  @State private var failure: String?
  /// Mở thư viện để tạo bài, mang theo chữ đang tìm (`openLibrary`, `:427`).
  @State private var creating: CreateExercise?

  var body: some View {
    NavigationStack {
      Group {
        if step == 1 { pickStep } else { reviewStep }
      }
      .navigationTitle(Text("wb.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if step == 1 {
            Button(String(localized: "common.cancel")) { dismiss() }
          } else {
            Button {
              step = 1
            } label: {
              Label(String(localized: "wb.step.pick"), systemImage: "chevron.left")
            }
          }
        }
        ToolbarItem(placement: .principal) {
          VStack(spacing: 0) {
            Text("wb.title").font(DS.TextStyle.headline)
            Text(String(localized: step == 1 ? "wb.step.pick" : "wb.step.review"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .accessibilityElement(children: .combine)
        }
      }
      .sheet(item: Binding(get: { editing.map(EditTarget.init) }, set: { editing = $0?.index })) { target in
        setSheet(target.index)
      }
      .navigationDestination(item: $creating) { target in
        if let library = flow.library {
          // Builder vẫn nằm dưới: quay lại thì bài đã chọn còn nguyên, bài vừa
          // tạo đã có trong danh sách (cùng `ExerciseLibrary`).
          ExercisesView(library: library, create: target.name)
        }
      }
    }
    .task {
      if templateId == nil { templateId = flow.plan?.newTemplateId() }
      if let library = flow.library, !library.loaded { await library.load() }
    }
    // Nút Lưu tắt khi đang lưu và dòng lỗi hiện ở cuối danh sách: VoiceOver
    // phải được nói, không thì focus kẹt trên nút đã tắt (#466).
    .onChange(of: saving) { _, now in
      if now { announceForVoiceOver(String(localized: "wb.saving")) }
    }
    .onChange(of: failure) { _, message in
      if let message { announceForVoiceOver(message) }
    }
  }

  private func announceForVoiceOver(_ message: String) {
    AccessibilityNotification.Announcement(message).post()
  }

  // MARK: - Bước 1: chọn bài
  //
  // Vẽ lại 18/10 (chủ dự án: "vẽ lại mục tạo buổi tập và sheet"): ô tìm + chip
  // nhóm cơ ghim trên đầu (`.searchable` của iOS 26 nằm ở đáy, đè nút Tiếp);
  // mỗi bài một hàng có thẻ thiết bị; bài đã chọn mang SỐ THỨ TỰ trong buổi;
  // đáy màn: số bài đã chọn + Tiếp.

  static let rose = DS.Color.metricRose.swiftUI
  private var lang: MuscleGroup.Language { MuscleGroup.Language(locale: .app) }

  private var pickStep: some View {
    let library = flow.library
    let visible = TemplateDraft.visible(library?.exercises ?? [], group: group, search: search)
    return ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        if visible.isEmpty {
          emptyPick(library)
            .padding(DS.Spacing.md)
        } else {
          ForEach(visible) { ex in
            pickRow(ex)
            if ex.id != visible.last?.id {
              Divider().padding(.leading, DS.Spacing.md)
            }
          }
        }
      }
      .dsCard(radius: DS.Radius.lg)
      .padding(.horizontal, DS.Spacing.md)
      if !visible.isEmpty, library != nil {
        createButton(String(localized: "wb.createExercise"))
          .padding(.horizontal, DS.Spacing.md)
          .padding(.top, DS.Spacing.sm)
      }
      Color.clear.frame(height: DS.Spacing.lg)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .top, spacing: 0) {
      VStack(spacing: DS.Spacing.xs) {
        searchField
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.xs) {
            chip(String(localized: "wb.all"), on: group == nil) { group = nil }
            ForEach(MuscleGroup.allCases, id: \.self) { g in
              chip(Self.muscleName(g), on: group == g) { group = group == g ? nil : g }
            }
          }
          .padding(.horizontal, DS.Spacing.md)
        }
      }
      .padding(.vertical, DS.Spacing.sm)
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: DS.Spacing.xs) {
        Text(draft.items.isEmpty ? String(localized: "wb.pickHint") : String(localized: "wb.selected \(draft.items.count)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
        DSButton(String(localized: "wb.next"), style: .primary) { step = 2 }
          .disabled(draft.items.isEmpty)
          .opacity(draft.items.isEmpty ? 0.5 : 1)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.top, DS.Spacing.sm)
      .padding(.bottom, DS.Spacing.xs)
      .background(.regularMaterial)
    }
    .sensoryFeedback(.selection, trigger: draft.items.count)
  }

  private var searchField: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(Self.rose)
        .accessibilityHidden(true)
      TextField(text: $search, prompt: Text(String(localized: "wb.search"))) {
        Text(String(localized: "wb.search"))
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
    .overlay(Capsule().strokeBorder(Self.rose.opacity(0.55), lineWidth: 1.5))
    .padding(.horizontal, DS.Spacing.md)
  }

  /// Một bài: tên theo ngôn ngữ app (tên gốc nhỏ bên dưới), nhóm cơ + thiết bị;
  /// đã chọn → vòng tô màu mang số thứ tự trong buổi.
  private func pickRow(_ ex: LibraryExercise) -> some View {
    let order = draft.items.firstIndex { $0.exerciseId == ex.id }.map { $0 + 1 }
    let gear = ex.equipment.flatMap { $0.isEmpty ? nil : Equipment.label($0, lang) }
    let muscles = ex.muscles.map(Self.muscleName).joined(separator: " / ")
    return Button {
      draft.toggle(id: ex.id, name: ex.name)
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 3) {
          Text(verbatim: ex.displayName)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(2)
          if ex.displayName != ex.name {
            Text(verbatim: ex.name)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
          HStack(spacing: 6) {
            if !muscles.isEmpty { tag(muscles, tinted: false) }
            if let gear { tag(gear, tinted: true) }
          }
          .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        ZStack {
          Circle()
            .fill(order != nil ? Self.rose : Color.clear)
          Circle()
            .strokeBorder(order != nil ? Self.rose : DS.Color.border.swiftUI, lineWidth: 1.5)
          if let order {
            Text(verbatim: "\(order)")
              .font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
              .foregroundStyle(.white)
          }
        }
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, DS.Spacing.sm)
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(order != nil ? [.isButton, .isSelected] : .isButton)
  }

  private func tag(_ text: String, tinted: Bool) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.semibold))
      .foregroundStyle(tinted ? Self.rose : DS.Color.foreground.swiftUI.opacity(0.75))
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Capsule().fill(tinted ? Self.rose.opacity(0.12) : DS.Color.secondary.swiftUI))
  }

  @ViewBuilder private func emptyPick(_ library: ExerciseLibrary?) -> some View {
    let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
    if let library, !library.loaded {
      ProgressView().frame(maxWidth: .infinity, minHeight: 88)
    } else if let library, library.exercises.isEmpty, library.failure != nil {
      // Lỗi đọc ≠ thư viện trống (`LoadFailed`).
      DSErrorView(message: String(localized: "history.loadFailed")) {
        Task { await library.refresh() }
      }
    } else {
      VStack(spacing: DS.Spacing.sm) {
        Text(
          !q.isEmpty
            ? String(localized: "wb.noMatch \(q)")
            : (library?.exercises.isEmpty ?? true) ? String(localized: "wb.libraryEmpty") : String(localized: "wb.noExercises")
        )
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 60)
        // Ngõ cụt thành lối đi: chữ đã tìm là tên của bài mới.
        if library != nil {
          createButton(q.isEmpty ? String(localized: "wb.createExercise") : String(localized: "wb.createNamed \(q)"))
        }
      }
    }
  }

  private func createButton(_ title: String) -> some View {
    Button {
      creating = CreateExercise(name: search.trimmingCharacters(in: .whitespacesAndNewlines))
    } label: {
      Label(title, systemImage: "plus")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(Self.rose)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(
          RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
            .strokeBorder(Self.rose.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /// Chip chọn: đang chọn tô màu Tập luyện, chữ trắng; chưa chọn kính + viền.
  private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(on ? .bold : .medium))
        .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 40)
        .background(Capsule().fill(on ? AnyShapeStyle(Self.rose) : AnyShapeStyle(.regularMaterial)))
        .overlay(Capsule().strokeBorder(on ? Color.clear : DS.Color.border.swiftUI, lineWidth: 1))
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
  }

  // MARK: - Bước 2: tên, loại, các bài

  private var reviewStep: some View {
    let ranked = draft.ranking { id in flow.library?.exercise(id: id)?.muscleGroup }
    let suggested = suggestedName(ranked)
    let kind = draft.type(ranked: ranked)
    return ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          TextField(
            String(localized: "wb.name.placeholder"),
            text: Binding(
              get: { draft.nameTouched ? draft.name : suggested },
              set: { draft.nameTouched = true; draft.name = $0 }))
            .font(DS.TextStyle.title2)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 56)
            .dsCard(radius: DS.Radius.lg)
          Text(String(localized: "wb.name.hint"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.horizontal, DS.Spacing.xs)
        }
        // Tóm tắt nổi bật: bài · set · phút.
        HStack(spacing: DS.Spacing.sm) {
          stat(exerciseCount, systemImage: "dumbbell.fill")
          stat(setCount, systemImage: "square.stack.3d.up.fill")
          stat(String(localized: "wb.minutes \(draft.estimatedMinutes)"), systemImage: "clock.fill")
        }
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          sectionTitle(String(localized: "wb.type"))
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DS.Spacing.xs) {
              ForEach(TemplateDraft.Kind.allCases, id: \.self) { k in
                chip(Self.kindName(k), on: kind == k) { draft.pickedType = k }
              }
            }
          }
        }
        VStack(alignment: .leading, spacing: DS.Spacing.xs) {
          sectionTitle(String(localized: "wb.added"))
          VStack(spacing: DS.Spacing.sm) {
            ForEach(Array(draft.items.enumerated()), id: \.offset) { i, e in
              exerciseCard(i, e)
            }
            Button {
              step = 1
            } label: {
              Label(String(localized: "wb.addMore"), systemImage: "plus")
                .font(DS.TextStyle.body.weight(.semibold))
                .foregroundStyle(Self.rose)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(
                  RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
                    .strokeBorder(Self.rose.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.top, DS.Spacing.sm)
      .padding(.bottom, DS.Spacing.lg)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: DS.Spacing.xs) {
        if let failure {
          Text(verbatim: failure)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        DSButton(saving ? String(localized: "wb.saving") : String(localized: "wb.save"), style: .primary) {
          Task { await save(name: draft.finalName(suggested: suggested), kind: kind) }
        }
        .disabled(draft.items.isEmpty || saving || flow.plan == nil)
        .opacity(draft.items.isEmpty || saving ? 0.5 : 1)
        .accessibilityLabel(Text(String(localized: "wb.save")))
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.top, DS.Spacing.sm)
      .padding(.bottom, DS.Spacing.xs)
      .background(.regularMaterial)
    }
  }

  private func sectionTitle(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .textCase(.uppercase)
      .tracking(0.5)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, DS.Spacing.xs)
  }

  private func stat(_ text: String, systemImage: String) -> some View {
    HStack(spacing: 6) {
      Image(systemName: systemImage)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(Self.rose)
        .accessibilityHidden(true)
      Text(verbatim: text)
        .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, minHeight: 40)
    .background(Self.rose.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
  }

  /// Một bài trong buổi: số thứ tự, tên, công thức "2 khởi động + 3 × 10 · 20 kg",
  /// dòng nghỉ · RPE; chạm để sửa.
  private func exerciseCard(_ i: Int, _ e: TemplateExercise) -> some View {
    Button {
      editing = i
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: "\(i + 1)")
          .font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
          .foregroundStyle(Self.rose)
          .frame(width: 32, height: 32)
          .background(Self.rose.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 3) {
          Text(verbatim: displayName(e))
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(2)
          Text(verbatim: prescription(e))
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI.opacity(0.8))
          Text(verbatim: String(localized: "wb.restEffort \(RestTimer.label(seconds: e.restSeconds)) \(e.rpe)"))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .dsCard(radius: DS.Radius.lg)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /// Tên theo ngôn ngữ app khi bài có trong thư viện; không thì tên đã lưu.
  private func displayName(_ e: TemplateExercise) -> String {
    e.exerciseId.flatMap { flow.library?.exercise(id: $0)?.displayName } ?? e.exerciseName
  }

  // MARK: - Sửa một bài

  @ViewBuilder private func setSheet(_ index: Int) -> some View {
    if draft.items.indices.contains(index) {
      let e = draft.items[index]
      NavigationStack {
        ScrollView {
          VStack(alignment: .leading, spacing: DS.Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
              Text(String(localized: "wb.exerciseOf \(index + 1) \(draft.items.count)"))
                .font(DS.TextStyle.caption.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.5)
                .foregroundStyle(Self.rose)
              Text(verbatim: displayName(e))
                .font(DS.TextStyle.title2)
            }
            .accessibilityElement(children: .combine)

            VStack(spacing: 0) {
              counter(String(localized: "wb.sets"), value: "\(e.sets)",
                      minus: e.sets > 1, plus: e.sets < 20) { draft.patch(index, sets: e.sets + $0) }
              Divider()
              counter(String(localized: "wb.reps"), value: "\(e.reps)",
                      minus: e.reps > 1, plus: e.reps < 100) { draft.patch(index, reps: e.reps + $0) }
              Divider()
              counter(
                String(localized: "wb.load \(unit.label)"), value: Units.text(unit.display(e.weightKg)),
                hint: e.weightKg > 0 ? nil : String(localized: "wb.bodyweight"), minus: e.weightKg > 0, plus: true
              ) { draft.patch(index, weightKg: TemplateDraft.stepLoad(e.weightKg, unit: unit, up: $0 > 0)) }
              Divider()
              counter(String(localized: "wb.rest"), value: RestTimer.label(seconds: e.restSeconds),
                      minus: e.restSeconds > 0, plus: e.restSeconds < 600) {
                draft.patch(index, restSeconds: min(600, max(0, e.restSeconds + 15 * $0)))
              }
            }
            .padding(.horizontal, DS.Spacing.md)
            .dsCard(radius: DS.Radius.lg)

            // Khởi động: thẻ riêng, ngọn lửa — ghi lại nhưng không tính.
            counter(
              String(localized: "wb.warmupSets"), value: "\(e.warmupSets)",
              hint: String(localized: "wb.warmupSets.hint"), icon: "flame.fill",
              minus: e.warmupSets > 0, plus: e.warmupSets < WorkoutPlanning.maxWarmupSets
            ) { draft.patch(index, warmupSets: e.warmupSets + $0) }
              .padding(.horizontal, DS.Spacing.md)
              .dsCard(radius: DS.Radius.lg)

            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              Text(String(localized: "wb.effort"))
                .font(DS.TextStyle.headline)
              EffortPicker(values: 5...10, value: e.rpe) { draft.patch(index, rpe: $0) }
              // RPE là khoảng cách tới thất bại, không phải mức đau (18/10).
              Label {
                Text(String(localized: "wb.effort.hint"))
              } icon: {
                Image(systemName: "info.circle")
              }
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
            }
            .padding(DS.Spacing.md)
            .dsCard(radius: DS.Radius.lg)

            HStack(spacing: DS.Spacing.sm) {
              sheetAction(String(localized: "wb.moveUp"), systemImage: "arrow.up", enabled: index > 0) {
                draft.move(from: index, to: index - 1)
                editing = index - 1
              }
              sheetAction(String(localized: "wb.moveDown"), systemImage: "arrow.down", enabled: index < draft.items.count - 1) {
                draft.move(from: index, to: index + 1)
                editing = index + 1
              }
            }
            Button(role: .destructive) {
              draft.remove(at: index)
              editing = nil
            } label: {
              Label(String(localized: "wb.remove"), systemImage: "trash")
                .font(DS.TextStyle.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.destructive.swiftUI)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
          .padding(DS.Spacing.md)
        }
        .ascndPage()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button(String(localized: "wb.done")) { editing = nil }
          }
        }
      }
      .presentationDetents([.large])
    }
  }

  /// Một hàng đếm: nhãn (+ chú thích) bên trái, − số + bên phải.
  private func counter(
    _ label: String, value: String, hint: String? = nil, icon: String? = nil, minus: Bool, plus: Bool,
    step: @escaping (Int) -> Void
  ) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      if let icon {
        Image(systemName: icon)
          .foregroundStyle(Self.rose)
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: label).font(DS.TextStyle.body)
        if let hint {
          Text(verbatim: hint)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      roundButton("minus", enabled: minus) { step(-1) }
        .accessibilityLabel(Text(verbatim: "\(label) −"))
      Text(verbatim: value)
        .font(DS.TextStyle.headline.monospacedDigit())
        .frame(minWidth: 52)
        .multilineTextAlignment(.center)
        .contentTransition(.numericText())
      roundButton("plus", enabled: plus) { step(1) }
        .accessibilityLabel(Text(verbatim: "\(label) +"))
    }
    .frame(minHeight: 60)
    .accessibilityElement(children: .contain)
  }

  private func roundButton(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(enabled ? Self.rose : DS.Color.mutedForeground.swiftUI.opacity(0.4))
        .frame(width: 36, height: 36)
        .background(Self.rose.opacity(enabled ? 0.12 : 0.05), in: Circle())
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
  }

  private func sheetAction(_ title: String, systemImage: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(enabled ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI.opacity(0.5))
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(DS.Color.secondary.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
  }

  // MARK: - Chữ

  private func suggestedName(_ ranked: [MuscleGroup]) -> String {
    switch TemplateDraft.nameShape(itemCount: draft.items.count, ranked: ranked) {
    case .none: ""
    case .title: String(localized: "wb.title")
    case .fullBody: Self.kindName(.fullBody)
    case .one(let g): String(localized: "wb.name.one \(Self.muscleName(g))")
    case .two(let a, let b): String(localized: "wb.name.two \(Self.muscleName(a)) \(Self.muscleName(b))")
    }
  }

  /// `nWbSummary` có số nhiều (`{n:exercise|exercises}`): khoá một / nhiều
  /// riêng, như `history.month.sessions.*` — xcstrings không dùng biến thể.
  private var exerciseCount: String {
    let n = draft.items.count
    return n == 1 ? String(localized: "wb.count.exercise.one") : String(localized: "wb.count.exercise.other \(n)")
  }

  private var setCount: String {
    let n = draft.totalSets
    return n == 1 ? String(localized: "wb.count.set.one") : String(localized: "wb.count.set.other \(n)")
  }

  private func prescription(_ e: TemplateExercise) -> String {
    var base = "\(e.sets) × \(e.reps)"
    // "🔥2 + 3 × 10": số set khởi động đứng trước, để thấy ngay đã đặt.
    if e.warmupSets > 0 { base = String(localized: "wb.withWarmups \(e.warmupSets) \(base)") }
    guard let load = unit.localizedLoad(e.weightKg) else { return base }
    return "\(base) · \(load)"
  }

  static func muscleName(_ g: MuscleGroup) -> String {
    switch g {
    case .chest: String(localized: "muscle.chest")
    case .back: String(localized: "muscle.back")
    case .shoulders: String(localized: "muscle.shoulders")
    case .biceps: String(localized: "muscle.biceps")
    case .triceps: String(localized: "muscle.triceps")
    case .abs: String(localized: "muscle.abs")
    case .legs: String(localized: "muscle.legs")
    case .glutes: String(localized: "muscle.glutes")
    case .calves: String(localized: "muscle.calves")
    case .cardio: String(localized: "muscle.cardio")
    }
  }

  static func kindName(_ k: TemplateDraft.Kind) -> String {
    switch k {
    case .push: String(localized: "wb.type.push")
    case .pull: String(localized: "wb.type.pull")
    case .legs: String(localized: "wb.type.legs")
    case .upper: String(localized: "wb.type.upper")
    case .lower: String(localized: "wb.type.lower")
    case .fullBody: String(localized: "wb.type.fullBody")
    case .strength: String(localized: "wb.type.strength")
    case .hypertrophy: String(localized: "wb.type.hypertrophy")
    case .cardio: String(localized: "wb.type.cardio")
    case .custom: String(localized: "wb.type.custom")
    }
  }

  // MARK: - Lưu

  private func save(name: String, kind: TemplateDraft.Kind) async {
    guard let plan = flow.plan, let id = templateId, !saving else { return }
    saving = true
    defer { saving = false }
    failure = nil
    do throws(PlanEditor.Refusal) {
      try await plan.create(id: id, name: name, type: kind.rawValue, exercises: draft.items, scheduleOn: scheduleOn)
      announceForVoiceOver(String(localized: "wb.saved"))
      dismiss()
    } catch {
      failure = String(localized: "workout.finishError.generic")
    }
  }
}

private struct CreateExercise: Hashable {
  let name: String
}

private struct EditTarget: Identifiable {
  let index: Int
  var id: Int { index }
}
