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
///   (nói đúng khoảng).
///
/// Chưa có (ghi ở #527): mở nhạc (`MusicLaunch`), gợi ý tải (`suggestLoad` —
/// cần trạng thái người dùng + readiness), dòng xu hướng của insight, màn ăn
/// mừng kỷ lục (`RecordCelebration`) — kỷ lục vẫn được ghi và nổ ở lịch sử.
struct ManualLogView: View {
  let flow: WorkoutFlow
  @Environment(\.dismiss) private var dismiss
  @State private var log: ManualLogController?
  /// Bộ đệm chữ đang gõ — controller ghi bất đồng bộ, ô không được nhảy về
  /// chữ cũ giữa hai phím (như `WorkoutView`).
  @State private var buffer: [String: String] = [:]
  /// Ô tên bài đang gõ — gợi ý thư viện chỉ hiện dưới hàng ấy (`focusedRow`).
  @FocusState private var focusedName: String?
  @State private var saving = false
  @State private var failure: String?
  @State private var savedTick = 0

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
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .sensoryFeedback(.success, trigger: savedTick)
    .task {
      guard log == nil else { return }
      let l = flow.makeManualLog()
      await l.load()
      log = l
    }
  }

  // MARK: - Form

  private func form(_ log: ManualLogController) -> some View {
    let unit = log.weightUnit
    let numbers = log.setNumbers
    return List {
      if let plan = log.planOffer {
        Section {
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
            .frame(minHeight: 44)
          }
          .accessibilityLabel(Text(verbatim: "\(String(localized: "manualLog.planToday")): \(plan.name)"))
        }
      }

      Section {
        TextField(
          String(localized: "manualLog.name.placeholder"),
          text: text("name", log.name) { await log.setName($0) })
          .frame(minHeight: 44)
      }

      Section {
        columnHead(unit)
        ForEach(log.rows) { row in
          setRow(row, log: log, number: numbers[row.id] ?? 1, unit: unit)
        }
        HStack(spacing: DS.Spacing.sm) {
          Button {
            Task { await log.addSet() }
          } label: {
            Label(String(localized: "manualLog.addSet"), systemImage: "plus")
              .frame(maxWidth: .infinity, minHeight: 44)
          }
          Button {
            Task { await log.addExercise() }
          } label: {
            Label(String(localized: "manualLog.newExercise"), systemImage: "plus")
              .foregroundStyle(DS.Color.primary.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 44)
          }
        }
        .buttonStyle(.bordered)
      } header: {
        Text(String(localized: "manualLog.sets"))
      } footer: {
        VStack(alignment: .leading, spacing: 4) {
          Text(String(localized: "manualLog.hint.bodyweight"))
          Text(String(localized: "manualLog.hint.hold"))
        }
      }

      Section {
        HStack {
          Text(String(localized: "manualLog.volume"))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Spacer()
          Text(verbatim: volumeText(log, unit))
            .font(DS.TextStyle.headline.monospacedDigit())
        }
        Picker(selection: Binding(get: { log.rpe }, set: { v in Task { await log.setRpe(v) } })) {
          ForEach(Array(ManualLogController.rpeValues), id: \.self) { v in
            Text(verbatim: "\(v)").tag(v)
          }
        } label: {
          Text(String(localized: "manualLog.rpe"))
        }
        .pickerStyle(.segmented)
        .frame(minHeight: 44)
      } header: {
        Text(String(localized: "manualLog.rpe"))
      }

      Section {
        if log.validRows.isEmpty {
          Text(String(localized: "manualLog.needReps"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        if let e = log.firstError() {
          Text(rangeMessage(e.field))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        if let failure {
          Text(verbatim: failure)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
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
      .listRowBackground(Color.clear)
    }
    .scrollDismissesKeyboard(.interactively)
  }

  /// Tên cột, nói một lần (`:741`): bài / đơn vị tạ / reps.
  private func columnHead(_ unit: WeightUnit) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "manualLog.exercise")).frame(maxWidth: .infinity, alignment: .leading)
      Text(verbatim: unit.label).frame(width: 72, alignment: .trailing)
      Text(String(localized: "manualLog.reps")).frame(width: 64, alignment: .trailing)
      Color.clear.frame(width: 88)
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .accessibilityHidden(true)
  }

  private func setRow(_ row: ManualSetRow, log: ManualLogController, number: Int, unit: WeightUnit) -> some View {
    let name = row.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
    let spoken = name.isEmpty ? String(localized: "manualLog.exercise") : name
    let bad = log.errors()[row.id] ?? []
    return VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: "\(number)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 20)
          .accessibilityHidden(true)
        TextField(
          String(localized: "manualLog.exercise"),
          text: text("n:\(row.id)", row.exerciseName) { await log.setExerciseName($0, row: row.id) })
          .focused($focusedName, equals: row.id)
          .frame(minHeight: 44)
      }
      HStack(spacing: DS.Spacing.sm) {
        Spacer(minLength: 0)
        // Gạch ngang, không phải "kg": cột đã nói đơn vị, ô trống là bodyweight.
        TextField(Self.dash, text: text("w:\(row.id)", row.weight) { await log.setWeight($0, row: row.id) })
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .frame(width: 72, height: 44)
          .foregroundStyle(bad.contains(.weight) ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI)
          .accessibilityLabel(Text(String(localized: "manualLog.a11y.weight \(spoken) \(number) \(unit.label)")))
        // "45s" cho set giữ: bàn phím số thuần không có chữ "s".
        TextField(Self.dash, text: text("r:\(row.id)", row.reps) { await log.setReps($0, row: row.id) })
          .keyboardType(.numbersAndPunctuation)
          .multilineTextAlignment(.trailing)
          .frame(width: 64, height: 44)
          .foregroundStyle(bad.contains(.reps) ? DS.Color.destructive.swiftUI : DS.Color.foreground.swiftUI)
          .accessibilityLabel(Text(String(localized: "manualLog.a11y.reps \(spoken) \(number)")))
        Button {
          Task { await log.toggleWarmup(row: row.id) }
        } label: {
          Text(String(localized: "manualLog.warmup.short"))
            .font(DS.TextStyle.caption.weight(.bold))
            .foregroundStyle(row.warmup ? DS.Color.primaryForeground.swiftUI : DS.Color.mutedForeground.swiftUI)
            .frame(width: 26, height: 26)
            .background(row.warmup ? DS.Color.primary.swiftUI : Color.clear, in: Circle())
            .overlay(Circle().stroke(DS.Color.mutedForeground.swiftUI.opacity(0.4)))
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(String(localized: "manualLog.warmup")))
        .accessibilityAddTraits(row.warmup ? [.isButton, .isSelected] : .isButton)
        Button {
          Task { await log.removeRow(row.id) }
        } label: {
          Image(systemName: "xmark")
            .font(.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.borderless)
        .disabled(log.rows.count <= 1)
        .accessibilityLabel(Text(String(localized: "manualLog.remove")))
      }
      // "Lần trước" chỉ trên hàng MỞ bài (`:837`) — nói một lần, không bốn.
      if number == 1, !name.isEmpty, let insights = flow.insights {
        ExerciseProgressRow(insights: insights, today: flow.today, name: name)
      }
      if focusedName == row.id, let library = flow.library {
        let picks = ManualLogController.suggestions(for: row.exerciseName, in: library.exercises)
        if !picks.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DS.Spacing.xs) {
              ForEach(picks) { ex in
                Button(ex.name) {
                  focusedName = nil
                  buffer["n:\(row.id)"] = nil
                  Task { await log.pickExercise(id: ex.id, name: ex.name, row: row.id) }
                }
                .buttonStyle(.bordered)
                .font(DS.TextStyle.caption)
                .frame(minHeight: 44)
              }
            }
          }
        }
      }
    }
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
      _ = try await log.save()
      savedTick += 1
      AccessibilityNotification.Announcement(String(localized: "manualLog.saved")).post()
      dismiss()
    } catch {
      failure = String(localized: "workout.finishError.generic")
    }
  }
}

// MARK: - Preview

#Preview("Ghi buổi tập") {
  Text(verbatim: "ManualLogView cần WorkoutFlow thật — xem Lab.")
}
