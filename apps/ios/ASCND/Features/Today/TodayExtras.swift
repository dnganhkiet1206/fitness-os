import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thân tab Hôm nay khi có phiên (#527) — bản thiết kế Today đã duyệt
/// (`docs/design/today`), đối chiếu RN ở `docs/design/today/RN-PARITY.md`:
/// tiêu đề lớn + ngày (chuỗi ngày, avatar), khối ngày (Koa + năm ống), thẻ
/// buổi tập mang dòng sẵn sàng (`plan`, do `TodayView` vẽ), "Your day",
/// "More about today", rồi thẻ Apple Health.
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
  /// Nhận dòng sẵn sàng để đặt trong thẻ buổi tập (bản thiết kế Today).
  /// Tên buổi của hôm nay (dòng Buổi tập của "Your day"); `nil` = chưa lên lịch.
  var planName: String?
  /// Nhận dòng sẵn sàng và nút "Ghi giấc ngủ" (khi chưa có điểm) để đặt trong
  /// thẻ buổi tập.
  @ViewBuilder var plan: (_ readiness: AnyView?, _ logSleep: AnyView?) -> Plan

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
  @State private var showsReadiness = false
  @State private var showsTrend = false
  /// Chuyển cảnh zoom: màn con phóng ra từ dòng / Koa vừa chạm.
  @Namespace private var zoom
  @State private var roomSource = "koa"
  @State private var readinessSource = "readiness"
  @State private var biometricsSource = "bio"
  @State private var showsWeekly = false
  @State private var showsSteps = false
  /// Tín hiệu bữa / ngủ / sinh trắc / cân của hôm nay cho thẻ việc.
  @State private var todo: ReminderTodayBook?
  @State private var logging: TodayTodo?
  /// "+250 ml" của khối ngày.
  @State private var water: WaterBook?
  @State private var waterNote: String?
  @State private var waterTaps = 0
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var built = false

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      header
        .todayEntrance(0)
      if let mascot, case .ready = mascot.phase {
        TodayDayBlock(
          room: mascot, localWaterMl: water?.loaded == true ? water?.totalMl : nil,
          onAct: act, onOpenRoom: { roomSource = "koa"; showsRoom = true }, zoom: zoom)
          .todayEntrance(1)
          .preference(key: TodayAccentPreference.self, value: nextSignal(mascot))
          // Rung NGAY lúc chạm nước (RN `Haptics.light()` trong `onPress`).
          .sensoryFeedback(.impact(weight: .light), trigger: waterTaps)
        if let waterNote {
          Text(verbatim: waterNote)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      // Thẻ buổi tập ngay dưới khối ngày, mang dòng sẵn sàng.
      VStack(alignment: .leading, spacing: DS.Spacing.md) { plan(readinessRow, logSleepButton) }
        .todayEntrance(2)
      if let mascot, case .ready = mascot.phase {
        TodayYourDay(rows: dayRows(mascot), onTap: tap)
          .todayEntrance(3)
      }
      TodayMore(rows: moreRows, zoom: zoom)
        .todayEntrance(4)
      HealthSyncCard(isAvailable: services.health.isAvailable, sync: syncHealth)
    }
    // Bữa / nước / ngủ đi qua outbox: hàng đợi vơi đi (server đã nhận) thì đọc
    // lại ngày — như `invalidateQueries` sau `onSettled` của RN.
    .onChange(of: services.sync.pendingCount) { old, new in
      if new < old { Task { await reloadDay() } }
    }
    .sheet(item: $logging, onDismiss: { Task { await reloadDay() } }) { item in
      switch item {
      case .meal: LogMealView(userId: userId)
      case .sleep: LogSleepView(makeLogger: { services.makeSleepLogger(userId: userId) })
      case .bio: LogBiometricsView(makeLogger: { services.makeBiometricLogger(userId: userId) })
      case .workout, .weight: EmptyView()
      }
    }
    .navigationDestination(isPresented: $showsSteps) {
      if let steps = services.makeStepsBook(userId: userId, today: Self.today()) { StepsView(book: steps) }
    }
    .navigationDestination(isPresented: $showsRoom) {
      if let mascot {
        MascotRoomView(room: mascot, awards: awards, challenges: challenges).todayZoom(roomSource, in: zoom)
      }
    }
    .sheet(isPresented: $showsReadiness) {
      if let readiness {
        NavigationStack {
          ScrollView {
            ReadinessCardView(
              book: readiness, lang: services.preferences.lang,
              onOpenBiometrics: biometrics == nil ? nil : {
                showsReadiness = false
                showsBiometrics = true
              },
              startExpanded: true)
          }
          .background(DS.Color.background.swiftUI)
          .toolbar {
            ToolbarItem(placement: .confirmationAction) {
              Button(String(localized: "common.close")) { showsReadiness = false }
            }
          }
        }
        .presentationDetents([.large])
        .presentationBackground(.regularMaterial)
        .todayZoom(readinessSource, in: zoom)
      }
    }
    .sheet(isPresented: $showsWeight) {
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }) {
        Task { await weight?.load() }
      }
      .onDisappear { Task { await reloadDay() } }
    }
    .navigationDestination(isPresented: $showsTrend) {
      if let trend {
        ScrollView {
          // Thẻ RN tự ẩn khi dưới 2 ngày — ở màn riêng thì nói lý do thay vì trang trắng.
          if trend.stats == nil {
            DSEmptyState(
              systemImage: "chart.bar", title: String(localized: "rt.title"),
              message: String(localized: "today.more.trend.empty"))
          } else {
            ReadinessTrendCardView(book: trend)
          }
        }
        .contentMargins(DS.Spacing.md, for: .scrollContent)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DS.Color.background.swiftUI)
          .navigationTitle(Text(String(localized: "rt.title")))
          .todayZoom("trend", in: zoom)
      }
    }
    .navigationDestination(isPresented: $showsWeekly) {
      if let weekly { WeeklyReviewView(book: weekly, lang: services.preferences.lang).todayZoom("weekly", in: zoom) }
    }
    .navigationDestination(isPresented: $showsBiometrics) {
      if let biometrics { BiometricsView(book: biometrics).todayZoom(biometricsSource, in: zoom) }
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
      water = services.makeWaterBook(userId: userId)
      await todo?.refresh()
      await weight?.load()
      await mascot?.load()
      await water?.load()
      await readiness?.load()
      await trend?.load()
      await biometrics?.load()
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
      water?.close()
    }
  }

  // MARK: - Your day

  /// Năm tín hiệu (cùng `DailySignals` với khối ngày, nước gộp phần chờ gửi)
  /// rồi cân nặng và sinh trắc. Cờ "đã ghi" như `todo-card.tsx`: bữa = `kcal >
  /// 0`, ngủ = có hàng ngủ hoặc phút ngủ, sinh trắc / cân = có hàng hôm nay.
  private func dayRows(_ room: MascotRoomController) -> [TodayYourDay.Row] {
    let s = TodayDay.merging(room.signals, localWaterMl: water?.loaded == true ? water?.totalMl : nil)
    let goal = room.stepsGoal
    let flags = todo?.signals
    func done(_ q: MascotRules.Quest) -> Bool { s?.done(q, stepsGoal: goal) ?? false }
    let num = { (v: Double, digits: Int) in v.formatted(.number.precision(.fractionLength(0...digits)).locale(.app)) }
    let sleepMin = Int((s?.sleepMinutes ?? 0).rounded())
    let sleep = done(.sleep) && sleepMin > 0
      ? String(localized: "today.d.sleep \(sleepMin / 60) \(sleepMin % 60)")
      : done(.sleep) ? String(localized: "today.tube.done") : String(localized: "today.d.sleep.ask")
    let kcal = s?.kcal ?? 0
    let meal = kcal > 0 ? String(localized: "today.d.meal \(num(kcal, 0))") : String(localized: "today.d.meal.none")
    let waterLine = String(
      localized: "today.d.water \(num((s?.waterMl ?? 0) / 1000, 1)) \(num(TodayDay.waterTarget(s) / 1000, 1))")
    let workouts = Int(s?.workoutCount ?? 0)
    let workout =
      workouts > 0
      ? (workouts == 1 ? String(localized: "today.d.workout.done.one") : String(localized: "today.d.workout.done.other \(workouts)"))
      : planName.map { String(localized: "today.d.workout.planned \($0)") } ?? String(localized: "today.d.workout.none")
    let steps = String(localized: "today.d.steps \(num(s?.steps ?? 0, 0)) \(num(Double(goal), 0))")
    let kg = weight?.todayKg
    let weighed = flags?.weighed ?? (kg != nil)
    let weightLine = kg.map { "\(OnboardingRuler.fixed1(unit.display($0))) \(unit.label)" }
      ?? (weighed ? String(localized: "today.tube.done") : String(localized: "today.d.weight.none"))
    return [
      .init(kind: .sleep, detail: sleep, done: done(.sleep)),
      .init(kind: .meal, detail: meal, done: done(.meal)),
      .init(kind: .water, detail: waterLine, done: done(.water)),
      .init(kind: .workout, detail: workout, done: done(.workout)),
      .init(kind: .steps, detail: steps, done: done(.steps)),
      .init(kind: .weight, detail: weightLine, done: weighed),
      .init(kind: .bio, detail: String(localized: "today.d.bio"), done: flags?.bioLogged ?? false),
    ]
  }

  private func tap(_ kind: TodayYourDay.Row.Kind) {
    switch kind {
    case .sleep: act(.sleep)
    case .meal: act(.meal)
    case .water: act(.water)
    case .workout: act(.workout)
    case .steps: showsSteps = true
    case .weight: showsWeight = true
    case .bio: logging = .bio
    }
  }

  // MARK: - More about today

  /// Sinh trắc hôm nay, tải tuần so với thói quen (`loadComparison` trên ACWR
  /// mà engine đã ghi — RN `training-card.ts`), trung bình sẵn sàng 7 ngày,
  /// tổng kết tuần, phòng linh vật.
  private var moreRows: [TodayMore.Row] {
    var rows: [TodayMore.Row] = []
    if biometrics != nil {
      let b = todayBiometrics
      let hrv = b?.hrvSdnn ?? b?.hrvRmssd
      let parts = [b?.hr.map { "\(Int($0.rounded())) bpm" }, hrv.map { "\(Int($0.rounded())) ms" }].compactMap { $0 }
      rows.append(.init(
        id: "bio", title: String(localized: "today.todo.bio"),
        value: parts.isEmpty ? "—" : parts.joined(separator: " · "),
        action: { biometricsSource = "bio"; showsBiometrics = true }))
    }
    if readiness != nil {
      rows.append(.init(
        id: "load", title: String(localized: "today.more.training"), value: loadText,
        action: { readinessSource = "load"; showsReadiness = true }))
    }
    if let trend {
      let avg = trend.stats.map { String(localized: "today.more.avg \(Int($0.average))") } ?? "—"
      rows.append(.init(id: "trend", title: String(localized: "rt.title"), value: avg, action: { showsTrend = true }))
    }
    if weekly != nil {
      rows.append(.init(id: "weekly", title: String(localized: "wr.title"), value: nil, action: { showsWeekly = true }))
    }
    if let mascot, case .ready = mascot.phase {
      rows.append(.init(
        id: "room", title: String(localized: "mr.title"),
        value: String(localized: "today.more.level \(mascot.level)"), action: { roomSource = "room"; showsRoom = true }))
    }
    return rows
  }

  /// Việc kế tiếp của Koa (cùng `MascotLine` với khối ngày) — màu vầng sáng.
  private func nextSignal(_ room: MascotRoomController) -> MascotRules.Quest? {
    let s = TodayDay.merging(room.signals, localWaterMl: water?.loaded == true ? water?.totalMl : nil)
    let hour = Calendar.current.component(.hour, from: .now)
    return MascotLine.line(TodayDay.mascotDay(s, hour: hour)).gap.map(TodayDay.quest)
  }

  /// "+8%" / "−12%" so với tuần thói quen; chưa có ACWR → "—".
  private var loadText: String {
    guard let readiness, case .ready(let day) = readiness.phase, let acwr = day.acwr else { return "—" }
    let c = ReadinessCard.loadComparison(acwr)
    return c.percent == 0 ? "0%" : "\(c.heavier ? "+" : "−")\(c.percent)%"
  }

  /// Dòng sẵn sàng của thẻ buổi tập; chạm → thẻ sẵn sàng RN ở dạng mở.
  private var readinessRow: AnyView? {
    guard let readiness else { return nil }
    return AnyView(
      TodayReadinessRow(
        book: readiness, lang: services.preferences.lang,
        onOpen: { readinessSource = "readiness"; showsReadiness = true }
      ).matchedTransitionSource(id: "readiness", in: zoom))
  }

  /// "Ghi giấc ngủ" cạnh nút chính khi chưa có điểm sẵn sàng — một đêm ngủ là
  /// một cách để có điểm (`rd.empty.message`).
  private var logSleepButton: AnyView? {
    guard let readiness, case .empty = readiness.phase else { return nil }
    return AnyView(DSButton(String(localized: "today.do.sleep"), style: .secondary) { logging = .sleep })
  }

  /// Nút của khối ngày / chạm ống: ngủ, bữa → màn ghi; nước → +250 ml ngay;
  /// buổi tập → màn ghi buổi tay; bước đến từ Apple Health, không có nút.
  private func act(_ q: MascotRules.Quest) {
    switch q {
    case .sleep: logging = .sleep
    case .meal: logging = .meal
    case .workout: onLogWorkout?()
    case .water:
      waterTaps += 1
      Task { await addWater() }
    case .steps: break
    }
  }

  static var waterStepMl: Int { 250 }

  private func addWater() async {
    guard let water else { return }
    waterNote = nil
    do {
      _ = try await water.add(amountMl: Self.waterStepMl, online: services.sync.online)
      AccessibilityNotification.Announcement(String(localized: "today.water.added")).post()
    } catch {
      waterNote = String(localized: "async.error.generic")
    }
  }

  /// Sau một lần ghi: đọc lại những gì thẻ việc, năng lượng và điểm sẵn sàng hiện.
  private func reloadDay() async {
    await todo?.refresh()
    await mascot?.load()
    await water?.refresh()
    await readiness?.load()
    await biometrics?.load()
  }

  /// Lần đo sinh trắc mới nhất của HÔM NAY (`useTodayBiometrics`).
  private var todayBiometrics: Biometrics.Sample? {
    guard let biometrics, case .ready(let samples) = biometrics.phase else { return nil }
    let cal = Calendar.current
    return samples
      .filter { cal.isDateInToday(Date(timeIntervalSince1970: Double($0.at.millis) / 1000)) }
      .max { $0.at < $1.at }
  }

  // MARK: - Đầu trang

  /// Tiêu đề lớn "Hôm nay" + ngày; phải là viên chuỗi ngày (≥ 1, → phòng linh
  /// vật) và avatar (→ Cài đặt). Logo của RN bỏ — đã ở biểu tượng app.
  private var header: some View {
    HStack(alignment: .top, spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 0) {
        Text(String(localized: "tab.today"))
          .font(.largeTitle.bold())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Text(verbatim: Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(.app)))
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
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

  private var isCurrentSession: Bool { services.session.session?.userId == userId }

  /// Đồng bộ Apple Health của B (#554); xong thì điểm hôm nay đọc lại.
  private func syncHealth() async throws(HealthSync.Failure) {
    try await services.health.syncNow(userId: userId, lang: AppServices.appLang)
    await readiness?.load()
    await trend?.load()
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}
