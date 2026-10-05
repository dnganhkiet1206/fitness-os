// Màn tập — C sở hữu UI (#276).
//
// Presentation layer thuần trên `WorkoutSessionController`:
//  - CHỈ gọi: toggle(key), setWeightText, setRepsText, setRest, setRpe, finish().
//  - CHỈ đọc: plan.rows, progress, phase, canFinish, unsaved, performed(row).
//  - Không database/sync/outbox trong View. Không tính volume trong View.
//  - Tick bị từ chối khi `!WorkoutDay.isReady` — controller đã chặn, View chỉ
//    phản ánh (disabled + lý do).
//  - `unsaved != nil` phải hiện ra: màn không được nói "đã lưu" khi chưa bền.
//
// Gom set theo bài thành một thẻ (baseline `day-plan.tsx`); plank nhập `45s`
// ở ô reps — `RepEntry.parse` ở tầng domain lo, View chỉ truyền chữ.
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

public struct WorkoutView: View {
  @Bindable var controller: WorkoutSessionController
  /// Key của set đang nghỉ sau khi tick — A8 (#272) nối `RestTimerController`
  /// vào đây. Nil thì không set nào hiện "đang nghỉ".
  var restingRowKey: String?

  @State private var weightTexts: [String: String] = [:]
  @State private var repsTexts: [String: String] = [:]
  @State private var finishMessage: String?
  /// Focus: weight → reps → done (#300).
  @FocusState private var focusedField: FieldFocus?
  /// Debounce ghi controller — tránh ghi mỗi phím gõ (#300).
  @State private var pendingWrites: [String: Task<Void, Never>] = [:]

  /// Ô nào đang focus.
  enum FieldFocus: Hashable {
    case weight(String)
    case reps(String)
  }

  public init(controller: WorkoutSessionController, restingRowKey: String? = nil) {
    self.controller = controller
    self.restingRowKey = restingRowKey
  }

  public var body: some View {
    NavigationStack {
      Group {
        switch controller.phase {
        case .loading:
          ProgressView(String(localized: "workout.loading"))
        case .idle, .active:
          workoutContent
        case .finished:
          finishedView
        }
      }
      .navigationTitle(controller.plan.templateName)
      .navigationBarTitleDisplayMode(.large)
    }
    .onAppear(perform: seedTexts)
    .alert(
      String(localized: "workout.finishError.title"),
      isPresented: Binding(
        get: { finishMessage != nil },
        set: { if !$0 { finishMessage = nil } }
      )
    ) {
      Button(String(localized: "workout.ok")) { finishMessage = nil }
    } message: {
      Text(finishMessage ?? "")
    }
  }

  // MARK: - Nội dung buổi tập

  private var workoutContent: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if controller.unsaved != nil {
          unsavedBanner
        }
        ForEach(exerciseGroups, id: \.key) { group in
          exerciseCard(group)
        }
        DSButton(
          String(localized: "workout.finish"),
          style: .primary,
          action: { Task { await doFinish() } }
        )
        .disabled(!controller.canFinish)
        .opacity(controller.canFinish ? 1 : 0.5)
        .padding(.top, DS.Spacing.sm)
      }
      .padding(DS.Spacing.md)
    }
  }

  /// Gom set theo bài, giữ đúng thứ tự kế hoạch (baseline `day-plan.tsx`).
  private var exerciseGroups: [(key: String, name: String, rows: [PlannedSet])] {
    var order: [String] = []
    var groups: [String: [PlannedSet]] = [:]
    for row in controller.plan.rows {
      let k = row.exerciseId ?? row.exerciseName
      if groups[k] == nil { order.append(k) }
      groups[k, default: []].append(row)
    }
    return order.compactMap { k in
      guard let rows = groups[k], let first = rows.first else { return nil }
      return (k, first.exerciseName, rows)
    }
  }

  private func exerciseCard(_ group: (key: String, name: String, rows: [PlannedSet])) -> some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Text(group.name)
          .font(DS.TextStyle.title2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        ForEach(group.rows) { row in
          setRow(row)
          if row.key != group.rows.last?.key {
            Divider()
          }
        }
      }
    }
  }

  // MARK: - Hàng set: chưa làm / đang nghỉ / xong

  private func setRow(_ row: PlannedSet) -> some View {
    let done = controller.progress.done[row.key] == true
    let ready = WorkoutDay.isReady(row, controller.progress)
    let performed = controller.performed(row)
    let resting = restingRowKey == row.key

    return VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: DS.Spacing.sm) {
        // Tick — controller từ chối khi chưa đủ (không tên/không reps).
        Button {
          Task { await controller.toggle(row.key) }
        } label: {
          Image(systemName: done ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 26))
            .foregroundStyle(
              done ? DS.Color.primary.swiftUI : DS.Color.mutedForeground.swiftUI
            )
            .frame(width: 44, height: 44)
        }
        .disabled(!ready && !done)
        .opacity((!ready && !done) ? 0.4 : 1)
        .accessibilityLabel(
          Text(
            done
              ? String(localized: "workout.untick")
              : ready
                ? String(localized: "workout.tick")
                : String(localized: "workout.notReady")
          )
        )

        Text("\(row.ordinal)/\(row.of)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 36)

        // Ô tạ / reps — gõ chữ, View debounce rồi truyền cho controller (#300).
        TextField("", text: weightBinding(for: row))
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .font(DS.TextStyle.body.monospacedDigit())
          .frame(width: 64, minHeight: 44)
          .padding(.horizontal, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
          .accessibilityLabel(Text(String(localized: "workout.weight")))
          .focused($focusedField, equals: .weight(row.key))
          .submitLabel(.next)
          .onSubmit {
            // Focus weight → reps (#300).
            focusedField = .reps(row.key)
          }

        Text("×")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)

        TextField("", text: repsBinding(for: row))
          .keyboardType(.numberPad)
          .multilineTextAlignment(.trailing)
          .font(DS.TextStyle.body.monospacedDigit())
          .frame(width: 64, minHeight: 44)
          .padding(.horizontal, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
          .accessibilityLabel(Text(String(localized: "workout.reps")))
          .focused($focusedField, equals: .reps(row.key))
          .submitLabel(.done)
          .onSubmit {
            // Done: flush ghi ngay + hạ bàn phím (#300).
            flushWrites()
            focusedField = nil
          }
          .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
              Spacer()
              Button(String(localized: "workout.done")) {
                flushWrites()
                focusedField = nil
              }
            }
          }

        Spacer(minLength: 0)
      }

      HStack(spacing: DS.Spacing.sm) {
        // Chip nghỉ.
        Menu {
          ForEach([30, 60, 90, 120, 180, 300], id: \.self) { s in
            Button("\(s)s") {
              Task { await controller.setRest(s, for: row.key) }
            }
          }
        } label: {
          Label(
            "\(WorkoutDay.restSeconds(row, controller.progress))s",
            systemImage: "timer"
          )
          .font(DS.TextStyle.footnote)
          .padding(.horizontal, DS.Spacing.sm)
          .frame(minHeight: 44)
          .background(DS.Color.secondary.swiftUI)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .clipShape(Capsule())
        }
        .accessibilityLabel(Text(String(localized: "workout.rest")))

        // Chip RPE.
        Menu {
          ForEach(1...10, id: \.self) { v in
            Button("RPE \(v)") {
              Task { await controller.setRpe(v, for: row.key) }
            }
          }
        } label: {
          Text("RPE \(controller.progress.rpe[row.key] ?? row.plannedRpe)")
            .font(DS.TextStyle.footnote)
            .padding(.horizontal, DS.Spacing.sm)
            .frame(minHeight: 44)
            .background(DS.Color.secondary.swiftUI)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .clipShape(Capsule())
        }
        .accessibilityLabel(Text("RPE"))

        if resting {
          Label(String(localized: "workout.resting"), systemImage: "hourglass")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.metricBlue.swiftUI)
        }

        Spacer(minLength: 0)
      }
      .padding(.leading, 52)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(rowVoiceOver(row, performed: performed, done: done)))
  }

  /// "Bench Press, hiệp 2 trên 3, 60 kg × 8, đã xong" (#276).
  private func rowVoiceOver(_ row: PlannedSet, performed: PerformedSet, done: Bool) -> String {
    String(
      format: String(localized: "workout.row.accessibility"),
      row.exerciseName, row.ordinal, row.of,
      Int(performed.weightKg), performed.reps,
      String(localized: done ? "workout.row.done" : "workout.row.notDone")
    )
  }

  // MARK: - Binding ô nhập (phản hồi tức thì, ghi bền debounce)

  /// Ghi debounce: huỷ lần ghi cũ, chờ 0.6s rồi mới gọi controller (#300).
  /// Gõ nhanh không spam controller; giá trị cuối cùng vẫn được ghi.
  private func scheduleWrite(key: String, write: @escaping () async -> Void) {
    pendingWrites[key]?.cancel()
    pendingWrites[key] = Task {
      try? await Task.sleep(nanoseconds: 600_000_000)
      guard !Task.isCancelled else { return }
      await write()
    }
  }

  /// Lọc chữ thập phân: chỉ số + một dấu chấm/phẩy (#300).
  private func filteredDecimal(_ text: String) -> String {
    var seenSeparator = false
    var result = ""
    for ch in text {
      if ch.isNumber {
        result.append(ch)
      } else if (ch == "." || ch == ",") && !seenSeparator {
        seenSeparator = true
        result.append(".")
      }
    }
    return result
  }

  /// Lọc số nguyên (reps): chỉ số.
  private func filteredInteger(_ text: String) -> String {
    text.filter(\.isNumber)
  }

  private func weightBinding(for row: PlannedSet) -> Binding<String> {
    Binding(
      get: { weightTexts[row.key] ?? "\(Int(row.weightKg))" },
      set: { new in
        let clean = filteredDecimal(new)
        weightTexts[row.key] = clean
        scheduleWrite(key: "w:\(row.key)") {
          await controller.setWeightText(clean, for: row.key)
        }
      }
    )
  }

  private func repsBinding(for row: PlannedSet) -> Binding<String> {
    Binding(
      get: { repsTexts[row.key] ?? "\(row.reps)" },
      set: { new in
        // Plank nhập "45s" ở ô reps — giữ chữ, `RepEntry.parse` ở domain lo.
        // Chỉ lọc khi là số thuần; chữ (như "45s") giữ nguyên.
        let clean = new.allSatisfy({ $0.isNumber }) ? filteredInteger(new) : new
        repsTexts[row.key] = clean
        scheduleWrite(key: "r:\(row.key)") {
          await controller.setRepsText(clean, for: row.key)
        }
      }
    )
  }

  /// Flush tất cả ghi đang chờ — gọi khi Done/hạ bàn phím (#300).
  private func flushWrites() {
    // Chỉ flush các field đang có ghi chờ — không ghi lại toàn bộ rows
    // (seedTexts đã điền mọi ô, ghi lại hết sẽ spam controller và có thể
    // ghi đè state đang bay).
    let pendingKeys = Array(pendingWrites.keys)
    for task in pendingWrites.values {
      task.cancel()
    }
    pendingWrites.removeAll()
    for pkey in pendingKeys {
      if pkey.hasPrefix("w:") {
        let key = String(pkey.dropFirst(2))
        if let w = weightTexts[key] {
          Task { await controller.setWeightText(w, for: key) }
        }
      } else if pkey.hasPrefix("r:") {
        let key = String(pkey.dropFirst(2))
        if let r = repsTexts[key] {
          Task { await controller.setRepsText(r, for: key) }
        }
      }
    }
  }

  private func seedTexts() {
    for row in controller.plan.rows {
      if weightTexts[row.key] == nil {
        weightTexts[row.key] = controller.progress.weightText[row.key] ?? "\(Int(row.weightKg))"
      }
      if repsTexts[row.key] == nil {
        repsTexts[row.key] = controller.progress.repsText[row.key] ?? "\(row.reps)"
      }
    }
  }

  // MARK: - Chưa bền / đã chốt

  private var unsavedBanner: some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(DS.Color.destructive.swiftUI)
      Text(String(localized: "workout.unsaved"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.foreground.swiftUI)
    }
    .padding(DS.Spacing.sm)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.destructive.swiftUI.opacity(0.12))
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
    .accessibilityLabel(Text(String(localized: "workout.unsaved")))
  }

  private var finishedView: some View {
    DSEmptyState(
      systemImage: "checkmark.circle.fill",
      title: String(localized: "workout.finished.title"),
      message: String(localized: "workout.finished.message")
    )
  }

  private func doFinish() async {
    do {
      _ = try await controller.finish()
    } catch let refusal as WorkoutSessionController.FinishRefusal {
      finishMessage = String(describing: refusal)
    } catch {
      finishMessage = error.localizedDescription
    }
  }
}

// MARK: - Preview (không cần A, không cần máy)

#if DEBUG
// Store tối thiểu cho Preview — `ASCNDTestSupport` không phải product nên
// app target không import được (lỗi của issue #276, A nhận).
private actor PreviewStore: WorkoutStore {
  var days: [String: DayState]
  var failSaves: Bool

  init(days: [String: DayState] = [:], failSaves: Bool = false) {
    self.days = days
    self.failSaves = failSaves
  }

  func loadDay(_ key: String) async throws -> DayState? { days[key] }

  func saveDay(_ key: String, _ state: DayState) async throws {
    struct Failed: Error {}
    if failSaves { throw Failed() }
    days[key] = state
  }

  func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    days[key] = state
    return true
  }
}

private struct WorkoutPreviewHost: View {
  enum Scenario { case idle, active, finished, unsaved }

  let scenario: Scenario
  let restingRowKey: String?
  @State private var controller: WorkoutSessionController?

  var body: some View {
    Group {
      if let controller {
        WorkoutView(controller: controller, restingRowKey: restingRowKey)
      } else {
        ProgressView()
      }
    }
    .task {
      controller = await WorkoutPreviewHost.make(scenario: scenario)
    }
  }

  static func make(scenario: Scenario) async -> WorkoutSessionController {
    let date = LocalDate("2026-10-05")!
    let rows = [
      PlannedSet(key: "bp1", exerciseName: "Bench Press", ordinal: 1, of: 3,
                 weightKg: 60, reps: 8, plannedRest: 90),
      PlannedSet(key: "bp2", exerciseName: "Bench Press", ordinal: 2, of: 3,
                 weightKg: 60, reps: 8, plannedRest: 90),
      PlannedSet(key: "bp3", exerciseName: "Bench Press", ordinal: 3, of: 3,
                 weightKg: 60, reps: 8, plannedRest: 90),
      PlannedSet(key: "pl1", exerciseName: "Plank", ordinal: 1, of: 2,
                 weightKg: 0, reps: 0, plannedRest: 60),
      PlannedSet(key: "pl2", exerciseName: "Plank", ordinal: 2, of: 2,
                 weightKg: 0, reps: 0, plannedRest: 60),
    ]
    let plan = WorkoutSessionController.Plan(
      date: date, templateId: "tpl-preview",
      templateName: "Ngực – Vai – Tay", rows: rows
    )
    let storeKey = DayProgressStore.key(date: date, templateId: "tpl-preview")
    let store: PreviewStore
    let controller: WorkoutSessionController

    switch scenario {
    case .idle:
      store = PreviewStore()
      controller = WorkoutSessionController(plan: plan, userId: "u1", store: store)
      await controller.load()
    case .active:
      // Tick sẵn 1 set để thấy trạng thái active.
      var progress = DayProgress()
      progress.done["bp1"] = true
      store = PreviewStore(days: [storeKey: DayState(progress: progress)])
      controller = WorkoutSessionController(plan: plan, userId: "u1", store: store)
      await controller.load()
    case .finished:
      store = PreviewStore(days: [
        storeKey: DayState(loggedSessionId: "session-preview")
      ])
      controller = WorkoutSessionController(plan: plan, userId: "u1", store: store)
      await controller.load()
    case .unsaved:
      // Lần ghi hỏng → unsaved hiện banner.
      store = PreviewStore(failSaves: true)
      controller = WorkoutSessionController(plan: plan, userId: "u1", store: store)
      await controller.load()
      _ = await controller.toggle("bp1")
    }
    return controller
  }
}

#Preview("idle — Light") {
  WorkoutPreviewHost(scenario: .idle, restingRowKey: nil)
    .preferredColorScheme(.light)
}
#Preview("idle — Dark") {
  WorkoutPreviewHost(scenario: .idle, restingRowKey: nil)
    .preferredColorScheme(.dark)
}
#Preview("active + resting — Light") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: "bp2")
    .preferredColorScheme(.light)
}
#Preview("active + resting — Dark") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: "bp2")
    .preferredColorScheme(.dark)
}
#Preview("finished") {
  WorkoutPreviewHost(scenario: .finished, restingRowKey: nil)
}
#Preview("unsaved") {
  WorkoutPreviewHost(scenario: .unsaved, restingRowKey: nil)
}
#Preview("Dynamic Type XXXL") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: nil)
    .dynamicTypeSize(.accessibility3)
}
#endif
