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
/// Chưa có (ghi ở #527): hình nhóm cơ (`MuscleArt`), "Tạo bài tập mới" từ chỗ
/// tìm trượt (cần màn thư viện production), toast "Đã thêm vào Plan".
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

  var body: some View {
    NavigationStack {
      Group {
        if step == 1 { pickStep } else { reviewStep }
      }
      .navigationTitle(Text("wb.title"))
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
    }
    .task {
      if templateId == nil { templateId = flow.plan?.newTemplateId() }
      if let library = flow.library, !library.loaded { await library.load() }
    }
  }

  // MARK: - Bước 1: chọn bài

  private var pickStep: some View {
    let library = flow.library
    let visible = TemplateDraft.visible(library?.exercises ?? [], group: group, search: search)
    return VStack(spacing: 0) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.xs) {
          chip(String(localized: "wb.all"), on: group == nil) { group = nil }
          ForEach(MuscleGroup.allCases, id: \.self) { g in
            chip(Self.muscleName(g), on: group == g) { group = group == g ? nil : g }
          }
        }
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, DS.Spacing.xs)
      }
      List {
        if visible.isEmpty {
          emptyPick(library)
        } else {
          ForEach(visible) { ex in
            Button {
              draft.toggle(id: ex.id, name: ex.name)
            } label: {
              HStack {
                VStack(alignment: .leading, spacing: 2) {
                  Text(verbatim: ex.name).foregroundStyle(DS.Color.foreground.swiftUI)
                  if let g = ex.muscleGroup, !g.isEmpty {
                    Text(verbatim: ex.muscles.map(Self.muscleName).joined(separator: " / "))
                      .font(DS.TextStyle.caption)
                      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  }
                }
                Spacer()
                Image(systemName: draft.contains(ex.id) ? "checkmark.circle.fill" : "circle")
                  .foregroundStyle(draft.contains(ex.id) ? DS.Color.primary.swiftUI : DS.Color.mutedForeground.swiftUI)
                  .accessibilityHidden(true)
              }
              .frame(minHeight: 44)
            }
            .accessibilityAddTraits(draft.contains(ex.id) ? [.isButton, .isSelected] : .isButton)
          }
        }
      }
      .searchable(text: $search, prompt: Text("wb.search"))
      .scrollDismissesKeyboard(.interactively)
      VStack(spacing: DS.Spacing.xs) {
        Text(draft.items.isEmpty ? String(localized: "wb.pickHint") : String(localized: "wb.selected \(draft.items.count)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
        DSButton(String(localized: "wb.next"), style: .primary) { step = 2 }
          .disabled(draft.items.isEmpty)
          .opacity(draft.items.isEmpty ? 0.5 : 1)
      }
      .padding(DS.Spacing.md)
      .background(.bar)
    }
    .sensoryFeedback(.selection, trigger: draft.items.count)
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
      Text(
        !q.isEmpty
          ? String(localized: "wb.noMatch \(q)")
          : (library?.exercises.isEmpty ?? true) ? String(localized: "wb.libraryEmpty") : String(localized: "wb.noExercises")
      )
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 88)
    }
  }

  private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(on ? .bold : .regular))
        .padding(.horizontal, DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(on ? DS.Color.primary.swiftUI.opacity(0.15) : DS.Color.secondary.swiftUI, in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
  }

  // MARK: - Bước 2: tên, loại, số

  private var reviewStep: some View {
    let ranked = draft.ranking { id in flow.library?.exercise(id: id)?.muscleGroup }
    let suggested = suggestedName(ranked)
    let kind = draft.type(ranked: ranked)
    return List {
      Section {
        TextField(
          String(localized: "wb.name.placeholder"),
          text: Binding(
            get: { draft.nameTouched ? draft.name : suggested },
            set: { draft.nameTouched = true; draft.name = $0 }))
          .font(DS.TextStyle.headline)
          .frame(minHeight: 44)
      } footer: {
        VStack(alignment: .leading, spacing: 4) {
          Text(String(localized: "wb.name.hint"))
          Text(String(localized: "wb.summary \(exerciseCount) \(setCount) \(draft.estimatedMinutes)"))
        }
      }

      Section {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: DS.Spacing.xs) {
            ForEach(TemplateDraft.Kind.allCases, id: \.self) { k in
              chip(Self.kindName(k), on: kind == k) { draft.pickedType = k }
            }
          }
        }
      } header: {
        Text(String(localized: "wb.type"))
      }

      Section {
        ForEach(Array(draft.items.enumerated()), id: \.offset) { i, e in
          Button {
            editing = i
          } label: {
            HStack {
              Text(verbatim: e.exerciseName).foregroundStyle(DS.Color.foreground.swiftUI)
              Spacer()
              Text(verbatim: prescription(e))
                .font(DS.TextStyle.footnote.monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
          }
        }
        Button {
          step = 1
        } label: {
          Label(String(localized: "wb.addMore"), systemImage: "plus")
            .frame(minHeight: 44)
        }
      } header: {
        Text(String(localized: "wb.added"))
      }

      Section {
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
      .listRowBackground(Color.clear)
    }
    .scrollDismissesKeyboard(.interactively)
  }

  // MARK: - Sửa một bài

  @ViewBuilder private func setSheet(_ index: Int) -> some View {
    if draft.items.indices.contains(index) {
      let e = draft.items[index]
      NavigationStack {
        List {
          Section {
            Text(verbatim: e.exerciseName).font(DS.TextStyle.headline)
            Text(verbatim: "\(index + 1) / \(draft.items.count)")
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Section {
            Stepper(value: Binding(get: { e.sets }, set: { draft.patch(index, sets: $0) }), in: 1...20) {
              row(String(localized: "wb.sets"), value: "\(e.sets)")
            }
            Stepper(value: Binding(get: { e.reps }, set: { draft.patch(index, reps: $0) }), in: 1...100) {
              row(String(localized: "wb.reps"), value: "\(e.reps)")
            }
            Stepper(
              onIncrement: { draft.patch(index, weightKg: TemplateDraft.stepLoad(e.weightKg, unit: unit, up: true)) },
              onDecrement: { draft.patch(index, weightKg: TemplateDraft.stepLoad(e.weightKg, unit: unit, up: false)) }
            ) {
              row(
                String(localized: "wb.load \(unit.label)"),
                value: Units.text(unit.display(e.weightKg)),
                hint: e.weightKg > 0 ? nil : String(localized: "wb.bodyweight"))
            }
            Stepper(value: Binding(get: { e.restSeconds }, set: { draft.patch(index, restSeconds: $0) }), in: 0...600, step: 15) {
              row(String(localized: "wb.rest"), value: RestTimer.label(seconds: e.restSeconds))
            }
            Stepper(value: Binding(get: { e.rpe }, set: { draft.patch(index, rpe: $0) }), in: 5...10) {
              row(String(localized: "wb.effort"), value: "\(e.rpe)", hint: String(localized: "wb.effort.hint"))
            }
          }
          Section {
            Button(String(localized: "wb.moveUp")) {
              draft.move(from: index, to: index - 1)
              editing = index - 1
            }
            .disabled(index == 0)
            Button(String(localized: "wb.moveDown")) {
              draft.move(from: index, to: index + 1)
              editing = index + 1
            }
            .disabled(index >= draft.items.count - 1)
            Button(String(localized: "wb.remove"), role: .destructive) {
              draft.remove(at: index)
              editing = nil
            }
          }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button(String(localized: "wb.done")) { editing = nil }
          }
        }
      }
      .presentationDetents([.medium, .large])
    }
  }

  private func row(_ label: String, value: String, hint: String? = nil) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: label)
        if let hint {
          Text(verbatim: hint)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      Spacer()
      Text(verbatim: value).font(DS.TextStyle.body.monospacedDigit())
    }
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
    let base = "\(e.sets) × \(e.reps)"
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
      AccessibilityNotification.Announcement(String(localized: "wb.saved")).post()
      dismiss()
    } catch {
      failure = String(localized: "workout.finishError.generic")
    }
  }
}

private struct EditTarget: Identifiable {
  let index: Int
  var id: Int { index }
}
