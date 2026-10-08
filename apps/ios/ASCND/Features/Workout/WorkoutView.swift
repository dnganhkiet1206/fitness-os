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
  /// Trạng thái outbox — A8 nối `SyncWorker`. Mặc định `.ok` (không hiện).
  var outboxStatus: OutboxStatus
  /// Chốt / nối thêm qua tầng ứng dụng (`WorkoutFlow.finish` / `.append`):
  /// flow làm thêm việc mà controller không biết (ngày đã chốt ở chỗ khác vẫn
  /// là "đã tập"). `nil` = gọi thẳng controller (Preview, test).
  var onFinish: (@MainActor () async throws -> Void)?
  var onAppend: (@MainActor () async throws -> Void)?
  /// Mở lịch sử buổi tập. `nil` = không hiện nút (Preview, test).
  var onOpenHistory: (() -> Void)?

  @State private var weightTexts: [String: String] = [:]
  @State private var repsTexts: [String: String] = [:]
  @State private var finishMessage: String?
  /// Focus: weight → reps → done (#300).
  @FocusState private var focusedField: FieldFocus?
  /// Debounce ghi controller — tránh ghi mỗi phím gõ (#300).
  @State private var pendingWrites: [String: Task<Void, Never>] = [:]
  @Environment(\.scenePhase) private var scenePhase
  /// Đơn vị tạ của tài khoản (#527 1.9-B): ô tạ hiện và nhận số theo đơn vị
  /// này; controller đổi về kg (cùng đơn vị, `WorkoutFlow.setWeightUnit`).
  @Environment(\.weightUnit) private var unit

  /// Ô nào đang focus.
  enum FieldFocus: Hashable {
    case weight(String)
    case reps(String)
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
    outboxStatus: OutboxStatus = .ok,
    onFinish: (@MainActor () async throws -> Void)? = nil,
    onAppend: (@MainActor () async throws -> Void)? = nil,
    onOpenHistory: (() -> Void)? = nil
  ) {
    self.controller = controller
    self.restingRowKey = restingRowKey
    self.restTimer = restTimer
    self.onAdjustRest = onAdjustRest
    self.onSkipRest = onSkipRest
    self.outboxStatus = outboxStatus
    self.onFinish = onFinish
    self.onAppend = onAppend
    self.onOpenHistory = onOpenHistory
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
          // Như RN: buổi đã chốt VẪN là danh sách hàng — bỏ tích một hàng đã
          // ghi để gỡ nó (có hoàn tác), tích thêm hàng để nối vào buổi.
          // Bản trước thay cả màn bằng một ô "Đã chốt", nên hai việc ấy chỉ
          // làm được trong Lab.
          workoutContent
        }
      }
      .navigationTitle(controller.plan.templateName)
      .navigationBarTitleDisplayMode(.large)
      // Một thanh "Xong" trên bàn phím cho cả màn — gắn trên từng ô reps thì
      // mỗi hàng góp một nút.
      .toolbar {
        if let onOpenHistory {
          ToolbarItem(placement: .topBarTrailing) {
            Button(action: onOpenHistory) {
              Image(systemName: "clock.arrow.circlepath")
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(Text("history.title"))
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
        if let timer = restTimer {
          RestCard(timer: timer, onAdjust: onAdjustRest, onSkip: onSkipRest)
        }
        if controller.plan.rows.isEmpty {
          emptyView
        } else {
          ForEach(exerciseGroups, id: \.key) { group in
            exerciseCard(group)
          }
          finishButton
            .padding(.top, DS.Spacing.sm)
        }
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

    // Không `.combine`: mỗi phần tử tương tác (nút tick, ô nhập, menu)
    // là một điểm dừng VoiceOver riêng. Thông tin hàng ("Bench Press,
    // hiệp 2 trên 3, 60 kg × 8, đã xong") nằm trong label của nút tick.
    return VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack(spacing: DS.Spacing.sm) {
        // Tick — controller từ chối khi chưa đủ (không tên/không reps).
        Button {
          // Chữ vừa gõ (đang chờ debounce) phải tới controller TRƯỚC khi tick,
          // không thì set được chốt với số cũ.
          // Hàng đã nằm trong buổi đã chốt: bỏ tích là nói nó KHÔNG xảy ra —
          // hỏi lại trước (RN `nRdUntick*`), rồi gỡ khỏi buổi.
          if controller.canRemove(row.key) {
            untickTarget = row
            return
          }
          Task {
            await flushWrites()
            await controller.toggle(row.key)
          }
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
        .accessibilityLabel(Text(tickLabel(row, performed: performed, done: done, ready: ready)))
        .accessibilityAddTraits(done ? [.isButton, .isSelected] : .isButton)

        Text("\(row.ordinal)/\(row.of)")
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(minWidth: 36)

        // Ô tạ / reps — gõ chữ, View debounce rồi truyền cho controller (#300).
        TextField("", text: weightBinding(for: row))
          .keyboardType(.decimalPad)
          .multilineTextAlignment(.trailing)
          .font(DS.TextStyle.body.monospacedDigit())
          .frame(width: 64)
          .frame(minHeight: 44)
          .padding(.horizontal, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
          .accessibilityLabel(Text(String(localized: "workout.weight.unit \(unit.label)")))
          // Hàng controller không cho sửa (đang tải, đã nằm trong buổi đã
          // chốt, đang chốt): khoá ô — gõ vào sẽ hiện một con số controller
          // đã từ chối, tức ô nói dối.
          .disabled(!controller.canEdit(row.key))
          .focused($focusedField, equals: .weight(row.key))
          .submitLabel(.next)
          .onSubmit {
            // Focus weight → reps (#300).
            focusedField = .reps(row.key)
          }

        // Nhãn đơn vị cạnh ô tạ (`day-plan.tsx:1986`): "kg" / "lb" — ký hiệu,
        // không dịch; VoiceOver đã nghe đơn vị trong nhãn của ô.
        Text(verbatim: unit.label)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)

        Text("×")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)

        TextField("", text: repsBinding(for: row))
          // Ô reps nhận cả "45s" (bài giữ, `RepEntry.parse`): bàn phím số thuần
          // không có chữ "s".
          .keyboardType(.numbersAndPunctuation)
          .multilineTextAlignment(.trailing)
          .font(DS.TextStyle.body.monospacedDigit())
          .frame(width: 64)
          .frame(minHeight: 44)
          .padding(.horizontal, DS.Spacing.xs)
          .background(DS.Color.secondary.swiftUI)
          .clipShape(RoundedRectangle(cornerRadius: DS.Radius.sm))
          .accessibilityLabel(Text(String(localized: "workout.reps")))
          .disabled(!controller.canEdit(row.key))
          .focused($focusedField, equals: .reps(row.key))
          .submitLabel(.done)
          .onSubmit {
            // Done: flush ghi ngay + hạ bàn phím (#300).
            Task { await flushWrites() }
            focusedField = nil
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

  /// "Bench Press, hiệp 2 trên 3, 60 kg × 8, đã xong" (#276).
  private func rowVoiceOver(_ row: PlannedSet, performed: PerformedSet, done: Bool) -> String {
    String(
      format: String(localized: "workout.row.accessibility"),
      row.exerciseName, row.ordinal, row.of,
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
    if controller.loggedSessionId != nil, !controller.pendingRows.isEmpty {
      DSButton(String(localized: "workout.append"), style: .secondary, action: { Task { await doAppend() } })
        .disabled(!controller.canAppend || isFinishing)
        .opacity(controller.canAppend && !isFinishing ? 1 : 0.5)
    } else if controller.loggedSessionId != nil {
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
      DSButton(
        isFinishing
          ? String(localized: "workout.finishing")
          : controller.isFuture
            ? String(localized: "workout.finishError.future")
            : String(localized: "workout.finish"),
        style: .primary,
        action: { Task { await doFinish() } }
      )
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

  func saveDay(_ key: String, _ state: DayState) async throws {
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
