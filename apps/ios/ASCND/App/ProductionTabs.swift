import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Nối những màn ĐÃ có (#527) vào tab của bản Release: Today (nút của thẻ →
// kế hoạch tuần / ghi tay; thẻ sẵn sàng → sinh trắc học; Apple Health; phòng
// linh vật → huy chương), màn tập, lịch sử buổi tập (→ chi tiết buổi), Cài
// đặt. Chỉ là nối dây — không hành vi mới. Màn nào chưa đủ hành vi thì không
// hiện nút dẫn tới nó, thay vì một nút không làm gì.

/// Tab Hôm nay: `TodayScreen` trên `flow.today` của phiên.
struct TodayTab: View {
  @Environment(WorkoutFlow.self) private var flow
  /// Bấm "Bắt đầu" — đưa người dùng sang tab Tập luyện, nơi màn tập sống.
  var onStartWorkout: () -> Void
  @State private var showsSettings = false
  @State private var showsPlan = false
  @State private var showsManualLog = false

  var body: some View {
    TodayScreen(
      controller: flow.today,
      onStartWorkout: onStartWorkout,
      // Nút của thẻ (`today-training.tsx:338`): "Chọn buổi tập" mở kế hoạch
      // của hôm nay (`/workouts/plan?day=today`); "Ghi buổi tập" / "Ghi thêm
      // buổi phát sinh" mở màn ghi tay (`/log-workout`).
      onChoosePlan: flow.plan == nil ? nil : { showsPlan = true },
      onLogWorkout: { showsManualLog = true },
      onOpenSettings: { showsSettings = true },
      onRefresh: { await flow.refresh() },
      // Thẻ sẵn sàng / Apple Health / phòng linh vật (#527) — cửa của RN là Today.
      extrasUserId: flow.today.userId
    )
    .sheet(isPresented: $showsSettings) { SettingsSheet() }
    .sheet(isPresented: $showsPlan) {
      // Kế hoạch tuần mở trên hôm nay; từ đó: gán buổi, builder, thư viện,
      // bảng tập của mọi ngày (#541, #540, #543, #547).
      NavigationStack { WeekPlanView(flow: flow) }
    }
    .sheet(isPresented: $showsManualLog) { ManualLogView(flow: flow) }
  }
}

/// Tab Tập luyện: màn tập của hôm nay, lịch sử qua nút trên thanh điều hướng.
struct WorkoutsTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var showsHistory = false
  /// Buổi vừa chốt → màn tóm tắt (audit #527 6138699103: trước đây kết quả
  /// của `finish()` bị bỏ đi và `WorkoutSummaryView` không được mở ở đâu).
  @State private var finished: FinishedWorkout?
  @State private var sharing = false

  var body: some View {
    Group {
      if let session = flow.session {
        WorkoutView(
          controller: session,
          // Hàng "đang nghỉ" cần biết set nào vừa tick; `RestTimerController`
          // chỉ giữ set KẾ TIẾP. Chưa nối (#527 PARTIAL) — thẻ nghỉ vẫn hiện.
          restingRowKey: nil,
          restTimer: rest.timer,
          onAdjustRest: { rest.adjust(by: $0) },
          onSkipRest: { rest.handle(.cancel) },
          onSetRestPaused: { rest.setPaused($0) },
          outboxStatus: outboxStatus,
          onFinish: {
            // Set dựng TRƯỚC khi chốt, từ đúng đầu vào `finish()` dùng: sau khi
            // chốt, tiến độ của ngày được neo lại (`anchoring`).
            let sets = Self.summarySets(session)
            let summary = try await flow.finish()
            finished = FinishedWorkout(summary: summary, sets: sets)
          },
          onAppend: { _ = try await flow.append() },
          onOpenHistory: openHistory
        )
      } else {
        NavigationStack {
          // Trang gốc của tab (`(tabs)/workouts/index.tsx`): mẫu buổi tập,
          // builder, lịch sử, thư viện bài tập, tiến bộ từng bài.
          WorkoutsHomeView(flow: flow)
          .navigationTitle(Text("tab.workouts"))
          .ascndPage()
          .toolbar {
            if let openHistory {
              ToolbarItem(placement: .topBarTrailing) {
                Button(action: openHistory) {
                  Image(systemName: "clock.arrow.circlepath")
                    .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Text("history.title"))
              }
            }
          }
        }
      }
    }
    .sheet(isPresented: $showsHistory) {
      if let history = flow.history {
        NavigationStack { WorkoutHistoryView(book: history) }
      }
    }
    .sheet(item: $finished, onDismiss: { sharing = false }) { f in
      NavigationStack {
        WorkoutSummaryView(
          summary: f.summary, sets: f.sets,
          onDone: { finished = nil },
          onShare: { sharing = true })
        .navigationDestination(isPresented: $sharing) {
          CommunityShareWorkoutScreen(sessionId: f.summary.sessionId) { finished = nil }
        }
      }
    }
  }

  struct FinishedWorkout: Identifiable {
    let summary: WorkoutSummary
    let sets: [SummarySet]
    var id: String { summary.sessionId }
  }

  /// Set đã làm của buổi (kể cả khởi động — màn tóm tắt hiện mờ), theo
  /// `WorkoutDay.sessionSets` như bản ghi `finish()` gửi đi.
  static func summarySets(_ session: WorkoutSessionController) -> [SummarySet] {
    WorkoutDay.sessionSets(session.rows, session.progress, toKg: session.weightUnit.toKg).map {
      SummarySet(
        exerciseName: $0.exerciseName, weightKg: $0.weightKg > 0 ? $0.weightKg : nil,
        reps: $0.reps, durationSec: $0.durationSec, warmup: $0.warmup)
    }
  }

  /// Không có `HistoryBook` (app không đưa chỗ đọc) thì không có nút.
  private var openHistory: (() -> Void)? {
    flow.history == nil ? nil : { showsHistory = true }
  }

  private var outboxStatus: OutboxStatus {
    if services.sync.deadCount > 0 { return .dead(services.sync.deadCount) }
    if services.sync.pendingCount > 0 { return .pending(services.sync.pendingCount) }
    return .ok
  }
}

/// Cài đặt của phiên: tài khoản, phiên bản, đăng xuất.
private struct SettingsSheet: View {
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?

  var body: some View {
    SettingsView(
      account: account,
      onSignOut: { Task { await services.session.signOut() } },
      // Đổi ngay trong app, mọi chữ theo (`AppLanguage`, #527 · 1.7).
      onLanguageChange: { code in
        if let choice = AppPreferences.LangChoice(rawValue: code) { services.setLanguage(choice) }
      },
      language: services.preferences.lang.rawValue,
      theme: services.preferences.theme.rawValue,
      onThemeChange: { code in
        if let t = AppPreferences.Theme(rawValue: code) { services.preferences.setTheme(t) }
      },
      makePasswordChange: { PasswordChangeController(session: services.session) },
      legalLang: services.preferences.lang,
      profileBook: profile
    )
    .presentationDragIndicator(.visible)
  }

  private var account: AccountSummary? {
    guard case .signedIn(let s) = services.session.phase else { return nil }
    return AccountSummary(email: s.email)
  }
}
