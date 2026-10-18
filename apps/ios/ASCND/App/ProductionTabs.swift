import ASCNDCore
import ASCNDDesignSystem
import SwiftUI
import UIKit

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
    .sheet(isPresented: $showsSettings) { MyProfileSheet(userId: flow.today.userId) }
    .sheet(isPresented: $showsPlan) {
      // Kế hoạch tuần mở trên hôm nay; từ đó: gán buổi, builder, thư viện,
      // bảng tập của mọi ngày (#541, #540, #543, #547).
      NavigationStack { WeekPlanView(flow: flow) }
    }
    .sheet(isPresented: $showsManualLog) { ManualLogView(flow: flow) }
  }
}

/// Tab Tập luyện (thiết kế lại 14/10, chủ dự án duyệt mock): trang gốc LUÔN
/// là trang chính (`(tabs)/workouts/index.tsx` — thẻ hôm nay + nút bắt đầu);
/// màn tập là một lớp toàn màn hình mở từ thẻ (hay từ "Bắt đầu" ở Hôm nay),
/// thu xuống vẫn giữ tiến độ. Trước đây hễ có buổi trong kế hoạch thì cả tab
/// là màn tập — không vào được mẫu, thư viện, kế hoạch tuần.
struct WorkoutsTab: View {
  /// "Bắt đầu" ở tab Hôm nay: mở thẳng màn tập (về `false` khi đã nhận).
  @Binding var launch: Bool
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var showsHistory = false
  @State private var showsSession = false
  /// Buổi vừa chốt → màn tóm tắt (audit #527 6138699103: trước đây kết quả
  /// của `finish()` bị bỏ đi và `WorkoutSummaryView` không được mở ở đâu).
  @State private var finished: FinishedWorkout?
  @State private var sharing = false
  /// Tab đang trên màn (giữa `onAppear` và `onDisappear`).
  @State private var visible = false
  /// "Bắt đầu" ở Hôm nay đã bấm, chờ tab lên màn / buổi dựng xong.
  @State private var pendingLaunch = false

  init(launch: Binding<Bool> = .constant(false)) {
    _launch = launch
  }

  var body: some View {
    NavigationStack {
      WorkoutsHomeView(flow: flow, onOpenSession: { showsSession = true })
    }
    // "Bắt đầu" ở Hôm nay: chỉ mở lớp toàn màn hình khi tab ĐÃ lên màn và
    // buổi đã dựng xong. Mở cùng nhịp đổi tab thì SwiftUI bỏ qua (14/10: chỉ
    // đổi tab); chờ một khoảng cố định thì máy chậm vẫn trượt.
    .onAppear {
      visible = true
      tryLaunch()
    }
    .onDisappear { visible = false }
    .onChange(of: launch, initial: true) { _, go in
      guard go else { return }
      launch = false
      pendingLaunch = true
      tryLaunch()
    }
    .onChange(of: flow.session != nil) { _, _ in tryLaunch() }
    .fullScreenCover(isPresented: $showsSession) {
      sessionScreen
        .sheet(isPresented: $showsHistory) {
          if let history = flow.history {
            NavigationStack { WorkoutHistoryView(book: history) }
          }
        }
        .sheet(item: $finished, onDismiss: { sharing = false }) { f in
          NavigationStack {
            WorkoutSummaryView(
              summary: f.summary, sets: f.sets,
              onDone: {
                finished = nil
                showsSession = false
              },
              onShare: { sharing = true })
            .navigationDestination(isPresented: $sharing) {
              CommunityShareWorkoutScreen(sessionId: f.summary.sessionId) {
                finished = nil
                showsSession = false
              }
            }
          }
        }
    }
  }

  private func tryLaunch() {
    guard pendingLaunch, visible, flow.session != nil else { return }
    pendingLaunch = false
    // Sang nhịp sau: lần trình bày này không chung giao dịch với lần tab hiện.
    Task { @MainActor in
      await Task.yield()
      showsSession = true
    }
  }

  @ViewBuilder private var sessionScreen: some View {
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
          Telemetry.capture(.workoutCompleted)
          services.didLog()
          finished = FinishedWorkout(summary: summary, sets: sets)
        },
        onAppend: { _ = try await flow.append() },
        onOpenHistory: openHistory,
        onClose: { showsSession = false }
      )
    } else {
      // Phiên biến mất khi đang mở (qua nửa đêm, đổi tài khoản): đóng lớp.
      Color.clear.onAppear { showsSession = false }
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

/// Trang Hồ sơ của mình (15/10, chủ dự án chọn "Một trang Hồ sơ"): avatar ở Hôm nay
/// mở cùng trang với nút hồ sơ của Cộng đồng — công khai + mục tiêu + tập luyện;
/// bánh răng → Cài đặt.
private struct MyProfileSheet: View {
  let userId: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      CommunityUserScreen(targetId: userId)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button(String(localized: "common.close")) { dismiss() }
          }
        }
    }
    .presentationDragIndicator(.visible)
  }
}

/// Cài đặt của phiên: tài khoản, phiên bản, đăng xuất. Mở từ bánh răng của trang
/// Hồ sơ (`CommunityUserView`).
struct SettingsSheet: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    SettingsView(
      account: account,
      onSignOut: { Task { await signOut() } },
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
      healthAvailable: services.health.isAvailable,
      healthSync: { () async throws(HealthSync.Failure) in
        guard case .signedIn(let s) = services.session.phase else { return }
        try await services.health.syncNow(userId: s.userId, lang: AppServices.appLang)
        services.startHealthObserving()
      },
      healthConnected: { await services.health.isConnected() },
      phoneSteps: services.health.phoneStepsAvailable
        ? PhoneSteps(
          isOn: { services.health.phoneStepsOn },
          enable: {
            guard case .signedIn(let s) = services.session.phase else { return false }
            return await services.health.enablePhoneSteps(userId: s.userId)
          })
        : nil,
      // Xoá xong thì đăng xuất (đóng mọi bảng, dọn máy) — tài khoản không còn.
      deleteAccount: services.accountDeleter.map { deleter in
        {
          let result = await deleter.deleteAccount()
          if result == .deleted { await signOut() }
          return result
        }
      }
    )
    .presentationDragIndicator(.visible)
  }

  /// Đóng mọi bảng đang mở (Hồ sơ → Cài đặt chồng nhau) rồi đăng xuất — để màn
  /// Đăng nhập hiện ra ngay, không bị bảng cũ che (16/10, chủ dự án: "không đăng
  /// xuất được").
  private func signOut() async {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows { window.rootViewController?.dismiss(animated: true) }
    }
    await services.session.signOut()
  }

  private var account: AccountSummary? {
    guard case .signedIn(let s) = services.session.phase else { return nil }
    return AccountSummary(email: s.email)
  }
}
