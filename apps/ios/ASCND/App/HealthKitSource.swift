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

  private var readTypes: Set<HKObjectType> {
    [
      HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.appleExerciseTime),
      HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN), HKQuantityType(.oxygenSaturation),
      HKQuantityType(.respiratoryRate), HKCategoryType(.sleepAnalysis), HKObjectType.workoutType(),
    ]
  }

  private var shareTypes: Set<HKSampleType> {
    [HKQuantityType(.bodyMass), HKObjectType.workoutType(), HKCategoryType(.sleepAnalysis)]
  }

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

  /// `healthAlreadyAsked`: hộp xin quyền đã hiện rồi (không cần hỏi nữa).
  func alreadyAsked() async -> Bool {
    guard isAvailable else { return false }
    return (try? await store.statusForAuthorizationRequest(toShare: shareTypes, read: readTypes)) == .unnecessary
  }

  /// Đọc mọi thứ một lượt đồng bộ cần.
  func snapshot(now: EpochMillis, in tz: TimeZone) async -> HealthSync.Snapshot {
    let w = HealthData.windows(now: now, in: tz)
    async let hr = latest(.restingHeartRate, .count().unitDivided(by: .minute()), since: w.weekAgo)
    async let hrv = latest(.heartRateVariabilitySDNN, .secondUnit(with: .milli), since: w.weekAgo)
    async let spo2 = latest(.oxygenSaturation, .percent(), since: w.weekAgo)
    async let resp = latest(.respiratoryRate, .count().unitDivided(by: .minute()), since: w.weekAgo)
    async let steps = total(.stepCount, .count(), from: w.todayStart, to: now)
    async let kcal = total(.activeEnergyBurned, .kilocalorie(), from: w.todayStart, to: now)
    async let minutes = total(.appleExerciseTime, .minute(), from: w.todayStart, to: now)
    async let sleep = sleepSamples(since: w.sleepSince, to: now)
    async let workouts = workoutSamples(since: w.weekAgo, to: now)
    async let buckets = stepBuckets(anchor: w.todayStart, from: w.stepHistoryStart, to: now)
    return HealthSync.Snapshot(
      bio: HealthData.latestBiometrics(hr: await hr, hrv: await hrv, spo2: await spo2, resp: await resp),
      steps: HealthData.total(await steps), activeKcal: HealthData.total(await kcal),
      exerciseMinutes: HealthData.total(await minutes), sleep: HealthData.lastNight(await sleep),
      workouts: HealthData.workouts(await workouts),
      stepDays: HealthData.dailySteps(await buckets, today: LocalDate(now, in: tz), in: tz))
  }

  // MARK: - Ghi ngược (gương, nuốt lỗi như RN)

  /// `writeWorkoutToHealth`: buổi tạ, metadata `HKExternalUUID = ascnd:<id>` —
  /// lượt đọc sau nhận ra và bỏ qua mẫu của chính app.
  func writeWorkout(recordId: String, start: EpochMillis, end: EpochMillis) async {
    guard isAvailable else { return }
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: nil)
    do {
      try await builder.beginCollection(at: start.date)
      try await builder.addMetadata([HKMetadataKeyExternalUUID: "ascnd:\(recordId)"])
      try await builder.endCollection(at: end.date)
      _ = try await builder.finishWorkout()
    } catch {
      // Gương: không làm hỏng luồng lưu.
    }
  }

  // MARK: - Truy vấn

  private static func external(_ metadata: [String: Any]?) -> String? { metadata?[HKMetadataKeyExternalUUID] as? String }

  /// Mẫu HealthKit không `Sendable`: đổi sang kiểu giá trị NGAY trong
  /// callback, chỉ giá trị đi qua continuation.
  private func samples<T: Sendable>(
    _ type: HKSampleType, predicate: NSPredicate, limit: Int, ascending: Bool,
    map: @escaping (HKSample) -> T?
  ) async -> [T] {
    await withCheckedContinuation { cont in
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

  init(store: (any RowStore)?) {
    self.store = store
  }

  var isAvailable: Bool { source.isAvailable }

  /// Nút "Đồng bộ" (`useHealthSync`): xin quyền nếu cần, rồi chạy.
  func syncNow(userId: String, lang: String) async throws(HealthSync.Failure) {
    guard await source.requestPermission() else { throw .write("Health access was not granted") }
    try await run(userId: userId, lang: lang)
  }

  /// `useAutoHealthSync`: về tiền cảnh, đã hỏi quyền, cách lần trước ≥ 15
  /// phút. Im lặng — lỗi không hiện cho người dùng.
  func autoSync(userId: String?, lang: String) async {
    guard let userId, source.isAvailable, !running else { return }
    let now = SystemWallClock().nowMillis()
    let last = (UserDefaults.standard.object(forKey: Self.lastSyncKey) as? Double).map { EpochMillis(Int64($0)) }
    guard HealthSync.shouldAutoSync(asked: await source.alreadyAsked(), lastSync: last, now: now) else { return }
    UserDefaults.standard.set(Double(now.millis), forKey: Self.lastSyncKey)
    try? await run(userId: userId, lang: lang)
  }

  /// Ghi ngược buổi ghi tay vào Apple Health (gương).
  func mirrorManualWorkout(_ entry: OutboxEntry) {
    let source = self.source
    let interval = HealthSync.manualWorkoutInterval(payload: entry.payload, end: SystemWallClock().nowMillis())
    Task { await source.writeWorkout(recordId: entry.id, start: interval.start, end: interval.end) }
  }

  private func run(userId: String, lang: String) async throws(HealthSync.Failure) {
    guard let store, !running else { return }
    running = true
    defer { running = false }
    let now = SystemWallClock().nowMillis()
    let snapshot = await source.snapshot(now: now, in: .current)
    try await HealthSync.run(snapshot, userId: userId, lang: lang, store: store, now: now, in: .current)
  }
}
