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
/// Kế hoạch là dữ liệu mẫu (`templateId = nil` → `template_id` null trên
/// server — id bịa là khoá ngoại hỏng). Đọc template thật là việc của slice
/// Workouts.
struct WorkoutLabView: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    NavigationStack {
      Group {
        switch services.session.phase {
        case .loading:
          ProgressView()
        case .signedOut:
          LabSignIn()
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

private struct LabSignIn: View {
  @Environment(AppServices.self) private var services
  @State private var email = ""
  @State private var password = ""
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    Form {
      Section {
        TextField(text: $email) { Text(verbatim: "Email") }
          .textContentType(.username)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
        SecureField(text: $password) { Text(verbatim: "Password") }
          .textContentType(.password)
      } footer: {
        Text(verbatim: "Tài khoản ASCND thật (cùng Supabase với app RN). Buổi tập sẽ được ghi thật.")
      }
      Section {
        Button {
          busy = true
          Task {
            do {
              try await services.session.signIn(email: email, password: password)
              error = nil
            } catch {
              self.error = "\(error)"
            }
            busy = false
          }
        } label: {
          Text(verbatim: busy ? "…" : "Sign in")
        }
        .disabled(busy || email.isEmpty || password.isEmpty)
      }
      if let error {
        Section { Text(verbatim: error).foregroundStyle(.red).font(.footnote) }
      }
      if let problem = services.startupError {
        Section { Text(verbatim: problem).foregroundStyle(.red).font(.footnote) }
      }
    }
  }
}

private struct LabSession: View {
  let user: AuthSession
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var controller: WorkoutSessionController?

  var body: some View {
    Group {
      if let controller {
        LabWorkout(c: controller)
      } else {
        ProgressView()
      }
    }
    .task(id: user.userId) {
      let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
      let sync = services.sync
      let rest = self.rest
      let c = WorkoutSessionController(
        plan: WorkoutLabPlan.plan(on: today), userId: user.userId, store: services.workouts,
        onRest: { event, next in
          rest.handle(event, target: next.map { RestTarget(exerciseName: $0.exerciseName, setNumber: $0.ordinal, totalSets: $0.of) })
        },
        onEnqueued: { _ in sync.kick() })
      await c.load()
      controller = c
    }
  }
}

private struct LabWorkout: View {
  let c: WorkoutSessionController
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var finishError: String?

  var body: some View {
    List {
      Section {
        LabRow(label: "Phase", value: "\(c.phase)")
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
