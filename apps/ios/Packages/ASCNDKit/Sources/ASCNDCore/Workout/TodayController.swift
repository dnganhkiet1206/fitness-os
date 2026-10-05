public import Foundation
public import Observation

extension EpochMillis {
  /// Đọc `timestamptz` như PostgREST trả: `2026-10-05T07:00:00+00:00`,
  /// `…T07:00:00.123456+07:00`, `…Z`. Phần lẻ cắt về mili giây. Viết tay chứ
  /// không qua `ISO8601DateFormatter`: formatter ấy không chắc nhận phần lẻ
  /// sáu chữ số, và một buổi đọc hỏng là một ngày "chưa tập" sai.
  public init?(iso8601 s: String) {
    let c = Array(s.utf8)
    func int(_ from: Int, _ len: Int) -> Int? {
      guard from + len <= c.count else { return nil }
      var v = 0
      for i in from..<(from + len) {
        guard c[i] >= 48, c[i] <= 57 else { return nil }
        v = v * 10 + Int(c[i] - 48)
      }
      return v
    }
    guard c.count >= 19, c[4] == 45, c[7] == 45, c[10] == 84 || c[10] == 32, c[13] == 58, c[16] == 58,
      let y = int(0, 4), let mo = int(5, 2), let d = int(8, 2),
      let h = int(11, 2), let mi = int(14, 2), let se = int(17, 2),
      let date = LocalDate(String(format: "%04d-%02d-%02d", y, mo, d)), h < 24, mi < 60, se < 61
    else { return nil }
    var i = 19
    var ms = 0
    if i < c.count, c[i] == 46 {
      i += 1
      var digits = 0
      while i < c.count, c[i] >= 48, c[i] <= 57 {
        if digits < 3 { ms = ms * 10 + Int(c[i] - 48) }
        digits += 1
        i += 1
      }
      guard digits > 0 else { return nil }
      if digits < 3 { for _ in digits..<3 { ms *= 10 } }
    }
    var offset = 0
    if i == c.count {
      offset = 0  // không có múi: coi là UTC, như Postgres với timestamptz đã chuẩn hoá
    } else if c[i] == 90, i + 1 == c.count {
      offset = 0
    } else if c[i] == 43 || c[i] == 45, let oh = int(i + 1, 2) {
      var om = 0
      if i + 3 < c.count {
        let j = c[i + 3] == 58 ? i + 4 : i + 3
        guard let m = int(j, 2), j + 2 == c.count else { return nil }
        om = m
      } else {
        guard i + 3 == c.count else { return nil }
      }
      offset = (oh * 60 + om) * 60 * (c[i] == 45 ? -1 : 1)
    } else {
      return nil
    }
    let secs = Int64(date.daysSinceEpoch) * 86_400 + Int64(h * 3600 + mi * 60 + se) - Int64(offset)
    self.init(secs * 1000 + Int64(ms))
  }
}

/// Những ngày đã có buổi trên server (`workout_sessions.date_time`).
/// `ASCNDBackend.SupabaseTrainingHistory` hiện thực.
public protocol TrainingHistory: Sendable {
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis]
}

/// Tầng ứng dụng của màn Today (#271): ngày thật của người dùng, kế hoạch
/// local-first, trạng thái `dayStateOf`, và mở màn tập cho đúng ngày.
///
/// "Đã tập" là hợp của hai nguồn — một trong hai đủ để khoá nút Chốt:
/// - server: có buổi nào trong ngày (`logged = sessions.length > 0`, baseline);
/// - máy này: ngày đã chốt bằng `loggedSessionId` — đúng cả khi offline và
///   buổi chưa lên server.
@MainActor @Observable
public final class TodayController {
  public enum Source: Sendable, Hashable {
    case none
    case cache(EpochMillis)
    case server(EpochMillis)
  }

  /// Cửa sổ lịch sử: 14 ngày, như `useWorkoutSessions(14)` của tuần.
  public static let historyDays = 14

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var plan: TodayPlan?
  public private(set) var source: Source = .none
  public private(set) var refreshError: String?
  public private(set) var trained: Set<LocalDate> = []

  @ObservationIgnored private let repository: TodayRepository
  @ObservationIgnored private let history: any TrainingHistory
  @ObservationIgnored private let workouts: any WorkoutStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var snapshot: TemplateSnapshot?
  @ObservationIgnored private var serverTrained: Set<LocalDate> = []

  public init(
    userId: String, repository: TodayRepository, history: any TrainingHistory, workouts: any WorkoutStore,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.repository = repository
    self.history = history
    self.workouts = workouts
    self.clock = clock
    self.timeZone = timeZone
    self.today = LocalDate(clock.nowMillis(), in: timeZone)
  }

  /// Cache trên máy trước (hiện ngay, kể cả offline), rồi server.
  public func load() async {
    if let cached = await repository.cached(userId: userId) {
      snapshot = cached
      source = .cache(cached.fetchedAt)
      await recompute()
    }
    await refresh()
  }

  /// Hỏi server kế hoạch + lịch sử. Hỏng phần nào thì giữ phần đã có.
  public func refresh() async {
    var failures: [String] = []
    do {
      let fresh = try await repository.refresh(userId: userId)
      snapshot = fresh
      source = .server(fresh.fetchedAt)
    } catch {
      failures.append("plan: \(error)")
    }
    do {
      let since = EpochMillis(Self.startOfDay(today.adding(days: -(Self.historyDays - 1)), in: timeZone))
      let times = try await history.sessionTimes(userId: userId, since: since)
      serverTrained = Set(times.map { LocalDate($0, in: timeZone) })
    } catch {
      failures.append("history: \(error)")
    }
    refreshError = failures.isEmpty ? nil : failures.joined(separator: "\n")
    await recompute()
  }

  /// Gọi khi app ra tiền cảnh / mỗi phút: qua nửa đêm thì "hôm nay" đổi.
  public func clockTick() async {
    let now = LocalDate(clock.nowMillis(), in: timeZone)
    guard now != today else { return }
    today = now
    await recompute()
  }

  /// Màn tập cho kế hoạch hôm nay; `nil` khi hôm nay không có buổi.
  public func makeSession(
    onRest: @escaping @MainActor (RestEvent, PlannedSet?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) -> WorkoutSessionController? {
    guard let sessionPlan = plan?.sessionPlan else { return nil }
    return WorkoutSessionController(
      plan: sessionPlan, userId: userId, store: workouts, clock: clock, timeZone: timeZone,
      loggedElsewhere: serverTrained.contains(today), onRest: onRest, onEnqueued: onEnqueued)
  }

  /// Màn tập vừa chốt: ngày thành `done` ngay, không đợi server.
  public func markTrained(_ date: LocalDate) async {
    trained.insert(date)
    await recompute()
  }

  private func recompute() async {
    guard let snapshot else {
      plan = nil
      return
    }
    var days = serverTrained.union(trained)
    // Ngày đã chốt trên máy này (có thể chưa lên server).
    let draft = snapshot.plan(for: today, today: today, trained: days)
    if let tpl = draft.template,
      let state = try? await workouts.loadDay(DayProgressStore.key(date: today, templateId: tpl.id)),
      state.loggedSessionId != nil
    {
      days.insert(today)
    }
    trained = days
    plan = snapshot.plan(for: today, today: today, trained: days)
  }

  /// 00:00 địa phương của `date`, ra mili giây epoch.
  static func startOfDay(_ date: LocalDate, in tz: TimeZone) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    return cal.date(from: DateComponents(year: date.year, month: date.month, day: date.day)) ?? Date(timeIntervalSince1970: 0)
  }
}
