import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Ghi buổi tập bằng tay (#527 Phase 2) — `app/log-workout.tsx` @ fac9ac2.
/// Luật (nháp bền, gợi ý kế hoạch, cận, một đường ghi online/offline, kỷ
/// lục) nằm ở `ManualLogController`; màn chỉ đọc và gọi nó.
///
/// RN behavior (giữ nguyên):
/// - gợi ý "Theo lịch hôm nay" là một chip, không tự điền; biến mất khi đã
///   dùng hoặc hôm nay đã có buổi (`:144`);
/// - mỗi set một hàng; số thứ tự là set thứ mấy CỦA BÀI, `1` mở bài mới;
/// - cột tạ mang nhãn đơn vị (`kg` / `lb`), ô trống = bodyweight;
/// - "Thêm set" chép bài + tạ hàng trên (không chép khởi động); "Bài tập khác"
///   là hàng trống;
/// - RPE hỏi MỘT lần cho cả buổi (6…10);
/// - nút Lưu tắt khi chưa có set nào có reps (nói lý do) hoặc có số ngoài cận
///   (nói đúng khoảng);
/// - gợi ý tải (`loadHint`, `LoadHintBook`) ngay trên hàng RPE;
/// - buổi có kỷ lục: sheet dừng lại với màn ăn mừng (`RecordCelebrationView`)
///   rồi mới đóng.
///
/// Chưa có (ghi ở #527): mở nhạc (`MusicLaunch`), mời chia sẻ sau khi lưu.
struct ManualLogView: View {
  let flow: WorkoutFlow
  @Environment(\.dismiss) private var dismiss
  @Environment(AppServices.self) private var services: AppServices?
  @Environment(ProfileBook.self) private var profileBook: ProfileBook?
  @State private var log: ManualLogController?
  /// Câu gợi ý tải (`loadHint`, `:288`); nạp sau form, không chặn form.
  @State private var loadHint: LoadHintBook?
  /// Bộ đệm chữ đang gõ — controller ghi bất đồng bộ, ô không được nhảy về
  /// chữ cũ giữa hai phím (như `WorkoutView`).
  @State private var buffer: [String: String] = [:]
  /// Thẻ bài đang gõ tên — gợi ý thư viện chỉ hiện trong thẻ ấy (`focusedRow`).
  @FocusState private var focusedName: String?
  /// Thẻ đang hiện gợi ý. Chạm vào gợi ý làm ô tên mất focus TRƯỚC khi nút nhận
  /// chạm — giữ dải gợi ý thêm một nhịp để lần chạm tới được nút.
  @State private var suggesting: String?
  @State private var saving = false
  @State private var failure: String?
  @State private var savedTick = 0
  /// Kỷ lục của buổi vừa lưu — khác rỗng thì màn ăn mừng phủ lên form.
  @State private var celebrating: [PersonalRecord] = []

  var body: some View {
    NavigationStack {
      Group {
        if let log {
          form(log)
        } else {
          DSLoadingView(message: String(localized: "manualLog.loading"))
        }
      }
      .navigationTitle(Text("manualLog.title"))
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .overlay {
      if !celebrating.isEmpty, let log {
        RecordCelebrationView(records: celebrating, unit: log.weightUnit) { leave() }
      }
    }
    .sensoryFeedback(.success, trigger: savedTick)
    .task {
      guard log == nil else { return }
      let l = flow.makeManualLog()
      await l.load()
      log = l
      guard loadHint == nil, let book = services?.makeLoadHint(userId: l.userId) else { return }
      loadHint = book
      await book.load()
    }
  }

  // MARK: - Form
  //
  // Vẽ lại 18/10 (chủ dự án: "phần ghi buổi tập này vẽ lại"): mỗi bài một thẻ —
  // tên bài ở đầu, bảng set thẳng cột (Set · tạ · reps · K · ×), "Thêm set" của
  // riêng thẻ; "Thêm bài tập" dưới cùng; RPE là thang chip có nghĩa từng mức;
  // nút Lưu ghim đáy màn cùng câu lý do khi chưa lưu được.

  private func form(_ log: ManualLogController) -> some View {
    let unit = log.weightUnit
    return ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if let plan = log.planOffer { planChip(plan, log) }
        nameField(log)
        ForEach(log.exerciseGroups) { group in
          exerciseCard(group, log: log, unit: unit)
        }
        Button {
          Task { await log.addExercise() }
        } label: {
          Label(String(localized: "manualLog.addExercise"), systemImage: "plus")
            .font(DS.TextStyle.body.weight(.semibold))
            .foregroundStyle(Self.rose)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
              RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
                .strokeBorder(Self.rose.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "manualLog.hint.bodyweight"))
          Text(String(localized: "manualLog.hint.hold"))
          HStack(spacing: 4) {
            Image(systemName: "flame.fill").foregroundStyle(Self.rose).accessibilityHidden(true)
            Text(String(localized: "manualLog.hint.warmup"))
          }
        }
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .padding(.horizontal, DS.Spacing.xs)
        feelCard(log, unit)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.top, DS.Spacing.sm)
      .padding(.bottom, DS.Spacing.lg)
    }
    .scrollDismissesKeyboard(.interactively)
    .safeAreaInset(edge: .bottom, spacing: 0) { saveBar(log) }
    .onChange(of: focusedName) { _, now in
      if let now {
        suggesting = now
      } else {
        Task {
          try? await Task.sleep(for: .milliseconds(350))
          if focusedName == nil { suggesting = nil }
        }
      }
    }
  }

  /// Màu Tập luyện — nút, chip RPE, set khởi động.
  static let rose = DS.Color.metricRose.swiftUI

  private func planChip(_ plan: WorkoutTemplate, _ log: ManualLogController) -> some View {
    Button {
      Task { await log.usePlan() }
    } label: {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: "calendar")
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "manualLog.planToday"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Text(verbatim: plan.name)
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
        }
        Spacer(minLength: DS.Spacing.xs)
        Text(String(localized: "manualLog.usePlan"))
          .font(DS.TextStyle.footnote.weight(.bold))
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 56)
      .dsCard(radius: DS.Radius.lg)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: "\(String(localized: "manualLog.planToday")): \(plan.name)"))
  }

  private func nameField(_ log: ManualLogController) -> some View {
    TextField(
      String(localized: "manualLog.name.placeholder"),
      text: text("name", log.name) { await log.setName($0) })
      .font(DS.TextStyle.headline)
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 56)
      .dsCard(radius: DS.Radius.lg)
  }

  // MARK: Thẻ bài

  private func exerciseCard(_ group: ManualExerciseGroup, log: ManualLogController, unit: WeightUnit) -> some View {
    let name = group.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let bad = log.errors()
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: "dumbbell.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Self.rose)
          .frame(width: 36, height: 36)
          .background(Self.rose.opacity(0.12), in: Circle())
          .accessibilityHidden(true)
        TextField(
          String(localized: "manualLog.exercise.search"),
          text: text("g:\(group.id)", group.name) { await log.setExerciseName($0, group: group.id) })
          .font(DS.TextStyle.headline)
          .focused($focusedName, equals: group.id)
          .frame(minHeight: 44)
        Menu {
          Button(role: .destructive) {
            Task { await log.removeGroup(group.id) }
          } label: {
            Label(String(localized: "manualLog.removeExercise"), systemImage: "trash")
          }
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(String(localized: "manualLog.removeExercise")))
      }
      if suggesting == group.id, let library = flow.library {
        let picks = ManualLogController.suggestions(for: group.name, in: library.exercises)
        if !picks.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DS.Spacing.xs) {
              ForEach(picks) { ex in
                Button {
                  // Chọn TRƯỚC, bỏ focus SAU: ô tên mất focus có thể ghi lại chữ
                  // đang gõ ("Bench") đè lên bài vừa chọn.
                  Task {
                    buffer["g:\(group.id)"] = nil
                    await log.pickExercise(id: ex.id, name: ex.name, group: group.id)
                    buffer["g:\(group.id)"] = nil
                    suggesting = nil
                    focusedName = nil
                  }
                } label: {
                  Text(verbatim: ex.displayName)
                    .font(DS.TextStyle.footnote.weight(.medium))
                    .foregroundStyle(DS.Color.foreground.swiftUI)
                    .padding(.horizontal, DS.Spacing.sm + 4)
                    .frame(minHeight: 36)
                    .background(Self.rose.opacity(0.12), in: Capsule())
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
              }
            }
          }
        }
      }
      // "Lần trước" một lần mỗi bài (`:837`).
      if !name.isEmpty, let insights = flow.insights {
        ExerciseProgressRow(insights: insights, today: flow.today, name: name)
      }
      columnHead(unit)
      // Set làm việc đánh số 1, 2, 3… bỏ qua set khởi động (ngọn lửa) — như
      // khối lượng, kỷ lục, "Lần trước": khởi động được ghi nhưng không đếm.
      let working = Self.workingNumbers(group.rows)
      ForEach(Array(group.rows.enumerated()), id: \.element.id) { i, row in
        setRow(
          row, log: log, working: working[row.id], position: i + 1, unit: unit, name: name, bad: bad[row.id] ?? [])
      }
      Button {
        Task { await log.addSet(toGroup: group.id) }
      } label: {
        Label(String(localized: "manualLog.addSet"), systemImage: "plus")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(Self.rose)
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(Self.rose.opacity(0.10), in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
      }
      .buttonStyle(.plain)
    }
    .padding(DS.Spacing.md)
    .dsCard(radius: DS.Radius.lg)
  }

  /// Tên cột, nói một lần mỗi thẻ, cùng khung với ô bên dưới nên thẳng hàng.
  private func columnHead(_ unit: WeightUnit) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "manualLog.col.set")).frame(width: Self.setCol, alignment: .center)
      Text(verbatim: unit.label).frame(maxWidth: .infinity)
      Text(String(localized: "manualLog.reps")).frame(maxWidth: .infinity)
      // Cột khởi động / bỏ: nút tự nói, không cần tên cột.
      Color.clear.frame(width: 44 + DS.Spacing.sm + 32)
    }
    .font(DS.TextStyle.caption.weight(.semibold))
    .textCase(.uppercase)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .accessibilityHidden(true)
  }

  static let setCol: CGFloat = 32

  /// Số thứ tự set làm việc trong thẻ; set khởi động không có số.
  static func workingNumbers(_ rows: [ManualSetRow]) -> [String: Int] {
    var out: [String: Int] = [:]
    var n = 0
    for r in rows where !r.warmup {
      n += 1
      out[r.id] = n
    }
    return out
  }

  private func setRow(
    _ row: ManualSetRow, log: ManualLogController, working: Int?, position: Int, unit: WeightUnit, name: String,
    bad: Set<ManualLogController.Field>
  ) -> some View {
    let spoken = name.isEmpty ? String(localized: "manualLog.exercise") : name
    // Nhãn đọc màn hình theo vị trí hàng — ô nào cũng có tên riêng, kể cả khởi động.
    let number = position
    return HStack(spacing: DS.Spacing.sm) {
      Group {
        if let working {
          Text(verbatim: "\(working)")
            .font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          Image(systemName: "flame.fill")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(Self.rose)
        }
      }
      .frame(width: Self.setCol, height: 32)
      .background(row.warmup ? Self.rose.opacity(0.12) : DS.Color.secondary.swiftUI, in: Circle())
      .accessibilityHidden(true)
      // Gạch ngang, không phải "kg": cột đã nói đơn vị, ô trống là bodyweight.
      numberField(
        text("w:\(row.id)", row.weight) { await log.setWeight($0, row: row.id) }, bad: bad.contains(.weight),
        keyboard: .decimalPad)
        .accessibilityLabel(Text(String(localized: "manualLog.a11y.weight \(spoken) \(number) \(unit.label)")))
      // "45s" cho set giữ: bàn phím số thuần không có chữ "s".
      numberField(
        text("r:\(row.id)", row.reps) { await log.setReps($0, row: row.id) }, bad: bad.contains(.reps),
        keyboard: .numbersAndPunctuation)
        .accessibilityLabel(Text(String(localized: "manualLog.a11y.reps \(spoken) \(number)")))
      Button {
        Task { await log.toggleWarmup(row: row.id) }
      } label: {
        // Ngọn lửa thay chữ "K" (18/10, chủ dự án hỏi "nút K có ý nghĩa gì").
        Image(systemName: row.warmup ? "flame.fill" : "flame")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(row.warmup ? Color.white : DS.Color.mutedForeground.swiftUI)
          .frame(width: 28, height: 28)
          .background(row.warmup ? Self.rose : Color.clear, in: Circle())
          .overlay(Circle().stroke(row.warmup ? Color.clear : DS.Color.border.swiftUI, lineWidth: 1.5))
          .frame(width: 44, height: 44)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "manualLog.warmup")))
      .accessibilityAddTraits(row.warmup ? [.isButton, .isSelected] : .isButton)
      Button {
        Task { await log.removeRow(row.id) }
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 32, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(log.rows.count <= 1)
      .opacity(log.rows.count <= 1 ? 0.3 : 1)
      .accessibilityLabel(Text(String(localized: "manualLog.remove")))
    }
  }

  private func numberField(_ value: Binding<String>, bad: Bool, keyboard: UIKeyboardType) -> some View {
    TextField(Self.dash, text: value)
      .keyboardType(keyboard)
      .multilineTextAlignment(.center)
      .font(DS.TextStyle.body.weight(.semibold).monospacedDigit())
      .foregroundStyle(bad ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.sm, style: .continuous)
          .stroke(bad ? DS.Color.destructive.swiftUI : .clear, lineWidth: 1.5))
  }

  // MARK: Cảm nhận + Lưu

  private func feelCard(_ log: ManualLogController, _ unit: WeightUnit) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(localized: "manualLog.feel"))
          .font(DS.TextStyle.headline)
        Spacer()
        // Khối lượng chỉ hiện khi đã có số — "—" một mình không nói gì.
        if log.volumeKg() > 0 {
          VStack(alignment: .trailing, spacing: 0) {
            Text(verbatim: volumeText(log, unit))
              .font(DS.TextStyle.headline.monospacedDigit())
            Text(String(localized: "manualLog.volume"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          .accessibilityElement(children: .combine)
        }
      }
      Text(String(localized: "manualLog.rpe"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: DS.Spacing.xs) {
        ForEach(Array(ManualLogController.rpeValues), id: \.self) { v in
          let on = log.rpe == v
          Button {
            Task { await log.setRpe(v) }
          } label: {
            Text(verbatim: "\(v)")
              .font(DS.TextStyle.body.weight(on ? .bold : .medium).monospacedDigit())
              .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 44)
              .background(
                on ? AnyShapeStyle(Self.rose) : AnyShapeStyle(DS.Color.secondary.swiftUI),
                in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: "RPE \(v), \(rpeMeaning(v))"))
          .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        }
      }
      Text(verbatim: rpeMeaning(log.rpe))
        .font(DS.TextStyle.footnote.weight(.medium))
        .foregroundStyle(Self.rose)
      // Mấy buổi cùng tên gần đây cảm thấy thế nào so với mức buổi tập đặt
      // (`:914-931`): một câu dưới RPE, không đổi gì trong template.
      if let hint = loadHint?.hint(
        name: log.name, templates: flow.today.library?.templates ?? [], goal: profileBook?.profile?.goal)
      {
        Text(verbatim: loadHintText(hint))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(DS.Spacing.md)
    .dsCard(radius: DS.Radius.lg)
  }

  private func rpeMeaning(_ v: Int) -> String {
    switch v {
    case ...6: String(localized: "manualLog.rpe.6")
    case 7: String(localized: "manualLog.rpe.7")
    case 8: String(localized: "manualLog.rpe.8")
    case 9: String(localized: "manualLog.rpe.9")
    default: String(localized: "manualLog.rpe.10")
    }
  }

  private func saveBar(_ log: ManualLogController) -> some View {
    VStack(spacing: DS.Spacing.xs) {
      if let failure {
        Text(verbatim: failure).foregroundStyle(DS.Color.destructive.swiftUI)
      } else if let e = log.firstError() {
        Text(rangeMessage(e.field)).foregroundStyle(DS.Color.destructive.swiftUI)
      } else if log.validRows.isEmpty {
        Text(String(localized: "manualLog.needReps")).foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      DSButton(
        saving ? String(localized: "manualLog.saving") : String(localized: "manualLog.save"),
        style: .primary,
        action: { Task { await save(log) } }
      )
      .disabled(!log.canSave() || saving)
      .opacity(log.canSave() && !saving ? 1 : 0.5)
      .accessibilityLabel(Text(String(localized: "manualLog.save")))
    }
    .font(DS.TextStyle.footnote)
    .multilineTextAlignment(.center)
    .padding(.horizontal, DS.Spacing.md)
    .padding(.top, DS.Spacing.sm)
    .padding(.bottom, DS.Spacing.xs)
    .background(.regularMaterial)
  }

  private func loadHintText(_ h: LoadHint.Hint) -> String {
    let aim = Units.text(h.aim)
    return h.up
      ? String(localized: "manualLog.loadHint.up \(h.name) \(aim) \(h.percent)")
      : String(localized: "manualLog.loadHint.down \(h.name) \(aim) \(h.percent)")
  }

  // MARK: - Chữ

  /// Chỗ trống của ô số: ký hiệu, không phải chữ cần dịch.
  static let dash = "—"

  private func volumeText(_ log: ManualLogController, _ unit: WeightUnit) -> String {
    let kg = log.volumeKg()
    // `Math.round(displayWeight(volumeLoad)).toLocaleString()` (`:896`).
    return kg > 0 ? "\(unit.volume(kg).formatted(.number.locale(.app))) \(unit.label)" : "—"
  }

  /// `outOfRangeMessage` với cận của `plausible.ts`: tạ luôn nói theo kg
  /// (`lift_kg`, như RN), reps theo `set_reps`.
  private func rangeMessage(_ field: ManualLogController.Field) -> String {
    switch field {
    case .weight:
      let b = ManualLogController.liftKg
      let kg = WeightUnit.kg.label
      return String(localized: "manualLog.range \(Int(b.lowerBound)) \(Int(b.upperBound)) \(kg)")
    case .reps:
      let b = ManualLogController.setReps
      let reps = String(localized: "manualLog.reps")
      return String(localized: "manualLog.range \(b.lowerBound) \(b.upperBound) \(reps)")
    }
  }

  // MARK: - Ghi

  /// Ô gõ qua bộ đệm: hiện ngay chữ vừa gõ, controller ghi sau.
  private func text(_ key: String, _ current: String, write: @escaping (String) async -> Bool) -> Binding<String> {
    Binding(
      get: { buffer[key] ?? current },
      set: { new in
        buffer[key] = new
        Task {
          _ = await write(new)
          if buffer[key] == new { buffer[key] = nil }
        }
      })
  }

  private func save(_ log: ManualLogController) async {
    guard !saving else { return }
    saving = true
    defer { saving = false }
    failure = nil
    do throws(ManualLogController.SaveRefusal) {
      let summary = try await log.save()
      savedTick += 1
      if summary.records.isEmpty {
        leave()
      } else {
        celebrating = summary.records
      }
    } catch {
      failure = String(localized: "workout.finishError.generic")
    }
  }
}

extension ManualLogView {
  /// Lưu xong (thẳng, hoặc sau màn kỷ lục): báo và đóng.
  fileprivate func leave() {
    AccessibilityNotification.Announcement(String(localized: "manualLog.saved")).post()
    dismiss()
  }
}

// MARK: - Preview

#Preview("Ghi buổi tập") {
  Text(verbatim: "ManualLogView cần WorkoutFlow thật — xem Lab.")
}
