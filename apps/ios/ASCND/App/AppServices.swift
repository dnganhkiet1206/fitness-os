import ASCNDBackend
import ASCNDCore
import ASCNDStore
import Foundation
import Network
import Observation

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
  let sync: SyncWorker
  /// Hai widget màn hình chính (#66): dữ liệu thật, xoá khi phiên kết thúc.
  @ObservationIgnored let widgets: WidgetRefresher
  /// Apple Health (#66): đồng bộ vào server, ghi ngược buổi ghi tay.
  @ObservationIgnored let health: HealthSyncCoordinator
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
  /// Bảng `read_cache` (kế hoạch, kỷ lục, "lần trước") — để dọn theo người.
  @ObservationIgnored private let readCache: GRDBTemplateCache
  /// Lỗi không mở được database / thiếu cấu hình — app vẫn mở, màn nói thật.
  private(set) var startupError: String?

  @ObservationIgnored private let monitor = NWPathMonitor()

  init() {
    let backend: Backend?
    var problems: [String] = []
    do {
      backend = Backend(config: try BackendConfig.fromMainBundle())
    } catch {
      backend = nil
      problems.append("backend: \(error)")
    }

    let database: ASCNDDatabase
    do {
      database = try ASCNDDatabase(path: try Self.databasePath())
    } catch {
      // Không mở được tệp thì vẫn chạy trong bộ nhớ: dữ liệu KHÔNG bền, và
      // `startupError` nói điều đó ra — không bao giờ giả vờ "đã lưu".
      problems.append("database: \(error)")
      database = try! ASCNDDatabase()  // trong bộ nhớ: không có lý do thất bại ngoài hết RAM
    }

    workouts = GRDBWorkoutStore(database)
    let outboxStore = OutboxStore(database)
    outbox = outboxStore
    let templateCache = GRDBTemplateCache(database)
    readCache = templateCache
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
    session = SessionStore(api: backend.map { SupabaseAuthAPI(backend: $0) as any AuthAPI } ?? UnconfiguredAuth())
    let rows = backend.map { SupabaseRowStore(backend: $0) }
    let widgets = WidgetRefresher(store: rows)
    self.widgets = widgets
    health = HealthSyncCoordinator(store: rows)
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

    // Phiên kết thúc (nút Đăng xuất, token hết hạn, tài khoản bị xoá, hay đổi
    // thẳng sang tài khoản khác): mọi thứ của người vừa rời đi rời khỏi máy —
    // như `forgetPreviousAccount` của baseline (`use-auth.tsx:53`). MỘT closure,
    // chạy tuần tự, để thứ tự không phụ thuộc thứ tự đăng ký.
    let workouts = self.workouts
    session.onSignedOut { [sync = self.sync, weak session = self.session] in
      // Hàng đợi chưa gửi: bỏ, như baseline (#241 chờ Kiệt).
      await sync.signOut()
      // Điểm quay lại `routine-day:*` (`clearUserScopedStorage`).
      try? await workouts.clearAll()
      // Kế hoạch đã cache.
      try? await templateCache.clearAll()
      // Widget màn hình chính không giữ số của người vừa rời đi (`clearWidgetData`).
      widgets.setUser(session?.session?.userId)
      // Đổi thẳng tài khoản: người mới đã đăng nhập — vòng sync gửi hàng của
      // họ (`signOut` ở trên vừa đặt nó về nil).
      sync.setSignedInUser(session?.session?.userId)
    }
    startNetworkMonitor()
  }

  /// App mở / quay lại tiền cảnh: đọc phiên, dọn ngày cũ, thử gửi hàng đợi.
  func start() async {
    await session.start()
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    _ = try? await workouts.pruneDays(today: today)
    sync.kick()
    autoSyncHealth()
  }

  /// Tầng ứng dụng của màn Today cho người đang đăng nhập (#271).
  func makeToday(userId: String) -> TodayController {
    TodayController(userId: userId, repository: templates, history: history, workouts: workouts)
  }

  /// Phiên của `userId` bắt đầu: bỏ read model của mọi người khác. Lượt làm
  /// mới của người vừa rời đi có thể về SAU lượt dọn lúc đăng xuất (#335).
  func forgetOtherAccounts(keeping userId: String) async {
    _ = try? await readCache.clearAll(except: userId)
  }

  /// Việc dọn thêm khi phiên kết thúc, của những thứ không do AppServices
  /// dựng (quãng nghỉ / Live Activity).
  func onSessionEnded(_ cleanup: @escaping @MainActor @Sendable () async -> Void) {
    session.onSignedOut(cleanup)
  }

  /// Bảng kỷ lục của người đang đăng nhập (#295).
  func makeRecordBook(userId: String) -> RecordBook {
    RecordBook(userId: userId, history: recordHistory, cache: recordCache)
  }

  /// "Lần trước" của người đang đăng nhập (#331).
  func makePerformanceBook(userId: String) -> PerformanceBook {
    PerformanceBook(userId: userId, source: performanceSource, cache: performanceCache)
  }

  /// Luồng tập của người đang đăng nhập (#272): Today → buổi tập → nghỉ →
  /// chốt → máy → outbox → sync. Dựng MỘT lần mỗi phiên (`SignedInScope`);
  /// màn Today / Workout và Lab chỉ đọc nó.
  func makeWorkoutFlow(userId: String, rest: RestTimerController) -> WorkoutFlow {
    let sync = self.sync
    // Lịch sử buổi tập (#400): xoá từ lịch sử đi qua cùng outbox.
    let history = HistoryBook(
      userId: userId, source: historySource, cache: historyCache, store: workouts,
      onEnqueued: { _ in sync.kick() })
    // Phân tích bài tập (#419): cùng nguồn 90 ngày với "lần trước".
    let insights = InsightBook(userId: userId, source: performanceSource, cache: insightCache)
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
      onEnqueued: { _ in sync.kick() })
    flow.onManualLogged = { [health] entry in health.mirrorManualWorkout(entry) }
    return flow
  }

  /// Onboarding (#424): cổng sau đăng nhập của người này. `RootGate` nối nó
  /// khi màn của C sẵn sàng; tới lúc đó cổng hiện tại giữ nguyên.
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

  func didBecomeActive() {
    sync.kick()
    Task { [widgets] in await widgets.refresh() }
    autoSyncHealth()
  }

  /// `useAutoHealthSync`: về tiền cảnh, đã hỏi quyền, cách lần trước ≥ 15 phút;
  /// xong thì widget đọc số mới.
  func autoSyncHealth() {
    let user = session.session?.userId
    Task { [health, widgets] in
      await health.autoSync(userId: user, lang: Self.appLang)
      await widgets.refresh()
    }
  }

  /// Ngôn ngữ chữ của app đang hiện — tên buổi tập từ đồng hồ theo nó.
  static var appLang: String {
    let code = Bundle.main.preferredLocalizations.first ?? "en"
    return code.hasPrefix("vi") ? "vi" : code.hasPrefix("es") ? "es" : "en"
  }

  /// `Application Support/ascnd.sqlite`. Bảo vệ "tới lần mở khoá đầu tiên":
  /// app ở nền (nút ±15 của Island, vòng sync) vẫn đọc được sau khi máy khoá.
  private static func databasePath() throws -> String {
    let fm = FileManager.default
    let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    try fm.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: dir.path)
    return dir.appendingPathComponent("ascnd.sqlite").path
  }

  private func startNetworkMonitor() {
    monitor.pathUpdateHandler = { [weak self] path in
      let online = path.status == .satisfied
      Task { @MainActor in self?.sync.setOnline(online) }
    }
    monitor.start(queue: DispatchQueue(label: "ascnd.network"))
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
