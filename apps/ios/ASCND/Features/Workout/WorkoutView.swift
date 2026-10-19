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
  /// Quãng nghỉ đang chạy — A8 nối `RestTimerController`. Nil thì không hiện thẻ nghỉ.
  var restTimer: RestTimer?
  var onAdjustRest: (Int) -> Void
  var onSkipRest: () -> Void
  var onSetRestPaused: (Bool) -> Void
  /// Trạng thái outbox — A8 nối `SyncWorker`. Mặc định `.ok` (không hiện).
  var outboxStatus: OutboxStatus
  /// Chốt / nối thêm qua tầng ứng dụng (`WorkoutFlow.finish` / `.append`):
  /// flow làm thêm việc mà controller không biết (ngày đã chốt ở chỗ khác vẫn
  /// là "đã tập"). `nil` = gọi thẳng controller (Preview, test).
  var onFinish: (@MainActor () async throws -> Void)?
  var onAppend: (@MainActor () async throws -> Void)?
  /// Mở lịch sử buổi tập. `nil` = không hiện nút (Preview, test).
  var onOpenHistory: (() -> Void)?
  /// Thu màn tập về trang gốc tab (lớp toàn màn hình, 14/10) — tiến độ giữ nguyên.
  var onClose: (() -> Void)?
  /// Ngày chưa tới (mở từ Kế hoạch tuần): "Đổi buổi khác". `nil` = không hiện.
  var onChangeWorkout: (() -> Void)?

  /// Dạng bảng (RN) thay cho "từng set một" — người dùng chọn ở menu ⋯, nhớ
  /// trên máy (#527, thiết kế lại 14/10).
  @AppStorage("ascnd.workout.tableLayout") private var tableLayout = false
  /// Bài người dùng chạm ở "Các bài trong buổi" — set kế tiếp lấy từ bài ấy.
  @State private var pinned: String?

  @State private var weightTexts: [String: String] = [:]
  @State private var repsTexts: [String: String] = [:]
  @State private var finishMessage: String?
  /// Focus: weight → reps → done (#300).
  @FocusState private var focusedField: FieldFocus?
  /// Debounce ghi controller — tránh ghi mỗi phím gõ (#300).
  @State private var pendingWrites: [String: Task<Void, Never>] = [:]
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.dynamicTypeSize) private var typeSize
  /// Đơn vị tạ của tài khoản (#527 1.9-B): ô tạ hiện và nhận số theo đơn vị
  /// này; controller đổi về kg (cùng đơn vị, `WorkoutFlow.setWeightUnit`).
  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  /// Ô nào đang focus.
  enum FieldFocus: Hashable {
    case weight(String)
    case reps(String)
    /// Tên của một bài thêm trong buổi (id bài).
    case name(String)
  }
  @State private var isFinishing = false
  /// Hàng đã nằm trong buổi đã chốt mà người dùng vừa bấm bỏ tích — chờ hỏi
  /// lại (RN `nRdUntickTitle`).
  @State private var untickTarget: PlannedSet?
  /// Lần gỡ gần nhất, còn trong cửa sổ hoàn tác 8 giây.
  @State private var removal: WorkoutSessionController.Removal?
  /// Tăng mỗi lần chốt / nối thêm thành công — kích phản hồi xúc giác.
  @State private var successTick = 0
  /// Luồng tập của phiên — mở màn ghi tay cho bài phát sinh sau khi đã ghi
  /// (`day-plan.tsx:2291`). `nil` (preview) = không có liên kết.
  @Environment(WorkoutFlow.self) private var flow: WorkoutFlow?
  @State private var showsManualLog = false

  public init(
    controller: WorkoutSessionController,
    restingRowKey: String? = nil,
    restTimer: RestTimer? = nil,
    onAdjustRest: @escaping (Int) -> Void = { _ in },
    onSkipRest: @escaping () -> Void = {},
    onSetRestPaused: @escaping (Bool) -> Void = { _ in },
    outboxStatus: OutboxStatus = .ok,
    onFinish: (@MainActor () async throws -> Void)? = nil,
    onAppend: (@MainActor () async throws -> Void)? = nil,
    onOpenHistory: (() -> Void)? = nil,
    onClose: (() -> Void)? = nil,
    onChangeWorkout: (() -> Void)? = nil
  ) {
    self.controller = controller
    self.restingRowKey = restingRowKey
    self.restTimer = restTimer
    self.onAdjustRest = onAdjustRest
    self.onSkipRest = onSkipRest
    self.onSetRestPaused = onSetRestPaused
    self.outboxStatus = outboxStatus
    self.onFinish = onFinish
    self.onAppend = onAppend
    self.onOpenHistory = onOpenHistory
    self.onClose = onClose
    self.onChangeWorkout = onChangeWorkout
  }

  public var body: some View {
    NavigationStack {
      Group {
        switch controller.phase {
        case .loading:
          ProgressView(String(localized: "workout.loading"))
        case .idle, .active:
          sessionContent
        case .finished:
          // Như RN: buổi đã chốt VẪN là danh sách hàng — bỏ tích một hàng đã
          // ghi để gỡ nó (có hoàn tác), tích thêm hàng để nối vào buổi.
          // Bản trước thay cả màn bằng một ô "Đã chốt", nên hai việc ấy chỉ
          // làm được trong Lab.
          workoutContent
        }
      }
      .navigationTitle(isPreview ? "" : controller.plan.templateName)
      .ascndPage()
      .sheet(isPresented: $reordering) {
        ExerciseOrderSheet(
          exercises: WorkoutFocus.exercises(controller.rows, controller.progress)
        ) { keys in
          Task { await controller.reorderExercises(keys) }
        }
      }
      .navigationBarTitleDisplayMode(.inline)
      // Một thanh "Xong" trên bàn phím cho cả màn — gắn trên từng ô reps thì
      // mỗi hàng góp một nút.
      .toolbar {
        if let onClose {
          ToolbarItem(placement: .topBarLeading) {
            Button(action: onClose) {
              Image(systemName: isPreview ? "xmark" : "chevron.down")
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(Text(isPreview ? "common.close" : "workout.minimize"))
          }
        }
        if !isPreview, !controller.isLogged || onOpenHistory != nil {
          ToolbarItem(placement: .topBarTrailing) {
            Menu {
              if !controller.isLogged, !controller.plan.rows.isEmpty {
                Button {
                  withAnimation(.snappy) { tableLayout.toggle() }
                } label: {
                  Label(
                    String(localized: tableLayout ? "ws.layout.focus" : "ws.layout.table"),
                    systemImage: tableLayout ? "rectangle.portrait" : "list.bullet")
                }
              }
              // Kéo thả thứ tự bài như Apple Music (19/10).
              if controller.canReorder, WorkoutFocus.exercises(controller.rows, controller.progress).count > 1 {
                Button {
                  reordering = true
                } label: {
                  Label(String(localized: "ws.reorder"), systemImage: "arrow.up.arrow.down")
                }
              }
              if let onOpenHistory {
                Button(action: onOpenHistory) {
                  Label(String(localized: "history.title"), systemImage: "clock.arrow.circlepath")
                }
              }
            } label: {
              Image(systemName: "ellipsis")
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(Text("ws.more"))
          }
        }
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button(String(localized: "workout.done")) {
            Task { await flushWrites() }
            focusedField = nil
          }
        }
      }
    }
    // Rời tiền cảnh (vào nền, bị kill sau đó): chữ đang chờ debounce phải
    // tới controller ngay, không đợi hết 0.6 s.
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { Task { await flushWrites() } }
    }
    // Cùng chỗ trên màn nhưng là buổi khác (sang ngày mới, kế hoạch đổi):
    // bộ đệm thuộc buổi cũ — bỏ, để ô đọc `progress` của buổi mới.
    .onChange(of: ObjectIdentifier(controller)) { _, _ in
      for task in pendingWrites.values { task.cancel() }
      pendingWrites.removeAll()
      weightTexts.removeAll()
      repsTexts.removeAll()
    }
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
    .alert(
      String(localized: "workout.untick.title"),
      isPresented: Binding(get: { untickTarget != nil }, set: { if !$0 { untickTarget = nil } }),
      presenting: untickTarget
    ) { row in
      Button(String(localized: "common.cancel"), role: .cancel) {}
      Button(String(localized: "workout.untick.confirm"), role: .destructive) {
        Task { await removeLogged(row) }
      }
    } message: { _ in
      Text(String(localized: "workout.untick.message"))
    }
    .sensoryFeedback(.success, trigger: successTick)
  }

  // MARK: - Nội dung buổi tập

  private var workoutContent: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if controller.unsaved != nil {
          unsavedBanner
        }
        if let removal {
          undoBar(removal)
        }
        SyncStrip(status: outboxStatus)
        if controller.rows.isEmpty {
          emptyView
          addExerciseButton
        } else {
          let exercises = WorkoutFocus.exercises(controller.rows, controller.progress)
          let next = WorkoutFocus.next(controller.rows, controller.progress, pinned: pinned)
          SessionProgressHeader(eyebrow: eyebrow, exercises: exercises, current: next.map(WorkoutFocus.exerciseKey))
            .padding(.horizontal, 4)
          if let timer = restTimer {
            RestStrip(timer: timer, onAdjust: onAdjustRest, onSkip: onSkipRest, onSetPaused: onSetRestPaused)
          }
          ForEach(exerciseGroups, id: \.key) { group in
            exerciseCard(group, next: next)
          }
          addExerciseButton
          finishButton
            .padding(.top, DS.Spacing.sm)
        }
      }
      .padding(DS.Spacing.md)
      .animation(.snappy, value: editingKey)
      .animation(.snappy, value: controller.progress.done)
    }
    .scrollDismissesKeyboard(.interactively)
  }

  // MARK: - Từng set một (#527, thiết kế lại 14/10)
  //
  // Mặc định: một thẻ lớn cho SET KẾ TIẾP (± thay bàn phím, "Xong set"), thẻ
  // nghỉ thay chỗ nó khi đang nghỉ, "Các bài trong buổi" để nhảy bài. Dạng
  // bảng của RN vẫn ở menu ⋯ và là dạng của buổi đã ghi (gỡ / nối thêm).

  private var today: LocalDate { flow?.today.today ?? LocalDate(SystemWallClock().nowMillis(), in: .current) }

  /// Ngày chưa tới mà chưa ghi: chỉ xem trước.
  private var isPreview: Bool {
    controller.isFuture && !controller.isLogged && !controller.plan.rows.isEmpty
  }

  private var showsTable: Bool {
    !isPreview && (tableLayout || controller.isLogged || controller.rows.isEmpty)
  }

  @ViewBuilder private var sessionContent: some View {
    if isPreview {
      previewContent
    } else if showsTable {
      workoutContent
    } else {
      focusContent
    }
  }

  private var eyebrow: String {
    let d = controller.plan.date
    return d == today
      ? String(localized: "wh.eyebrow \(WorkoutsHomeView.longWeekday(d))")
      : WorkoutsHomeView.longDay(d)
  }

  private var previewContent: some View {
    let rows = controller.plan.rows
    let p = controller.progress
    let d = controller.plan.date
    return ScrollView {
      WorkoutPreviewView(
        eyebrow: WorkoutsHomeView.longDay(d),
        name: controller.plan.templateName,
        meta: String(localized: "wh.meta \(WorkoutFocus.exercises(rows, p).count) \(rows.count) \(WorkoutFocus.minutes(rows, p))"),
        lines: WorkoutFocus.preview(rows, p),
        opensOn: WorkoutsHomeView.longWeekday(d),
        onChange: onChangeWorkout)
      .padding(DS.Spacing.md)
    }
  }

  private var focusContent: some View {
    let rows = controller.rows
    let exercises = WorkoutFocus.exercises(rows, controller.progress)
    let next = WorkoutFocus.next(rows, controller.progress, pinned: pinned)
    let current = next.map(WorkoutFocus.exerciseKey)
    let doneCount = exercises.reduce(0) { $0 + $1.done }
    let workingTotal = exercises.reduce(0) { $0 + $1.total }
    return ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        if controller.unsaved != nil { unsavedBanner }
        if let removal { undoBar(removal) }
        SyncStrip(status: outboxStatus)
        SessionProgressHeader(eyebrow: eyebrow, exercises: exercises, current: current)
          .padding(.horizontal, 4)

        if let timer = restTimer {
          FocusRestCard(
            timer: timer, next: next.map { nextLine($0) },
            onAdjust: onAdjustRest, onSkip: onSkipRest, onSetPaused: onSetRestPaused)
          .transition(.blurReplace)
          if let last = WorkoutFocus.lastDone(rows, controller.progress, before: next) {
            justDone(last)
          }
        } else if let next {
          focusCard(next, exercises: exercises)
            .id(next.key)
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
        } else {
          allDoneCard
        }

        if exercises.count > 1 {
          ExerciseQueue(exercises: exercises, current: current) { key in
            withAnimation(.snappy) { pinned = key }
          }
        }
        addExerciseButton

        if next != nil, controller.canFinish {
          outlineButton(
            isFinishing ? String(localized: "workout.finishing") : String(localized: "ws.finishEarly \(doneCount) \(workingTotal)")
          ) { Task { await doFinish() } }
          .disabled(isFinishing)
        }
      }
      .padding(DS.Spacing.md)
      .padding(.bottom, DS.Spacing.lg)
      .animation(.snappy, value: next?.key)
      .animation(.snappy, value: restTimer == nil)
    }
    .scrollDismissesKeyboard(.interactively)
    .sensoryFeedback(.impact(weight: .medium), trigger: doneCount)
  }

  private func focusCard(_ row: PlannedSet, exercises: [WorkoutFocus.Exercise]) -> some View {
    let key = WorkoutFocus.exerciseKey(row)
    let index = exercises.firstIndex { $0.key == key } ?? 0
    let group = (key: key, name: row.exerciseName, rows: index < exercises.count ? exercises[index].rows : [row])
    let ready = WorkoutDay.isReady(row, controller.progress)
    let editable = controller.canEdit(row.key)
    // Gợi ý tạ cho ô trống: set trước của CHÍNH bài này hôm nay, không thì
    // mức tạ (ngoài, không gồm thân) của buổi gần nhất có bài.
    let previous = previousWeight(row, in: group.rows)
    let hint = previous ?? flow?.insights?.history(for: row.exerciseName).last?.bestWeightKg.map { unit.seed($0) } ?? ""
    return VStack(alignment: .leading, spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: DS.Spacing.sm) {
          Text(eyebrow(row, exercise: index + 1, of: exercises.count))
            .font(DS.TextStyle.caption.weight(.semibold).monospacedDigit())
            .textCase(.uppercase)
            .tracking(0.6)
            .foregroundStyle(WorkoutsHomeView.accent)
          if controller.isWarmup(row.key) {
            Text(String(localized: "ws.warmup"))
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.readinessYellow.swiftUI)
              .padding(.horizontal, 8)
              .padding(.vertical, 2)
              .background(DS.Color.readinessYellow.swiftUI.opacity(0.14), in: Capsule())
          }
        }
        exerciseTitle(group)
        if let flow, let insights = flow.insights {
          ExerciseProgressRow(insights: insights, today: flow.today, name: row.exerciseName)
        }
      }

      let weight = weightBinding(for: row)
      FocusStepper(
        text: weight, unitLabel: unit.label,
        name: String(localized: "workout.weight.unit \(unit.label)"), editable: editable,
        keyboard: .decimalPad, placeholder: "0", focus: $focusedField, field: .weight(row.key)
      ) { WorkoutFocus.stepWeight($0, by: $1, unit: unit, hint: hint) }
      // Ô trống mà lần trước có tạ: một chạm để lấy lại mức ấy. Không điền
      // ngầm — ô trống là bodyweight, ghi 0 kg; chữ mờ "15" sẽ nói dối.
      if weight.wrappedValue.isEmpty, !hint.isEmpty, editable {
        Button {
          weight.wrappedValue = hint
        } label: {
          Label(
            previous != nil
              ? String(localized: "ws.usePrevious \(hint) \(unit.label)")
              : String(localized: "ws.useLast \(hint) \(unit.label)"),
            systemImage: "arrow.uturn.backward")
            .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
            .foregroundStyle(WorkoutsHomeView.accent)
            .frame(maxWidth: .infinity, minHeight: 36)
        }
        .buttonStyle(.plain)
        .padding(.top, -DS.Spacing.sm)
      }
      FocusStepper(
        text: repsBinding(for: row), unitLabel: String(localized: "ws.reps.unit"),
        name: String(localized: "workout.reps"), editable: editable,
        keyboard: .numbersAndPunctuation, placeholder: "0", focus: $focusedField, field: .reps(row.key)
      ) { WorkoutFocus.stepReps($0, by: $1) }

      HStack(spacing: DS.Spacing.sm) {
        restMenu(row)
        rpeMenu(row)
        Spacer(minLength: 0)
        if let id = row.adHoc {
          addSetButton(id, count: group.rows.count)
        }
      }

      Button {
        Task {
          focusedField = nil
          await flushWrites()
          await controller.toggle(row.key)
        }
      } label: {
        Label(String(localized: "ws.doneSet"), systemImage: "checkmark")
          .font(DS.TextStyle.headline)
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 54)
          .background(WorkoutsHomeView.accent, in: Capsule())
      }
      .buttonStyle(TodayPressStyle())
      .disabled(!ready || !editable)
      .opacity(ready && editable ? 1 : 0.45)
      .accessibilityLabel(Text(tickLabel(row, performed: controller.performed(row), done: false, ready: ready)))
    }
    .padding(DS.Spacing.card)
    .todayCard()
  }

  /// "15 kg × 10" / "45s" / "10 reps" — chữ đọc của một set.
  private func setText(_ row: PlannedSet) -> String {
    let p = controller.performed(row)
    let reps = p.durationSec.map { "\($0)s" } ?? "\(p.reps)"
    guard p.weightKg > 0 else { return p.durationSec == nil ? String(localized: "xi.reps.other \(p.reps)") : reps }
    return "\(unit.localizedLoad(p.weightKg, locale: locale) ?? unit.load(p.weightKg)) × \(reps)"
  }

  private func nextLine(_ row: PlannedSet) -> String {
    let n = number(row)
    let line = n.warmup
      ? String(localized: "ws.rest.nextWarmup \(row.exerciseName) \(n.n)")
      : String(localized: "ws.rest.nextLine \(row.exerciseName) \(n.n) \(n.of)")
    return line + " · " + setText(row)
  }

  /// Set vừa xong, dưới thẻ nghỉ — "Sửa" bỏ tích nó (huỷ quãng nghỉ) để thẻ
  /// set quay lại đúng set ấy với số đang có.
  private func justDone(_ row: PlannedSet) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Image(systemName: "checkmark.circle.fill")
        .foregroundStyle(WorkoutsHomeView.accent)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(String(localized: "ws.justDone"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(row.exerciseName) · \(setText(row))")
          .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
          .lineLimit(1)
      }
      Spacer(minLength: DS.Spacing.sm)
      if controller.canEdit(row.key) {
        Button(String(localized: "ws.edit")) {
          Task {
            await flushWrites()
            await controller.toggle(row.key)
          }
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(WorkoutsHomeView.accent)
        .frame(minHeight: 44)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, DS.Spacing.sm)
    .todayCard()
  }

  private var allDoneCard: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "checkmark.seal.fill")
        .font(.system(size: 48))
        .foregroundStyle(WorkoutsHomeView.accent.gradient)
        .symbolEffect(.bounce, value: controller.progress.done.count)
        .accessibilityHidden(true)
      VStack(spacing: 4) {
        Text(String(localized: "ws.allDone.title"))
          .font(DS.TextStyle.title2)
        Text(String(localized: "ws.allDone.lead"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
      finishButton
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity)
    .todayCard()
  }

  private func accentButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(DS.TextStyle.headline)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 54)
        .background(WorkoutsHomeView.accent, in: Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }

  private func outlineButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 50)
        .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.15)))
        .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
  }

  /// Gom set theo bài, giữ đúng thứ tự kế hoạch (baseline `day-plan.tsx`).
  private var exerciseGroups: [(key: String, name: String, rows: [PlannedSet])] {
    var order: [String] = []
    var groups: [String: [PlannedSet]] = [:]
    for row in controller.rows {
      let k = WorkoutFocus.exerciseKey(row)
      if groups[k] == nil { order.append(k) }
      groups[k, default: []].append(row)
    }
    return order.compactMap { k in
      guard let rows = groups[k], let first = rows.first else { return nil }
      return (k, first.exerciseName, rows)
    }
  }

  /// Sheet kéo thả thứ tự bài đang mở.
  @State private var reordering = false

  /// Bài đang mở hướng dẫn (`day-plan.tsx:1784`).
  @State private var guideTarget: GuideTarget?

  // MARK: - Dạng bảng (phương án A, chủ dự án chọn 14/10)
  //
  // Mỗi bài một thẻ. Set đã xong / chưa tới là MỘT DÒNG chữ ("✓ 15 kg × 10 ·
  // RPE 7"); chỉ một set MỞ ra để nhập — set kế tiếp, hay set người dùng chạm.
  // Bài không chứa set kế tiếp thu thành một dòng tóm tắt, chạm để mở.

  /// Set đang mở để sửa (người dùng chạm). `nil` = set kế tiếp.
  @State private var editingKey: String?
  /// Bài người dùng mở tay (bài không chứa set kế tiếp mặc định thu gọn).
  @State private var openGroups: Set<String> = []

  private func exerciseCard(_ group: (key: String, name: String, rows: [PlannedSet]), next: PlannedSet?) -> some View {
    // Đếm set làm việc — khởi động không vào "x/y" (18/10).
    let work = group.rows.filter { !controller.isWarmup($0.key) }
    let done = work.filter { controller.progress.done[$0.key] == true }.count
    let holdsNext = next.map { WorkoutFocus.exerciseKey($0) == group.key } ?? false
    let editing = editingKey.flatMap { k in group.rows.first { $0.key == k } }
    let open = holdsNext || editing != nil || openGroups.contains(group.key) || controller.isLogged
    let editor = editing ?? (holdsNext && !controller.isLogged ? next : nil)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.sm) {
        exerciseTitle(group)
        Spacer(minLength: DS.Spacing.sm)
        Text(verbatim: "\(done)/\(work.count)")
          .font(DS.TextStyle.mono(.footnote))
          .foregroundStyle(done == work.count ? WorkoutsHomeView.accent : DS.Color.mutedForeground.swiftUI)
        if !holdsNext, !controller.isLogged {
          Button {
            withAnimation(.snappy) {
              if openGroups.contains(group.key) { openGroups.remove(group.key) } else { openGroups.insert(group.key) }
            }
          } label: {
            Image(systemName: open ? "chevron.up" : "chevron.down")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(minWidth: 44, minHeight: 44)
          }
          .accessibilityLabel(Text(open ? "ws.collapse" : "ws.expand"))
        }
      }
      if open {
        // "Lần trước" — thứ đọc TRƯỚC khi làm một hiệp (`day-plan.tsx:1876`).
        if let flow, let insights = flow.insights {
          ExerciseProgressRow(insights: insights, today: flow.today, name: group.name)
        }
        VStack(spacing: 0) {
          ForEach(group.rows) { row in
            if row.key == editor?.key {
              setEditor(row, group: group)
                .padding(.vertical, DS.Spacing.xs)
                .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
            } else {
              setLine(row)
            }
          }
        }
        if let id = group.rows.first?.adHoc {
          addSetButton(id, count: group.rows.count)
        }
      } else {
        Text(verbatim: groupSummary(group.rows))
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .padding(DS.Spacing.card)
    .todayCard()
  }

  /// "3 × 12 · 12 kg · nghỉ 60s" cho bài đang thu gọn.
  private func groupSummary(_ rows: [PlannedSet]) -> String {
    guard let first = rows.first else { return "" }
    let p = controller.performed(first)
    var parts = ["\(rows.count) × \(p.durationSec.map { "\($0)s" } ?? "\(p.reps)")"]
    if p.weightKg > 0 { parts.append(unit.localizedLoad(p.weightKg, locale: locale) ?? unit.load(p.weightKg)) }
    parts.append(String(localized: "ws.preview.rest \(WorkoutDay.restSeconds(first, controller.progress))"))
    return parts.joined(separator: " · ")
  }

  /// Một set gọn: vòng tick + "15 kg × 10" + RPE. Chạm chữ để mở ô nhập.
  private func setLine(_ row: PlannedSet) -> some View {
    let done = controller.progress.done[row.key] == true
    let ready = WorkoutDay.isReady(row, controller.progress)
    let performed = controller.performed(row)
    return HStack(spacing: 12) {
      Button {
        if controller.canRemove(row.key) {
          untickTarget = row
          return
        }
        Task {
          await flushWrites()
          await controller.toggle(row.key)
        }
      } label: {
        ZStack {
          Circle()
            .fill(done ? WorkoutsHomeView.accent : Color.clear)
          Circle()
            .strokeBorder(done ? WorkoutsHomeView.accent : DS.Color.mutedForeground.swiftUI.opacity(0.5), lineWidth: 1.5)
          if done {
            Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(.white)
          } else {
            if controller.isWarmup(row.key) {
              // Set khởi động: ngọn lửa, không số (18/10) — như màn ghi tay.
              Image(systemName: "flame.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(DS.Color.metricRose.swiftUI)
            } else {
              Text(verbatim: "\(number(row).n)")
                .font(DS.TextStyle.mono(.caption))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
          }
        }
        .frame(width: 30, height: 30)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!ready && !done)
      .accessibilityLabel(Text(tickLabel(row, performed: performed, done: done, ready: ready)))
      .accessibilityAddTraits(done ? [.isButton, .isSelected] : .isButton)

      Button {
        guard controller.canEdit(row.key) else { return }
        withAnimation(.snappy) { editingKey = row.key }
      } label: {
        HStack(spacing: DS.Spacing.sm) {
          Text(verbatim: setText(row))
            .font(DS.TextStyle.body.monospacedDigit().weight(done ? .semibold : .regular))
            .foregroundStyle(done ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          if controller.isWarmup(row.key) {
            Text(String(localized: "ws.warmup"))
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.readinessYellow.swiftUI)
          }
          Spacer(minLength: DS.Spacing.sm)
          Text(verbatim: "RPE \(controller.progress.rpe[row.key] ?? row.plannedRpe)")
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          if restingRowKey == row.key {
            Image(systemName: "hourglass").font(.caption).foregroundStyle(DS.Color.metricBlue.swiftUI)
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(verbatim: setTitle(row, done: true)))
      .accessibilityValue(Text(verbatim: setText(row)))
    }
  }

  /// Set đang mở: ± tạ / reps, nghỉ, RPE, "Xong set N" — cùng ô với thẻ set.
  private func setEditor(_ row: PlannedSet, group: (key: String, name: String, rows: [PlannedSet])) -> some View {
    let done = controller.progress.done[row.key] == true
    let ready = WorkoutDay.isReady(row, controller.progress)
    let editable = controller.canEdit(row.key)
    let previous = previousWeight(row, in: group.rows)
    let hint = previous ?? flow?.insights?.history(for: row.exerciseName).last?.bestWeightKg.map { unit.seed($0) } ?? ""
    let weight = weightBinding(for: row)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack {
        Text(verbatim: setTitle(row, done: done))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(WorkoutsHomeView.accent)
        Spacer()
        if editingKey != nil {
          Button(String(localized: "workout.done")) {
            Task { await flushWrites() }
            focusedField = nil
            withAnimation(.snappy) { editingKey = nil }
          }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(WorkoutsHomeView.accent)
          .frame(minHeight: 44)
        }
      }
      HStack(spacing: DS.Spacing.sm) {
        FocusStepper(
          text: weight, unitLabel: unit.label,
          name: String(localized: "workout.weight.unit \(unit.label)"), editable: editable,
          keyboard: .decimalPad, placeholder: "0", focus: $focusedField, field: .weight(row.key), compact: true
        ) { WorkoutFocus.stepWeight($0, by: $1, unit: unit, hint: hint) }
        FocusStepper(
          text: repsBinding(for: row), unitLabel: String(localized: "ws.reps.unit"),
          name: String(localized: "workout.reps"), editable: editable,
          keyboard: .numbersAndPunctuation, placeholder: "0", focus: $focusedField, field: .reps(row.key), compact: true
        ) { WorkoutFocus.stepReps($0, by: $1) }
      }
      if weight.wrappedValue.isEmpty, !hint.isEmpty, editable {
        Button {
          weight.wrappedValue = hint
        } label: {
          Label(
            previous != nil
              ? String(localized: "ws.usePrevious \(hint) \(unit.label)")
              : String(localized: "ws.useLast \(hint) \(unit.label)"),
            systemImage: "arrow.uturn.backward")
            .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
            .foregroundStyle(WorkoutsHomeView.accent)
            .frame(maxWidth: .infinity, minHeight: 36)
        }
        .buttonStyle(.plain)
      }
      HStack(spacing: DS.Spacing.sm) {
        restMenu(row)
        rpeMenu(row)
        warmupToggle(row, editable: editable)
        Spacer(minLength: 0)
      }
      if !done {
        Button {
          Task {
            focusedField = nil
            await flushWrites()
            await controller.toggle(row.key)
            editingKey = nil
          }
        } label: {
          Label(doneLabel(row), systemImage: "checkmark")
            .font(DS.TextStyle.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(WorkoutsHomeView.accent, in: Capsule())
        }
        .buttonStyle(TodayPressStyle())
        .disabled(!ready || !editable)
        .opacity(ready && editable ? 1 : 0.45)
        .accessibilityLabel(Text(tickLabel(row, performed: controller.performed(row), done: false, ready: ready)))
      }
    }
    .padding(DS.Spacing.md)
    .background(WorkoutsHomeView.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
  }

  /// Chạm tên bài để biết về bài ấy: tên + glyph ⓘ là MỘT control. Bài thêm
  /// tay không có lối này — tên chưa có trong thư viện thì không có hướng dẫn.
  /// Id lấy từ hàng đầu của khối; thiếu (template cũ) thì lõi lùi về tên.
  /// Đầu một bài: ẢNH của bài + tên + "Tay trước · Tạ đơn" (14/10, chủ dự
  /// án duyệt phương án A). Ảnh và tên cùng là MỘT nút mở hướng dẫn; dấu ▶
  /// khi bài có video. Bài thêm tay / không có hướng dẫn: chữ cái đầu, không
  /// bấm được — tên chưa có trong thư viện thì không có hướng dẫn.
  @ViewBuilder private func exerciseTitle(_ group: (key: String, name: String, rows: [PlannedSet])) -> some View {
    let first = group.rows.first
    let lang = MuscleGroup.Language(locale: locale)
    if let id = first?.adHoc {
      adHocHeader(id, name: group.name)
    } else if let guides = flow?.guides, let first, first.adHoc == nil {
      let thumb = guides.thumbnail(exerciseId: first.exerciseId, name: group.name, lang: lang)
      Button {
        guideTarget = GuideTarget(key: group.key, exerciseId: first.exerciseId, name: group.name)
      } label: {
        HStack(spacing: DS.Spacing.sm) {
          ExerciseThumb(name: group.name, thumbnail: thumb, linked: true)
          VStack(alignment: .leading, spacing: 2) {
            Text(group.name)
              .font(DS.TextStyle.title2)
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .multilineTextAlignment(.leading)
            if let meta = thumb?.meta {
              Text(verbatim: meta)
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(1)
            }
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "eg.open.a11y \(group.name)")))
      .accessibilityAddTraits(.isHeader)
      .task(id: group.key) { await guides.peek(exerciseId: first.exerciseId, name: group.name, lang: lang) }
      .sheet(item: Binding(
        get: { guideTarget?.key == group.key ? guideTarget : nil },
        set: { guideTarget = $0 }
      )) { t in
        ExerciseGuideView(guides: guides, library: flow?.library, exerciseId: t.exerciseId, name: t.name)
      }
    } else {
      HStack(spacing: DS.Spacing.sm) {
        ExerciseThumb(name: group.name, thumbnail: nil, linked: false)
        Text(group.name)
          .font(DS.TextStyle.title2)
          .foregroundStyle(DS.Color.foreground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
    }
  }


  // MARK: - Bài / set thêm trong buổi (#527, 14/10 — RN `nRdAddExercise` / `nRdAddSet`)

  /// Chữ tên bài thêm đang chờ debounce (như ô tạ / reps).
  @State private var nameTexts: [String: String] = [:]

  /// "+ Bài tập khác": thêm một bài trống một hiệp, nhảy tới nó, đặt con trỏ
  /// vào ô tên (`addExercise`, `day-plan.tsx:987`).
  @ViewBuilder private var addExerciseButton: some View {
    if !isPreview, controller.loaded {
      Button {
        Task {
          await flushWrites()
          guard let id = await controller.addExercise() else { return }
          withAnimation(.snappy) { pinned = "x:\(id)" }
          try? await Task.sleep(for: .milliseconds(250))
          focusedField = .name(id)
        }
      } label: {
        Label(String(localized: "ws.addExercise"), systemImage: "plus")
          .font(DS.TextStyle.headline)
          .foregroundStyle(WorkoutsHomeView.accent)
          .frame(maxWidth: .infinity, minHeight: 50)
          .overlay(
            Capsule().strokeBorder(WorkoutsHomeView.accent.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
          .contentShape(Capsule())
      }
      .buttonStyle(TodayPressStyle())
    }
  }

  /// "+ Thêm set" của một bài thêm (trần 20, `addSet`).
  @ViewBuilder private func addSetButton(_ id: String, count: Int) -> some View {
    if count < WorkoutPlanning.maxSets {
      Button {
        Task { await controller.addSet(to: id) }
      } label: {
        Label(String(localized: "ws.addSet"), systemImage: "plus")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(WorkoutsHomeView.accent)
          .frame(minHeight: 44)
      }
      .buttonStyle(.plain)
    }
  }

  /// Đầu một bài thêm: ô tên (chưa có tên thì chưa tick được — `rowReady`)
  /// + nút bỏ bài. Bài đã có set nằm trong buổi đã ghi: chỉ đọc.
  private func adHocHeader(_ id: String, name: String) -> some View {
    let locked = controller.adHocLocked(id)
    let binding = Binding<String>(
      get: { nameTexts[id] ?? controller.progress.extra.first { $0.id == id }?.name ?? name },
      set: { new in
        nameTexts[id] = new
        scheduleWrite(key: "n:\(id)") {
          await controller.renameExercise(id, to: new)
          if nameTexts[id] == new { nameTexts[id] = nil }
        }
      })
    return HStack(spacing: DS.Spacing.sm) {
      ExerciseThumb(name: binding.wrappedValue.isEmpty ? "+" : binding.wrappedValue, thumbnail: nil, linked: false)
      TextField(String(localized: "ws.exerciseName"), text: binding)
        .font(DS.TextStyle.title2)
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .focused($focusedField, equals: .name(id))
        .disabled(locked)
        .onSubmit { Task { await flushWrites() } }
        .accessibilityLabel(Text("ws.exerciseName"))
      if !locked {
        Button {
          Task {
            await flushWrites()
            await controller.removeExercise(id)
            if pinned == "x:\(id)" { pinned = nil }
          }
        } label: {
          Image(systemName: "trash")
            .font(.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text("ws.removeExercise"))
      }
    }
  }

  /// Chip nghỉ của một hàng (dạng bảng và thẻ set).
  private func restMenu(_ row: PlannedSet) -> some View {
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
      .fixedSize()
      .padding(.horizontal, DS.Spacing.sm)
      .frame(minHeight: 44)
      .background(DS.Color.secondary.swiftUI)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .clipShape(Capsule())
    }
    .accessibilityLabel(Text(String(localized: "workout.rest")))
  }

  /// Chip RPE của một hàng.
  private func rpeMenu(_ row: PlannedSet) -> some View {
    Menu {
      ForEach(1...10, id: \.self) { v in
        Button("RPE \(v)") {
          Task { await controller.setRpe(v, for: row.key) }
        }
      }
    } label: {
      Text("RPE \(controller.progress.rpe[row.key] ?? row.plannedRpe)")
        .font(DS.TextStyle.footnote)
        .fixedSize()
        .padding(.horizontal, DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.secondary.swiftUI)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .clipShape(Capsule())
    }
    .accessibilityLabel(Text("RPE"))
  }

  /// Label nút tick: thông tin hàng + hành động (#276, #278).
  /// "Bench Press, hiệp 2 trên 3, 60 kg × 8, đã xong. Bỏ đánh dấu."
  private func tickLabel(
    _ row: PlannedSet, performed: PerformedSet, done: Bool, ready: Bool
  ) -> String {
    let summary = rowVoiceOver(row, performed: performed, done: done)
    let action = String(
      localized: done ? "workout.untick" : ready ? "workout.tick" : "workout.notReady"
    )
    return "\(summary). \(action)"
  }

  // MARK: - Số set (18/10: set khởi động đếm riêng)

  /// Hàng của bài chứa `row`, đúng thứ tự.
  private func rowsOfExercise(_ row: PlannedSet) -> [PlannedSet] {
    let k = WorkoutFocus.exerciseKey(row)
    return controller.rows.filter { WorkoutFocus.exerciseKey($0) == k }
  }

  /// Số của hàng trong bài: khởi động 1…w, set làm việc 1…n (bỏ qua khởi động).
  private func number(_ row: PlannedSet) -> (warmup: Bool, n: Int, of: Int) {
    let p = controller.progress
    let rows = rowsOfExercise(row)
    let warm = WorkoutDay.isWarmup(row, p)
    let same = rows.filter { WorkoutDay.isWarmup($0, p) == warm }
    let n = (same.firstIndex { $0.key == row.key } ?? 0) + 1
    return (warm, n, same.count)
  }

  private func eyebrow(_ row: PlannedSet, exercise: Int, of total: Int) -> String {
    let n = number(row)
    return n.warmup
      ? String(localized: "ws.focus.eyebrow.warmup \(exercise) \(total) \(n.n)")
      : String(localized: "ws.focus.eyebrow \(exercise) \(total) \(n.n) \(n.of)")
  }

  private func setTitle(_ row: PlannedSet, done: Bool) -> String {
    let n = number(row)
    switch (n.warmup, done) {
    case (true, true): return String(localized: "ws.editingWarmup \(n.n)")
    case (true, false): return String(localized: "ws.nextWarmup \(n.n)")
    case (false, true): return String(localized: "ws.editingSet \(n.n)")
    case (false, false): return String(localized: "ws.nextSet \(n.n)")
    }
  }

  private func doneLabel(_ row: PlannedSet) -> String {
    let n = number(row)
    return n.warmup ? String(localized: "ws.doneWarmupN \(n.n)") : String(localized: "ws.doneSetN \(n.n)")
  }

  /// Gợi ý tạ: set trước CÙNG LOẠI của bài này hôm nay — set làm việc đầu
  /// không lấy tạ nhẹ của set khởi động.
  private func previousWeight(_ row: PlannedSet, in rows: [PlannedSet]) -> String? {
    let p = controller.progress
    guard let i = rows.firstIndex(where: { $0.key == row.key }) else { return nil }
    let warm = WorkoutDay.isWarmup(row, p)
    return rows[..<i].last { WorkoutDay.isWarmup($0, p) == warm && !(p.weightText[$0.key] ?? "").isEmpty }
      .flatMap { p.weightText[$0.key] }
  }

  /// Bật / tắt set khởi động của set đang mở.
  private func warmupToggle(_ row: PlannedSet, editable: Bool) -> some View {
    let on = controller.isWarmup(row.key)
    let rose = DS.Color.metricRose.swiftUI
    return Button {
      Task { await controller.toggleWarmup(row.key) }
    } label: {
      Label(String(localized: "ws.warmup"), systemImage: on ? "flame.fill" : "flame")
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(on ? Color.white : rose)
        .padding(.horizontal, DS.Spacing.sm + 2)
        .frame(minHeight: 36)
        .background(on ? rose : rose.opacity(0.12), in: Capsule())
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!editable)
    .accessibilityLabel(Text(String(localized: "manualLog.warmup")))
    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
  }

  /// "Bench Press, hiệp 2 trên 3, 60 kg × 8, đã xong" (#276).
  private func rowVoiceOver(_ row: PlannedSet, performed: PerformedSet, done: Bool) -> String {
    String(
      format: String(localized: "workout.row.accessibility"),
      row.exerciseName, number(row).n, number(row).of,
      a11yLoad(performed.weightKg), performed.reps,
      String(localized: done ? "workout.row.done" : "workout.row.notDone")
    )
  }

  // MARK: - Binding ô nhập (phản hồi tức thì, ghi bền debounce)
  //
  // Nguồn sự thật là `controller.progress` (bền, đã nạp lại sau kill, đã qua
  // `NumberInput.decimal`). `weightTexts` / `repsTexts` CHỈ là bộ đệm của chữ
  // đang chờ debounce: có thì hiện nó, ghi xong thì bỏ. Bản trước chép
  // `progress` vào bộ đệm một lần ở `onAppear` — mà `WorkoutFlow` đưa buổi ra
  // TRƯỚC khi `load()` xong, và nạp lại buổi sau khi xoá từ lịch sử — nên ô
  // giữ số kế hoạch / số cũ trong khi controller (và lượt chốt) dùng số khác.

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
      get: {
        weightTexts[row.key] ?? controller.progress.weightText[row.key]
          ?? unit.seed(row.weightKg)
      },
      set: { new in
        let clean = filteredDecimal(new)
        weightTexts[row.key] = clean
        scheduleWrite(key: "w:\(row.key)") {
          await controller.setWeightText(clean, for: row.key)
          if weightTexts[row.key] == clean { weightTexts[row.key] = nil }
        }
      }
    )
  }

  private func repsBinding(for row: PlannedSet) -> Binding<String> {
    Binding(
      get: {
        repsTexts[row.key] ?? controller.progress.repsText[row.key]
          ?? NumberInput.plannedReps(row.reps)
      },
      set: { new in
        // Plank nhập "45s" ở ô reps — giữ chữ, `RepEntry.parse` ở domain lo.
        // Chỉ lọc khi là số thuần; chữ (như "45s") giữ nguyên.
        let clean = new.allSatisfy({ $0.isNumber }) ? filteredInteger(new) : new
        repsTexts[row.key] = clean
        scheduleWrite(key: "r:\(row.key)") {
          await controller.setRepsText(clean, for: row.key)
          if repsTexts[row.key] == clean { repsTexts[row.key] = nil }
        }
      }
    )
  }

  /// Flush tất cả ghi đang chờ, CHỜ tới khi controller nhận xong: gọi trước
  /// tick / finish, khi Done / hạ bàn phím, và khi rời tiền cảnh (#300).
  private func flushWrites() async {
    // Chỉ flush các field đang có ghi chờ — không ghi lại toàn bộ rows
    // (ghi lại hết sẽ spam controller và có thể ghi đè state đang bay).
    // Ghi xong thì bỏ bộ đệm: từ đó ô đọc `controller.progress`.
    let pendingKeys = Array(pendingWrites.keys)
    for task in pendingWrites.values {
      task.cancel()
    }
    pendingWrites.removeAll()
    for pkey in pendingKeys {
      if pkey.hasPrefix("w:") {
        let key = String(pkey.dropFirst(2))
        if let w = weightTexts[key] {
          await controller.setWeightText(w, for: key)
          if weightTexts[key] == w { weightTexts[key] = nil }
        }
      } else if pkey.hasPrefix("r:") {
        let key = String(pkey.dropFirst(2))
        if let r = repsTexts[key] {
          await controller.setRepsText(r, for: key)
          if repsTexts[key] == r { repsTexts[key] = nil }
        }
      } else if pkey.hasPrefix("n:") {
        let id = String(pkey.dropFirst(2))
        if let n = nameTexts[id] {
          await controller.renameExercise(id, to: n)
          if nameTexts[id] == n { nameTexts[id] = nil }
        }
      }
    }
  }

  // MARK: - Trạng thái rỗng / đang chốt / đã chốt

  private var emptyView: some View {
    DSEmptyState(
      systemImage: "dumbbell",
      title: String(localized: "workout.empty.title"),
      message: String(localized: "workout.empty.message")
    )
  }

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

  /// Nút cuối danh sách — bốn trạng thái như RN (`day-plan.tsx` nút finish):
  /// nối thêm (có hàng mới sau khi chốt), đã ghi, ngày chưa tới, hoàn thành.
  @ViewBuilder private var finishButton: some View {
    if controller.isLogged, !controller.pendingRows.isEmpty {
      DSButton(String(localized: "workout.append"), style: .secondary, action: { Task { await doAppend() } })
        .disabled(!controller.canAppend || isFinishing)
        .opacity(controller.canAppend && !isFinishing ? 1 : 0.5)
    } else if controller.isLogged {
      // Không phải một nút tắt mang chữ cũ: nói điều đã xảy ra (RN nRdAlready).
      Label(String(localized: "workout.finishError.alreadyLogged"), systemImage: "checkmark.circle.fill")
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.readinessGreen.swiftUI)
        .frame(maxWidth: .infinity, minHeight: 48)
      // Đã ghi mà còn bài PHÁT SINH: chỉ chỗ đi tiếp (`nRdExtra`) — luật
      // một-lần-lưu giữ nguyên, sổ ghi tay nhận buổi thứ hai.
      if let flow {
        Button(String(localized: "manualLog.extra")) { showsManualLog = true }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(maxWidth: .infinity, minHeight: 44)
          .sheet(isPresented: $showsManualLog) { ManualLogView(flow: flow) }
      }
    } else {
      accentButton(
        isFinishing
          ? String(localized: "workout.finishing")
          : controller.isFuture
            ? String(localized: "workout.finishError.future")
            : String(localized: "workout.finish")
      ) { Task { await doFinish() } }
      .disabled(!controller.canFinish || isFinishing)
      .opacity(controller.canFinish && !isFinishing ? 1 : 0.5)
    }
  }

  /// "Đã gỡ hiệp khỏi buổi tập · Hoàn tác" trong 8 giây (RN `toast.undo`,
  /// cùng `ACTION_HIDE_MS`). Hết giờ thì tự biến mất.
  private func undoBar(_ r: WorkoutSessionController.Removal) -> some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let left = Int((r.expiresAt.date.timeIntervalSince(context.date)).rounded(.up))
      if left > 0 {
        HStack(spacing: DS.Spacing.sm) {
          Image(systemName: "arrow.uturn.backward.circle")
            .accessibilityHidden(true)
          Text(String(localized: "workout.setRemoved"))
            .font(DS.TextStyle.footnote)
          Spacer(minLength: DS.Spacing.sm)
          Button(String(localized: "extra.undo.action")) {
            Task { await undoRemoval(r) }
          }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(minHeight: 44)
        }
        .padding(.horizontal, DS.Spacing.sm)
        .background(DS.Color.secondary.swiftUI)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
      }
    }
  }

  private func removeLogged(_ row: PlannedSet) async {
    untickTarget = nil
    await flushWrites()
    do throws(WorkoutSessionController.RemoveRefusal) {
      removal = try await controller.removeLoggedSet(row.key)
      AccessibilityNotification.Announcement(String(localized: "workout.setRemoved")).post()
    } catch {
      finishMessage = Self.removeMessage(error)
    }
  }

  private func undoRemoval(_ r: WorkoutSessionController.Removal) async {
    do throws(WorkoutSessionController.RemoveRefusal) {
      try await controller.undo(r)
    } catch {
      finishMessage = Self.removeMessage(error)
    }
    removal = nil
  }

  /// Câu cho lý do không gỡ / hoàn tác được. `nil` = không báo: hết cửa sổ
  /// hoàn tác (dải đã biến mất), đang bận, hàng không còn trong buổi.
  static func removeMessage(_ refusal: WorkoutSessionController.RemoveRefusal) -> String? {
    switch refusal {
    case .loading, .inProgress, .notLogged, .expired:
      return nil
    case .loggedElsewhere:
      return String(localized: "workout.finishError.alreadyLogged")
    case .storage:
      return String(localized: "workout.finishError.generic")
    }
  }

  private func doAppend() async {
    isFinishing = true
    defer { isFinishing = false }
    await flushWrites()
    do {
      if let onAppend { try await onAppend() } else { _ = try await controller.append() }
      successTick += 1
      AccessibilityNotification.Announcement(String(localized: "workout.appended")).post()
    } catch let refusal as WorkoutSessionController.FinishRefusal {
      finishMessage = Self.refusalMessage(refusal)
    } catch {
      finishMessage = String(localized: "workout.finishError.generic")
    }
  }

  private func doFinish() async {
    isFinishing = true
    defer { isFinishing = false }
    await flushWrites()
    do {
      if let onFinish { try await onFinish() } else { _ = try await controller.finish() }
      // RN: Haptics.success + "Đã ghi buổi tập" (nRdSaved).
      successTick += 1
      AccessibilityNotification.Announcement(String(localized: "workout.saved")).post()
    } catch let refusal as WorkoutSessionController.FinishRefusal {
      finishMessage = Self.refusalMessage(refusal)
    } catch {
      // Không lộ mô tả lỗi thô (tên kiểu, mã nội bộ) cho người dùng.
      finishMessage = String(localized: "workout.finishError.generic")
    }
  }

  /// Câu người đọc được cho lý do không chốt được — không bao giờ là
  /// `String(describing:)` của enum (#523 P2). `nil` = không báo gì: các trường
  /// hợp mà baseline tắt nút Chốt (`canFinish`) hoặc là lần bấm thứ hai.
  static func refusalMessage(_ refusal: WorkoutSessionController.FinishRefusal) -> String? {
    switch refusal {
    case .loading, .inProgress, .nothingDone, .nothingToAppend:
      return nil
    case .futureDay:
      return String(localized: "workout.finishError.future")  // nRdFuture
    case .alreadyLogged, .loggedElsewhere:
      return String(localized: "workout.finishError.alreadyLogged")  // nRdAlready
    case .storage:
      return String(localized: "workout.finishError.generic")  // errUnknown
    }
  }

  /// Mức tạ cho VoiceOver — cùng phần lẻ với ô nhập, "0" khi không tạ.
  private func a11yLoad(_ kg: Double) -> String {
    let t = NumberInput.plannedLoad(kg)
    return t.isEmpty ? "0" : t
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

  func saveDay(_ key: String, _ state: DayState, userId: String) async throws {
    struct Failed: Error {}
    if failSaves { throw Failed() }
    days[key] = state
  }

  func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    days[key] = state
    return true
  }

  /// Xoá buổi từ lịch sử (#400, \`WorkoutStore.commitDelete\`): ngày đã chốt
  /// bằng buổi ấy thôi giữ set nào. Preview không có outbox thật.
  func commitDelete(sessionId: String, _ entry: OutboxEntry) async throws {
    for (k, s) in days where s.loggedSessionId == sessionId {
      var state = s
      state.loggedKeys = []
      days[k] = state
    }
  }
}

private struct WorkoutPreviewHost: View {
  enum Scenario { case idle, active, finished, unsaved, empty }

  let scenario: Scenario
  let restingRowKey: String?
  var showRestCard: Bool = false
  var outboxStatus: OutboxStatus = .ok
  @State private var controller: WorkoutSessionController?

  var body: some View {
    Group {
      if let controller {
        WorkoutView(
          controller: controller,
          restingRowKey: restingRowKey,
          restTimer: showRestCard
            ? RestTimer.start(seconds: 90, at: EpochMillis(Date().addingTimeInterval(-30)))
            : nil,
          outboxStatus: outboxStatus
        )
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
    let rows: [PlannedSet]
    if scenario == .empty {
      rows = []
    } else {
      rows = [
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
    }
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
    case .empty:
      store = PreviewStore()
      controller = WorkoutSessionController(plan: plan, userId: "u1", store: store)
      await controller.load()
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
#Preview("empty") {
  WorkoutPreviewHost(scenario: .empty, restingRowKey: nil)
}
#Preview("with RestCard") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: "bp2", showRestCard: true)
}
#Preview("sync pending") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: nil, outboxStatus: .pending(3))
}
#Preview("sync dead") {
  WorkoutPreviewHost(scenario: .active, restingRowKey: nil, outboxStatus: .dead(1))
}
#endif

private struct GuideTarget: Identifiable {
  let key: String
  let exerciseId: String?
  let name: String
  var id: String { key }
}

/// Thứ tự bài trong buổi, kéo thả như hàng đợi Apple Music (19/10): tay nắm ≡
/// luôn hiện, kéo là đổi ngay; "Xong" đóng. Set trong một bài giữ thứ tự.
struct ExerciseOrderSheet: View {
  @State var exercises: [WorkoutFocus.Exercise]
  let commit: ([String]) -> Void
  @Environment(\.dismiss) private var dismiss

  init(exercises: [WorkoutFocus.Exercise], commit: @escaping ([String]) -> Void) {
    _exercises = State(initialValue: exercises)
    self.commit = commit
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(exercises) { ex in
            HStack(spacing: DS.Spacing.sm) {
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: ex.name.isEmpty ? String(localized: "manualLog.exercise") : ex.name)
                  .font(DS.TextStyle.body.weight(.semibold))
                  .lineLimit(2)
                Text(verbatim: "\(ex.done)/\(ex.total)")
                  .font(DS.TextStyle.caption.monospacedDigit())
                  .foregroundStyle(ex.isComplete ? DS.Color.metricRose.swiftUI : DS.Color.mutedForeground.swiftUI)
              }
              Spacer(minLength: 0)
              if ex.isComplete {
                Image(systemName: "checkmark.circle.fill")
                  .foregroundStyle(DS.Color.metricRose.swiftUI)
                  .accessibilityHidden(true)
              }
            }
            .frame(minHeight: 52)
          }
          .onMove { from, to in
            exercises.move(fromOffsets: from, toOffset: to)
            commit(exercises.map(\.key))
          }
        } footer: {
          Text(String(localized: "ws.reorder.hint"))
        }
      }
      // Tay nắm luôn hiện, như hàng đợi của Apple Music.
      .environment(\.editMode, .constant(.active))
      .navigationTitle(Text("ws.reorder"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "wb.done")) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
    .sensoryFeedback(.selection, trigger: exercises.map(\.key))
  }
}
