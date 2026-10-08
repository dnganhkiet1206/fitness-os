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
          AuthView()
        case .signedIn:
          LabSession()
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

/// Chỉ đọc `WorkoutFlow` của phiên (#272) — cùng flow mà màn thật dùng. Lab
/// không còn tự nối controller, nên thứ Kiệt thử ở đây là đường của bản Release.
private struct LabSession: View {
  @Environment(WorkoutFlow.self) private var flow
  @State private var useSample = false

  var body: some View {
    let today = flow.today
    List {
      Section {
        LabRow(label: "Today", value: today.plan.map { "\($0.date) · \($0.status.rawValue)\($0.isDeload ? " · deload" : "")" } ?? "\(today.today) · no plan")
        LabRow(label: "Template", value: today.plan?.template.map { "\($0.name) (\($0.exercises.count) bài)" } ?? "—")
        LabRow(label: "Plan source", value: Self.describe(today.source))
        LabRow(label: "Trained (14d)", value: "\(today.trained.count) ngày")
        LabRow(label: "Record history", value: flow.records.bests.map { "\($0.count) bài" } ?? "chưa biết (không nhận kỷ lục)")
        if let f = today.failure {
          LabRow(label: "Refresh failed (\(f))", value: today.failureDetail ?? "").foregroundStyle(.orange)
        }
        if today.plan?.sessionPlan == nil {
          Toggle(isOn: $useSample) { Text(verbatim: "Hôm nay không có buổi — dùng kế hoạch mẫu (Lab)") }
        }
      } header: {
        Text(verbatim: "Today (WorkoutFlow)")
      }
      if let c = flow.session {
        LabWorkout(c: c)
      }
      if let history = flow.history {
        Section {
          // Màn lịch sử thật (#375) — cùng `HistoryBook` với bảng thô dưới.
          NavigationLink {
            WorkoutHistoryView(book: history)
          } label: {
            Text(verbatim: "Buổi tập đã ghi (màn thật)")
          }
        }
        LabHistory(history: history)
      }
      if let editor = flow.plan {
        LabPlan(today: today, editor: editor)
      }
      LabManualLog(flow: flow)
      if let insights = flow.insights {
        LabInsights(book: insights)
      }
      if let library = flow.library {
        LabLibrary(library: library)
        if let guides = flow.guides {
          LabGuide(guides: guides, library: library)
        }
      }
    }
    .onChange(of: useSample) { _, on in
      Task {
        if on {
          await flow.setAdHoc { WorkoutLabPlan.plan(on: $0) }
        } else {
          await flow.setAdHoc(nil)
        }
      }
    }
    .refreshable { await flow.refresh() }
  }

  static func describe(_ s: TodayController.Source) -> String {
    switch s {
    case .none: "—"
    case .cache(let t): "cache · \(t.date.formatted(date: .omitted, time: .shortened))"
    case .server(let t): "server · \(t.date.formatted(date: .omitted, time: .shortened))"
    }
  }
}

private struct LabWorkout: View {
  let c: WorkoutSessionController
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var finishError: String?
  /// Lần gỡ set gần nhất (#398) — hoàn tác được trong 8 giây.
  @State private var removal: WorkoutSessionController.Removal?

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
        ForEach(c.rows) { row in
          if let id = row.adHoc, row.heads {
            LabAdHocHeader(c: c, id: id)
          }
          if row.ordinal == 1, let last = flow.performance.last(for: row.exerciseName), let d = last.display {
            Text(verbatim: "Last (\(last.date)): \(Self.describe(d, unit: flow.weightUnit))")
              .font(.caption).foregroundStyle(.secondary)
          }
          LabSetRow(c: c, row: row)
            .swipeActions {
              if c.canRemove(row.key) {
                Button(role: .destructive) {
                  Task {
                    do throws(WorkoutSessionController.RemoveRefusal) {
                      removal = try await c.removeLoggedSet(row.key)
                      finishError = nil
                    } catch {
                      finishError = "\(error)"
                    }
                  }
                } label: {
                  Text(verbatim: "Remove set")
                }
              }
            }
        }
        Button {
          Task { await c.addExercise() }
        } label: {
          Text(verbatim: "+ Add exercise (not in plan)")
        }
      }

      Section {
        Button {
          Task {
            do throws(WorkoutSessionController.FinishRefusal) {
              _ = try await flow.finish()
              finishError = nil
            } catch {
              finishError = "\(error)"
            }
          }
        } label: {
          Text(verbatim: "Finish workout")
        }
        .disabled(!c.canFinish)
        if c.loggedSessionId != nil {
          Button {
            Task {
              do throws(WorkoutSessionController.FinishRefusal) {
                _ = try await flow.append()
                finishError = nil
              } catch {
                finishError = "\(error)"
              }
            }
          } label: {
            Text(verbatim: "Append \(c.pendingRows.count) new set(s) to this session")
          }
          .disabled(!c.canAppend)
        }
        if let r = removal {
          Button {
            Task {
              do throws(WorkoutSessionController.RemoveRefusal) {
                try await c.undo(r)
                finishError = nil
              } catch {
                finishError = "\(error)"
              }
              removal = nil
            }
          } label: {
            Text(verbatim: "Undo remove \(r.key)\(r.deletedSession ? " (session deleted)" : "") — 8 s")
          }
        }
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

extension LabWorkout {
  static func describe(_ d: LastPerformance.Display, unit: WeightUnit) -> String {
    switch d {
    case .hold(let s): "\(s)s"
    case .bodyweight(let r): "\(r) reps × bodyweight"
    case .loaded(let w, let r): "\(unit.load(w)) × \(r)"
    }
  }
}

/// Lịch sử buổi tập (#400): 90 ngày, mới trước; vuốt để xoá.
private struct LabHistory: View {
  let history: HistoryBook
  @State private var error: String?

  var body: some View {
    Section {
      if let f = history.failure {
        LabRow(label: "History refresh failed", value: "\(f)").foregroundStyle(.orange)
      }
      ForEach(history.entries) { e in
        LabRow(
          label: e.at.date.formatted(date: .abbreviated, time: .shortened),
          value: "\(e.templateName) · \(e.completedSets) sets · \(e.exerciseCount) ex · \(e.volumeKg) kg\(e.prDetected ? " · PR" : "")")
          .swipeActions {
            Button(role: .destructive) {
              Task {
                do throws(HistoryBook.DeleteRefusal) {
                  try await history.delete(e.id)
                  error = nil
                } catch {
                  self.error = "\(error)"
                }
              }
            } label: {
              Text(verbatim: "Delete session")
            }
          }
      }
      if let error {
        Text(verbatim: error).foregroundStyle(.red).font(.footnote)
      }
    } header: {
      Text(verbatim: "History (90 days) — \(history.entries.count)")
    }
  }
}

/// Ghi kế hoạch (#401): tạo template mẫu gán cho hôm nay, cho hôm nay nghỉ,
/// vuốt để xoá template. Không phải builder (C-37 #410) — chỉ để thử đường ghi
/// trên máy thật: online / offline / mở lại app.
private struct LabPlan: View {
  let today: TodayController
  let editor: PlanEditor
  @State private var error: String?

  var body: some View {
    let library = today.library
    let day = WorkoutPlanning.routineIndex(today.today)
    Section {
      ForEach((library?.templates ?? []).sorted(by: WorkoutTemplate.newestFirst)) { t in
        LabRow(
          label: t.name + (library?.day(day)?.templateId == t.id ? " · hôm nay" : ""),
          value: "\(t.exercises.count) bài · \(t.type ?? PlanEdit.defaultType)\(t.createdAt == nil ? " · chưa lên server" : "")")
          .swipeActions {
            Button(role: .destructive) { run { try await editor.delete(templateId: t.id) } } label: {
              Text(verbatim: "Delete template")
            }
            Button { run { try await editor.assign(day: day, templateId: t.id) } } label: {
              Text(verbatim: "Hôm nay")
            }
          }
      }
      Button {
        run {
          try await editor.create(
            id: editor.newTemplateId(), name: "Lab \(Date().formatted(date: .omitted, time: .shortened))",
            exercises: [
              TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60),
              TemplateExercise(exerciseName: "Row", sets: 2, reps: 10, weightKg: 40),
            ], scheduleOn: day)
        }
      } label: {
        Text(verbatim: "Tạo template mẫu, gán cho hôm nay")
      }
      Button { run { try await editor.assign(day: day, templateId: nil) } } label: {
        Text(verbatim: "Hôm nay nghỉ")
      }
      Button {
        run { try await editor.setDeload(day: day, !(library?.day(day)?.isDeload ?? false)) }
      } label: {
        Text(verbatim: "Bật / tắt deload hôm nay")
      }
      if let error {
        Text(verbatim: error).foregroundStyle(.red).font(.footnote)
      }
    } header: {
      Text(verbatim: "Plan (#401) — \(library?.templates.count ?? 0) templates")
    }
  }

  /// Lỗi là `PlanEditor.Refusal`; closure không khai kiểu ném nên nhận `any Error`.
  private func run(_ op: @escaping @MainActor () async throws -> Void) {
    Task { @MainActor in
      do {
        try await op()
        error = nil
      } catch {
        self.error = "\(error)"
      }
    }
  }
}

/// Phân tích bài tập (#419): đúng thứ tự và các con số C sẽ vẽ — không phải
/// màn của C, chỉ để đối chiếu với app RN trên cùng tài khoản.
private struct LabInsights: View {
  let book: InsightBook

  var body: some View {
    Section {
      if let f = book.failure {
        LabRow(label: "Insights refresh failed", value: "\(f)").foregroundStyle(.orange)
      }
      ForEach(book.insights) { i in
        LabRow(
          label: "\(i.exerciseName) · \(i.kind.rawValue)",
          value: "\(i.trend.rawValue) · \(i.readiness.rawValue) · \(i.confidence.rawValue) · \(i.sessions) buổi"
            + (i.bestE1rmKg.map { " · e1RM \($0.formatted())" } ?? "")
            + (i.changePct.map { " · \(($0 * 100).formatted(.number.precision(.fractionLength(1))))%" } ?? "")
            + (i.stale ? " · stale" : ""))
      }
    } header: {
      Text(verbatim: "Insights (90 days) — \(book.insights.count)")
    }
  }
}

/// Thư viện bài tập (#420): gộp theo nhãn nhóm cơ, ô tìm như màn RN.
private struct LabLibrary: View {
  let library: ExerciseLibrary
  @State private var query = ""
  @State private var error: String?

  var body: some View {
    Section {
      TextField(text: $query) { Text(verbatim: "Tìm bài") }
      if let f = library.failure {
        LabRow(label: "Library refresh failed", value: "\(f)").foregroundStyle(.orange)
      }
      ForEach(ExerciseCatalog.sections(library.exercises, query: query, lang: .vi)) { section in
        LabRow(
          label: section.title,
          value: section.exercises.map { $0.name + ($0.isBuiltIn ? "" : " ★") }.joined(separator: ", "))
      }
      // #421: thêm một bài thử (tên = ô tìm), vuốt bài của mình để xoá.
      Button {
        Task {
          do throws(ExerciseLibrary.Refusal) {
            try await library.create(
              id: library.newExerciseId(), name: query.isEmpty ? "Lab exercise" : query, muscleGroup: "chest")
            error = nil
          } catch {
            self.error = "\(error)"
          }
        }
      } label: {
        Text(verbatim: "Thêm bài (tên = ô tìm, nhóm Ngực)")
      }
      ForEach(library.exercises.filter { !$0.isBuiltIn }) { e in
        LabRow(label: "★ \(e.name)", value: MuscleGroup.label(e.muscleGroup, .vi))
          .swipeActions {
            Button(role: .destructive) {
              Task {
                do throws(ExerciseLibrary.Refusal) {
                  try await library.delete(id: e.id)
                  error = nil
                } catch {
                  self.error = "\(error)"
                }
              }
            } label: {
              Text(verbatim: "Delete exercise")
            }
          }
      }
      if let error {
        Text(verbatim: error).foregroundStyle(.red).font(.footnote)
      }
    } header: {
      Text(verbatim: "Exercise library — \(library.exercises.count)")
    }
  }
}

/// Hướng dẫn bài tập (#422): mở sheet cho một bài của thư viện, xem đúng thứ
/// C sẽ vẽ (nội dung theo tiếng, media, bài liên quan).
private struct LabGuide: View {
  let guides: ExerciseGuideBook
  let library: ExerciseLibrary
  @State private var picked: String?

  var body: some View {
    Section {
      Picker(selection: $picked) {
        Text(verbatim: "—").tag(String?.none)
        ForEach(library.exercises) { e in Text(verbatim: e.name).tag(String?.some(e.id)) }
      } label: {
        Text(verbatim: "Bài")
      }
      if let f = guides.failure {
        LabRow(label: "Guide failed", value: "\(f)").foregroundStyle(.orange)
      }
      if let g = guides.guide {
        LabRow(label: "\(g.name) · \(g.matchedBy.rawValue)", value: "\(g.muscleGroup ?? "—") · \(g.equipment ?? "—")")
        LabRow(label: "Content (\(g.contentLocale?.rawValue ?? "—"))", value: (g.instructions + g.formCues + g.commonMistakes).joined(separator: " | "))
        LabRow(label: "Media \(g.media.shape.rawValue)", value: g.media.items.map(\.uri).joined(separator: ", "))
        let subject = GuideRelated.Subject(g)
        LabRow(label: "Cùng thiết bị", value: GuideRelated.sameEquipment(library.exercises, subject).map(\.name).joined(separator: ", "))
        LabRow(label: "Cùng nhóm cơ", value: GuideRelated.sameMuscle(library.exercises, subject).map(\.name).joined(separator: ", "))
      }
    } header: {
      Text(verbatim: "Exercise guide (#422)")
    }
    .onChange(of: picked) { _, id in
      guard let id, let e = library.exercise(id: id) else { return }
      Task { await guides.open(exerciseId: e.id, name: e.name, lang: .vi) }
    }
  }
}

/// Ghi buổi thủ công (#418): không phải màn của C — chỉ để thử bản nháp bền
/// (kill rồi mở lại), gợi ý kế hoạch, và ghi qua outbox trên máy thật.
private struct LabManualLog: View {
  let flow: WorkoutFlow
  @State private var log: ManualLogController?
  @State private var message: String?

  var body: some View {
    Section {
      if let log {
        LabRow(label: "Draft", value: "\(log.name.isEmpty ? "—" : log.name) · RPE \(log.rpe) · \(log.validRows.count)/\(log.rows.count) hàng ghi được")
        ForEach(log.rows) { r in
          LabRow(
            label: "\(log.setNumbers[r.id] ?? 0). \(r.exerciseName.isEmpty ? "—" : r.exerciseName)\(r.warmup ? " · warm-up" : "")",
            value: "\(r.weight.isEmpty ? "BW" : r.weight) × \(r.reps.isEmpty ? "—" : r.reps)")
        }
        if let plan = log.planOffer {
          Button { Task { await log.usePlan() } } label: { Text(verbatim: "Dùng kế hoạch hôm nay: \(plan.name)") }
        }
        Button {
          Task {
            if !(log.rows.last?.reps.isEmpty ?? true) { await log.addExercise() }
            guard let id = log.rows.last?.id else { return }
            await log.setExerciseName("Curl", row: id)
            await log.setWeight("10", row: id)
            await log.setReps("10", row: id)
          }
        } label: {
          Text(verbatim: "Thêm set Curl 10 × 10")
        }
        Button {
          Task {
            do throws(ManualLogController.SaveRefusal) {
              let s = try await log.save()
              let unit = flow.weightUnit
              message = "Đã ghi \(s.completedSets) set · \(unit.volume(Double(s.volumeKg))) \(unit.label)\(s.prDetected ? " · PR" : "")"
            } catch {
              message = "\(error)"
            }
          }
        } label: {
          Text(verbatim: "Lưu buổi")
        }
        .disabled(!log.canSave())
        if log.loggedSessionId != nil {
          Button { Task { await log.startNew() } } label: { Text(verbatim: "Ghi buổi khác") }
        }
        if let message {
          Text(verbatim: message).font(.footnote)
        }
      } else {
        Button {
          Task {
            let l = flow.makeManualLog()
            await l.load()
            log = l
          }
        } label: {
          Text(verbatim: "Mở form ghi tay (khôi phục nháp nếu có)")
        }
      }
    } header: {
      Text(verbatim: "Manual log (#418)")
    }
  }
}

/// Đầu thẻ của một bài thêm (#399): tên, thêm hiệp, bỏ bài.
private struct LabAdHocHeader: View {
  let c: WorkoutSessionController
  let id: String

  var body: some View {
    let locked = c.adHocLocked(id)
    HStack {
      TextField(text: Binding(
        get: { c.progress.extra.first { $0.id == id }?.name ?? "" },
        set: { v in Task { await c.renameExercise(id, to: v) } })
      ) { Text(verbatim: "Exercise name") }
        .disabled(locked)
      Button { Task { await c.addSet(to: id) } } label: { Text(verbatim: "+ set") }
      Button(role: .destructive) { Task { await c.removeExercise(id) } } label: { Text(verbatim: "Remove") }
        .disabled(locked)
    }
    .buttonStyle(.borderless)
    .font(.footnote)
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
      // Ô gõ theo đơn vị của controller (#527 1.9-C): gieo và nhãn cùng đơn vị
      // controller dùng để đổi về kg — không thì "60" ghi nhãn kg bị đọc là lb.
      TextField(text: Binding(
        get: { c.progress.weightText[row.key] ?? c.weightUnit.seed(row.weightKg) },
        set: { v in Task { await c.setWeightText(v, for: row.key) } })
      ) { Text(verbatim: c.weightUnit.label) }
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
    // Chỉ khoá hàng đã nằm trong buổi: hàng mới tick được để nối thêm (#296);
    // hàng đã chốt thì vuốt để gỡ (#398).
    .disabled(c.loggedKeys.contains(row.key))
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
