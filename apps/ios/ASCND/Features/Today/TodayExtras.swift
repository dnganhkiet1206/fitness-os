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
  /// Nhịp "kéo để tải lại" của trang.
  var refreshTick = 0
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
  /// Tủ đồ Koa (Koa đợt 1): Koa ở Hôm nay mặc đúng đồ đang mặc trong phòng —
  /// CÙNG sổ với phòng, nên thay đồ ở phòng là Koa ngoài này đổi theo.
  @State private var shop: MascotShopBook?
  /// Ngày đã đọc xong lần đầu: thưởng chuỗi tự về SAU đó là việc vừa làm (mừng),
  /// còn lúc mở app thì không diễn lại.
  @State private var dayLoaded = false
  @State private var challenges: WeeklyChallengesBook?
  /// Điểm 7 ngày qua — chỉ để dòng sẵn sàng hiện điểm gần nhất khi hôm nay chưa có
  /// (cùng quyết định với Trợ lý, `AssistantSummary.shown`).
  @State private var trend: ReadinessTrendBook?
  /// Ba vòng hoạt động (RN `ActivityRingsCard`).
  @State private var activity: ActivityRingsBook?
  @State private var showsActivity = false
  /// Cân hôm nay cho hàng "Cân nặng" (`todo-card.tsx: weight → /log-weight`).
  @State private var weight: WeightLogger?
  /// "Như hôm qua" trên dòng Bữa ăn (17/10): sổ ghi bữa hôm nay, chỉ để đọc các
  /// bữa hôm qua và chép một chạm.
  @State private var meals: MealLogger?
  /// "Ghi cả ngày" (18/10): form một lần cho mọi việc còn thiếu.
  @State private var showsDayLog = false
  /// Giấc đêm qua do Apple Health điền (không phải ghi tay) — ô Ngủ ghi "Apple Health".
  @State private var sleepFromHealth = false
  @State private var showsWeight = false
  @State private var showsBiometrics = false
  @State private var showsRoom = false
  /// Mục Thông báo (16/10): hộp cộng đồng + thử thách cộng đồng chưa nhận.
  @State private var inbox: CommunityInboxBook?
  @State private var communityChallenges: CommunityChallengesBook?
  /// Tin nhắc việc đã xem (`NoticeSeen`).
  @State private var seenNotices: Set<String> = []
  /// Gói trả phí → thỉnh thoảng hiện "ASCND Intelligence" ở logo đầu trang.
  @State private var paid = false
  @State private var showsAwards = false
  @State private var showsReadiness = false
  @Environment(DeepLinkInbox.self) private var links: DeepLinkInbox?
  /// Chuyển cảnh zoom: màn con phóng ra từ dòng / Koa vừa chạm.
  @Namespace private var zoom
  @State private var roomSource = "koa"
  @State private var readinessSource = "readiness"
  @State private var biometricsSource = "bio"
  @State private var showsSteps = false
  /// Tín hiệu bữa / ngủ / sinh trắc / cân của hôm nay cho thẻ việc.
  @State private var todo: ReminderTodayBook?
  @State private var logging: TodayTodo?
  /// "+250 ml" của khối ngày.
  /// Nước của Today là CÙNG sổ với tab Dinh dưỡng (`NutritionBooks` của phiên)
  /// — ly thêm ở đây hiện ngay ở kia và ngược lại; chỉ khi không có (preview)
  /// thì Today tự dựng sổ riêng và tự đóng.
  @Environment(NutritionBooks.self) private var nutrition: NutritionBooks?
  @State private var ownWater: WaterBook?
  private var water: WaterBook? { nutrition?.water ?? ownWater }
  @State private var showsSupplements = false
  @State private var waterNote: String?
  @State private var waterTaps = 0
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var built = false

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      header
        .todayEntrance(0)
      // Ba việc đầu tiên cho người mới (15/10) — tự ẩn khi xong / sau 7 ngày.
      if isCurrentSession {
        TodayStartCard(
          userId: userId,
          signals: mascot.flatMap { TodayDay.merging($0.signals, localWaterMl: nil) },
          onMeal: { logging = .meal }, onWorkout: onLogWorkout)
      }
      if let mascot, case .loading = mascot.phase {
        // Bóng đúng cỡ khối ngày (RN `TodaySkeleton part="hero"`) — không để
        // trang nhảy khi dữ liệu về, không vẽ một ngày "0 of 5" giả.
        RoundedRectangle(cornerRadius: 30, style: .continuous)
          .fill(DS.Color.foreground.swiftUI.opacity(0.05))
          .frame(height: 300)
          .accessibilityLabel(Text(String(localized: "today.loading")))
      } else if let mascot, case .failed = mascot.phase {
        // RN `LoadFailed`: nói là không đọc được và cho thử lại.
        VStack(spacing: DS.Spacing.sm) {
          Text(String(localized: "async.error.generic"))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Button(String(localized: "common.retry")) { Task { await mascot.load() } }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity)
        .padding(DS.Spacing.lg)
        .todayCard()
      }
      if let mascot, case .ready = mascot.phase {
        TodayDayBlock(
          room: mascot, localWaterMl: water?.loaded == true ? water?.totalMl : nil,
          onAct: act, onOpenRoom: { roomSource = "koa"; showsRoom = true }, zoom: zoom,
          profile: profile?.profile, riskHour: KoaToday.riskHour(services.habitHours, userId: userId),
          equipped: shop?.inventory.filter(\.equipped).map(\.itemKey) ?? [], reward: services.koaReward)
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
        // "Hôm nay của bạn" (18/10, mock A): thay danh sách "Ngày của bạn".
        TodayDayCard(
          tiles: dayTiles(mascot), weighIn: weighInRow, onLogAll: { showsDayLog = true },
          onTap: tapItem, onWeight: { showsWeight = true })
          .todayEntrance(3)
      }
      // Apple Health chỉ ở Cài đặt (18/10, chủ dự án): Hôm nay không có thẻ Health —
      // đồng bộ tự chạy (mở app + nền), người dùng không phải nghĩ tới nó.
      TodayMore(rows: moreRows, zoom: zoom)
        .todayEntrance(4)
      if let awards {
        RecentAwardsCard(book: awards, lang: services.preferences.lang) { showsAwards = true }
      }
    }
    // Bữa / nước / ngủ đi qua outbox: hàng đợi vơi đi (server đã nhận) thì đọc
    // lại ngày — như `invalidateQueries` sau `onSettled` của RN.
    .onChange(of: services.sync.pendingCount) { old, new in
      if new < old { Task { await reloadDay() } }
    }
    // "Ghi hôm nay" (19/10): một màn cho cả nói, gõ và chip "như thường lệ".
    .sheet(isPresented: $showsDayLog, onDismiss: { Task { await reloadDay() } }) {
      TellKoaSheet(userId: userId)
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
    .navigationDestination(isPresented: $showsAwards) {
      if let awards { AwardsView(book: awards, lang: services.preferences.lang) }
    }
    .navigationDestination(isPresented: $showsRoom) {
      if let mascot {
        MascotRoomView(room: mascot, awards: awards, challenges: challenges, sharedShop: shop)
          .todayZoom(roomSource, in: zoom)
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
    .navigationDestination(isPresented: $showsActivity) {
      if let activity {
        ActivityRingsView(book: activity, stepsTarget: mascot?.stepsGoal ?? DailySignals.defaultStepsGoal)
          .todayZoom("activity", in: zoom)
      }
    }
    .navigationDestination(isPresented: $showsSupplements) {
      if let supplements = nutrition?.supplements {
        SupplementsView(book: supplements).todayZoom("supplements", in: zoom)
      }
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
      shop = services.makeMascotShop(userId: userId)
      challenges = services.makeWeeklyChallenges(userId: userId, today: today)
      trend = services.makeReadinessTrend(userId: userId, today: today)
      activity = services.makeActivityRings(userId: userId, today: today)
      weight = services.makeWeightLogger(userId: userId)
      todo = services.makeReminderToday(userId: userId)
      inbox = services.makeCommunityInbox(userId: userId)
      communityChallenges = services.makeCommunityChallenges(userId: userId)
      seenNotices = NoticeSeen.load(userId: userId)
      Task { paid = await services.isPaid() }
      if nutrition == nil { ownWater = services.makeWaterBook(userId: userId) }
      await todo?.refresh()
      await weight?.load()
      await loadMeals()
      await mascot?.load()
      dayLoaded = true
      await shop?.load()
      if let nutrition { await nutrition.loadOnce() } else { await ownWater?.load() }
      await readiness?.load()
      await trend?.load()
      await activity?.load()
      await biometrics?.load()
      await focusChecks()
      await loadNotifications()
    }
    .onChange(of: refreshTick) { _, _ in
      Task {
        await reloadDay()
        await focusChecks()
        await loadNotifications()
      }
    }
    // Lượt tự đồng bộ (ra tiền cảnh, AppServices) xong sau lần đọc của màn.
    .onReceive(NotificationCenter.default.publisher(for: .healthSynced)) { _ in
      Task { await reloadAfterHealthSync() }
    }
    // Koa đợt 1: xu nhiệm vụ tự về (bộ quan sát của app) → đọc lại ví, báo lên cấp.
    .onChange(of: services.koaReward?.id) { _, _ in
      guard let mascot, services.koaReward?.userId == userId else { return }
      Task {
        let before = mascot.level
        await mascot.refreshWallet()
        announceLevel(from: before, mascot)
      }
    }
    // Koa ló lên ở tab khác mặc đúng đồ đang mặc.
    .onChange(of: shop?.inventory, initial: true) { _, rows in
      guard let rows else { return }
      services.koaEquipped = rows.filter(\.equipped).map(\.itemKey)
    }
    // Nhắc chuỗi của Koa (đợt 2B) cần chuỗi hiện tại.
    .onChange(of: mascot?.streak, initial: true) { _, value in
      guard let value, let mascot, case .ready = mascot.phase else { return }
      services.koaStreak = (userId, value)
    }
    // Thưởng chuỗi tự về trong lần đọc ngày.
    .onChange(of: mascot?.streakAutoClaim) { _, outcome in
      guard let outcome, let mascot else { return }
      mascot.streakAutoClaimShown()
      services.noteKoaReward(userId: userId, amount: outcome.amount, seen: dayLoaded)
    }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì đổi ngày; không thì đọc lại điểm (đồng
      // bộ Apple Health / ghi buổi ở nơi khác có thể vừa dựng lại hôm nay).
      guard phase == .active, let readiness else { return }
      Task {
        let today = Self.today()
        if today != readiness.date { await readiness.move(to: today) } else { await readiness.load() }
        await mascot?.load()
        await todo?.refresh()
        await focusChecks()
        await trend?.move(to: today)
        await activity?.load(today: today)
        await loadMeals()
        await loadNotifications()
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
      shop?.close()
      challenges?.close()
      trend?.close()
      activity?.close()
      weight?.close()
      meals?.close()
      todo?.close()
      ownWater?.close()
    }
  }

  // MARK: - More about today

  /// Hôm nay để LÀM (15/10, chủ dự án chọn "Chia rõ"): thực phẩm bổ sung, ba vòng,
  /// phòng linh vật. Sinh trắc học, giấc ngủ, tập luyện, xu hướng, tổng kết tuần
  /// — những thứ để HIỂU — ở tab Trợ lý.
  private var moreRows: [TodayMore.Row] {
    var rows: [TodayMore.Row] = []
    // Thực phẩm bổ sung (RN `SupplementChecklistCard` trong nhóm Dinh dưỡng).
    if let sup = nutrition?.supplements, !sup.items.isEmpty {
      rows.append(.init(
        id: "supplements", title: String(localized: "supplements.title"),
        value: "\(sup.shownTakenCount(writer: services.stateWriter))/\(sup.items.count)",
        action: { showsSupplements = true }))
    }
    // Ba vòng (RN `ActivityRingsCard`): số vòng đã đóng hôm nay.
    if let activity, let m = activity.model(body: energyBody, stepsTarget: mascot?.stepsGoal ?? DailySignals.defaultStepsGoal) {
      rows.append(.init(
        id: "activity", title: String(localized: "ar.title"), value: "\(m.closed)/\(m.rings.count)",
        action: { showsActivity = true }))
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

  /// Hồ sơ năng lượng cho kcal ước lượng của vòng Move (`energyProfileFrom`).
  private var energyBody: SessionEnergy.Body? {
    SessionEnergy.body(profile: profile?.profile, today: Self.today())
  }

  /// RN chạy hai việc này mỗi lần Today có focus (`useCheckAwards`,
  /// `useUpdateChallengeProgress`): huy chương vừa đủ điều kiện được trao và
  /// ăn mừng ngay, thử thách tuần nhích theo tuần đã tập — không đợi người
  /// dùng mở màn Thử thách. Cả hai an toàn khi chạy lại (`ref_key` cố định).
  private func focusChecks() async {
    let lang = services.preferences.lang
    await awards?.load()
    // `enqueueAward` của `useCheckAwards`: màn ăn mừng ở gốc app
    // (`CelebrationHost`), cùng đường với màn Huy chương.
    for key in awards?.newlyGranted ?? [] {
      guard let def = Awards.def(key) else { continue }
      let text = AwardText.text(key, lang: lang)
      services.celebrations.enqueue(
        title: text?.title ?? key, description: text?.desc ?? "", icon: def.icon, tier: def.tier.rawValue,
        awardKey: key)
    }
    await challenges?.refreshProgress()
    // `use-extras.ts:711`: chỉ thử thách CÓ phần thưởng mới có thẻ ăn mừng.
    if let challenges, case .ready(let rows) = challenges.phase {
      for key in challenges.justCompleted {
        guard let ch = rows.first(where: { $0.key == key }), let reward = ch.rewardTitle else { continue }
        services.celebrations.enqueue(
          title: ChallengeText.reward(key, lang: lang) ?? reward,
          description: String(localized: "ch.done \(ChallengeText.title(key, lang: lang) ?? ch.title)"),
          icon: ch.icon ?? "trophy", tier: ch.rewardTier ?? "bronze")
      }
    }
  }

  /// Dòng sẵn sàng của thẻ buổi tập; chạm → thẻ sẵn sàng RN ở dạng mở.
  private var readinessRow: AnyView? {
    guard let readiness else { return nil }
    return AnyView(
      TodayReadinessRow(
        book: readiness, lang: services.preferences.lang,
        recent: (trend?.points ?? []).filter { $0.date < readiness.date }.map { ($0.date, Int($0.value.rounded())) },
        onOpen: {
          // Hiểu điểm là việc của Trợ lý (15/10, "Chia rõ"); không có hộp link
          // (preview) thì mở thẻ phân tích tại chỗ như trước.
          if let links { links.receive(.tab(.assistant)) } else {
            readinessSource = "readiness"
            showsReadiness = true
          }
        }
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

  /// Một chạm thêm mức nhanh đầu tiên của đơn vị (250 ml / 8 oz).
  private var waterStepMl: Int { Water.stepMl(services.preferences.volumeUnit) }

  private func addWater() async {
    guard let water else { return }
    waterNote = nil
    do {
      _ = try await water.add(amountMl: waterStepMl, online: services.sync.online)
      AccessibilityNotification.Announcement(String(localized: "today.water.added")).post()
    } catch {
      waterNote = String(localized: "async.error.generic")
    }
  }

  /// Sau một lần ghi: đọc lại những gì thẻ việc, năng lượng và điểm sẵn sàng hiện.
  /// Sổ ghi bữa mới cho hôm nay (mỗi sổ chép được một lần; qua ngày thì "hôm
  /// qua" đổi theo).
  private func loadMeals() async {
    meals?.close()
    let l = services.makeMealLogger(userId: userId, date: nil, mealType: nil)
    meals = l
    await l?.loadRecents()
    // Nguồn của giấc đêm qua cho ô Ngủ (cùng lượt đọc với màn ghi giấc ngủ).
    if let sleep = services.makeSleepLogger(userId: userId) {
      await sleep.load()
      sleepFromHealth = sleep.healthNight != nil
      sleep.close()
    }
  }

  private func reloadDay() async {
    await loadMeals()
    await todo?.refresh()
    await mascot?.load()
    if let nutrition { await nutrition.refresh() } else { await ownWater?.refresh() }
    await readiness?.load()
    await biometrics?.load()
    // Buổi vừa ghi đổi phút của vòng Tập luyện.
    await activity?.load(today: Self.today())
  }

  // MARK: - Đầu trang

  /// Đầu trang như RN (`(tabs)/index.tsx`): logo ASCND; phải là chuông Thông báo
  /// (16/10, thay viên chuỗi ngày) và avatar (→ Cài đặt). Không có dòng thứ / ngày
  /// (chủ dự án, 13/10).
  private var header: some View {
    HStack(alignment: .center, spacing: DS.Spacing.sm) {
      BrandLockup(paid: paid)
      Spacer(minLength: 0)
      // Chuông thay viên chuỗi ngày (16/10, chủ dự án); chuỗi vẫn ở phòng Koa, và
      // chuỗi sắp đứt thành một tin nhắc việc trong Thông báo.
      if let inbox {
        let notices = AppNotice.of(mascot)
        let current = NoticeSeen.keys(
          notices: notices, challengeIds: communityChallenges?.pending.map(\.id) ?? [], day: "\(Self.today())")
        NavigationLink {
          CommunityInboxView(book: inbox, challenges: communityChallenges, notices: notices) { _ in
            roomSource = "room"
            showsRoom = true
          }
          // Mở màn = đã xem mọi tin nhắc việc đang có (tin cộng đồng đánh dấu qua RPC).
          .onAppear {
            seenNotices.formUnion(current)
            NoticeSeen.save(seenNotices, userId: userId)
          }
        } label: {
          // Chấm chỉ khi có tin CHƯA ĐỌC (16/10, chủ dự án).
          NotificationBell(dot: inbox.hasNew || !current.isSubset(of: seenNotices))
        }
        .buttonStyle(TodayPressStyle())
      }
      if let onOpenSettings {
        AccountAvatar(
          initials: AccountInitials.of(name: profile?.profile?.name, email: services.session.session?.email),
          action: onOpenSettings)
      }
    }
  }

  /// Chấm trên chuông: thông báo cộng đồng + thử thách đạt mà chưa nhận.
  private func loadNotifications() async {
    let lang = AppServices.appLang
    await inbox?.load(lang: lang)
    await communityChallenges?.load(lang: lang)
  }

  private var isCurrentSession: Bool { services.session.session?.userId == userId }

  /// Sau một lượt đồng bộ Apple Health: điểm, xu hướng VÀ các ống của Koa
  /// (bước chân đọc từ `daily_logs` qua phòng linh vật) — trước đây ống bước
  /// không đọc lại nên giữ số cũ tới lần ra tiền cảnh sau (15/10).
  // MARK: - Hôm nay của bạn (18/10)

  private func dayStates(_ room: MascotRoomController) -> [DayCheckIn.Item: DayCheckIn.State] {
    let s = TodayDay.merging(room.signals, localWaterMl: water?.loaded == true ? water?.totalMl : nil)
    let goal = room.stepsGoal
    func done(_ q: MascotRules.Quest) -> Bool { s?.done(q, stepsGoal: goal) ?? false }
    return DayCheckIn.states(
      sleepDone: done(.sleep), mealDone: done(.meal), waterMl: s?.waterMl ?? 0,
      waterTargetMl: TodayDay.waterTarget(s), workoutDone: done(.workout), workoutPlanned: planName != nil)
  }

  private func dayTiles(_ room: MascotRoomController) -> [TodayDayCard.Tile] {
    let states = dayStates(room)
    let s = TodayDay.merging(room.signals, localWaterMl: water?.loaded == true ? water?.totalMl : nil)
    let num = { (v: Double) in v.formatted(.number.precision(.fractionLength(0)).locale(.app)) }
    let todo = String(localized: "day.tile.todo")
    let sleepMin = Int((s?.sleepMinutes ?? 0).rounded())
    let sleep = states[.sleep] == .done
      ? (sleepMin > 0 ? String(localized: "today.d.sleep \(sleepMin / 60) \(sleepMin % 60)") : String(localized: "today.tube.done"))
      : todo
    let yMeals = meals?.yesterdayMeals ?? []
    let meal = states[.meal] == .done
      ? "\(num(s?.kcal ?? 0)) kcal"
      : yMeals.isEmpty ? todo : String(localized: "day.tile.yesterday \("\(num(yMeals.reduce(0) { $0 + $1.kcal })) kcal")")
    let yWater = water.flatMap { DayCheckIn.yesterdayWaterMl($0.week, today: Self.today()) }
    let unit = services.preferences.volumeUnit
    let waterText = states[.water] == .done
      ? Water.progressLabel(ml: s?.waterMl ?? 0, targetMl: TodayDay.waterTarget(s), unit, locale: .app)
      : yWater.map { String(localized: "day.tile.yesterday \(SpokenLogDisplay.water($0, unit: unit))") } ?? todo
    let workout: String
    switch states[.workout] {
    case .done: workout = String(localized: "today.tube.done")
    case .rest: workout = String(localized: "day.tile.restDay")
    default: workout = planName ?? todo
    }
    return [
      .init(
        item: .sleep, state: states[.sleep] ?? .todo,
        detail: sleepFromHealth && states[.sleep] == .done ? "\(sleep) · \(String(localized: "hs.title"))" : sleep),
      .init(item: .meal, state: states[.meal] ?? .todo, detail: meal),
      .init(item: .water, state: states[.water] ?? .todo, detail: waterText),
      .init(item: .workout, state: states[.workout] ?? .todo, detail: workout),
    ]
  }

  /// Dòng cân trong thẻ: chỉ khi đã lâu chưa cân (hoặc hôm nay vừa cân).
  private var weighInRow: (detail: String, done: Bool)? {
    let kg = weight?.todayKg
    let weighed = todo?.signals.weighed ?? (kg != nil)
    guard weighed || TodayDay.showsWeighIn(lastWeighIn: weight?.lastDate, today: Self.today()) else { return nil }
    let line = kg.map { "\(OnboardingRuler.fixed1(unit.display($0), locale: .app)) \(unit.label)" }
      ?? (weighed ? String(localized: "today.tube.done") : String(localized: "today.d.weight.none"))
    return (line, weighed)
  }

  private func tapItem(_ item: DayCheckIn.Item) {
    switch item {
    case .sleep: act(.sleep)
    case .meal: act(.meal)
    case .water: act(.water)
    case .workout: act(.workout)
    }
  }

  /// Lên cấp / lên hạng nhờ xu tự về: màn ăn mừng ở gốc app (cùng đường với huy chương).
  private func announceLevel(from before: Int, _ room: MascotRoomController) {
    guard room.level > before else { return }
    let rank = room.rank
    let rankUp = MascotRules.rank(level: before).key != rank.key
    let lang = services.preferences.lang
    services.celebrations.enqueue(
      title: rankUp ? String(localized: "mr.rankUp \(rank.name(lang))") : String(localized: "mr.levelUp \(room.level)"),
      description: rank.name(lang), icon: "trophy", tier: MascotRules.celebrationTier(rank.key))
  }

  private func reloadAfterHealthSync() async {
    await readiness?.load()
    await trend?.load()
    await mascot?.load()
  }

  private static func today() -> LocalDate { LocalDate(SystemWallClock().nowMillis(), in: .current) }
}

/// "Huy chương gần đây" (`RecentAwardsCard`, `today-widgets-2.tsx` @ fac9ac2;
/// 15/10 — chủ dự án: "không thấy mục huy chương ở đâu cả"): ba huy chương
/// mới nhất — CÙNG đĩa với màn Huy chương (`MedalDisc`, tra danh mục để có
/// dáng / mốc của hôm nay), tên + mô tả hai dòng, tên hạng màu kim loại; "Xem
/// tất cả" mở màn Huy chương.
///
/// Khác RN (tốt hơn): RN ẩn thẻ khi chưa có huy chương nào — nên người mới
/// không biết mục này tồn tại. Ở đây là một hàng "0/N huy chương" dẫn tới màn.
struct RecentAwardsCard: View {
  let book: AwardsBook
  let lang: AppPreferences.Lang
  let openAll: () -> Void

  private var recent: [EarnedAward] {
    book.earned.values
      .sorted { ($0.earnedAt?.millis ?? 0) > ($1.earnedAt?.millis ?? 0) }
      .prefix(3).map { $0 }
  }

  var body: some View {
    if case .ready = book.phase {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Button(action: openAll) {
          HStack(spacing: 6) {
            Image(systemName: "trophy.fill").font(.caption).foregroundStyle(MedalDisc.gold)
              .accessibilityHidden(true)
            Text(String(localized: "aw.recent"))
              .font(DS.TextStyle.caption.weight(.semibold))
              .textCase(.uppercase)
              .tracking(1.2)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Spacer(minLength: 0)
            Text(verbatim: "\(book.earnedCount)/\(Awards.catalogue.count)")
              .font(DS.TextStyle.mono(.caption))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Text(String(localized: "aw.viewAll"))
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "aw.recent")))
        .accessibilityValue(Text(verbatim: "\(book.earnedCount)/\(Awards.catalogue.count)"))
        if recent.isEmpty {
          Text(String(localized: "aw.none"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(recent, id: \.key) { row($0) }
        }
      }
      .padding(DS.Spacing.card)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
    }
  }

  private func row(_ e: EarnedAward) -> some View {
    let def = Awards.def(e.key)
    let text = AwardText.text(e.key, lang: lang)
    let title = text?.title ?? e.title ?? e.key
    let desc = text?.desc ?? e.description ?? ""
    let tier = def?.tier ?? .bronze
    return HStack(spacing: DS.Spacing.sm) {
      MedalDisc(
        type: def?.type ?? "weight", tier: tier, icon: def?.icon ?? "trophy",
        requirement: def?.requirement, earned: true)
        .frame(width: 44, height: 44)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title)
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        if !desc.isEmpty {
          Text(verbatim: desc)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2)
        }
      }
      Spacer(minLength: 0)
      Text(Self.tierName(tier))
        .font(DS.TextStyle.caption.weight(.bold))
        .foregroundStyle(MedalDisc.onSurface(tier, dark: false))
    }
    .accessibilityElement(children: .combine)
  }

  static func tierName(_ t: Awards.Tier) -> String {
    switch t {
    case .bronze: String(localized: "aw.tier.bronze")
    case .silver: String(localized: "aw.tier.silver")
    case .gold: String(localized: "aw.tier.gold")
    case .platinum: String(localized: "aw.tier.platinum")
    }
  }
}
