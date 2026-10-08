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
  /// Các hàng `workout_sessions` trong [from, to), mới trước — cột `id,
  /// date_time, session_rpe, pr_detected, sets` (RN `day-plan.tsx` đọc buổi
  /// của ngày để biết hàng nào đã được chứng minh, `proven`).
  func sessions(userId: String, from: EpochMillis, to: EpochMillis) async throws -> [JSONValue]
}

extension TrainingHistory {
  /// Mặc định: không có bằng chứng — hành vi trước đây (chỉ biết "đã tập").
  public func sessions(userId: String, from: EpochMillis, to: EpochMillis) async throws -> [JSONValue] { [] }
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
  /// Vì sao làm mới không xong, theo thứ người dùng làm được với nó.
  public enum RefreshFailure: Sendable, Hashable {
    /// Không tới được server. Kế hoạch đang hiện (nếu có) là bản trên máy.
    case offline
    /// Tới được server mà không đọc được (lỗi server, dữ liệu hỏng, phiên
    /// hết hạn). Thử lại sau.
    case unavailable
  }

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
  /// Lần làm mới gần nhất không xong — thứ DUY NHẤT màn hình được dùng để
  /// nói về lỗi (#334). `nil` = xong hết.
  public private(set) var failure: RefreshFailure?
  /// Chi tiết lỗi thô (mã PostgREST, mô tả URLError). CHỈ cho Lab / log —
  /// không bao giờ hiện cho người dùng.
  public private(set) var failureDetail: String?
  public private(set) var trained: Set<LocalDate> = []
  /// Kế hoạch cả tuần + mọi template, đúng như máy này đang thấy: bản server
  /// (hoặc cache) với các lệnh sửa chưa gửi áp lên (#401). Màn Plan, danh
  /// sách template, builder đọc từ đây.
  public private(set) var library: TemplateSnapshot?

  @ObservationIgnored private let repository: TodayRepository
  @ObservationIgnored private let history: any TrainingHistory
  @ObservationIgnored private let workouts: any WorkoutStore
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private var snapshot: TemplateSnapshot?
  @ObservationIgnored private var serverTrained: Set<LocalDate> = []
  /// Các buổi trên server của ngày ấy (đọc khi ngày ấy đã có buổi) — để màn
  /// tập nhận buổi ghi từ máy khác (#523, RN `proven`).
  @ObservationIgnored private var serverSessions: (date: LocalDate, rows: [JSONValue])?
  /// Ngày đã chốt trên máy này (có thể chưa lên server) — giữ qua nửa đêm.
  @ObservationIgnored private var localTrained: Set<LocalDate> = []
  /// Lệnh sửa kế hoạch chưa tới server (#401), theo thứ tự hàng đợi, kèm số
  /// thứ tự lúc nhận — để lượt làm mới biết lệnh nào tới SAU khi nó bắt đầu.
  @ObservationIgnored private var edits: [(seq: Int, entry: OutboxEntry)] = []
  @ObservationIgnored private var editSeq = 0
  /// Buổi vừa xoá trên máy (#429), để lần làm mới đang bay không đánh dấu lại.
  @ObservationIgnored private var sessionLog = SessionChangeLog()

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
  ///
  /// Gọi chồng (`load` / `refresh` từ hai chỗ cùng lúc) thì chờ chung một
  /// lượt, không bắn hai lượt truy vấn (đề xuất audit của C, 05/10).
  public func load() async {
    await coalesced { await self.loadNow() }
  }

  /// Hỏi server kế hoạch + lịch sử. Hỏng phần nào thì giữ phần đã có.
  public func refresh() async {
    await coalesced { await self.refreshNow() }
  }

  @ObservationIgnored private var inFlight: Task<Void, Never>?

  /// Một lượt đọc tại một thời điểm. Huỷ người chờ thì huỷ cả lượt — `close()`
  /// của `WorkoutFlow` phải dừng được truy vấn mạng của phiên vừa kết thúc.
  private func coalesced(_ work: @escaping @MainActor () async -> Void) async {
    if let running = inFlight {
      await running.value
      return
    }
    let task = Task { await work() }
    inFlight = task
    await withTaskCancellationHandler {
      await task.value
    } onCancel: {
      task.cancel()
    }
    inFlight = nil
  }

  private func loadNow() async {
    let mark = editSeq
    let pending = await repository.pendingEdits(userId: userId)
    if let cached = await repository.cached(userId: userId) {
      snapshot = cached
      source = .cache(cached.fetchedAt)
    }
    if let pending { mergeEdits(pending, since: mark, replacing: false) }
    if snapshot != nil || !edits.isEmpty { await recompute() }
    await refreshNow()
  }

  private func refreshNow() async {
    var errors: [(String, any Error)] = []
    // Đọc lệnh chưa gửi TRƯỚC khi hỏi server: lệnh nào gửi xong giữa chừng thì
    // hoặc server đã có nó, hoặc nó còn trong danh sách này — áp lại lệnh
    // server đã nhận không đổi gì. Đọc SAU thì một lệnh vừa gửi xong mà truy
    // vấn chưa thấy sẽ biến mất cho tới lần làm mới sau.
    let mark = editSeq
    let pending = await repository.pendingEdits(userId: userId)
    let sessionMark = sessionLog.mark
    let pendingSessions = await repository.pendingSessionChanges(userId: userId)
    do {
      let fresh = try await repository.refresh(userId: userId)
      snapshot = fresh
      source = .server(fresh.fetchedAt)
      if let pending { mergeEdits(pending, since: mark, replacing: true) }
    } catch {
      errors.append(("plan", error))
      // Server không trả lời: bản đang có là bản cũ — giữ mọi lệnh đã áp.
      if let pending { mergeEdits(pending, since: mark, replacing: false) }
    }
    do {
      let since = EpochMillis(Self.startOfDay(today.adding(days: -(Self.historyDays - 1)), in: timeZone))
      var times = try await history.sessionTimes(userId: userId, since: since)
      // Buổi đã xoá trên máy mà server chưa nhận lệnh xoá (#429): không còn là
      // buổi của ngày ấy. Bỏ ĐÚNG một lần mỗi buổi — ngày có buổi khác vẫn "đã tập".
      for change in (pendingSessions ?? []) + sessionLog.settle(since: sessionMark) {
        if case .delete(_, let at?) = change, let i = times.firstIndex(of: at) { times.remove(at: i) }
      }
      serverTrained = Set(times.map { LocalDate($0, in: timeZone) })
    } catch {
      errors.append(("history", error))
    }
    if serverTrained.contains(today) {
      // Không đọc được buổi thì vẫn biết "đã tập" — chỉ thiếu bằng chứng từng
      // hàng; không tính là lỗi của màn.
      let from = EpochMillis(Self.startOfDay(today, in: timeZone))
      let to = EpochMillis(Self.startOfDay(today.adding(days: 1), in: timeZone))
      let rows = (try? await history.sessions(userId: userId, from: from, to: to)) ?? []
      serverSessions = (today, rows)
    } else {
      serverSessions = nil
    }
    failure = Self.failure(errors.map(\.1))
    failureDetail = errors.isEmpty ? nil : errors.map { "\($0): \($1)" }.joined(separator: "\n")
    await recompute()
  }

  /// Mất mạng ở bất kỳ phần nào → `offline`: đó là điều người dùng sửa được
  /// (bật mạng), và cũng là lý do thường gặp nhất khiến phần kia hỏng theo.
  static func failure(_ errors: [any Error]) -> RefreshFailure? {
    if errors.isEmpty { return nil }
    return errors.contains(where: NetworkFailure.isOffline) ? .offline : .unavailable
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
    bests: @escaping @MainActor () -> PersonalRecords.Bests? = { nil },
    onRest: @escaping @MainActor (RestEvent, PlannedSet?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) -> WorkoutSessionController? {
    guard let sessionPlan = plan?.sessionPlan else { return nil }
    return WorkoutSessionController(
      plan: sessionPlan, userId: userId, store: workouts, clock: clock, timeZone: timeZone,
      loggedElsewhere: serverTrained.contains(today),
      remoteSessions: serverSessions?.date == today ? serverSessions?.rows ?? [] : [],
      bests: bests, onRest: onRest, onEnqueued: onEnqueued)
  }

  /// Bảng tập của MỘT NGÀY BẤT KỲ trong tuần (`DayPlan` dưới ngày đang chọn,
  /// `week-plan.tsx:495`). Hôm nay đi đúng đường `makeSession` ở trên. Ngày
  /// khác: kế hoạch của chính ngày ấy (`plan(for:)` — template gán cho thứ ấy,
  /// sau các lệnh sửa chưa gửi), tiến độ trên máy theo khoá của ngày ấy
  /// (`dayProgressKey`), và — nếu server biết ngày ấy đã tập — các buổi của
  /// ngày ấy làm bằng chứng từng hàng (`sessions.filter(dayOf == dStr)` của RN).
  /// Ngày nghỉ / chưa lên lịch: `nil`. Ghi của ngày tương lai bị chặn trong
  /// `finish` (`.futureDay`); ngày đã qua ghi đúng ngày ấy.
  public func makeSession(
    on date: LocalDate,
    bests: @escaping @MainActor () -> PersonalRecords.Bests? = { nil },
    onRest: @escaping @MainActor (RestEvent, PlannedSet?) -> Void = { _, _ in },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) async -> WorkoutSessionController? {
    if date == today { return makeSession(bests: bests, onRest: onRest, onEnqueued: onEnqueued) }
    guard let sessionPlan = library?.plan(for: date, today: today, trained: trained).sessionPlan else { return nil }
    let logged = serverTrained.contains(date)
    var rows: [JSONValue] = []
    if logged {
      // Không đọc được buổi thì vẫn biết "đã tập" — chỉ thiếu bằng chứng từng hàng.
      let from = EpochMillis(Self.startOfDay(date, in: timeZone))
      let to = EpochMillis(Self.startOfDay(date.adding(days: 1), in: timeZone))
      rows = (try? await history.sessions(userId: userId, from: from, to: to)) ?? []
    }
    return WorkoutSessionController(
      plan: sessionPlan, userId: userId, store: workouts, clock: clock, timeZone: timeZone,
      loggedElsewhere: logged, remoteSessions: rows, bests: bests, onRest: onRest, onEnqueued: onEnqueued)
  }

  /// Lệnh sửa kế hoạch vừa bền (#401): kế hoạch đổi ngay, không đợi server
  /// (D-26 TW-6b). Nhận lại cùng lệnh là không đổi gì.
  public func adopt(_ entries: [OutboxEntry]) async {
    for e in entries where PlanEdit.kinds.contains(e.kind) && e.userId == userId {
      guard !edits.contains(where: { $0.entry.id == e.id }) else { continue }
      editSeq += 1
      edits.append((editSeq, e))
    }
    await recompute()
  }

  /// `pending`: lệnh còn trong outbox lúc `mark`. `replacing`: bản server vừa
  /// về, nên lệnh đã gửi xong (không còn trong `pending`) đã nằm trong nó —
  /// chỉ giữ thêm những lệnh nhận SAU `mark`. Không thì giữ hết.
  private func mergeEdits(_ pending: [OutboxEntry], since mark: Int, replacing: Bool) {
    let kept = replacing ? edits.filter { $0.seq > mark } : edits
    var merged: [(seq: Int, entry: OutboxEntry)] = []
    var seen = Set<String>()
    for e in pending where seen.insert(e.id).inserted {
      merged.append((kept.first { $0.entry.id == e.id }?.seq ?? 0, e))
    }
    for k in kept where seen.insert(k.entry.id).inserted { merged.append(k) }
    edits = merged
  }

  /// Màn tập vừa chốt: ngày thành `done` ngay, không đợi server.
  public func markTrained(_ date: LocalDate) async {
    localTrained.insert(date)
    await recompute()
  }

  /// Buổi của ngày vừa bị xoá trên máy (gỡ set cuối cùng, #398): ngày không
  /// còn "đã tập" — kể cả khi server chưa nhận lệnh xoá (local-first). Lần làm
  /// mới sau server nói lại sự thật.
  /// - Parameter at: thời điểm của buổi bị xoá — để lần làm mới đang bay
  ///   (bản server chưa biết lệnh xoá) không đánh dấu lại ngày ấy.
  public func markUntrained(_ date: LocalDate, at: EpochMillis? = nil) async {
    if let at { sessionLog.record(.delete(id: "", at: at)) }
    localTrained.remove(date)
    serverTrained.remove(date)
    await recompute()
  }

  private func recompute() async {
    // Chưa từng có bản nào (offline từ lần mở đầu) mà đã sửa: kế hoạch rỗng
    // cộng các lệnh — template vừa tạo vẫn hiện.
    let base = snapshot ?? (edits.isEmpty ? nil : TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(0)))
    guard let snapshot = base?.applying(edits.map(\.entry)) else {
      library = nil
      plan = nil
      return
    }
    library = snapshot
    var days = serverTrained.union(localTrained)
    // Ngày đã chốt trên máy này (có thể chưa lên server). Buổi đã bị gỡ hết
    // set (`loggedKeys` rỗng) thì không còn là buổi.
    let draft = snapshot.plan(for: today, today: today, trained: days)
    if let tpl = draft.template,
      let state = try? await workouts.loadDay(DayProgressStore.key(date: today, templateId: tpl.id)),
      state.loggedSessionId != nil, state.loggedKeys.map({ !$0.isEmpty }) ?? true
    {
      days.insert(today)
      localTrained.insert(today)
    }
    trained = days
    plan = snapshot.plan(for: today, today: today, trained: days)
  }

  /// 00:00 địa phương của `date`, ra mili giây epoch.
  static func startOfDay(_ date: LocalDate, in tz: TimeZone) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    if let d = cal.date(from: DateComponents(year: date.year, month: date.month, day: date.day)) { return d }
    // Không dựng được ngày (lịch hỏng): nửa đêm UTC của ngày ấy, lệch theo múi
    // — sai tối đa một giờ quanh đổi giờ. Trước đây rơi về 1970, và truy vấn
    // "14 ngày" thành "mọi buổi từ 1970" (đề xuất audit của C).
    let utcMidnight = Date(timeIntervalSince1970: TimeInterval(date.daysSinceEpoch) * 86_400)
    return utcMidnight.addingTimeInterval(-TimeInterval(tz.secondsFromGMT(for: utcMidnight)))
  }
}
