#if DEBUG
import ASCNDCore
import SwiftUI

/// Màn thử lát dọc đầu tiên — CHỈ có trong bản Debug ("ASCND Dev"), như Rest
/// Lab. Không phải màn tập thật: không dùng DS của C, chữ không vào catalog
/// (`verbatim`). Mục đích duy nhất: để Kiệt chạy trên iPhone thật đúng chuỗi
///
///     đăng nhập → kế hoạch hôm nay → tick / sửa set → nghỉ (Island) → chốt
///     → lưu trên máy → outbox → Supabase
///
/// và kiểm những điều mà test không thay được: tắt mạng, kill app giữa buổi,
/// mở lại, bật mạng, xem buổi lên `workout_sessions`.
///
/// Kế hoạch đọc từ `routine_days` + `workout_templates` thật (#270), cache
/// trên máy trước rồi làm mới từ server. Ngày không có buổi thì có thể bật kế
/// hoạch mẫu (`templateId = nil` → `template_id` null trên server — id bịa là
/// khoá ngoại hỏng).
struct WorkoutLabView: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    NavigationStack {
      Group {
        switch services.session.phase {
        case .loading:
          ProgressView()
        case .signedOut:
          SignInView()
        case .signedIn(let s):
          LabSession(user: s)
        }
      }
      .navigationTitle(Text(verbatim: "Workout Lab"))
    }
  }
}

/// Kế hoạch mẫu: hai bài có tạ (nghỉ 90 s, 60 s) và một bài giữ không nghỉ.
enum WorkoutLabPlan {
  static func plan(on date: LocalDate) -> WorkoutSessionController.Plan {
    func sets(_ name: String, _ id: String, _ n: Int, kg: Double, reps: Int, rest: Int) -> [PlannedSet] {
      (1...n).map {
        PlannedSet(key: "\(id)-\($0)", exerciseName: name, ordinal: $0, of: n, weightKg: kg, reps: reps, plannedRest: rest)
      }
    }
    return .init(
      date: date, templateId: nil, templateName: "Lab Push",
      rows: sets("Bench Press", "bench", 3, kg: 60, reps: 8, rest: 90)
        + sets("Overhead Press", "ohp", 2, kg: 35, reps: 10, rest: 60)
        // reps 0: phải gõ "45s" mới tick được — thử luật set giữ (WS-2).
        + sets("Plank", "plank", 1, kg: 0, reps: 0, rest: 0))
  }
}

private struct LabSession: View {
  let user: AuthSession
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @Environment(\.scenePhase) private var scenePhase
  @State private var today: TodayController?
  @State private var records: RecordBook?
  @State private var controller: WorkoutSessionController?
  @State private var useSample = false

  var body: some View {
    List {
      if let today {
        Section {
          LabRow(label: "Today", value: today.plan.map { "\($0.date) · \($0.status.rawValue)\($0.isDeload ? " · deload" : "")" } ?? "\(today.today) · no plan")
          LabRow(label: "Template", value: today.plan?.template.map { "\($0.name) (\($0.exercises.count) bài)" } ?? "—")
          LabRow(label: "Plan source", value: Self.describe(today.source))
          LabRow(label: "Trained (14d)", value: "\(today.trained.count) ngày")
          LabRow(label: "Record history", value: records?.bests.map { "\($0.count) bài" } ?? "chưa biết (không nhận kỷ lục)")
          if let e = today.refreshError {
            LabRow(label: "Refresh failed", value: e).foregroundStyle(.orange)
          }
          if today.plan?.sessionPlan == nil {
            Toggle(isOn: $useSample) { Text(verbatim: "Hôm nay không có buổi — dùng kế hoạch mẫu (Lab)") }
          }
        } header: {
          Text(verbatim: "Today (TodayController)")
        }
      }
      if let controller {
        LabWorkout(c: controller)
      }
    }
    .task(id: user.userId) {
      let t = services.makeToday(userId: user.userId)
      let book = services.makeRecordBook(userId: user.userId)
      today = t
      records = book
      await book.load()
      await t.load()
      install()
    }
    .onChange(of: useSample) { install() }
    .onChange(of: controller?.loggedSessionId) { _, id in
      // Chốt xong: ngày thành done ngay, không đợi server.
      if id != nil, let today { Task { await today.markTrained(today.today) } }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active, let today { Task { await today.clockTick(); install() } }
    }
    .refreshable {
      await today?.refresh()
      install()
    }
  }

  static func describe(_ s: TodayController.Source) -> String {
    switch s {
    case .none: "—"
    case .cache(let t): "cache · \(t.date.formatted(date: .omitted, time: .shortened))"
    case .server(let t): "server · \(t.date.formatted(date: .omitted, time: .shortened))"
    }
  }

  /// Dựng màn tập cho kế hoạch hiện tại. Không thay controller đang có tiến
  /// độ: kế hoạch mới (server sau cache) chỉ áp khi chưa tick gì.
  private func install() {
    guard let today else { return }
    let sync = services.sync
    let rest = self.rest
    let onRest: @MainActor (RestEvent, PlannedSet?) -> Void = { event, next in
      rest.handle(event, target: next.map { RestTarget(exerciseName: $0.exerciseName, setNumber: $0.ordinal, totalSets: $0.of) })
    }
    let book = records
    let onEnqueued: @MainActor (OutboxEntry) -> Void = { entry in
      sync.kick()
      // Buổi vừa chốt thành lịch sử kỷ lục — buổi sau không nổ lại cùng kỷ lục.
      if let book { Task { await book.absorb(setsJSON: entry.payload["sets"]) } }
    }
    let bests: @MainActor () -> PersonalRecords.Bests? = { book?.bests }
    var next = today.makeSession(bests: bests, onRest: onRest, onEnqueued: onEnqueued)
    if next == nil, useSample {
      next = WorkoutSessionController(
        plan: WorkoutLabPlan.plan(on: today.today), userId: user.userId, store: services.workouts,
        bests: bests, onRest: onRest, onEnqueued: onEnqueued)
    }
    guard let next else {
      controller = nil
      return
    }
    if let c = controller, (c.plan == next.plan && c.loggedElsewhere == next.loggedElsewhere) || c.phase != .idle { return }
    controller = next
    Task { await next.load() }
  }
}

private struct LabWorkout: View {
  let c: WorkoutSessionController
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var finishError: String?

  var body: some View {
    Group {
      Section {
        LabRow(label: "Phase", value: "\(c.phase)\(c.loggedElsewhere ? " · logged elsewhere" : "")")
        LabRow(label: "Day key", value: c.key)
        if let u = c.unsaved {
          LabRow(label: "UNSAVED", value: u.message).foregroundStyle(.red)
        }
      }

      if rest.timer != nil {
        Section {
          TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = rest.timer?.remaining(at: EpochMillis(context.date)) ?? 0
            HStack {
              Text(verbatim: "Rest \(RestTimer.label(seconds: left))").monospacedDigit()
              if let t = rest.target {
                Text(verbatim: "→ \(t.exerciseName) \(t.setNumber)/\(t.totalSets)").foregroundStyle(.secondary)
              }
              Spacer()
              Button { rest.adjust(by: -15) } label: { Text(verbatim: "−15") }
              Button { rest.adjust(by: 15) } label: { Text(verbatim: "+15") }
              Button(role: .destructive) { rest.handle(.cancel) } label: { Text(verbatim: "Skip") }
            }
            .buttonStyle(.borderless)
          }
        }
      }

      Section {
        ForEach(c.plan.rows) { row in
          LabSetRow(c: c, row: row)
        }
      }

      Section {
        Button {
          Task {
            do throws(WorkoutSessionController.FinishRefusal) {
              _ = try await c.finish()
              finishError = nil
            } catch {
              finishError = "\(error)"
            }
          }
        } label: {
          Text(verbatim: "Finish workout")
        }
        .disabled(!c.canFinish)
        if let finishError {
          Text(verbatim: finishError).foregroundStyle(.red).font(.footnote)
        }
        if let s = c.summary {
          LabRow(label: "Session", value: s.sessionId)
          LabRow(label: "Sets / holds / warm-ups", value: "\(s.completedSets) / \(s.holdSets) / \(s.warmupSets)")
          LabRow(label: "Exercises", value: "\(s.exerciseCount)")
          LabRow(label: "Volume (kg)", value: "\(s.volumeKg)")
          LabRow(label: "Session RPE", value: "\(s.sessionRpe)")
          LabRow(label: "PR", value: s.records.isEmpty ? "—" : s.records.map { "\($0.exercise) \($0.kind.rawValue) \($0.previous.formatted())→\($0.value.formatted())" }.joined(separator: "; "))
        }
      }

      Section {
        LabRow(label: "Online", value: "\(services.sync.online)")
        LabRow(label: "Signed in", value: services.sync.signedInUser ?? "—")
        LabRow(label: "Outbox pending", value: "\(services.sync.pendingCount)")
        LabRow(label: "Outbox dead", value: "\(services.sync.deadCount)")
        LabRow(label: "Sending", value: "\(services.sync.isRunning)")
        if let u = services.sync.unsaved {
          LabRow(label: "Outbox unsaved", value: u.message).foregroundStyle(.red)
        }
        ForEach(services.sync.outbox.dead, id: \.entry.id) { d in
          LabRow(label: "dead \(d.reason)", value: "\(d.entry.id.prefix(8)) \(d.failure.map { "\($0)" } ?? "")")
            .foregroundStyle(.red)
        }
        Button { services.sync.kick() } label: { Text(verbatim: "Sync now") }
      } header: {
        Text(verbatim: "Outbox")
      }

      Section {
        Button(role: .destructive) {
          Task { await services.session.signOut() }
        } label: {
          Text(verbatim: "Sign out (drops outbox, #241)")
        }
      }
    }
  }
}

private struct LabSetRow: View {
  let c: WorkoutSessionController
  let row: PlannedSet

  var body: some View {
    let done = c.progress.done[row.key] == true
    HStack(spacing: 12) {
      Button {
        Task { await c.toggle(row.key) }
      } label: {
        Image(systemName: done ? "checkmark.circle.fill" : "circle").font(.title2)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(Text(verbatim: "\(row.exerciseName) set \(row.ordinal)"))
      .accessibilityAddTraits(done ? .isSelected : [])

      VStack(alignment: .leading) {
        Text(verbatim: row.exerciseName)
        Text(verbatim: "\(row.ordinal)/\(row.of) · rest \(RestTimer.label(seconds: WorkoutDay.restSeconds(row, c.progress)))")
          .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      TextField(text: Binding(
        get: { c.progress.weightText[row.key] ?? WorkoutMath.round2(row.weightKg).formatted() },
        set: { v in Task { await c.setWeightText(v, for: row.key) } })
      ) { Text(verbatim: "kg") }
        .keyboardType(.decimalPad)
        .frame(width: 56)
        .multilineTextAlignment(.trailing)
      Text(verbatim: "×")
      TextField(text: Binding(
        get: { c.progress.repsText[row.key] ?? (row.reps > 0 ? String(row.reps) : "") },
        set: { v in Task { await c.setRepsText(v, for: row.key) } })
      ) { Text(verbatim: "reps") }
        .frame(width: 48)
    }
    .disabled(c.loggedSessionId != nil)
  }
}

private struct LabRow: View {
  let label: String
  let value: String

  var body: some View {
    LabeledContent {
      Text(verbatim: value).font(.footnote.monospaced()).textSelection(.enabled)
    } label: {
      Text(verbatim: label)
    }
  }
}
#endif
