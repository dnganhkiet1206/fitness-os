import ASCNDCore
import Foundation
import HealthKit

/// Lớp đọc / ghi HealthKit thật (`lib/health.ts` của RN): cùng loại dữ liệu
/// đọc, cùng loại ghi, cùng truy vấn (cửa sổ từ `HealthData.windows`). Mọi
/// phép gom / làm tròn nằm ở Core (`HealthData`), khoá bằng golden RN.
/// Mọi lỗi HealthKit là "không có số" — đồng bộ không bao giờ làm app ném.
final class HealthKitSource: @unchecked Sendable {
  private let store = HKHealthStore()

  var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

  /// Bộ loại đọc từ trước 17/10 — "đã kết nối" vẫn tính theo bộ này, để người
  /// đã kết nối không bị coi là chưa kết nối chỉ vì app xin thêm loại mới.
  private var legacyReadTypes: Set<HKObjectType> {
    [
      HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.appleExerciseTime),
      HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN), HKQuantityType(.oxygenSaturation),
      HKQuantityType(.respiratoryRate), HKCategoryType(.sleepAnalysis), HKObjectType.workoutType(),
    ]
  }

  /// Thêm cân nặng và nước (17/10, chủ dự án: app bắt ghi quá nhiều) — chỉ đọc.
  private var readTypes: Set<HKObjectType> {
    legacyReadTypes.union([HKQuantityType(.bodyMass), HKQuantityType(.dietaryWater)])
  }

  /// Không xin quyền ghi gì (17/10, chủ dự án: "Không ghi ngược vào
  /// HealthKit"): app chỉ ĐỌC Apple Health.
  private var shareTypes: Set<HKSampleType> { [] }

  /// `requestHealthPermissions`. HealthKit không cho biết người dùng đã cho
  /// đọc gì — "đã trả lời" là tất cả những gì có.
  func requestPermission() async -> Bool {
    guard isAvailable else { return false }
    do {
      try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
      return true
    } catch {
      return false
    }
  }

  /// `healthAlreadyAsked`: hộp xin quyền đã hiện rồi (không cần hỏi nữa) —
  /// theo bộ loại cũ.
  func alreadyAsked() async -> Bool {
    guard isAvailable else { return false }
    return (try? await store.statusForAuthorizationRequest(toShare: shareTypes, read: legacyReadTypes)) == .unnecessary
  }

  /// Đã hỏi cả các loại mới (cân, nước) chưa. Người kết nối trước 17/10 sẽ
  /// được hỏi thêm MỘT lần ở lượt tự đồng bộ kế tiếp.
  func askedAllTypes() async -> Bool {
    guard isAvailable else { return false }
    return (try? await store.statusForAuthorizationRequest(toShare: shareTypes, read: readTypes)) == .unnecessary
  }

  /// Kết quả đọc cửa sổ giới hạn (iOS 27): `.unknown` khi không đọc được
  /// (iOS < 27, build bằng SDK cũ, hoặc lỗi), `.unlimited` khi HealthKit trả
  /// về rỗng (không loại nào bị giới hạn), `.limited` với ngày sớm nhất khi
  /// có giới hạn. Ba trạng thái phải phân biệt: lỗi thì giữ dấu đã biết, còn
  /// rỗng thành công thì xoá dấu (người dùng đã mở rộng quyền).
  enum HistoryWindowResult: Sendable {
    case unknown
    case unlimited
    case limited(Date)
  }

  /// Ngày đọc được sớm nhất (iOS 27, màn chọn "Past 30 Days and Future Data"
  /// / "All Recorded Data and Future Data"): `earliestAuthorizedSampleDate`
  /// chỉ trả về các loại BỊ GIỚI HẠN — loại đủ quyền và loại bị từ chối đều
  /// vắng mặt như nhau, nên rỗng nghĩa là "không giới hạn nào thấy được",
  /// không phải "đủ quyền". Giới hạn theo thời gian chỉ áp cho loại mẫu
  /// (sample types); bộ loại đọc của app toàn loại mẫu nên truyền thẳng được.
  /// Ngày trả về là ngày HẠN CHẾ NHẤT (muộn nhất) trong các loại, để cửa sổ
  /// chung không nền nào tính trên ngày không đọc được.
  ///
  /// API chỉ có trong SDK iOS 27 (Xcode 27, Swift 6.4): build bằng Xcode cũ
  /// hơn thì nhánh này biên dịch ra `.unknown` — hành vi như iOS < 27, và CI
  /// (Xcode cũ) không kiểm được nhánh thật; xem CONSTRAINTS. Không bao giờ
  /// truyền tập rỗng: HealthKit coi đó là lỗi kết nối healthd.
  func historyWindowResult() async -> HistoryWindowResult {
    guard isAvailable, !readTypes.isEmpty else { return .unknown }
    #if compiler(>=6.4)
      if #available(iOS 27.0, *) {
        do {
          let dates = try await store.earliestAuthorizedSampleDate(for: readTypes)
          if let latest = dates.values.max() { return .limited(latest) }
          return .unlimited
        } catch {
          return .unknown
        }
      }
    #endif
    return .unknown
  }

  /// Số đo cho màn Về bạn của onboarding (mock 22/10): giới tính, ngày sinh, chiều
  /// cao, cân nặng mới nhất. Chỉ xin đọc đúng bốn thứ này, lúc người dùng bấm "Lấy từ
  /// Apple Health" — không gộp vào bộ loại của đồng bộ. Không cho đọc thì Health trả
  /// rỗng như không có dữ liệu (HealthKit không nói ai đã từ chối).
  func bodyStats() async -> HealthBodyStats {
    guard isAvailable else { return HealthBodyStats() }
    let types: Set<HKObjectType> = [
      HKCharacteristicType(.biologicalSex), HKCharacteristicType(.dateOfBirth), HKQuantityType(.height),
      HKQuantityType(.bodyMass),
    ]
    do {
      try await store.requestAuthorization(toShare: [], read: types)
    } catch {
      return HealthBodyStats()
    }
    var out = HealthBodyStats()
    switch (try? store.biologicalSex())?.biologicalSex {
    case .female: out.sex = .female
    case .male: out.sex = .male
    case .other: out.sex = .other
    default: break
    }
    if let c = try? store.dateOfBirthComponents(), let y = c.year, let m = c.month, let d = c.day {
      out.dob = LocalDate(String(format: "%04d-%02d-%02d", y, m, d))
    }
    async let height = latest(.height, .meterUnit(with: .centi), since: EpochMillis(Date(timeIntervalSince1970: 0)))
    async let weight = latest(.bodyMass, .gramUnit(with: .kilo), since: EpochMillis(Date(timeIntervalSince1970: 0)))
    out.heightCm = await height?.value
    out.weightKg = await weight?.value
    return out
  }

  /// Đồng bộ nền (18/10, chủ dự án: "Apple Health không tự đồng bộ được à"):
  /// Health báo khi có mẫu mới của các loại này — kể cả lúc app đang đóng (iOS
  /// đánh thức app, tối đa mỗi giờ một lần) — để thẻ Hôm nay, widget và nhắc nhở
  /// luôn đúng mà người dùng không phải mở app hay bấm gì.
  private var observedTypes: [HKSampleType] {
    [
      HKQuantityType(.stepCount), HKCategoryType(.sleepAnalysis), HKObjectType.workoutType(),
      HKQuantityType(.bodyMass), HKQuantityType(.dietaryWater), HKQuantityType(.restingHeartRate),
    ]
  }

  /// Đăng ký theo dõi; `onChange` chạy mỗi lần Health báo (iOS chờ `completion`
  /// trước khi cho app ngủ lại).
  func observe(_ onChange: @escaping @Sendable () async -> Void) {
    guard isAvailable else { return }
    for type in observedTypes {
      let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
        guard error == nil else {
          completion()
          return
        }
        // `completion` của HealthKit không `Sendable`; gọi đúng một lần sau lượt đồng bộ.
        let done = CompletionBox(completion)
        Task {
          await onChange()
          done.call()
        }
      }
      store.execute(query)
      store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
    }
  }

  /// Đọc mọi thứ một lượt đồng bộ cần. `earliestReadable` (iOS 27) là sàn của
  /// mọi cửa sổ truy vấn: không xin dữ liệu trước ngày hệ thống cho đọc —
  /// HealthKit trả rỗng chứ không lỗi, nên không kẹp thì "không có" và "không
  /// được đọc" lẫn nhau. Với cửa sổ 30 ngày thì kẹp này không đổi gì (mọi cửa
  /// sổ của app đều trong 14 ngày); nó chỉ có tác dụng khi cửa sổ ngắn hơn.
  func snapshot(now: EpochMillis, in tz: TimeZone, earliestReadable: EpochMillis? = nil) async -> HealthSync.Snapshot {
    let w = HealthData.windows(now: now, in: tz)
    func start(_ s: EpochMillis) -> EpochMillis { earliestReadable.map { max($0, s) } ?? s }
    let weekAgo = start(w.weekAgo)
    let sleepSince = start(w.sleepSince)
    let stepStart = start(w.stepHistoryStart)
    let weightSince = start(now - Int64(HealthData.weightDays) * 86_400_000)
    let waterSince = start(now - Int64(HealthData.waterDays) * 86_400_000)
    async let hr = latest(.restingHeartRate, .count().unitDivided(by: .minute()), since: weekAgo)
    async let hrv = latest(.heartRateVariabilitySDNN, .secondUnit(with: .milli), since: weekAgo)
    async let spo2 = latest(.oxygenSaturation, .percent(), since: weekAgo)
    async let resp = latest(.respiratoryRate, .count().unitDivided(by: .minute()), since: weekAgo)
    async let steps = total(.stepCount, .count(), from: w.todayStart, to: now)
    async let kcal = total(.activeEnergyBurned, .kilocalorie(), from: w.todayStart, to: now)
    async let minutes = total(.appleExerciseTime, .minute(), from: w.todayStart, to: now)
    async let sleep = sleepSamples(since: sleepSince, to: now)
    async let workouts = workoutSamples(since: weekAgo, to: now)
    async let buckets = stepBuckets(anchor: w.todayStart, from: stepStart, to: now)
    async let weights = weightSamples(since: weightSince, to: now)
    async let water = waterSamples(since: waterSince, to: now)
    return HealthSync.Snapshot(
      bio: HealthData.latestBiometrics(hr: await hr, hrv: await hrv, spo2: await spo2, resp: await resp),
      steps: HealthData.total(await steps), activeKcal: HealthData.total(await kcal),
      exerciseMinutes: HealthData.total(await minutes), sleep: HealthData.lastNight(await sleep),
      workouts: HealthData.workouts(await workouts),
      stepDays: HealthData.dailySteps(await buckets, today: LocalDate(now, in: tz), in: tz),
      weighIns: HealthData.weighIns(await weights, in: tz), water: HealthData.waterRows(await water, in: tz))
  }

  // MARK: - Truy vấn

  private static func external(_ metadata: [String: Any]?) -> String? { metadata?[HKMetadataKeyExternalUUID] as? String }

  /// Mẫu HealthKit không `Sendable`: đổi sang kiểu giá trị NGAY trong
  /// callback, chỉ giá trị đi qua continuation.
  private func samples<T: Sendable>(
    _ type: HKSampleType, predicate: NSPredicate, limit: Int, ascending: Bool,
    map: @escaping (HKSample) -> T?
  ) async -> [T] {
    // `map` chỉ chạy một lần trong callback của truy vấn, chỉ đọc mẫu được trao.
    nonisolated(unsafe) let map = map
    return await withCheckedContinuation { cont in
      let q = HKSampleQuery(
        sampleType: type, predicate: predicate, limit: limit,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)]
      ) { _, results, _ in cont.resume(returning: (results ?? []).compactMap(map)) }
      store.execute(q)
    }
  }

  private func latest(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, since: EpochMillis) async -> HealthData.Reading? {
    let p = HKQuery.predicateForSamples(withStart: since.date, end: nil)
    return await samples(HKQuantityType(id), predicate: p, limit: 1, ascending: false) { (sample: HKSample) -> HealthData.Reading? in
      guard let s = sample as? HKQuantitySample, s.quantity.is(compatibleWith: unit) else { return nil }
      return HealthData.Reading(value: s.quantity.doubleValue(for: unit), at: EpochMillis(s.startDate), uuid: s.uuid.uuidString)
    }.first
  }

  private func total(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, from: EpochMillis, to: EpochMillis) async -> Double? {
    await withCheckedContinuation { cont in
      let q = HKStatisticsQuery(
        quantityType: HKQuantityType(id), quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from.date, end: to.date),
        options: .cumulativeSum
      ) { _, stats, _ in cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit)) }
      store.execute(q)
    }
  }

  private func stepBuckets(anchor: EpochMillis, from: EpochMillis, to: EpochMillis) async -> [HealthData.StepBucket] {
    await withCheckedContinuation { cont in
      let q = HKStatisticsCollectionQuery(
        quantityType: HKQuantityType(.stepCount), quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from.date, end: to.date),
        options: .cumulativeSum, anchorDate: anchor.date, intervalComponents: DateComponents(day: 1))
      q.initialResultsHandler = { _, collection, _ in
        let out = (collection?.statistics() ?? []).map {
          HealthData.StepBucket(start: EpochMillis($0.startDate), sum: $0.sumQuantity()?.doubleValue(for: .count()))
        }
        cont.resume(returning: out)
      }
      store.execute(q)
    }
  }

  private func sleepSamples(since: EpochMillis, to: EpochMillis) async -> [HealthData.SleepSample] {
    let p = HKQuery.predicateForSamples(withStart: since.date, end: to.date)
    return await samples(HKCategoryType(.sleepAnalysis), predicate: p, limit: HKObjectQueryNoLimit, ascending: true) { (sample: HKSample) -> HealthData.SleepSample? in
      guard let s = sample as? HKCategorySample else { return nil }
      return HealthData.SleepSample(
        start: EpochMillis(s.startDate), end: EpochMillis(s.endDate), value: s.value, externalUUID: Self.external(s.metadata))
    }
  }

  /// Mẫu do chính app này ghi thì bỏ — không đọc lại thứ mình đã ghi.
  private static func isOwn(_ s: HKSample) -> Bool {
    s.sourceRevision.source.bundleIdentifier == Bundle.main.bundleIdentifier
  }

  private func weightSamples(since: EpochMillis, to: EpochMillis) async -> [HealthData.WeightSample] {
    let p = HKQuery.predicateForSamples(withStart: since.date, end: to.date)
    return await samples(HKQuantityType(.bodyMass), predicate: p, limit: HKObjectQueryNoLimit, ascending: true) { (sample: HKSample) -> HealthData.WeightSample? in
      guard let s = sample as? HKQuantitySample, !Self.isOwn(s) else { return nil }
      return HealthData.WeightSample(at: EpochMillis(s.startDate), kg: s.quantity.doubleValue(for: .gramUnit(with: .kilo)))
    }
  }

  private func waterSamples(since: EpochMillis, to: EpochMillis) async -> [HealthData.WaterSample] {
    let p = HKQuery.predicateForSamples(withStart: since.date, end: to.date)
    return await samples(HKQuantityType(.dietaryWater), predicate: p, limit: HKObjectQueryNoLimit, ascending: true) { (sample: HKSample) -> HealthData.WaterSample? in
      guard let s = sample as? HKQuantitySample, !Self.isOwn(s) else { return nil }
      return HealthData.WaterSample(
        uuid: s.uuid.uuidString, at: EpochMillis(s.startDate), ml: s.quantity.doubleValue(for: .literUnit(with: .milli)))
    }
  }

  private func workoutSamples(since: EpochMillis, to: EpochMillis) async -> [HealthData.WorkoutSample] {
    let p = HKQuery.predicateForSamples(withStart: since.date, end: to.date)
    return await samples(.workoutType(), predicate: p, limit: HKObjectQueryNoLimit, ascending: false) { (sample: HKSample) -> HealthData.WorkoutSample? in
      guard let w = sample as? HKWorkout else { return nil }
      return HealthData.WorkoutSample(
        uuid: w.uuid.uuidString, start: EpochMillis(w.startDate), durationSec: w.duration,
        kcal: w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()),
        activityType: Int(w.workoutActivityType.rawValue), externalUUID: Self.external(w.metadata))
    }
  }
}

/// Điều phối đồng bộ Apple Health của app (`useHealthSync` + `useAutoHealthSync`).
@MainActor
final class HealthSyncCoordinator {
  private let source = HealthKitSource()
  private let store: (any RowStore)?
  private var running = false
  private static let lastSyncKey = "health:lastAutoSync"
  /// Người dùng tắt Apple Health trong Cài đặt (Kiệt 01/11): ngừng đồng bộ, giữ quyền
  /// (app không thu hồi được quyền HealthKit — chỉ Cài đặt của iPhone làm được).
  static let pausedKey = "health:paused"
  /// Ngày đọc được sớm nhất của Apple Health (iOS 27, mili giây), theo máy như
  /// `health:paused`: 0 / vắng = không biết (iOS < 27, SDK cũ, hoặc không giới
  /// hạn). UI đọc cùng khoá để ghi chú "lịch sử giới hạn".
  static let earliestReadableDateKey = "health:earliestReadableDate"

  /// Mili giây đã lưu của ngày đọc được sớm nhất, `nil` khi không biết.
  private var earliestReadableMillis: EpochMillis? {
    let ms = UserDefaults.standard.double(forKey: Self.earliestReadableDateKey)
    return ms > 0 ? EpochMillis(Int64(ms)) : nil
  }

  /// Cửa sổ lịch sử đã biết trên máy này — UI và engine đọc để ghi cờ.
  var historyWindow: HealthHistoryWindow {
    HealthHistoryWindow.fromStored(
      millis: Int64(UserDefaults.standard.double(forKey: Self.earliestReadableDateKey)), in: .current)
  }

  /// Đọc lại cửa sổ giới hạn từ HealthKit (iOS 27). Chạy ở đầu mỗi lượt đồng
  /// bộ — lượt đã bị nhịp 15 phút / thao tác người dùng chặn, nên không gọi
  /// dồn dập. Lỗi thì giữ dấu cũ; thành công mà rỗng thì xoá dấu (người dùng
  /// đã mở rộng quyền hoặc không còn giới hạn).
  private func refreshHistoryWindow() async {
    switch await source.historyWindowResult() {
    case .unknown:
      break
    case .unlimited:
      UserDefaults.standard.removeObject(forKey: Self.earliestReadableDateKey)
    case .limited(let date):
      UserDefaults.standard.set(Double(EpochMillis(date).millis), forKey: Self.earliestReadableDateKey)
    }
  }

  var paused: Bool { UserDefaults.standard.bool(forKey: Self.pausedKey) }

  func setPaused(_ on: Bool) {
    UserDefaults.standard.set(on, forKey: Self.pausedKey)
  }

  init(store: (any RowStore)?) {
    self.store = store
  }

  var isAvailable: Bool { source.isAvailable }

  /// Số đo cho màn Về bạn (`HealthKitSource.bodyStats`).
  func bodyStats() async -> HealthBodyStats { await source.bodyStats() }

  /// Đã hỏi quyền Apple Health trên máy này chưa (thẻ "Bắt đầu" của Hôm nay).
  func isConnected() async -> Bool { await source.alreadyAsked() }

  /// Lần đồng bộ gần nhất (tự hay bấm) — thẻ Apple Health của Hôm nay.
  var lastSync: Date? {
    (UserDefaults.standard.object(forKey: Self.lastSyncKey) as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }
  }

  /// Nút "Đồng bộ" (`useHealthSync`): xin quyền nếu cần, rồi chạy.
  func syncNow(userId: String, lang: String) async throws(HealthSync.Failure) {
    guard await source.requestPermission() else { throw .write("Health access was not granted") }
    setPaused(false)
    try await run(userId: userId, lang: lang)
    UserDefaults.standard.set(Double(SystemWallClock().nowMillis().millis), forKey: Self.lastSyncKey)
    Telemetry.capture(.healthConnected)
  }

  /// `useAutoHealthSync`: về tiền cảnh, đã hỏi quyền, cách lần trước ≥ 15
  /// phút. Im lặng — lỗi không hiện cho người dùng.
  func autoSync(userId: String?, lang: String) async {
    guard let userId, !running else { return }
    if paused { return }
    // Không kết nối Health: bước chân từ iPhone, nếu người dùng đã bật (18/10).
    guard source.isAvailable, await source.alreadyAsked() else {
      await syncPhoneSteps(userId: userId)
      return
    }
    let now = SystemWallClock().nowMillis()
    let last = (UserDefaults.standard.object(forKey: Self.lastSyncKey) as? Double).map { EpochMillis(Int64($0)) }
    guard HealthSync.shouldAutoSync(asked: await source.alreadyAsked(), lastSync: last, now: now) else { return }
    UserDefaults.standard.set(Double(now.millis), forKey: Self.lastSyncKey)
    // Đã kết nối từ trước nhưng chưa được hỏi cân / nước: hỏi một lần (hộp
    // quyền của hệ thống chỉ hiện các loại chưa hỏi).
    if !(await source.askedAllTypes()) { _ = await source.requestPermission() }
    try? await run(userId: userId, lang: lang)
  }

  // MARK: - Bước chân từ iPhone (18/10)

  private let pedometer = PedometerSource()

  /// Có thể đếm bước bằng iPhone (máy có cảm biến) — hàng bật ở Cài đặt.
  var phoneStepsAvailable: Bool { pedometer.isAvailable }
  /// Đã bật (đã cho quyền Chuyển động & thể chất).
  var phoneStepsOn: Bool { pedometer.authorized }

  /// Bật từ Cài đặt: lần đọc đầu là lúc hệ thống hỏi quyền; có quyền thì ghi
  /// bước hôm nay ngay.
  func enablePhoneSteps(userId: String) async -> Bool {
    _ = await pedometer.todaySteps()
    guard pedometer.authorized else { return false }
    await syncPhoneSteps(userId: userId)
    return true
  }

  /// Bước hôm nay từ iPhone → `daily_logs` (chỉ khi đã có quyền — không bao giờ
  /// tự hỏi), rồi báo màn đọc lại như một lượt Health.
  private func syncPhoneSteps(userId: String) async {
    guard let store, pedometer.isAvailable, pedometer.authorized, let steps = await pedometer.todaySteps() else {
      return
    }
    try? await HealthSync.phoneSteps(steps, userId: userId, store: store, now: SystemWallClock().nowMillis(), in: .current)
    NotificationCenter.default.post(name: .healthSynced, object: nil)
  }

  /// Bật đồng bộ nền một lần mỗi lần app chạy (cả khi iOS mở app trong nền), chỉ
  /// khi đã kết nối. `userId` đọc lúc Health báo — phiên có thể vừa khôi phục.
  private var observing = false
  func startObserving(userId: @escaping @MainActor () -> String?, lang: @escaping @MainActor () -> String,
                      onSynced: @escaping @MainActor () async -> Void = {}) async {
    guard source.isAvailable, !observing, await source.alreadyAsked() else { return }
    observing = true
    source.observe { [weak self] in
      await self?.backgroundSync(userId: userId(), lang: lang(), onSynced: onSynced)
    }
  }

  /// Một lượt do Health báo: không bao giờ xin quyền (app có thể đang ở nền),
  /// cùng nhịp 15 phút với lượt tự đồng bộ — nhiều loại báo cùng lúc chỉ chạy một.
  private func backgroundSync(userId: String?, lang: String, onSynced: @MainActor () async -> Void) async {
    guard let userId, !running, !paused else { return }
    let now = SystemWallClock().nowMillis()
    let last = (UserDefaults.standard.object(forKey: Self.lastSyncKey) as? Double).map { EpochMillis(Int64($0)) }
    guard HealthSync.shouldAutoSync(asked: true, lastSync: last, now: now) else { return }
    UserDefaults.standard.set(Double(now.millis), forKey: Self.lastSyncKey)
    if (try? await run(userId: userId, lang: lang)) != nil { await onSynced() }
  }

  private func run(userId: String, lang: String) async throws(HealthSync.Failure) {
    guard let store, !running else { return }
    running = true
    defer { running = false }
    let now = SystemWallClock().nowMillis()
    await refreshHistoryWindow()
    let window = historyWindow
    let snapshot = await source.snapshot(now: now, in: .current, earliestReadable: earliestReadableMillis)
    // Báo màn đang mở đọc lại SAU khi ghi xong — cả khi lượt ghi ném lỗi
    // (`HealthSync.run` vẫn lưu phần cứu được rồi mới ném). Không có tín hiệu
    // này, Hôm nay đọc `daily_logs` cùng lúc lượt tự đồng bộ chạy và giữ số
    // bước cũ (15/10).
    defer { Task { @MainActor in NotificationCenter.default.post(name: .healthSynced, object: nil) } }
    try await HealthSync.run(
      snapshot, userId: userId, lang: lang, store: store, now: now, in: .current, historyWindow: window)
  }
}

extension Notification.Name {
  /// Một lượt đồng bộ Apple Health vừa ghi xong `daily_logs` của máy này.
  static let healthSynced = Notification.Name("ascnd.healthSynced")
}

/// Hộp cho `HKObserverQueryCompletionHandler` để gọi từ `Task` (HealthKit cho
/// gọi từ luồng bất kỳ).
private final class CompletionBox: @unchecked Sendable {
  private let completion: HKObserverQueryCompletionHandler
  init(_ completion: @escaping HKObserverQueryCompletionHandler) { self.completion = completion }
  func call() { completion() }
}
