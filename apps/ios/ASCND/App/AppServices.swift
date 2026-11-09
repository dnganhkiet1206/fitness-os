import ASCNDBackend
import ASCNDCore
import ASCNDStore
import Foundation
import Network
import Observation
import UserNotifications
import WidgetKit

/// Gốc lắp ráp của app: nơi DUY NHẤT dựng các mảnh thật và nối chúng với nhau.
///
///     màn tập ─▶ WorkoutSessionController ─▶ GRDBWorkoutStore ┐
///                                                              ├─ ascnd.sqlite (một tệp,
///     SyncWorker ◀─ OutboxStore ◀──────────────────────────────┘  một transaction khi chốt)
///         │
///         └─▶ SupabaseRemoteWriter ─▶ workout_sessions
///
/// Mọi thứ khác nhận các mảnh này qua `environment`, không tự dựng.
@MainActor
@Observable
final class AppServices {
  let session: SessionStore
  /// Cài đặt của app (#426): ngôn ngữ, theme, đơn vị nước theo MÁY; linh vật
  /// theo tài khoản. Sống suốt đời app — đăng xuất chỉ xoá phần theo tài khoản.
  let preferences: AppPreferences
  /// Nhắc nhở (#427): cài đặt theo tài khoản + lịch thông báo cục bộ. Một bản
  /// cho cả app — màn Nhắc nhở và Hôm nay dùng chung (RN từng có hai bản ghi
  /// đè lịch của nhau).
  let reminders: ReminderCenter
  /// Giờ hay làm từng nhiệm vụ, trên máy (`personal-model.ts` `hours`, #527
  /// A-NEXT-7 · S1). Nguồn ghi (tự nhận nhiệm vụ) là S2 của Mascot; màn Nhắc
  /// nhở đọc `habit(.workout, userId:)` ở S3.
  let habitHours = HabitHours(store: UserDefaultsStore())
  /// Bộ quan sát nhiệm vụ ngày của tài khoản đang đăng nhập (#527 A-NEXT-7,
  /// cấp app): phiên (`RootGate`) và phòng linh vật dùng CHUNG một bản.
  @ObservationIgnored private var questObserverCache: QuestObserver?
  /// Phần thưởng vừa tự về (Koa đợt 1): Hôm nay đọc lại ví và — nếu app thấy việc
  /// vừa xong — cho Koa mừng rỡ với "+N" bay lên.
  private(set) var koaReward: KoaReward?

  struct KoaReward: Equatable {
    let id: Int
    let userId: String
    let amount: Int
    /// Bước chuyển app thấy tận mắt (không phải việc đã xong lúc app đóng).
    let seen: Bool
    /// Nhiệm vụ vừa nhận; `nil` = thưởng chuỗi.
    var quest: MascotRules.Quest?
    /// Xong hết việc của ngày (Koa ló lên luôn được hiện).
    var allDone = false
  }

  /// Đồ Koa đang mặc (khoá `mascot_inventory`), do Hôm nay ghi khi tủ đồ đọc xong
  /// / đổi — để Koa ló lên ở tab khác mặc đúng đồ (đợt 2A).
  var koaEquipped: [String] = []
  /// Đồ Koa đã mua (khoá `mascot_inventory`, kể cả không mặc), Hôm nay ghi cùng `koaEquipped`. Màn nghỉ dùng để
  /// biết Koa có bình nước để uống không (07/11: "chỉ áp dụng cho đồ vật đã được mua").
  var koaOwned: Set<String> = []
  /// Hạng vóc dáng (Gains, 0…5) của người đang dùng — Koa của chính họ ở mọi màn
  /// mang vóc dáng ấy (#527 đợt 1: vóc dáng theo tập, không theo cấp). Hôm nay ghi.
  var koaBuild = 0
  /// Lịch sử tập đã đọc cho Gains — màn kết thúc buổi tập tính trước phần cộng.
  struct GainsHistory {
    let days: [KoaGains.Day]
    let week: KoaGains.Week
  }
  var koaGainsHistory: GainsHistory?
  /// Kỷ lục từng ngày cho kệ cúp phòng Koa (#792), tính lại từ set đã lưu. Gắn userId; `basis` là
  /// số ngày tập của lịch sử Gains lúc đọc: lịch sử đổi (buổi mới, buổi bị xoá) thì đọc lại.
  var koaShelfRecords: (userId: String, basis: Int, records: [LocalDate: PersonalRecord])?
  /// Bụi phòng Koa (#527 phần 5) — gắn userId để phiên khác không dùng nhầm.
  var koaDust: (userId: String, state: KoaDust.State)?
  /// Đồ hỏng trong phòng Koa (`KoaBreakage`, cảnh A duyệt 06/11).
  var koaBreakage: (userId: String, outcome: KoaBreakage.Outcome)?
  /// Gains hiện tại (đợt 2): trạng thái của Koa và lời nhắc ngày lỡ. Gắn userId để
  /// phiên khác không dùng nhầm.
  var koaGainsNow: (userId: String, state: KoaGains.State, week: KoaGains.Week)?
  /// "Hỏi Koa" ở Hôm nay (GĐ3): tăng lên → thanh tab mở Tiến bộ và màn chat của
  /// phiên (một cuộc trò chuyện, như nút Koa ở Ghi nhanh).
  var coachRequest = 0
  /// Buổi tập theo lịch hôm nay (Kiệt 22/10: mọi nút "ghi buổi tập" đồng nhất với
  /// lịch): tăng lên → thanh tab sang Tập luyện và mở buổi hôm nay.
  var sessionRequest = 0
  /// Giờ buổi tập gần nhất — Koa "pump" 2 giờ sau đó.
  var koaLastSessionAt: EpochMillis?
  /// Việc chính của hôm nay (Daily Plan, GĐ1) — Today dựng, widget và lời nhắc
  /// đọc CÙNG kết quả. Gắn người + ngày để phiên / ngày khác không dùng nhầm.
  var dailyPlan: (userId: String, date: LocalDate, result: DailyPlan.Result)?
  /// Widget Koa (đợt 2C): ảnh + câu của Koa ở Hôm nay ra màn hình chính.
  @ObservationIgnored let koaWidget = KoaWidgetPublisher()
  /// Chuỗi ngày của tài khoản đang mở (phòng Koa của Hôm nay ghi) — cho nhắc chuỗi
  /// của Koa (đợt 2B). `nil` = chưa đọc.
  var koaStreak: (userId: String, value: Streak.Value)?

  /// Nút "+1 ly" trên widget Koa (đợt 2C): ghi qua CÙNG sổ nước + hàng đợi như
  /// nút trong app, rồi gửi, đọc lại nhiệm vụ (xu tự về) và vẽ lại widget. Chạy cả
  /// khi hệ thống mở app ở nền chỉ để chạy intent — phiên có thể chưa đọc.
  func addWaterFromWidget() async -> Bool {
    if case .loading = session.phase { await session.start() }
    guard let userId = session.session?.userId, let book = makeWaterBook(userId: userId) else { return false }
    defer { book.close() }
    do {
      _ = try await book.add(amountMl: Water.stepMl(preferences.volumeUnit), online: sync.online)
    } catch {
      return false
    }
    WidgetDataStore().markKoaWaterLogged(today: LocalDate(SystemWallClock().nowMillis(), in: .current))
    WidgetCenter.shared.reloadTimelines(ofKind: KoaWidgetPublisher.kind)
    sync.kick()
    Task {
      await sync.settle()
      await questObserver(userId: userId)?.refresh()
    }
    return true
  }

  /// Một lần thưởng tự về (nhiệm vụ hay chuỗi) — mã tăng dần để `onChange` bắt.
  func noteKoaReward(
    userId: String, amount: Int, seen: Bool, quest: MascotRules.Quest? = nil, allDone: Bool = false,
    source: String = "streak"
  ) {
    koaReward = KoaReward(
      id: (koaReward?.id ?? 0) + 1, userId: userId, amount: amount, seen: seen, quest: quest, allDone: allDone)
    Telemetry.capture(.questClaimed, ["quest": quest?.rawValue ?? source])
  }
  /// Số lần cân ONLINE đã được server xác nhận trong lần chạy app này — nhịp
  /// để kế hoạch nhắc nhở đọc lại `weight_logs` ngay (`invalidateQueries` của
  /// `useLogWeight`). Xếp hàng / lỗi không tăng; bữa ăn đi qua outbox nên đã
  /// có nhịp riêng (`sync.pendingCount` giảm SAU khi dựng lại `daily_logs`).
  private(set) var weightSaved = 0
  /// Nhật ký vừa sửa / xoá / hoàn tác món và server đã nhận + `daily_logs` của
  /// ngày ấy đã dựng lại (#527 A-NEXT-6). `seq` để hai lần cùng ngày vẫn là
  /// hai nhịp.
  private(set) var mealDiaryRebuilt: DayPulse?
  struct DayPulse: Equatable {
    let day: LocalDate
    let seq: Int
  }
  @ObservationIgnored private let reminderPresenter = ReminderPresenter()
  let sync: SyncWorker
  /// Hai widget màn hình chính (#66): dữ liệu thật, xoá khi phiên kết thúc.
  @ObservationIgnored let widgets: WidgetRefresher
  /// Apple Health (#66): đồng bộ vào server, ghi ngược buổi ghi tay.
  @ObservationIgnored let health: HealthSyncCoordinator
  /// Trạng thái mạng ba nhánh (#527 · 1.11, `net-status.ts`): dải báo ở gốc app.
  let net = NetStatusMonitor()
  /// Hàng đợi ăn mừng (#527, `celebration-queue.ts`): huy chương vừa trao,
  /// thử thách vừa xong — gốc Hôm nay hiện từng cái một; đăng xuất thì bỏ hết.
  let celebrations = CelebrationQueue()
  /// Lớp Trạng thái (#161, `state-write.ts`): cờ "chỉ giá trị cuối có nghĩa"
  /// — "đã uống hôm nay" của thực phẩm bổ sung. Chỉ trong phiên (chủ dự án
  /// chọn), đăng xuất thì bỏ; có mạng lại thì gửi các ý còn chờ.
  let stateWriter = StateWriter(environment: .init(online: { false }, isOffline: { NetworkFailure.isOffline($0) }))
  /// Đường mạng + phép dò internet của NetInfo (#530) — nuôi `net` và vòng sync.
  @ObservationIgnored private(set) var network: NetworkObserver!
  @ObservationIgnored let workouts: GRDBWorkoutStore
  /// Hàng đợi trên đĩa — vòng sync gửi từ đây; lệnh sửa kế hoạch (#401) ghi
  /// vào đây và Today đọc lại phần chưa gửi.
  @ObservationIgnored let outbox: OutboxStore
  /// Kế hoạch tuần + template thật, local-first (#270).
  @ObservationIgnored let templates: TodayRepository
  @ObservationIgnored let history: any TrainingHistory
  @ObservationIgnored let recordHistory: any RecordHistory
  @ObservationIgnored let recordCache: any RecordBookCache
  @ObservationIgnored let performanceSource: any PerformanceSource
  @ObservationIgnored let performanceCache: any PerformanceCache
  @ObservationIgnored let historySource: any HistorySource
  @ObservationIgnored let historyCache: any HistoryCache
  @ObservationIgnored let insightCache: any InsightCache
  @ObservationIgnored let exerciseSource: any ExerciseSource
  @ObservationIgnored let exerciseCache: any ExerciseCache
  @ObservationIgnored let guideSource: any ExerciseGuideSource
  @ObservationIgnored let guideCache: any ExerciseGuideCache
  @ObservationIgnored let onboardingStatus: any OnboardingStatusSource
  @ObservationIgnored let onboardingWriter: any OnboardingWriter
  @ObservationIgnored let onboardingStore: any OnboardingStore
  @ObservationIgnored let profileSource: any ProfileSource
  @ObservationIgnored let profileWriter: any ProfileWriter
  @ObservationIgnored let profileCache: any ProfileCache
  /// Nước uống hôm nay + 7 ngày trên máy (#527 Phase 3).
  @ObservationIgnored let waterCache: any WaterCache
  /// Thực phẩm bổ sung trên máy (#527 Phase 3 · 3.9).
  @ObservationIgnored let supplementCache: any SupplementCache
  /// Thứ tự đóng / mở chốt tài khoản và dọn dữ liệu trên máy (#431, #455).
  @ObservationIgnored private let lifecycle: AccountLifecycle
  /// Supabase (nếu có cấu hình) và kho hàng chung — nguồn của các thẻ đọc
  /// thẳng server: sẵn sàng, sinh trắc học, huy chương, phòng linh vật (#527).
  @ObservationIgnored private let backend: Backend?
  @ObservationIgnored private let rows: SupabaseRowStore?
  /// Lỗi không mở được database / thiếu cấu hình — app vẫn mở, màn nói thật.
  private(set) var startupError: String?

  /// `var`: "Thử lại" thay monitor mới khi đường mạng kẹt (xem `retryNetwork`).
  @ObservationIgnored private var monitor = NWPathMonitor()

  init() {
    let backend: Backend?
    var problems: [String] = []
    // Chế độ UI test (Maestro, chỉ bản Debug — `UITestMode`): máy chủ giả trong app,
    // database trong bộ nhớ, phiên giả. Không bao giờ nói chuyện với Supabase.
    #if DEBUG
      let fake = UITestMode.isOn ? UITestMode.makeBackend() : nil
    #else
      let fake: Backend? = nil
    #endif
    if let fake {
      backend = fake
    } else {
      do {
        backend = Backend(config: try BackendConfig.fromMainBundle())
      } catch {
        backend = nil
        problems.append("backend: \(error)")
      }
    }

    let database: ASCNDDatabase
    do {
      database = fake != nil ? try ASCNDDatabase() : try ASCNDDatabase(path: try Self.databasePath())
    } catch {
      // Không mở được tệp thì vẫn chạy trong bộ nhớ: dữ liệu KHÔNG bền, và
      // `startupError` nói điều đó ra — không bao giờ giả vờ "đã lưu".
      problems.append("database: \(error)")
      // trong bộ nhớ: không có lý do thất bại ngoài hết RAM — như `try!` cũ, nói rõ lỗi
      do { database = try ASCNDDatabase() } catch { fatalError("in-memory database: \(error)") }
    }

    // Chưa ai đăng nhập cho tới khi phiên mở (`forgetOtherAccounts`).
    lifecycle = AccountLifecycle(database)
    lifecycle.launched()
    workouts = GRDBWorkoutStore(database)
    let outboxStore = OutboxStore(database)
    outbox = outboxStore
    let templateCache = GRDBTemplateCache(database)
    templates = TodayRepository(
      source: backend.map { SupabaseTemplateSource(backend: $0) as any TemplateSource } ?? UnconfiguredTemplates(),
      cache: templateCache, edits: outboxStore)
    history = backend.map { SupabaseTrainingHistory(backend: $0) as any TrainingHistory } ?? UnconfiguredHistory()
    recordHistory = backend.map { SupabaseRecordHistory(backend: $0) as any RecordHistory } ?? UnconfiguredRecords()
    recordCache = GRDBRecordBookCache(database)
    performanceSource = backend.map { SupabasePerformanceSource(backend: $0) as any PerformanceSource } ?? UnconfiguredPerformance()
    performanceCache = GRDBPerformanceCache(database)
    historySource = backend.map { SupabaseHistorySource(backend: $0) as any HistorySource } ?? UnconfiguredHistorySource()
    historyCache = GRDBHistoryCache(database)
    insightCache = GRDBInsightCache(database)
    exerciseSource = backend.map { SupabaseExerciseSource(backend: $0) as any ExerciseSource } ?? UnconfiguredExercises()
    exerciseCache = GRDBExerciseCache(database)
    guideSource = backend.map { SupabaseExerciseGuideSource(backend: $0) as any ExerciseGuideSource } ?? UnconfiguredGuides()
    guideCache = GRDBExerciseGuideCache(database)
    onboardingStatus = backend.map { SupabaseOnboardingStatus(backend: $0) as any OnboardingStatusSource } ?? UnconfiguredOnboarding()
    onboardingWriter = backend.map { SupabaseOnboardingWriter(backend: $0) as any OnboardingWriter } ?? UnconfiguredOnboarding()
    onboardingStore = GRDBOnboardingStore(database)
    profileSource = backend.map { SupabaseProfileSource(backend: $0) as any ProfileSource } ?? UnconfiguredProfile()
    profileWriter = backend.map { SupabaseProfileWriter(backend: $0) as any ProfileWriter } ?? UnconfiguredProfile()
    profileCache = GRDBProfileCache(database)
    waterCache = GRDBWaterCache(database)
    supplementCache = GRDBSupplementCache(database)
    session = SessionStore(api: Self.uiTestAuth ?? backend.map { SupabaseAuthAPI(backend: $0) as any AuthAPI } ?? UnconfiguredAuth())
    let rows = backend.map { SupabaseRowStore(backend: $0) }
    self.backend = backend
    self.rows = rows
    // Lịch tập (cache trên máy) cho widget "Buổi tập hôm nay": buổi có lịch chưa
    // tập, và buổi ngày mai (20/10).
    let planRepo = templates
    let widgets = WidgetRefresher(store: rows, plans: { await planRepo.cached(userId: $0) })
    KoaWidgetResetHook.reset = { [koaWidget] in koaWidget.reset() }
    self.widgets = widgets
    health = HealthSyncCoordinator(store: rows)
    let prefs = AppPreferences(store: UserDefaultsStore(), shownLanguage: Bundle.main.preferredLocalizations.first)
    preferences = prefs
    // Widget dùng cùng lựa chọn ngôn ngữ ngay từ lần mở app đầu (bản cài từ
    // trước PR này chưa có khoá trong App Group).
    // Ngôn ngữ theo iPhone (23/10). Widget dùng ĐÚNG ngôn ngữ app đang chạy: câu của
    // Koa / trạng thái trong dữ liệu widget do app viết bằng ngôn ngữ ấy, nên nhãn của
    // widget phải cùng ngôn ngữ (audit vòng 5: đặt ngôn ngữ riêng cho app thì widget
    // lẫn "TUẦN NÀY" với "Workout time!"). Thường thì đó cũng là ngôn ngữ máy.
    widgets.setLanguage(Bundle.main.preferredLocalizations.first)
    let reminderCenter = ReminderCenter(
      store: UserDefaultsStore(), scheduler: NotificationReminderScheduler(), copy: ReminderCopyTable.copy(prefs.lang))
    reminders = reminderCenter
    sync = SyncWorker(
      store: outboxStore,
      remote: backend.map { b -> any RemoteWriter in
        // Server đã nhận một lệnh buổi tập → dựng lại `daily_logs` của ngày ấy
        // (+ hôm nay), như `rebuildAfterReplay` của RN (#266), rồi làm mới
        // widget (điểm sẵn sàng / buổi hôm nay vừa đổi). Lỗi dựng lại không
        // làm hỏng lượt gửi — ghi đã thành rồi.
        let rows = SupabaseRowStore(backend: b)
        return SupabaseRemoteWriter(backend: b, afterWrite: { entry in
          _ = await DailyLog.rebuildAfterWrite(entry, store: rows)
          await widgets.refresh()
        })
      } ?? UnconfiguredRemote(),
      online: false)
    startupError = problems.isEmpty ? nil : problems.joined(separator: "\n")
    stateWriter.environment.online = { [sync = self.sync] in sync.online }

    // Phiên kết thúc (nút Đăng xuất, token hết hạn, tài khoản bị xoá, hay đổi
    // thẳng sang tài khoản khác): mọi thứ của người vừa rời đi rời khỏi máy —
    // như `forgetPreviousAccount` của baseline (`use-auth.tsx:53`). MỘT closure,
    // chạy tuần tự, để thứ tự không phụ thuộc thứ tự đăng ký.
    let lifecycle = self.lifecycle
    session.onSignedOut {
      [weak self, sync = self.sync, weak session = self.session, celebrations = self.celebrations,
       habitHours = self.habitHours, stateWriter = self.stateWriter] in
      // Koa trong bộ nhớ của người vừa rời đi — TRƯỚC mọi `await`, để không xoá nhầm lượt đọc
      // của người mới khi đổi thẳng tài khoản.
      self?.forgetKoaSession()
      // Pháo hoa của người vừa rời đi không hiện cho người sau (`onUserScopedReset`).
      celebrations.clear()
      // Ý "đã uống" chưa gửi thuộc về người vừa rời đi (`onUserScopedReset`).
      stateWriter.clear()
      // Người của phiên mới khi đổi thẳng tài khoản; `nil` khi đăng xuất.
      let next = session?.session?.userId
      // Đóng chốt TRƯỚC khi dọn: lượt làm mới / lượt ghi muộn của người vừa
      // rời đi về sau đó không ghi lại được gì lên đĩa (#431, #454). Rồi bỏ
      // hàng đợi chưa gửi, như baseline (#241 chờ Kiệt). Rồi dọn điểm quay lại
      // `routine-day:*` (`clearUserScopedStorage`) và read model — trừ của
      // người mới, có thể đã ghi trong lúc lượt dọn này nhường (#455).
      await lifecycle.sessionEnded(next: next) { @MainActor in
        _ = await sync.signOut()
      }
      // Widget màn hình chính không giữ số của người vừa rời đi (`clearWidgetData`).
      widgets.setUser(next)
      // Cài đặt theo tài khoản (linh vật); theo máy thì giữ (`DEVICE_KEYS`).
      prefs.clearUserScoped()
      // "Insight hôm nay" của người vừa rời đi (`clearPersistedCache` của RN).
      SmartNudgesDefaultsCache.clear()
      // Nhắc nhở: huỷ thông báo đang chờ của người vừa rời đi, xoá cài đặt /
      // chữ ký lịch / chốt giờ thông minh (`forgetPreviousAccount`).
      await reminderCenter.clearUserScoped()
      // Giờ thói quen của người vừa rời đi (`resetPersonalModel`).
      habitHours.clear()
      // Đổi thẳng tài khoản: người mới đã đăng nhập — vòng sync gửi hàng của
      // họ (`signOut` ở trên vừa đặt nó về nil).
      sync.setSignedInUser(next)
    }
    UNUserNotificationCenter.current().delegate = reminderPresenter
    ReminderPresenter.onOpened = { [weak reminderCenter] key in reminderCenter?.noteOpened(key) }
    MealNotification.register()
    reminderPresenter.logUsualMeal = { [weak self] in
      await self?.logUsualMeal().map { (names: $0.names, kcal: $0.kcal) }
    }
    reminderPresenter.openMealLog = { [weak self] in await self?.requestMealLog() }
    // Dò cả Google lẫn backend của app (23/10): mạng chặn Google không còn báo
    // "Ngoại tuyến" khi Supabase vẫn chạy. Thiếu cấu hình backend → chỉ Google.
    let prober: any ReachabilityProber =
      Self.uiTestProber ?? backend.map {
        FallbackReachabilityProber(
          primary: URLSessionReachabilityProber(), backup: BackendReachabilityProber(),
          backupConfig: BackendReachabilityProber.config(for: $0.config.url))
      } ?? URLSessionReachabilityProber()
    network = NetworkObserver(prober: prober, timers: TaskNetTimers()) {
      [weak self] connected, reachable in
      self?.applyNetwork(connected: connected, reachable: reachable)
    }
    startNetworkMonitor()
    // Đăng ký theo dõi Health ngay khi app chạy — kể cả khi iOS mở app trong nền
    // để giao dữ liệu mới (18/10).
    if !Self.uiTest { startHealthObserving() }
    // Widget "Buổi tập hôm nay" nói cùng câu với việc chính của Today (GĐ1).
    widgets.planStatus = { [weak self] userId in await self?.widgetPlanStatus(userId: userId) }
    widgets.week = { [weak self] userId in await self?.widgetWeek(userId: userId) }
  }

  /// App mở / quay lại tiền cảnh: đọc phiên, thử gửi hàng đợi. Dọn ngày cũ
  /// KHÔNG ở đây (#469): lúc này chốt còn đóng — nó chạy khi phiên mở, cho
  /// đúng người (`forgetOtherAccounts`).
  func start() async {
    await session.start()
    sync.kick()
    autoSyncHealth()
    await reminders.refreshPermission()
    await probeAI()
  }

  /// Edge function AI đã deploy chưa (15/10: server trả 404 "function not found" cho
  /// MỌI function). `true` mới hiện lối vào AI (Coach, tổng kết tuần, Insight, gợi ý
  /// bữa, chụp ảnh món); `nil` (chưa biết / không có mạng) và `false` → ẩn, không để
  /// người dùng chạm vào một màn lỗi. Server deploy xong → lần mở app sau tự hiện.
  private(set) var aiDeployed: Bool?

  /// Một lượt hỏi gateway, không đăng nhập: function có → 401 (chưa chạy gì), không
  /// có → 404. Lỗi mạng: giữ `nil`, thử lại lần ra tiền cảnh sau.
  func probeAI() async {
    // UI test: máy chủ giả trả lời edge function — lối vào AI hiện như khi đã deploy.
    if Self.uiTest { aiDeployed = true }
    guard aiDeployed != true, let base = Self.supabaseURL, let key = Self.supabaseKey else { return }
    var req = URLRequest(url: base.appendingPathComponent("functions/v1/ai-coach"))
    req.httpMethod = "POST"
    req.timeoutInterval = 8
    req.setValue(key, forHTTPHeaderField: "apikey")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = Data("{}".utf8)
    // Mở app lúc mạng chưa sẵn (16/10: dải "Offline" lúc khởi động) thì lần dò
    // đầu hỏng và mọi lối AI ẩn cả phiên. Thử lại ba lần, cách 2 giây; quay lại
    // tiền cảnh cũng dò lại (`didBecomeActive`).
    for attempt in 0..<3 {
      if attempt > 0 { try? await Task.sleep(for: .seconds(2)) }
      if let (_, resp) = try? await URLSession.shared.data(for: req), let http = resp as? HTTPURLResponse {
        aiDeployed = http.statusCode != 404
        return
      }
    }
  }

  private static var supabaseURL: URL? {
    (Bundle.main.object(forInfoDictionaryKey: "ASCNDSupabaseURL") as? String).flatMap(URL.init(string:))
  }

  private static var supabaseKey: String? {
    (Bundle.main.object(forInfoDictionaryKey: "ASCNDSupabaseKey") as? String).flatMap { $0.isEmpty ? nil : $0 }
  }

  /// Ngôn ngữ cho widget / Live Activity (App Group). "Theo máy" thì không
  /// ghi gì — widget tự theo máy, kể cả khi máy đổi ngôn ngữ lúc app tắt.

  /// Tầng ứng dụng của màn Today cho người đang đăng nhập (#271).
  func makeToday(userId: String) -> TodayController {
    TodayController(userId: userId, repository: templates, history: history, workouts: workouts)
  }

  /// Phiên của `userId` bắt đầu: mở chốt, bỏ dữ liệu của mọi người khác (lượt
  /// làm mới của người vừa rời đi có thể về SAU lượt dọn lúc đăng xuất, #335),
  /// rồi dọn ngày cũ của chính họ (#469).
  func forgetOtherAccounts(keeping userId: String) async {
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    await lifecycle.sessionStarted(userId: userId, today: today)
  }

  /// Việc dọn thêm khi phiên kết thúc, của những thứ không do AppServices
  /// dựng (quãng nghỉ / Live Activity).
  func onSessionEnded(_ cleanup: @escaping @MainActor @Sendable () async -> Void) {
    session.onSignedOut(cleanup)
  }

  /// Bảng kỷ lục của người đang đăng nhập (#295).
  func makeRecordBook(userId: String) -> RecordBook {
    RecordBook(userId: userId, history: recordHistory, cache: recordCache, pending: outbox)
  }

  /// "Lần trước" của người đang đăng nhập (#331).
  func makePerformanceBook(userId: String) -> PerformanceBook {
    PerformanceBook(userId: userId, source: performanceSource, cache: performanceCache, pending: outbox)
  }

  /// Luồng tập của người đang đăng nhập (#272): Today → buổi tập → nghỉ →
  /// chốt → máy → outbox → sync. Dựng MỘT lần mỗi phiên (`SignedInScope`);
  /// màn Today / Workout và Lab chỉ đọc nó.
  func makeWorkoutFlow(userId: String, rest: RestTimerController) -> WorkoutFlow {
    let sync = self.sync
    // Lịch sử buổi tập (#400): xoá từ lịch sử đi qua cùng outbox.
    let history = HistoryBook(
      userId: userId, source: historySource, cache: historyCache, store: workouts,
      onEnqueued: { _ in sync.kick() }, pending: outbox)
    // Phân tích bài tập (#419): cùng nguồn 90 ngày với "lần trước".
    let insights = InsightBook(userId: userId, source: performanceSource, cache: insightCache, pending: outbox)
    let flow = WorkoutFlow(
      today: makeToday(userId: userId), records: makeRecordBook(userId: userId),
      performance: makePerformanceBook(userId: userId), history: history, insights: insights,
      library: ExerciseLibrary(
        userId: userId, source: exerciseSource, cache: exerciseCache, store: outbox,
        onEnqueued: { _ in sync.kick() }),
      guides: ExerciseGuideBook(userId: userId, source: guideSource, cache: guideCache),
      store: workouts,
      planStore: outbox,
      onRest: { event, target in rest.handle(event, target: target) },
      onEnqueued: { [weak self] entry in
        sync.kick()
        // Lịch có buổi tập đầu tiên (onboarding hay tự đặt): lúc xin quyền thông báo (#800).
        if entry.kind == PlanEdit.routineDayKind, entry.payload["template_id"]?.stringValue != nil {
          // Ghi buổi cũng đi qua đây: chờ cảnh Koa ăn mừng xong, hộp hệ thống không đè lên Koa.
          Task { @MainActor in
            await KoaReactionGate.waitIdle()
            await self?.reminders.askAfterSchedule()
          }
        }
      })
    // Không ghi buổi ghi tay vào Apple Health nữa (17/10, "Không ghi ngược vào
    // HealthKit").
    flow.onManualLogged = { [weak self] _ in
      Telemetry.capture(.workoutLogged, ["source": "manual"])
      self?.didLog()
    }
    // Nhiệm vụ tăng tải (#527 phần 4): buổi vừa vào phân tích → so với lần trước.
    flow.onSessionAbsorbed = { [weak self, weak flow] date in
      guard let self, let insights = flow?.insights else { return }
      Task { await self.claimOverload(userId: userId, date: date, insights: insights) }
    }
    return flow
  }

  // MARK: - Bụi phòng Koa (phần 5, 29/10)

  /// Đọc lại mức bụi từ lịch sử tập đã có + việc ghi + ngày đã dọn bằng xu.
  func loadKoaDust(userId: String) async {
    await retryPendingQuests(userId: userId)
    guard let rows, let h = koaGainsHistory else { return }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    guard
      let s = await KoaDustSync.load(
        userId: userId, store: rows, sessions: h.days, week: h.week, paused: koaPausedDay(userId: userId, today: today),
        today: today),
      session.session?.userId == userId
    else { return }
    koaDust = (userId, s)
  }

  // MARK: - Đồ hỏng trong phòng Koa (cảnh A, 06/11)

  static func breakageKey(_ userId: String) -> String { "koa.breakage.\(userId)" }

  /// Xét đồ hỏng theo thói quen 7 ngày: đọc việc ghi (`daily_logs`) + buổi tập (lịch sử Gains), trạng thái lưu
  /// trên máy; không hỏng lúc Koa đang ngủ. Đọc hỏng thì giữ nguyên (không bao giờ làm hỏng đồ vì mất mạng).
  func loadKoaBreakage(userId: String, sleep: KoaMood.SleepWindow = .standard) async {
    guard let rows, let h = koaGainsHistory else { return }
    let now = Date()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    guard let daily = try? await rows.select(KoaDustSync.dailyQuery(userId: userId, from: today.adding(days: -(KoaBreakage.window + 1))))
    else { return }
    let key = Self.breakageKey(userId)
    let memo = UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(KoaBreakage.Memo.self, from: $0) }
      ?? KoaBreakage.Memo()
    let cal = Calendar.current
    let week = h.week
    let outcome = KoaBreakage.decide(
      userId: userId, today: today, history: KoaBreakage.history(daily: daily, sessions: Set(h.days.map(\.date))),
      trainingDay: { week.isPlanned($0) }, current: memo.current, lastEvent: memo.lastEvent, lastItem: memo.lastItem,
      asleep: sleep.contains(hour: cal.component(.hour, from: now), minute: cal.component(.minute, from: now)))
    let next = KoaBreakage.step(memo, outcome)
    if next != memo, let data = try? JSONEncoder().encode(next) { UserDefaults.standard.set(data, forKey: key) }
    guard session.session?.userId == userId else { return }
    koaBreakage = (userId, outcome)
  }

  /// Dọn phòng bằng xu (30, mỗi ngày một lần — server trừ). `nil` = đã dọn.
  func cleanKoaRoom(userId: String) async -> MascotFailure? {
    guard let backend else { return .offline }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    do {
      _ = try await SupabaseMascotEconomy(backend: backend).cleanKoaRoom(day: today.description)
      if session.session?.userId == userId { koaDust = (userId, .clean) }
      return nil
    } catch let f as MascotFailure {
      return f
    } catch {
      return .server(code: nil)
    }
  }

  // MARK: - Nhiệm vụ Koa phần 4 (29/10)

  /// Khoá đã nhận trên máy này — `claim_quest_reward` trả số xu cả khi khoá đã có (ON
  /// CONFLICT DO NOTHING), nên máy nhớ để không mừng "+xu" hai lần. Server vẫn chỉ ghi
  /// một dòng.
  private func questSeenKey(_ userId: String, _ ref: String) -> String { "ascnd_koa_quest.\(userId).\(ref)" }
  @ObservationIgnored private var claimingQuests: Set<String> = []

  /// Một khoá nhiệm vụ tự nhận (tăng tải, khám phá): một lượt một lúc, nhớ khi xong;
  /// hỏng (mất mạng, server chưa có giá) thì lần sau thử lại.
  private func claimOnce(userId: String, ref: String, reason: String) async -> Int? {
    guard let backend else { return nil }
    let seen = questSeenKey(userId, ref)
    guard !UserDefaults.standard.bool(forKey: seen), !claimingQuests.contains(ref) else { return nil }
    claimingQuests.insert(ref)
    defer { claimingQuests.remove(ref) }
    do {
      let amount = try await SupabaseMascotEconomy(backend: backend).claimReward(refKey: ref, reason: reason)
      UserDefaults.standard.set(true, forKey: seen)
      setPendingQuests(userId, pendingQuests(userId).filter { $0.ref != ref })
      return session.session?.userId == userId ? amount : nil
    } catch {
      // Mất mạng / không rõ đã tới server: giữ lại để nhận bù (`retryPendingQuests`).
      if let f = error as? MascotFailure, QuestRetry.shouldRetry(f) {
        setPendingQuests(userId, QuestRetry.adding(.init(ref: ref, reason: reason), to: pendingQuests(userId)))
      } else {
        setPendingQuests(userId, pendingQuests(userId).filter { $0.ref != ref })
      }
      return nil
    }
  }

  /// Khoá thưởng tự nhận chưa tới server, của từng người (lưu trên máy).
  private func pendingQuestsKey(_ userId: String) -> String { "ascnd_koa_quest_pending.\(userId)" }

  private func pendingQuests(_ userId: String) -> [QuestRetry.Pending] {
    guard let data = UserDefaults.standard.data(forKey: pendingQuestsKey(userId)) else { return [] }
    return (try? JSONDecoder().decode([QuestRetry.Pending].self, from: data)) ?? []
  }

  private func setPendingQuests(_ userId: String, _ list: [QuestRetry.Pending]) {
    if list.isEmpty {
      UserDefaults.standard.removeObject(forKey: pendingQuestsKey(userId))
    } else if let data = try? JSONEncoder().encode(list) {
      UserDefaults.standard.set(data, forKey: pendingQuestsKey(userId))
    }
  }

  /// Nhận bù thưởng tự nhận đã hỏng vì mạng — khi có mạng lại và mỗi lần Hôm nay đọc
  /// Gains. Một lượt một lúc.
  func retryPendingQuests(userId: String) async {
    guard sync.online, !retryingQuests else { return }
    let list = pendingQuests(userId)
    guard !list.isEmpty else { return }
    retryingQuests = true
    defer { retryingQuests = false }
    for p in list {
      guard let amount = await claimOnce(userId: userId, ref: p.ref, reason: p.reason) else { continue }
      if let day = OverloadQuest.day(of: p.ref), let h = koaGainsHistory {
        koaGainsHistory = .init(days: KoaGainsSync.mark(h.days, overload: [day]), week: h.week)
      }
      noteKoaReward(userId: userId, amount: amount, seen: true, source: OverloadQuest.day(of: p.ref) != nil ? "overload" : "explore")
    }
  }
  @ObservationIgnored private var retryingQuests = false

  /// Làm theo gợi ý tăng tải: +20 xu, và ngày ấy +3 Gains (Gains đọc lại từ sổ xu).
  func claimOverload(userId: String, date: LocalDate, insights: InsightBook) async {
    guard OverloadQuest.achieved(on: date, insights.performances) else { return }
    // chỉ buổi đầu trong ngày có thưởng; 30 giây để không tính nhầm chính buổi vừa xong
    let cutoff = EpochMillis(Date()) - 30_000
    if let h = koaGainsHistory, KoaGains.hasEarlierSession(h.days, on: date, before: cutoff) { return }
    guard let amount = await claimOnce(userId: userId, ref: OverloadQuest.refKey(date), reason: "overload") else { return }
    if let h = koaGainsHistory { koaGainsHistory = .init(days: KoaGainsSync.mark(h.days, overload: [date]), week: h.week) }
    noteKoaReward(userId: userId, amount: amount, seen: true, source: "overload")
  }

  /// Người dùng vừa dùng một tính năng lần đầu — nhiệm vụ khám phá (một lần trọn đời).
  func exploreDone(_ q: ExploreQuest) {
    guard let userId = session.session?.userId else { return }
    Task { [weak self] in
      guard let amount = await self?.claimOnce(userId: userId, ref: q.refKey, reason: "explore \(q.rawValue)") else { return }
      self?.noteKoaReward(userId: userId, amount: amount, seen: true, source: "explore")
    }
  }

  /// Onboarding (#424): cổng sau đăng nhập của người này — `OnboardingGateView`
  /// trong `RootGate` (#527 1.3).
  func makeOnboardingGate(userId: String) -> OnboardingGate {
    OnboardingGate(userId: userId, source: onboardingStatus, store: onboardingStore)
  }

  /// Luồng onboarding; xong thì mở cổng.
  func makeOnboarding(userId: String, gate: OnboardingGate, healthAvailable: Bool) -> OnboardingController {
    OnboardingController(
      userId: userId, store: onboardingStore, writer: onboardingWriter, healthAvailable: healthAvailable,
      onFinished: { [weak gate] in await gate?.completed() })
  }

  /// Hồ sơ của người đang đăng nhập (#425) — màn Cài đặt / Sửa hồ sơ của C.
  func makeProfileBook(userId: String) -> ProfileBook {
    ProfileBook(userId: userId, source: profileSource, writer: profileWriter, cache: profileCache)
  }

  /// Nước uống của người đang đăng nhập (#527 Phase 3): đọc server, thêm qua
  /// outbox (kind `water`), "−" thẳng server khi online. `nil` khi thiếu cấu
  /// hình Supabase — tab không hiện thẻ thay vì một thẻ lỗi mãi.
  func makeWaterBook(userId: String) -> WaterBook? {
    guard let backend else { return nil }
    let sync = self.sync
    let rows = self.rows, widgets = self.widgets
    return WaterBook(
      userId: userId, source: SupabaseWaterSource(backend: backend), cache: waterCache, store: outbox,
      onEnqueued: { _ in sync.kick() },
      onRemoved: { day in
        // Như `rebuildAfterWrite`: lỗi dựng lại không làm hỏng lệnh "−" đã thành.
        guard let rows else { return }
        let now = SystemWallClock().nowMillis()
        try? await DailyLog.recompute(userId: userId, date: day, store: rows, now: now, in: .current)
        await widgets.refresh()
      })
  }

  /// Ghi cân nặng (#527 Phase 4): có mạng ghi thẳng `weight_logs` (+ hồ sơ),
  /// mất mạng xếp hàng outbox kind `weight`. `nil` khi thiếu cấu hình Supabase.
  func makeWeightLogger(userId: String) -> WeightLogger? {
    guard let backend else { return nil }
    let sync = self.sync
    return WeightLogger(
      userId: userId, source: SupabaseWeightLog(backend: backend), store: outbox,
      onEnqueued: { _ in sync.kick() },
      onSaved: { [weak self] _ in self?.weightSaved += 1 })
  }

  /// Nhập sinh trắc (#527 `log-biometrics`): đọc / ghi `biometric_samples` và
  /// dựng lại `daily_logs` qua `RowStore`; mất mạng xếp outbox kind `biometrics`.
  func makeBiometricLogger(userId: String) -> BiometricLogger? {
    guard let rows else { return nil }
    let sync = self.sync
    return BiometricLogger(userId: userId, store: rows, outbox: outbox, onEnqueued: { _ in sync.kick() })
  }

  /// "Tải dữ liệu của bạn" (#527 mục 7): đọc hết mọi bảng của người này. `nil` khi
  /// chưa có backend; lỗi đọc thì ném — không bao giờ trả gói thiếu.
  func loadExport(userId: String) async throws(RowStoreError) -> DataExport.Bundle? {
    guard let rows else { return nil }
    return try await DataExport.load(userId: userId, store: rows)
  }

  /// Nút "Ghi như mọi khi" của thông báo nhắc bữa và widget "Bữa quen" (Kiệt 01/11):
  /// bữa quen vào hàng đợi, như ghi trong app (mất mạng vẫn lưu, gửi khi có mạng).
  /// `mealType` `nil` = theo giờ.
  func logUsualMeal(mealType: String? = nil) async -> MealWidgetData.Logged? {
    guard let userId = session.session?.userId,
      let logger = makeMealLogger(userId: userId, date: nil, mealType: mealType),
      let meal = await logger.logUsual(), let id = logger.savedId
    else { return nil }
    return MealWidgetData.Logged(
      entryId: id, mealType: logger.mealType, names: meal.foods.map(\.food.name).joined(separator: ", "),
      kcal: meal.kcal.isFinite ? Int(meal.kcal.rounded()) : 0, at: Date().timeIntervalSince1970)
  }

  /// Chạm bữa quen trên widget: ghi, hiện "Đã ghi · Hoàn tác" ngay (lạc quan), rồi đọc
  /// lại bữa quen khi hàng đợi đã gửi.
  func logUsualMealFromWidget(_ mealType: String) async -> Bool {
    if case .loading = session.phase { await session.start() }
    guard let logged = await logUsualMeal(mealType: mealType) else { return false }
    let store = WidgetDataStore()
    if var d = store.meal() {
      d.logged = logged
      store.writeMeal(d)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: MealWidget.kind)
    if let userId = session.session?.userId {
      Task {
        await sync.settle()
        await publishMealWidget(userId: userId)
      }
    }
    return true
  }

  /// "Hoàn tác" của widget: chờ hàng đợi gửi xong rồi xoá bữa ấy như xoá trong nhật
  /// ký (chỉ khi có mạng). Không được thì widget mời mở nhật ký.
  func undoWidgetMeal(_ entryId: String) async -> Bool {
    if case .loading = session.phase { await session.start() }
    let store = WidgetDataStore()
    defer { WidgetCenter.shared.reloadTimelines(ofKind: MealWidget.kind) }
    var undone = false
    if let userId = session.session?.userId, let diary = makeMealDiary(userId: userId) {
      defer { diary.close() }
      sync.kick()
      await sync.settle()
      await diary.load()
      if case .ready(let meals) = diary.phase {
        let items = meals.flatMap(\.items).filter { $0.entryId.lowercased() == entryId.lowercased() }
        if case .done = await diary.delete(items, online: sync.online) { undone = true }
      }
    }
    guard var d = store.meal(), let l = d.logged, l.entryId == entryId else { return undone }
    if undone {
      d.logged = nil
      d.loggedTypes.removeAll { $0 == l.mealType }
    } else {
      d.logged?.undoFailed = true
    }
    store.writeMeal(d)
    return undone
  }

  /// Bữa quen của bốn loại bữa + bữa đã ghi hôm nay → App Group cho widget "Bữa quen".
  /// Đọc hỏng: giữ dữ liệu cũ.
  func publishMealWidget(userId: String) async {
    guard let backend,
      let rows = try? await SupabaseMealLog(backend: backend).recentMeals(userId: userId, limit: MealLog.recentMealsRead),
      session.session?.userId == userId
    else { return }
    let store = WidgetDataStore()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    var d = MealWidgetData(
      day: today.description, usual: MealWidget.usuals(rows),
      loggedTypes: MealWidget.loggedTypes(rows, today: today, in: .current))
    // Bữa widget vừa ghi còn trong hàng đợi (mất mạng), server chưa thấy: vẫn là đã ghi.
    let old = store.meal()
    d.logged = old?.logged
    if let l = old?.logged, old?.day == d.day, !rows.contains(where: { $0["id"]?.stringValue?.lowercased() == l.entryId.lowercased() }),
      !d.loggedTypes.contains(l.mealType)
    {
      d.loggedTypes.append(l.mealType)
    }
    guard d != old else { return }
    store.writeMeal(d)
    WidgetCenter.shared.reloadTimelines(ofKind: MealWidget.kind)
  }

  /// "Ghi món khác" từ thông báo: mỗi lần tăng một — `RootTabView` mở màn ghi bữa.
  var mealLogRequest = 0
  func requestMealLog() { mealLogRequest += 1 }

  /// Gains của Koa (#527 đợt 1): lịch sử tập + lịch tuần đã cache → vóc dáng.
  /// `nil` khi chưa có backend hoặc đọc hỏng (giữ Gains cũ).
  func loadKoaGains(userId: String) async -> KoaGainsSync.Loaded? {
    guard let rows else { return nil }
    let plans = await templates.cached(userId: userId)
    return await KoaGainsSync.load(userId: userId, store: rows, plans: plans, now: SystemWallClock().nowMillis(), in: .current)
  }

  /// Đổi mỗi lần câu "nếu… thì…" đổi.
  var trainingCueRevision = 0

  /// "Mình tập sau khi…" của tài khoản (`TrainingCue`, 03/11). Lưu trên máy.
  func trainingCue(userId: String) -> TrainingCue? {
    _ = trainingCueRevision
    guard let data = UserDefaults.standard.data(forKey: "koa.cue.\(userId)") else { return nil }
    return try? JSONDecoder().decode(TrainingCue.self, from: data)
  }

  func setTrainingCue(_ cue: TrainingCue?, userId: String) {
    let key = "koa.cue.\(userId)"
    if let cue, let data = try? JSONEncoder().encode(cue) {
      UserDefaults.standard.set(data, forKey: key)
    } else {
      UserDefaults.standard.removeObject(forKey: key)
    }
    trainingCueRevision += 1
  }

  /// Đổi mỗi lần tạm nghỉ đổi, để các màn đọc `koaPause` vẽ lại.
  var koaPauseRevision = 0
  /// UI test: tạm nghỉ chỉ sống trong một lần mở app, để flow này không làm hỏng flow sau.
  @ObservationIgnored private var uiTestPauses: [String: Data] = [:]

  /// Tạm nghỉ đang có hiệu lực của tài khoản (Koa Ecosystem V2). Lưu trên máy trước, rồi
  /// đồng bộ với bảng `koa_pauses`.
  func koaPause(userId: String, today: LocalDate) -> KoaPause? {
    _ = koaPauseRevision
    guard let data = Self.uiTest ? uiTestPauses[userId] : UserDefaults.standard.data(forKey: "koa.pause.\(userId)"),
      let p = try? JSONDecoder().decode(KoaPause.self, from: data), p.active(on: today)
    else { return nil }
    return p
  }

  /// Ngày `d` có nằm trong một đợt tạm nghỉ nào không, kể cả đợt đã qua (`KoaPauseLog`).
  func koaPausedDay(userId: String, today: LocalDate) -> @Sendable (LocalDate) -> Bool {
    let log = koaPauseLog(userId: userId, today: today)
    let current = koaPause(userId: userId, today: today)
    return { d in log.contains(d) || current?.contains(d) == true }
  }

  func koaPauseLog(userId: String, today: LocalDate) -> KoaPauseLog {
    _ = koaPauseRevision
    return loadPauseLog("koa.pauselog.\(userId)", userId: userId).pruned(today: today)
  }

  func setKoaPause(_ pause: KoaPause?, userId: String) {
    storeKoaPause(pause, userId: userId)
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    storePauseLog(koaPauseLog(userId: userId, today: today).setting(pause, today: today), "koa.pauselog.\(userId)", userId: userId)
    guard !Self.uiTest else { return }
    // lưu trên máy trước; đẩy lên server sau, mất mạng thì để cờ chờ lần đọc sau
    UserDefaults.standard.set(true, forKey: "koa.pause.pending.\(userId)")
    Task {
      await pushKoaPause(pause, userId: userId)
      await pushKoaPauseLog(userId: userId)
    }
  }

  @ObservationIgnored private var uiTestPauseLogs: [String: KoaPauseLog] = [:]

  private func loadPauseLog(_ key: String, userId: String) -> KoaPauseLog {
    if Self.uiTest { return uiTestPauseLogs[key] ?? KoaPauseLog() }
    guard let data = UserDefaults.standard.data(forKey: key),
      let log = try? JSONDecoder().decode(KoaPauseLog.self, from: data)
    else { return KoaPauseLog() }
    return log
  }

  private func storePauseLog(_ log: KoaPauseLog, _ key: String, userId: String) {
    if Self.uiTest {
      uiTestPauseLogs[key] = log
    } else if let data = try? JSONEncoder().encode(log) {
      UserDefaults.standard.set(data, forKey: key)
    }
    koaPauseRevision += 1
  }

  /// Gửi phần sổ server chưa có: so với bản đã gửi được lần cuối (`koa.pauselog.synced`), nên
  /// mất mạng hay bảng chưa deploy thì lần sau gửi bù, kể cả đợt đã huỷ.
  private func pushKoaPauseLog(userId: String) async {
    guard !Self.uiTest, let rows else { return }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let local = koaPauseLog(userId: userId, today: today)
    let synced = loadPauseLog("koa.pauselog.synced.\(userId)", userId: userId)
    let changes = KoaPauseLogSync.rows(from: synced, to: local, userId: userId)
    guard !changes.isEmpty else { return }
    do {
      try await rows.upsert(KoaPauseLogSync.table, changes, onConflict: KoaPauseLogSync.conflict)
      storePauseLog(local, "koa.pauselog.synced.\(userId)", userId: userId)
    } catch {}
  }

  /// Sổ tạm nghỉ: còn phần chưa gửi thì gửi trước; sau đó lấy bản trên server, ghép đợt đang có
  /// từ `koa_pauses`. Đọc hỏng (mất mạng, bảng chưa deploy) thì giữ sổ trên máy.
  /// `true` khi sổ trên máy vừa đổi theo server.
  @discardableResult
  func syncKoaPauseLog(userId: String) async -> Bool {
    guard !Self.uiTest, let rows else { return false }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    await pushKoaPauseLog(userId: userId)
    let local = koaPauseLog(userId: userId, today: today)
    guard local == loadPauseLog("koa.pauselog.synced.\(userId)", userId: userId).pruned(today: today),
      let found = try? await rows.select(KoaPauseLogSync.query(userId: userId, today: today)),
      session.session?.userId == userId
    else { return false }
    let server = KoaPauseLogSync.decode(found, today: today)
    storePauseLog(server, "koa.pauselog.synced.\(userId)", userId: userId)
    // đợt đang có đặt trước khi có sổ (hay ở máy chưa có bảng) vào sổ, lần gửi sau đưa lên
    let merged = server.including(koaPause(userId: userId, today: today), today: today)
    guard merged != local else { return false }
    storePauseLog(merged, "koa.pauselog.\(userId)", userId: userId)
    return true
  }

  private func storeKoaPause(_ pause: KoaPause?, userId: String) {
    let key = "koa.pause.\(userId)"
    if Self.uiTest {
      uiTestPauses[userId] = pause.flatMap { try? JSONEncoder().encode($0) }
    } else if let pause, let data = try? JSONEncoder().encode(pause) {
      UserDefaults.standard.set(data, forKey: key)
    } else {
      UserDefaults.standard.removeObject(forKey: key)
    }
    koaPauseRevision += 1
  }

  private func pushKoaPause(_ pause: KoaPause?, userId: String) async {
    guard let rows else { return }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    do {
      try await rows.upsert(
        KoaPauseSync.table, [KoaPauseSync.row(pause, userId: userId, today: today)], onConflict: "user_id")
      UserDefaults.standard.removeObject(forKey: "koa.pause.pending.\(userId)")
    } catch {}
  }

  /// Đồng bộ tạm nghỉ với server: còn thay đổi chưa gửi thì gửi; không thì lấy bản trên server
  /// (đổi máy, cài lại vẫn giữ đợt nghỉ). Đọc hỏng thì giữ bản trên máy.
  /// `true` khi đợt nghỉ trên máy vừa đổi theo server (bên gọi dựng lại việc chính).
  @discardableResult
  func syncKoaPause(userId: String) async -> Bool {
    guard !Self.uiTest, let rows else { return false }
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    if UserDefaults.standard.bool(forKey: "koa.pause.pending.\(userId)") {
      await pushKoaPause(koaPause(userId: userId, today: today), userId: userId)
      return false
    }
    guard let found = try? await rows.select(KoaPauseSync.query(userId: userId)),
      session.session?.userId == userId
    else { return false }
    let server = KoaPauseSync.decode(found.first).flatMap { $0.active(on: today) ? $0 : nil }
    guard server != koaPause(userId: userId, today: today) else { return false }
    storeKoaPause(server, userId: userId)
    return true
  }

  /// Phiên kết thúc: quên Koa trong bộ nhớ của người vừa rời đi (audit 03/11). Lịch sử Gains,
  /// đồ đang mặc, vóc dáng, giờ buổi gần nhất không gắn người: trước đây người đăng nhập sau thấy
  /// Nhịp 30 ngày / Hành trình / Gains của người trước cho tới khi Hôm nay đọc xong lượt của họ
  /// (`loadGains` chạy sau năm lượt đọc, có lượt qua mạng), và `ensureKoaGainsHistory` thấy
  /// lịch sử cũ nên không đọc lại. Các trạng thái có gắn `userId` (bụi, Gains hiện tại, Daily
  /// Plan, tuần, chuỗi) đã tự loại người khác nên giữ nguyên.
  func forgetKoaSession() {
    koaGainsHistory = nil
    koaShelfRecords = nil
    koaEquipped = []
    koaOwned = []
    koaBuild = 0
    koaLastSessionAt = nil
  }

  /// Màn tổng kết mở khi Hôm nay chưa đọc Gains (vào thẳng buổi tập): tự đọc, để thẻ Gains của
  /// buổi không biến mất đúng lúc đáng thấy nhất.
  func ensureKoaGainsHistory() async {
    guard koaGainsHistory == nil, let userId = session.session?.userId,
      let r = await loadKoaGains(userId: userId), session.session?.userId == userId
    else { return }
    koaGainsHistory = .init(days: r.days, week: r.week)
  }

  /// Phòng Koa mở (#792): tính lại kỷ lục cho kệ cúp khi chưa có hay lịch sử tập đã đổi. Đọc hỏng
  /// thì giữ kệ đang có; chưa có số thì cúp vẫn ở đó, Koa chỉ không nói số.
  func ensureKoaShelf() async {
    guard let userId = session.session?.userId, let rows, let h = koaGainsHistory else { return }
    if let r = koaShelfRecords, r.userId == userId, r.basis == h.days.count { return }
    guard let records = await KoaShelfSync.load(userId: userId, store: rows, in: .current),
      session.session?.userId == userId
    else { return }
    koaShelfRecords = (userId, h.days.count, records)
  }

  /// Câu ngắn của Daily Plan cho widget "Buổi tập hôm nay" (GĐ1); `nil` = câu mặc
  /// định của widget. Chỉ kết quả của ĐÚNG người + hôm nay.
  /// Tuần của Koa mới nhất mà Hôm nay dựng (Kiệt 27/10: widget thay "chuỗi" bằng số
  /// buổi tuần này) — cùng số với dải tuần.
  var koaWeekNow: (userId: String, weekStart: LocalDate, done: Int, target: Int)?

  func widgetWeek(userId: String) -> (done: Int, target: Int)? {
    guard let w = koaWeekNow, w.userId == userId,
      w.weekStart == WeeklyChallenges.weekStart(LocalDate(SystemWallClock().nowMillis(), in: .current))
    else { return nil }
    return (w.done, w.target)
  }

  func widgetPlanStatus(userId: String) -> String? {
    guard let p = dailyPlan, p.userId == userId, p.date == LocalDate(SystemWallClock().nowMillis(), in: .current)
    else { return nil }
    switch p.result.action {
    case .comeback: return String(localized: "dp.eyebrow.welcome")
    case .resume: return String(localized: "dp.eyebrow.resume")
    default: return nil
    }
  }

  /// Kết quả Daily Plan vừa đổi → widget vẽ lại theo cùng kết quả.
  func dailyPlanChanged() {
    Task { [widgets] in await widgets.refresh() }
  }

  /// Số liệu của Daily Plan (GĐ1) chỉ kho hàng đọc được: phục hồi của hôm nay
  /// (cùng đầu vào với điểm sẵn sàng) và đạm còn thiếu tới mục tiêu. Đọc hỏng /
  /// chưa đủ dữ liệu → `nil` — Daily Plan không đoán.
  func loadDailyPlanData(userId: String, date: LocalDate, profile: Profile?) async -> (
    recovery: DailyPlan.Recovery?, proteinLeftG: Int?
  ) {
    guard let rows else { return (nil, nil) }
    async let recovery = DailyLog.recovery(
      userId: userId, date: date, store: rows, now: SystemWallClock().nowMillis(), in: .current)
    let protein: Int?
    if let profile, let row = try? await rows.select(NutritionToday.query(userId: userId, today: date)) {
      let eaten = NutritionToday.totals(row.first).protein
      protein = max(0, Int((NutritionToday.macroTargets(profile).protein - eaten).rounded()))
    } else {
      protein = nil
    }
    return (await recovery, protein)
  }

  /// Ghi giấc ngủ (#527 `log-sleep`): đọc / ghi `sleep_logs` và dựng lại
  /// `daily_logs` qua `RowStore`; mất mạng xếp outbox kind `sleep`.
  func makeSleepLogger(userId: String) -> SleepLogger? {
    guard let rows else { return nil }
    let sync = self.sync
    return SleepLogger(userId: userId, store: rows, outbox: outbox, onEnqueued: { _ in sync.kick() })
  }

  /// Câu gợi ý tải của màn ghi buổi tập (#527 `log-workout` `loadHint`): ba
  /// lượt đọc qua kho hàng chung. Thiếu bảng chữ sẵn sàng thì coi mọi điểm
  /// đỏ là đỏ về hồi phục — chốt chặn "tăng tải" nghiêng về an toàn.
  func makeLoadHint(userId: String) -> LoadHintBook? {
    guard let rows else { return nil }
    let copy = ReadinessCopyStore.copy
    return LoadHintBook(
      userId: userId, store: rows,
      recovery: { explain in copy.map { ReadinessCard.hasRecoverySignal(explain, copy: $0) } ?? true })
  }

  /// Ghi số đo cơ thể (#527 `log-measurement`): có mạng upsert thẳng; mất
  /// mạng xếp outbox kind `measurement`, gửi ngay khi có mạng.
  func makeMeasurementLogger(userId: String) -> MeasurementLogger? {
    guard let backend else { return nil }
    let sync = self.sync
    return MeasurementLogger(
      userId: userId, source: SupabaseMeasurementLog(backend: backend), store: outbox,
      onEnqueued: { _ in sync.kick() })
  }

  /// Thực phẩm bổ sung (#527 Phase 3 · 3.9): đọc server; thêm / xoá thẳng
  /// server khi online, như RN. `nil` khi thiếu cấu hình Supabase.
  func makeSupplementBook(userId: String) -> SupplementBook? {
    guard let backend else { return nil }
    return SupplementBook(userId: userId, source: SupabaseSupplementSource(backend: backend), cache: supplementCache)
  }

  /// Danh sách đi chợ (#527, N1) — `grocery_items` + thực đơn gần nhất.
  func makeGrocery(userId: String) -> GroceryBook? {
    guard let backend else { return nil }
    return GroceryBook(userId: userId, source: SupabaseGrocerySource(backend: backend))
  }

  // MARK: - Thẻ / màn đọc server (#527 Phase 4/7/9)
  //
  // `nil` khi thiếu cấu hình Supabase: màn không hiện thẻ thay vì một thẻ lỗi mãi.

  /// Điểm sẵn sàng của `date` (hàng `daily_logs` mà #552 đã dựng).
  func makeReadinessBook(userId: String, date: LocalDate) -> ReadinessBook? {
    rows.map { ReadinessBook(userId: userId, date: date, store: $0) }
  }

  /// Xu hướng sẵn sàng 7 ngày (#527) — đọc `daily_logs` qua kho hàng chung.
  func makeReadinessTrend(userId: String, today: LocalDate) -> ReadinessTrendBook? {
    var recovery: (@Sendable (String?) -> Bool)?
    if let copy = ReadinessCopyStore.copy {
      recovery = { explain in ReadinessCard.hasRecoverySignal(explain, copy: copy) }
    }
    return rows.map { ReadinessTrendBook(userId: userId, today: today, store: $0, recovery: recovery) }
  }

  /// Thẻ tập luyện (#527 N3, `TrainingCard` của Hôm nay): các buổi 56 ngày và
  /// buổi gần nhất, qua kho hàng chung.
  func makeTrainingCard(userId: String) -> TrainingCardBook? {
    rows.map { TrainingCardBook(userId: userId, store: $0, in: .current) }
  }

  /// Ba vòng hoạt động (#527 N4, `ActivityRingsCard`): hàng `daily_logs` hôm nay
  /// (Health) và các buổi trong ngày, qua kho hàng chung.
  func makeActivityRings(userId: String, today: LocalDate) -> ActivityRingsBook? {
    rows.map { ActivityRingsBook(userId: userId, today: today, store: $0, in: .current) }
  }

  /// Nhật ký bữa ăn (#527 Phase 3 · 3.10): đọc một ngày; xoá / hoàn tác / sửa
  /// khẩu phần thẳng server (chỉ online, như RN) rồi dựng lại `daily_logs`.
  /// `date`: ngày đầu (`diary?date=` của deep link); `nil` = hôm nay.
  func makeMealDiary(userId: String, date: LocalDate? = nil) -> MealDiaryBook? {
    guard let rows, let backend else { return nil }
    // Bữa còn trong outbox hiện cùng bữa của server (chỉ đọc hàng đợi).
    return MealDiaryBook(
      userId: userId, source: SupabaseMealDiary(backend: backend), store: rows, pending: outbox, date: date,
      onRebuilt: { [weak self] day in
        guard let self else { return }
        self.mealDiaryRebuilt = DayPulse(day: day, seq: (self.mealDiaryRebuilt?.seq ?? 0) + 1)
      })
  }

  /// Ghi bữa ăn (#527 Phase 3 · 3.2): tìm món / món gần đây đọc server; LƯU
  /// luôn qua outbox kind `meal` (như RN `RECORD`), gửi ngay khi có mạng.
  /// Gọi edge function (19/10: "Ghi hôm nay" nhờ AI hiểu câu kể).
  var edge: (any EdgeCaller)? { backend.map(SupabaseEdgeCaller.init(backend:)) }

  func makeMealLogger(userId: String, date: LocalDate?, mealType: String?) -> MealLogger? {
    guard let backend else { return nil }
    let sync = self.sync
    return MealLogger(
      userId: userId, source: SupabaseMealLog(backend: backend), store: outbox, date: date, mealType: mealType,
      onEnqueued: { [weak self] entry in
        sync.kick()
        Telemetry.capture(.mealLogged)
        // Widget "Bữa quen" thôi mời bữa vừa ghi (cả khi ghi trong app).
        let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
        if let type = entry.payload["meal_type"]?.stringValue,
          entry.payload["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) }).map({ LocalDate($0, in: .current) }) == today
        {
          WidgetDataStore().markMealLogged(type, today: today)
          WidgetCenter.shared.reloadTimelines(ofKind: MealWidget.kind)
        }
        self?.didLog()
      },
      onChanged: { sync.kick() })
  }

  /// Vừa ghi một việc (bữa, buổi tập): lần đầu thì bật nhắc bữa tối và xin quyền
  /// thông báo (`ReminderCenter.firstLogNudge` — không đụng ai đã tự cài).
  func didLog() {
    Task { await reminders.firstLogNudge() }
  }

  /// Thư viện thực phẩm (#527 Phase 3 · 3.3): đọc "Của tôi" + "Gần đây";
  /// thêm / sửa / xoá thẳng server, chỉ khi có mạng (như RN).
  func makeFoodLibrary(userId: String) -> FoodLibraryBook? {
    guard let backend else { return nil }
    let source = SupabaseFoodLibrary(backend: backend)
    return FoodLibraryBook(userId: userId, source: source, favorites: source)
  }

  /// Ô tìm thực phẩm trên tab Dinh dưỡng (#527): chỉ đọc `food_items`.
  func makeFoodSearch() -> FoodSearchBook? {
    guard let backend else { return nil }
    let source = SupabaseFoodLibrary(backend: backend)
    return FoodSearchBook { text, limit in try await source.search(text, limit: limit) }
  }

  /// Dinh dưỡng 7 ngày (#527 Phase 3 · 3.6): chỉ đọc `daily_logs`.
  /// Số dinh dưỡng hôm nay cho thẻ trên tab Dinh dưỡng (#527, `NutritionCard`).
  func makeNutritionToday(userId: String) -> NutritionTodayBook? {
    guard let rows else { return nil }
    return NutritionTodayBook(userId: userId, store: rows)
  }

  func makeNutritionInsights(userId: String) -> NutritionInsightsBook? {
    guard let rows else { return nil }
    return NutritionInsightsBook(userId: userId, store: rows)
  }

  /// Kế hoạch ăn (#527 Phase 3 · 3.4): danh sách + tạo, chỉ khi có mạng.
  func makeMealPlans(userId: String) -> MealPlansBook? {
    guard let backend else { return nil }
    return MealPlansBook(userId: userId, source: SupabaseMealPlans(backend: backend))
  }

  /// Một kế hoạch ăn: thêm / xoá món thẳng server (có mạng); "Ghi vào hôm nay"
  /// qua hàng đợi bền như `log-meal`.
  func makeMealPlan(userId: String, planId: String) -> MealPlanBook? {
    guard let backend else { return nil }
    let sync = self.sync
    return MealPlanBook(
      userId: userId, planId: planId, source: SupabaseMealPlans(backend: backend), store: outbox,
      onEnqueued: { _ in sync.kick() })
  }

  /// Bốn tín hiệu còn lại của kế hoạch nhắc nhở (#527 A-NEXT-4): cân, bữa
  /// ăn, ngủ, sinh trắc của hôm nay — chỉ đọc, như các query của `useReminders`.
  func makeReminderToday(userId: String) -> ReminderTodayBook? {
    guard let rows else { return nil }
    return ReminderTodayBook(userId: userId, store: rows)
  }

  /// 14 ngày sinh trắc học; xoá một lần đo rồi dựng lại `daily_logs`.
  func makeBiometricsBook(userId: String) -> BiometricsBook? {
    guard let rows, let backend else { return nil }
    return BiometricsBook(userId: userId, store: rows, remover: SupabaseBiometricsRemover(backend: backend))
  }

  /// Huy chương: đọc + trao một lần mỗi lần mở màn.
  func makeAwardsBook(userId: String) -> AwardsBook? {
    guard let backend else { return nil }
    return AwardsBook(
      userId: userId, source: SupabaseAwardsSource(backend: backend),
      today: { LocalDate(SystemWallClock().nowMillis(), in: .current) },
      englishText: { AwardText.english($0) })
  }

  /// Tổng kết tuần (#527): sáu lệnh đọc qua kho hàng chung. Câu chữ sẵn sàng
  /// hỏng thì không có màn — không đoán "có tín hiệu hồi phục" khi không đọc được.
  func makeWeeklyReview(userId: String, today: LocalDate) -> WeeklyReviewBook? {
    guard let rows, let copy = ReadinessCopyStore.copy else { return nil }
    return WeeklyReviewBook(
      userId: userId, today: today, store: rows, edge: backend.map(SupabaseEdgeCaller.init(backend:)), copy: copy,
      in: .current)
  }

  /// Tín hiệu hôm nay cho chip gợi ý của Trợ lý / AI Coach (#527): ba lượt
  /// đọc qua kho hàng chung.
  func makeAssistantSignal(userId: String, today: LocalDate) -> AssistantSignalBook? {
    // Bảng chữ sẵn sàng đọc `readiness_explain` (`hasRecoverySignal`) cho lời
    // tóm tắt; thiếu thì lời tóm tắt chỉ nói về khả năng tập.
    rows.map {
      AssistantSignalBook(userId: userId, today: today, store: $0, in: .current, copy: ReadinessCopyStore.copy)
    }
  }

  /// Bảng chỉ số 7 ngày của tab Trợ lý (#527): `daily_logs` / `biometric_samples`
  /// qua kho hàng chung.
  func makeMetricHistory(userId: String, today: LocalDate) -> MetricHistoryBook? {
    // Trung bình sẵn sàng 7 ngày chỉ tính ngày có dữ liệu phục hồi (17/10).
    var recovery: (@Sendable (String?) -> Bool)?
    if let copy = ReadinessCopyStore.copy {
      recovery = { explain in ReadinessCard.hasRecoverySignal(explain, copy: copy) }
    }
    guard let rows else { return nil }
    return MetricHistoryBook(userId: userId, today: today, store: rows, in: .current, recovery: recovery)
  }

  /// "Insight hôm nay" của tab Trợ lý (#527): `ai-smart-nudges`, nhớ bền một ô.
  func makeSmartNudges(userId: String) -> SmartNudgesBook? {
    guard let backend else { return nil }
    return SmartNudgesBook(userId: userId, edge: SupabaseEdgeCaller(backend: backend), cache: SmartNudgesDefaultsCache())
  }

  /// Edge function của Supabase (chụp ảnh món, gợi ý món — #527). Thiếu cấu
  /// hình thì `nil`: màn nói "chưa triển khai".
  func makeEdgeCaller() -> (any EdgeCaller)? {
    #if DEBUG
      // Thử giao diện AI khi server chưa deploy hàm: mở app với
      // `SIMCTL_CHILD_ASCND_FAKE_AI=1`. Chỉ bản Debug.
      if ProcessInfo.processInfo.environment["ASCND_FAKE_AI"] == "1" { return FakeAIEdgeCaller() }
    #endif
    return backend.map { SupabaseEdgeCaller(backend: $0) }
  }

  /// Nhắn tin (15/10): server chưa có (`MESSAGING-PLAN.md`) → `nil`, app không hiện
  /// lối vào nào. Bản Debug thử giao diện với `SIMCTL_CHILD_ASCND_FAKE_DM=1`.
  func makeDirectMessages() -> (any DMSource)? {
    #if DEBUG
      if ProcessInfo.processInfo.environment["ASCND_FAKE_DM"] == "1" { return FakeDMSource.shared }
    #endif
    // Nhắn tin thật (20/10, `20261020130000_community_direct_messages.sql`). Lối vào chỉ hiện
    // khi hộp thư đọc được — trước khi migration lên server thì RPC hỏng, nút ẩn.
    return backend.map { SupabaseDMSource(backend: $0) }
  }

  /// Trí nhớ coach (#527): đọc + xoá `coach_memory`.
  func makeCoachMemory(userId: String) -> CoachMemoryBook? {
    guard let backend else { return nil }
    return CoachMemoryBook(userId: userId, store: SupabaseCoachMemoryStore(backend: backend), in: .current)
  }

  /// AI Coach (#527): luồng `ai-coach` + lịch sử `ai_conversations` / `ai_messages`,
  /// học qua `ai-coach-memory`. Thiếu cấu hình Supabase thì không có màn.
  func makeCoachChat(userId: String) -> CoachChat? {
    guard let backend else { return nil }
    return CoachChat(
      userId: userId, stream: SupabaseCoachStream(backend: backend), store: SupabaseCoachStore(backend: backend),
      edge: SupabaseEdgeCaller(backend: backend))
  }

  /// Thử thách tuần: gieo + đo qua kho hàng chung, thưởng qua RPC của server.
  func makeWeeklyChallenges(userId: String, today: LocalDate) -> WeeklyChallengesBook? {
    guard let rows, let backend else { return nil }
    return WeeklyChallengesBook(
      userId: userId, today: today, store: rows, economy: SupabaseMascotEconomy(backend: backend),
      english: { ChallengeText.english($0) })
  }

  /// "Tuần của Koa" (GĐ2): một sổ mỗi phiên — Hôm nay và phòng Koa nhận thưởng qua
  /// CÙNG sổ, nên trạng thái "đã nhận" không lệch giữa hai màn.
  @ObservationIgnored private var koaWeekBook: KoaWeekBook?
  func koaWeek(userId: String) -> KoaWeekBook? {
    if let b = koaWeekBook, b.userId == userId { return b }
    guard let backend else { return nil }
    let b = KoaWeekBook(userId: userId, economy: SupabaseMascotEconomy(backend: backend))
    koaWeekBook = b
    return b
  }

  /// Phòng linh vật: server là chủ kinh tế (hai RPC).
  func makeMascotRoom(userId: String, today: LocalDate) -> MascotRoomController? {
    guard let backend else { return nil }
    // Mục tiêu bước của màn Vận động (theo tài khoản) — nhiệm vụ bước chấm theo nó.
    let goals = StepsGoalStore(store: UserDefaultsStore(), userId: userId)
    // Lượt đọc của phòng đi vào bộ quan sát chung của tài khoản (#527 A-NEXT-7).
    return MascotRoomController(
      userId: userId, today: today, source: SupabaseMascotSource(backend: backend),
      economy: SupabaseMascotEconomy(backend: backend), stepsGoal: { goals.goal },
      questObserver: questObserver(userId: userId))
  }

  /// MỘT bộ quan sát nhiệm vụ cho mỗi tài khoản (`<QuestAutoClaim />` gắn ở gốc
  /// app RN): nhiệm vụ đã xong → tự nhận thưởng (Koa đợt 1); nhiệm vụ THẤY vừa
  /// xong → giờ thói quen — chính `noteDone` của RN;
  /// `HabitHours` tự bỏ nhiệm vụ ngoài `CLOCK_TRUSTED`. Đổi người → bản cũ
  /// đóng, bản mới bắt đầu từ mốc trống.
  func questObserver(userId: String) -> QuestObserver? {
    if let o = questObserverCache, o.userId == userId { return o }
    questObserverCache?.close()
    questObserverCache = nil
    guard let backend else { return nil }
    let goals = StepsGoalStore(store: UserDefaultsStore(), userId: userId)
    let o = QuestObserver(
      userId: userId, source: SupabaseMascotSource(backend: backend), stepsGoal: { goals.goal },
      economy: SupabaseMascotEconomy(backend: backend),
      onClaimed: { [weak self] claimed in
        guard self?.session.session?.userId == userId else { return }
        self?.noteKoaReward(
          userId: userId, amount: claimed.amount, seen: claimed.seen, quest: claimed.quest, allDone: claimed.allDone)
      },
      onQuestDone: { [weak self, habitHours] quest, hour in
        // Chỉ khi phiên vẫn là của người này: giờ của người vừa rời đi không
        // được ghi lại sau `habitHours.clear()`.
        guard self?.session.session?.userId == userId else { return }
        habitHours.noteDone(quest, hour: Double(hour), userId: userId)
      })
    questObserverCache = o
    return o
  }

  /// Phiên của `userId` kết thúc: lượt đọc về muộn của nó không ghi gì nữa.
  func closeQuestObserver(userId: String) {
    guard let o = questObserverCache, o.userId == userId else { return }
    o.close()
    questObserverCache = nil
  }

  /// Giấc ngủ — 7 ngày (#527): `sleep_logs` + mục tiêu ngủ của hồ sơ; xoá một
  /// đêm rồi dựng lại `daily_logs`.
  func makeSleepInsights(userId: String) -> SleepInsightsBook? {
    guard let rows, let backend else { return nil }
    return SleepInsightsBook(userId: userId, store: rows, remover: SupabaseSleepLogRemover(backend: backend))
  }

  /// Vận động (#527): 14 ngày `daily_logs.steps` + mục tiêu bước theo tài khoản.
  /// Tiến bộ theo trạng thái (#527, mock bản 10): 7 ngày daily_logs, 4 tuần cân, hồ sơ.
  func makeProgressStatus(userId: String, today: LocalDate) -> ProgressStatusBook? {
    rows.map { ProgressStatusBook(userId: userId, today: today, store: $0) }
  }

  func makeStepsBook(userId: String, today: LocalDate) -> StepsBook? {
    rows.map {
      StepsBook(userId: userId, today: today, store: $0, goals: StepsGoalStore(store: UserDefaultsStore(), userId: userId))
    }
  }

  /// Hiệu chỉnh mục tiêu (#527): 35 ngày cân + 14 ngày calo / đạm + hồ sơ.
  func makeSmartGoals(userId: String, today: LocalDate) -> SmartGoalsBook? {
    rows.map { SmartGoalsBook(userId: userId, today: today, store: $0) }
  }

  /// Số đo cơ thể (#527): 24 lần đo `body_measurements` mới nhất.
  /// Thẻ Cân nặng của phân đoạn Cơ thể (tab Tập luyện, 14/10): `weight_logs`
  /// qua kho hàng chung + cân mục tiêu trên máy.
  func makeWeightTrend(userId: String) -> WeightTrendBook? {
    rows.map { WeightTrendBook(userId: userId, store: $0, defaults: UserDefaultsStore()) }
  }

  func makeMeasurements(userId: String) -> MeasurementsBook? {
    rows.map { MeasurementsBook(userId: userId, store: $0) }
  }

  /// Ảnh tiến trình (#527): bảng `progress_photos` + bucket riêng tư; cân / vòng
  /// eo cho tấm so sánh đọc qua `RowStore`.
  /// Đo cơ thể bằng AI trong Ảnh tiến trình (04/11): đọc `body_checks`, gọi `body-check`.
  func makeBodyChecks(userId: String) -> BodyChecksBook? {
    guard let rows, let edge else { return nil }
    return BodyChecksBook(userId: userId, store: rows, edge: edge)
  }

  func makeProgressPhotos(userId: String) -> ProgressPhotosBook? {
    guard let backend else { return nil }
    return ProgressPhotosBook(userId: userId, remote: SupabaseProgressPhotos(backend: backend), store: rows)
  }

  /// Cửa hàng Koa (#527): sổ xu + tủ đồ; mua qua `buy_mascot_item`, nhận bộ qua
  /// `claim_quest_reward`.
  func makeMascotShop(userId: String) -> MascotShopBook? {
    guard let backend else { return nil }
    return MascotShopBook(
      userId: userId, source: SupabaseMascotSource(backend: backend),
      wardrobe: SupabaseMascotWardrobe(backend: backend), economy: SupabaseMascotEconomy(backend: backend))
  }

  /// Feed Cộng đồng (#527, lát 1): đọc `community_*` qua RLS, ảnh minh hoạ ở
  /// bucket công khai `community-art`.
  func makeCommunityFeed(userId: String) -> CommunityFeedBook? {
    guard let backend else { return nil }
    return CommunityFeedBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Hồ sơ cộng đồng của mình (#527, lát 2): `community_profiles` (upsert theo
  /// `user_id`) + số buổi tập / bữa ăn để mở khoá linh vật.
  func makeCommunityProfile(userId: String) -> CommunityProfileBook? {
    guard let backend else { return nil }
    return CommunityProfileBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Một bài + bình luận (#527, lát 3): `community_posts` / `community_comments`
  /// / `community_comment_mentions` / `community_mutes` qua RLS; gửi online.
  func makeCommunityPost(userId: String, postId: String) -> CommunityPostBook? {
    guard let backend else { return nil }
    return CommunityPostBook(userId: userId, postId: postId, remote: SupabaseCommunity(backend: backend))
  }

  /// Hồ sơ cộng đồng của một người (#527, lát 5): hồ sơ / theo dõi / bài theo
  /// loại / thống kê / huy hiệu / tắt tiếng / chặn / báo cáo qua RLS + RPC.
  func makeCommunityUser(userId: String, targetId: String) -> CommunityUserBook? {
    guard let backend else { return nil }
    return CommunityUserBook(userId: userId, targetId: targetId, remote: SupabaseCommunity(backend: backend))
  }

  /// Thử thách cộng đồng (#527, lát 14): tổng quan / lịch sử qua RPC, tham
  /// gia / rời qua RLS, nhận thưởng qua `claim_community_challenge`.
  func makeCommunityChallenges(userId: String) -> CommunityChallengesBook? {
    guard let backend else { return nil }
    return CommunityChallengesBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Chia sẻ một công thức (#527, lát 13): bữa 30 ngày + món + khẩu phần gốc,
  /// RPC `share_recipe*`.
  /// Bản ghi bữa / buổi đã đăng lên Cộng đồng (`useMySharedSessions`) — lối
  /// "Chia sẻ lên Cộng đồng" của thẻ bữa. Không đọc được → `nil` (chưa biết
  /// thì chưa hiện lối, như RN).
  func sharedPostSourceIds(userId: String) async -> Set<String>? {
    guard let backend else { return nil }
    return (try? await SupabaseCommunity(backend: backend).sharedSessionIds(me: userId)).map(Set.init)
  }

  func makeCommunityShareRecipe(userId: String, mealId: String?) -> CommunityShareRecipeBook? {
    guard let backend else { return nil }
    return CommunityShareRecipeBook(userId: userId, picked: mealId, remote: SupabaseCommunity(backend: backend))
  }

  /// Chia sẻ tiến trình (#527, lát 12): bài có tạ 90 ngày qua `historySource`
  /// (chỉ đọc), xem trước + đăng qua RPC.
  func makeCommunityShareProgress(userId: String) -> CommunityShareProgressBook? {
    guard let backend else { return nil }
    return CommunityShareProgressBook(userId: userId, remote: SupabaseCommunity(backend: backend), history: historySource)
  }

  /// Chia sẻ một buổi tập (#527, lát 11): buổi 30 ngày qua `historySource`
  /// (chỉ đọc), ảnh thư viện, RPC `share_workout*`.
  func makeCommunityShareWorkout(userId: String, sessionId: String?) -> CommunityShareWorkoutBook? {
    guard let backend else { return nil }
    return CommunityShareWorkoutBook(
      userId: userId, picked: sessionId, remote: SupabaseCommunity(backend: backend), history: historySource)
  }

  /// Quyền riêng tư Cộng đồng (#527, lát 10): cài đặt riêng, chặn / tắt
  /// tiếng, xoá mọi bài — qua RLS.
  func makeCommunityPrivacy(userId: String) -> CommunityPrivacyBook? {
    guard let backend else { return nil }
    return CommunityPrivacyBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Hộp thông báo Cộng đồng (#527, lát 9): thông báo + hồ sơ + tên thử thách,
  /// đánh dấu đã đọc qua RPC.
  /// Xoá tài khoản qua `delete-account` (App Store 5.1.1(v)).
  var accountDeleter: (any AccountDeleter)? { backend.map { SupabaseAccountDeleter(backend: $0) } }

  /// Tài khoản có gói trả phí (plus / max) — đọc `current_tier()` (server ghi,
  /// máy chỉ đọc). Lỗi / chưa cấu hình → `false`. Bản Debug: `ASCND_FAKE_TIER=plus`
  /// để thử giao diện gói trả phí khi chưa bán gói nào.
  func isPaid() async -> Bool {
    #if DEBUG
      if let fake = ProcessInfo.processInfo.environment["ASCND_FAKE_TIER"] { return fake != "free" }
    #endif
    guard let backend, let tier = try? await SupabaseTier(backend: backend).current() else { return false }
    return tier == "plus" || tier == "max"
  }

  func makeCommunityInbox(userId: String) -> CommunityInboxBook? {
    guard let backend else { return nil }
    return CommunityInboxBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Tìm người / công thức / bài (#527, lát 8): RPC tìm + theo dõi qua RLS.
  func makeCommunitySearch(userId: String, mode: CommunitySearch.Mode) -> CommunitySearchBook? {
    guard let backend else { return nil }
    return CommunitySearchBook(userId: userId, mode: mode, remote: SupabaseCommunity(backend: backend))
  }

  /// Thư viện Đã lưu (#527, lát 7): dòng lưu của mình + bài qua RLS.
  func makeCommunitySaved(userId: String) -> CommunitySavedBook? {
    guard let backend else { return nil }
    return CommunitySavedBook(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  /// Thích / lưu / menu bài (#527, lát 6): ghi thẳng server qua RLS + RPC.
  /// "Thử workout" (#527, lát 15): ghi `community_post_tries`; template do
  /// `PlanEditor.copyShared` của luồng tập tạo (màn truyền vào).
  func makeCommunityTry(userId: String) -> CommunityTryBook? {
    guard let backend else { return nil }
    return CommunityTryBook(userId: userId, remote: SupabaseCommunity(backend: backend)) { UUID().uuidString.lowercased() }
  }

  func makeCommunityPostActions(userId: String) -> CommunityPostActions? {
    guard let backend else { return nil }
    return CommunityPostActions(userId: userId, remote: SupabaseCommunity(backend: backend))
  }

  func didBecomeActive() {
    // Kết nối cũ có thể đã chết khi app ở nền / máy ngủ — mở kết nối mới (28/10).
    backend?.resetConnections()
    // Quay lại tiền cảnh: đo lại đường mạng, dò lại internet ngay.
    network.resume(Self.netPath(monitor.currentPath))
    sync.kick()
    Task { [widgets] in await widgets.refresh() }
    if let userId = session.session?.userId { Task { await publishMealWidget(userId: userId) } }
    autoSyncHealth()
    // Lần dò AI lúc mở app có thể đã hỏng vì mạng — dò lại (bỏ qua nếu đã có).
    Task { await probeAI() }
  }

  /// `useAutoHealthSync`: về tiền cảnh, đã hỏi quyền, cách lần trước ≥ 15 phút;
  /// xong thì widget đọc số mới.
  func autoSyncHealth() {
    if Self.uiTest { return }
    let user = session.session?.userId
    Task { [health, widgets] in
      await health.autoSync(userId: user, lang: Self.appLang)
      await widgets.refresh()
    }
    startHealthObserving()
  }

  /// Đồng bộ nền (18/10): Health báo có dữ liệu mới → đồng bộ rồi làm mới widget,
  /// kể cả khi app đang đóng. Chỉ khi đã kết nối; gọi lại nhiều lần cũng chỉ bật một.
  func startHealthObserving() {
    Task { [weak self, health, widgets] in
      await health.startObserving(
        userId: { self?.session.session?.userId }, lang: { Self.appLang },
        onSynced: { await widgets.refresh() })
    }
  }

  /// Ngôn ngữ chữ của app đang hiện — tên buổi tập từ đồng hồ theo nó. Theo iPhone
  /// (23/10): ngôn ngữ mà iOS chọn cho app (`preferredLocalizations`).
  static var appLang: String {
    let code = AppLanguage.shared.code ?? Bundle.main.preferredLocalizations.first ?? "en"
    return code.hasPrefix("vi") ? "vi" : code.hasPrefix("es") ? "es" : "en"
  }

  /// `Application Support/ascnd.sqlite`. Bảo vệ "tới lần mở khoá đầu tiên":
  /// app ở nền (nút ±15 của Island, vòng sync) vẫn đọc được sau khi máy khoá.
  /// Chế độ UI test (Maestro, `-uiTestFakeBackend`) — luôn `false` ở bản Release.
  static var uiTest: Bool {
    #if DEBUG
      UITestMode.isOn
    #else
      false
    #endif
  }

  private static var uiTestAuth: (any AuthAPI)? {
    #if DEBUG
      UITestMode.isOn ? UITestAuth() : nil
    #else
      nil
    #endif
  }

  private static var uiTestProber: (any ReachabilityProber)? {
    #if DEBUG
      UITestMode.isOn ? UITestReachabilityProber() : nil
    #else
      nil
    #endif
  }

  private static func databasePath() throws -> String {
    let fm = FileManager.default
    let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    try fm.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: dir.path)
    return dir.appendingPathComponent("ascnd.sqlite").path
  }

  /// MỘT định nghĩa "có mạng" cho cả app — vòng sync và dải báo đọc cùng một
  /// phép đo (luật 4 của `tools/net-status.mjs`): đường mạng của `NWPath` +
  /// phép dò internet của NetInfo (`NetworkObserver`, #530).
  private func applyNetwork(connected: Bool?, reachable: Bool?) {
    let usable = NetReachability.isUsable(connected: connected, internetReachable: reachable)
    let cameBack = usable && !sync.online
    sync.setOnline(usable)
    if cameBack, let userId = session.session?.userId {
      Task { await retryPendingQuests(userId: userId) }
    }
    net.apply(connected: connected, internetReachable: reachable)
  }

  /// `NWPath` → loại đường mạng của `RNCConnectionState`.
  nonisolated static func netPath(_ path: NWPath) -> NetPath {
    guard path.status == .satisfied else { return NetPath(kind: .none, isExpensive: path.isExpensive) }
    let kind: NetPath.Kind =
      path.usesInterfaceType(.wifi) ? .wifi
      : path.usesInterfaceType(.cellular) ? .cellular
      : path.usesInterfaceType(.wiredEthernet) ? .ethernet
      : .other
    return NetPath(kind: kind, isExpensive: path.isExpensive)
  }

  /// "Thử lại" của dải báo (`retryNow`): ĐO lại đường mạng và dò lại internet,
  /// không tự tuyên bố đã có mạng.
  ///
  /// Đường mạng báo chưa có (audit vòng 5, 28/10): NWPathMonitor có lúc không báo
  /// lại "có mạng" sau khi mạng chập chờn — app kẹt "Offline", "Thử lại" đọc lại
  /// đúng đường cũ, chỉ mở lại app mới hết (mở lại = monitor mới). Nên thay monitor
  /// mới: nó báo đường hiện tại ngay khi chạy, qua `pathChanged` như thường.
  func retryNetwork() {
    backend?.resetConnections()
    let current = monitor.currentPath
    let s = network.refresh(Self.netPath(current))
    applyNetwork(connected: s.connected, reachable: s.reachable)
    if current.status != .satisfied { restartNetworkMonitor() }
  }

  private func restartNetworkMonitor() {
    monitor.pathUpdateHandler = nil
    monitor.cancel()
    monitor = NWPathMonitor()
    startNetworkMonitor()
  }

  /// App vào nền: huỷ phép dò đang bay mà không đổi trạng thái (iOS cắt mạng
  /// của app ở nền — một phép dò bị cắt không phải bằng chứng mất mạng).
  func didEnterBackground() {
    network.suspend()
  }

  private func startNetworkMonitor() {
    let m = monitor
    m.pathUpdateHandler = { [weak self, weak m] path in
      let next = Self.netPath(path)
      Task { @MainActor in
        // Monitor cũ đã bị thay (`restartNetworkMonitor`): bỏ lượt báo muộn của nó.
        guard let self, let m, self.monitor === m else { return }
        self.network.pathChanged(next)
      }
    }
    m.start(queue: DispatchQueue(label: "ascnd.network"))
  }
}

/// Thiếu cấu hình Supabase (Backend.xcconfig): không đăng nhập được, nói rõ.
private struct UnconfiguredAuth: AuthAPI {
  struct NotConfigured: Error {}
  func currentSession() async throws -> AuthSession? { nil }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> { AsyncStream { $0.finish() } }
  func signUp(email: String, password: String, name: String) async throws { throw NotConfigured() }
  func updatePassword(_ password: String) async throws { throw NotConfigured() }
  func signIn(email: String, password: String) async throws { throw NotConfigured() }
  func signInWithApple(identityToken: String, rawNonce: String) async throws { throw NotConfigured() }
  func resetPassword(email: String) async throws { throw NotConfigured() }
  func signOut() async throws {}
}

private struct UnconfiguredHistory: TrainingHistory {
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { [] }
}

private struct UnconfiguredPerformance: PerformanceSource {
  struct NotConfigured: Error {}
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] { throw NotConfigured() }
}

private struct UnconfiguredHistorySource: HistorySource {
  struct NotConfigured: Error {}
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] { throw NotConfigured() }
}

private struct UnconfiguredRecords: RecordHistory {
  struct NotConfigured: Error {}
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] { throw NotConfigured() }
}

private struct UnconfiguredExercises: ExerciseSource {
  struct NotConfigured: Error {}
  func exercises(userId: String) async throws -> [LibraryExercise] { throw NotConfigured() }
}

private struct UnconfiguredGuides: ExerciseGuideSource {
  struct NotConfigured: Error {}
  func guideRows(userId: String, id: String?) async throws -> [GuideExerciseRow] { throw NotConfigured() }
  func guideContent(exerciseId: String) async throws -> [GuideContentRow] { throw NotConfigured() }
  func guideMedia(exerciseId: String) async throws -> [MediaRow] { throw NotConfigured() }
}

private struct UnconfiguredOnboarding: OnboardingStatusSource, OnboardingWriter {
  struct NotConfigured: Error {}
  func onboardingCompleted(userId: String) async throws -> Bool? { throw NotConfigured() }
  func completeOnboarding(userId: String, row: JSONValue) async throws { throw NotConfigured() }
}

private struct UnconfiguredProfile: ProfileSource, ProfileWriter {
  struct NotConfigured: Error {}
  func profile(userId: String) async throws -> JSONValue? { throw NotConfigured() }
  func update(userId: String, row: JSONValue) async throws { throw NotConfigured() }
}

private struct UnconfiguredTemplates: TemplateSource {
  struct NotConfigured: Error {}
  func fetch(userId: String) async throws -> TemplateSnapshot { throw NotConfigured() }
}

/// Không có backend thì không gửi được — coi như mất mạng, hàng đợi giữ nguyên.
private struct UnconfiguredRemote: RemoteWriter {
  func send(_ entry: OutboxEntry) async throws(WriteFailure) { throw .offline }
}

extension AppServices {
  /// Giấc / bữa của hôm nay còn trong hàng chờ — để thẻ Hôm nay tính "xong" ngay
  /// cả lúc mất mạng (audit 28/10), như nước đã làm.
  func todayPending(userId: String, today: LocalDate) -> TodayDay.Pending {
    TodayDay.pending(sync.outbox.pending, userId: userId, today: today, in: .current)
  }
}
