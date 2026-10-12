import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thân tab Hôm nay khi có phiên (#527) — theo thứ tự của `(tabs)/index.tsx`:
/// đầu trang (logo, chuỗi ngày, avatar → Cài đặt), hàng năng lượng (→ phòng
/// linh vật), trang sẵn sàng lớn (→ sinh trắc học, tấm giải thích), hàng Koa,
/// rồi phần buổi tập (`plan`, do `TodayView` vẽ), xu hướng 7 ngày, thẻ Apple
/// Health, cân nặng, lối vào tổng kết tuần.
///
/// Chỉ là nối dây: sổ dựng ở `AppServices`, một lần mỗi phiên (cây của tab
/// dựng lại theo `.id(userId)`), đóng khi phiên kết thúc. Thiếu cấu hình
/// Supabase thì sổ là `nil` và thẻ không hiện.
struct TodayExtras<Plan: View>: View {
  let userId: String
  /// Avatar → Cài đặt; `nil` thì không có avatar.
  var onOpenSettings: (() -> Void)?
  /// "Ghi" ở dòng Buổi tập → màn ghi buổi tay (`/log-workout`); `nil` thì nút không làm gì.
  var onLogWorkout: (() -> Void)?
  /// Thẻ buổi tập hôm nay + nút chính (`TodayView`).
  @ViewBuilder var plan: () -> Plan

  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.weightUnit) private var unit
  @State private var readiness: ReadinessBook?
  @State private var biometrics: BiometricsBook?
  @State private var awards: AwardsBook?
  @State private var mascot: MascotRoomController?
  @State private var challenges: WeeklyChallengesBook?
  @State private var weekly: WeeklyReviewBook?
  @State private var trend: ReadinessTrendBook?
  /// Cân hôm nay cho hàng "Cân nặng" (`todo-card.tsx: weight → /log-weight`).
  @State private var weight: WeightLogger?
  @State private var showsWeight = false
  @State private var showsBiometrics = false
  @State private var showsRoom = false
  /// Tín hiệu bữa / ngủ / sinh trắc / cân của hôm nay cho thẻ việc.
  @State private var todo: ReminderTodayBook?
  @State private var logging: TodayTodo?
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var built = false

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      header
      if let mascot, case .ready = mascot.phase {
        Button { showsRoom = true } label: { TodayEnergyRow(room: mascot) }
          .buttonStyle(.plain)
          .accessibilityAddTraits(.isButton)
      }
      if let readiness {
        ReadinessCardView(
          book: readiness, lang: services.preferences.lang,
          onOpenBiometrics: biometrics == nil ? nil : { showsBiometrics = true })
      }
      if let mascot, case .ready = mascot.phase {
        Button { showsRoom = true } label: { TodayKoaRow(room: mascot) }
          .buttonStyle(.plain)
      }
      if let todo {
        TodayTodoCard(done: { isDone($0, todo) }, onLog: log)
      }
      plan()
      if let trend {
        ReadinessTrendCardView(book: trend)
      }
      HealthSyncCard(isAvailable: services.health.isAvailable, sync: syncHealth)
      if let weight {
        // Lối vào màn ghi cân (#527 Phase 4) — RN mở từ thẻ việc hôm nay.
        Button {
          showsWeight = true
        } label: {
          weightRow(weight)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "weight.row")))
        .accessibilityValue(Text(verbatim: weightValue(weight) ?? ""))
      }
      if let weekly {
        // RN mở từ tab Trợ lý ("Tổng kết tuần"), tab ấy chưa có ở bản iOS.
        NavigationLink {
          WeeklyReviewView(book: weekly, lang: services.preferences.lang)
        } label: {
          row(String(localized: "wr.title"), systemImage: "calendar")
        }
        .buttonStyle(.plain)
      }
    }
    .sheet(item: $logging, onDismiss: { Task { await reloadDay() } }) { item in
      switch item {
      case .meal: LogMealView(userId: userId)
      case .sleep: LogSleepView(makeLogger: { services.makeSleepLogger(userId: userId) })
      case .bio: LogBiometricsView(makeLogger: { services.makeBiometricLogger(userId: userId) })
      case .workout, .weight: EmptyView()
      }
    }
    .navigationDestination(isPresented: $showsRoom) {
      if let mascot { MascotRoomView(room: mascot, awards: awards, challenges: challenges) }
    }
    .sheet(isPresented: $showsWeight) {
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }) {
        Task { await weight?.load() }
      }
      .onDisappear { Task { await reloadDay() } }
    }
    .navigationDestination(isPresented: $showsBiometrics) {
      if let biometrics { BiometricsView(book: biometrics) }
    }
    .task {
      guard !built else { return }
      built = true
      let today = Self.today()
      readiness = services.makeReadinessBook(userId: userId, date: today)
      biometrics = services.makeBiometricsBook(userId: userId)
      awards = services.makeAwardsBook(userId: userId)
      mascot = services.makeMascotRoom(userId: userId, today: today)
      challenges = services.makeWeeklyChallenges(userId: userId, today: today)
      weekly = services.makeWeeklyReview(userId: userId, today: today)
      trend = services.makeReadinessTrend(userId: userId, today: today)
      weight = services.makeWeightLogger(userId: userId)
      todo = services.makeReminderToday(userId: userId)
      await todo?.refresh()
      await weight?.load()
      await mascot?.load()
      await readiness?.load()
      await trend?.load()
    }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì đổi ngày; không thì đọc lại điểm (đồng
      // bộ Apple Health / ghi buổi ở nơi khác có thể vừa dựng lại hôm nay).
      guard phase == .active, let readiness else { return }
      Task {
        let today = Self.today()
        if today != readiness.date { await readiness.move(to: today) } else { await readiness.load() }
        // Tuần "này" của màn tổng kết đổi khi qua Chủ nhật.
        await weekly?.move(to: today)
        await mascot?.load()
        await todo?.refresh()
        await trend?.move(to: today)
      }
    }
    // Đóng khi phiên không còn là của người này (đăng xuất / đổi tài khoản) —
    // KHÔNG ở `onDisappear`: nó chạy cả khi đẩy màn con hay đổi tab, và sổ đã
    // đóng thì không mở lại.
    .onChange(of: isCurrentSession) { _, current in
      guard !current else { return }
      readiness?.close()
      biometrics?.close()
      awards?.close()
      mascot?.close()
      challenges?.close()
      weekly?.close()
      trend?.close()
      weight?.close()
      todo?.close()
    }
  }

  // MARK: - Việc hôm nay

  /// Cờ "đã ghi" của từng dòng như `todo-card.tsx`: bữa = `kcal > 0`, buổi tập =
  /// `workout_count > 0`, ngủ = có hàng ngủ hoặc `sleep_duration_min > 0`, sinh
  /// trắc / cân = có hàng hôm nay. Chưa đọc được → chưa ghi (nút "Ghi").
  private func isDone(_ item: TodayTodo, _ book: ReminderTodayBook) -> Bool {
    switch item {
    case .meal: book.signals.mealLogged ?? false
    case .workout: (mascot?.signals?.workoutCount ?? 0) > 0
    case .sleep: book.signals.sleepLogged ?? false
    case .bio: book.signals.bioLogged ?? false
    case .weight: book.signals.weighed ?? (weight?.todayKg != nil)
    }
  }

  private func log(_ item: TodayTodo) {
    switch item {
    case .workout: onLogWorkout?()
    case .weight: showsWeight = true
    case .meal, .sleep, .bio: logging = item
    }
  }

  /// Sau một lần ghi: đọc lại những gì thẻ việc, năng lượng và điểm sẵn sàng hiện.
  private func reloadDay() async {
    await todo?.refresh()
    await mascot?.load()
    await readiness?.load()
  }

  // MARK: - Đầu trang

  /// `BrandLockup` trái; phải là viên chuỗi ngày (≥ 1, → phòng linh vật) và
  /// avatar (→ Cài đặt).
  private var header: some View {
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      BrandLockup()
      Spacer(minLength: 0)
      if let mascot, mascot.streak.count >= 1 {
        StreakChip(count: mascot.streak.count, lit: mascot.streak.loggedToday) { showsRoom = true }
      }
      if let onOpenSettings {
        AccountAvatar(
          initials: AccountInitials.of(name: profile?.profile?.name, email: services.session.session?.email),
          action: onOpenSettings)
      }
    }
  }

  /// Một hàng dẫn sang màn con.
  private func row(_ title: String, systemImage: String) -> some View {
    HStack {
      Label(title, systemImage: systemImage)
        .font(DS.TextStyle.headline)
      Spacer()
      Image(systemName: "chevron.right")
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(DS.Spacing.md)
    .frame(minHeight: 44)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .contentShape(Rectangle())
  }

  /// "Cân nặng · 72.4 kg" khi hôm nay đã cân; chưa cân thì chỉ nhãn.
  private func weightRow(_ w: WeightLogger) -> some View {
    HStack {
      Label(String(localized: "weight.row"), systemImage: "scalemass")
        .font(DS.TextStyle.headline)
      Spacer()
      if let v = weightValue(w) {
        Text(verbatim: v)
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Image(systemName: "chevron.right")
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(DS.Spacing.md)
    .frame(minHeight: 44)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .contentShape(Rectangle())
  }

  private func weightValue(_ w: WeightLogger) -> String? {
    w.todayKg.map { "\(OnboardingRuler.fixed1(unit.display($0))) \(unit.label)" }
  }

  private var isCurrentSession: Bool { services.session.session?.userId == userId }

  /// Đồng bộ Apple Health của B (#554); xong thì điểm hôm nay đọc lại.
  private func syncHealth() async throws(HealthSync.Failure) {
    try await services.health.syncNow(userId: userId, lang: AppServices.appLang)
    await readiness?.load()
    await trend?.load()
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}
