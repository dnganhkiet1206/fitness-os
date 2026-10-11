public import Foundation
public import Observation

/// Ghi giấc ngủ (#527) — `app/log-sleep.tsx` + `lib/sleep-window.ts`
/// (`sleepSpan`) + `lib/same-day-entry.ts` (`sleepRowToReplace`) +
/// `lib/health-owned.ts` + `case 'sleep'` của `offline-write.ts`. Golden THẬT:
/// `SleepLogGoldenTests`.
///
/// RN behavior (giữ nguyên):
/// - hai ô giờ (mặc định 23:00 → 07:00), thức dậy là hôm nay, đi ngủ là hôm
///   nay nếu trước giờ thức, không thì hôm qua; thời lượng 10–960 phút;
/// - ba giai đoạn (sâu / REM / nông, phút): mỗi ô trống hoặc là số 0–1440, và
///   tổng không vượt thời lượng; ô trống ghi 0;
/// - chất lượng 2 / 4 / 6 / 8 / 10 (mặc định 8);
/// - đêm hôm nay do Apple Health ghi: điền sẵn giờ và giai đoạn; lưu mà có sửa
///   thì hỏi lại "N thứ sẽ thay số của Health";
/// - ghi lại cùng một giấc là SỬA: hàng của ngày thức dậy CHỒNG LẤN khoảng
///   ngủ mới thì `update` (không chạm hàng nào — máy khác vừa xoá — là lỗi có
///   tên), không thì `insert`; rồi dựng lại `daily_logs` hôm nay;
/// - mất mạng: xếp hàng bền (`kind: 'sleep'`, một id mỗi lần chạm), "đã lưu —
///   sẽ đồng bộ", nút chết; phát lại cũng đi qua luật "sửa" rồi dựng lại ngày
///   thức dậy.
///
/// Khác RN có chủ đích (`NATIVE_IMPROVEMENTS.md`):
/// - KHÔNG ghi ngược Apple Health (`writeSleepToHealth`) — guardrail #527;
/// - phát lại ghi ĐÈ hàng cần sửa (RN `ignoreDuplicates: true` bỏ qua đúng hàng
///   ấy, nên lần sửa lúc mất mạng mất);
/// - dựng lại `daily_logs` hỏng SAU khi giấc đã ghi không biến lần lưu thành
///   "thất bại" (như `DailyLog.rebuildAfterWrite`).
public enum SleepLog {
  /// `kind` của outbox (`OfflineWrite` `kind: 'sleep'`).
  public static let kind = "sleep"
  /// `QUALITY` của màn; `SLEEP_QUALITY_MAX`.
  public static let qualities = [2, 4, 6, 8, 10]
  public static let qualityMax = 10
  public static let defaultQuality = 8
  /// `BOUNDS.sleep_duration_min` (`plausible.ts:217`), `BOUNDS.sleep_stage_min` (`:200`).
  public static let durationBounds = 10.0...960.0
  public static let stageBounds = 0.0...1440.0

  /// Giờ trên ô chọn (giờ, phút) — ngày không dùng (`new Date(2000, 0, 1, h, m)`).
  public struct Clock: Sendable, Hashable {
    public var hour: Int
    public var minute: Int
    public init(hour: Int, minute: Int) {
      self.hour = hour
      self.minute = minute
    }
    public static let defaultBed = Clock(hour: 23, minute: 0)
    public static let defaultWake = Clock(hour: 7, minute: 0)
  }

  /// `SleepSpan`.
  public struct Span: Sendable, Hashable {
    public let bed: EpochMillis
    public let wake: EpochMillis
    public let minutes: Int
  }

  // MARK: - sleepSpan

  /// `onDay(time, ref, dayOffset)`: ngày địa phương của `ref` + `dayOffset`, giờ
  /// `time`, giây 0. Giờ không có (nhảy giờ mùa xuân) tiến lên như V8; giờ có hai
  /// lần (mùa thu) lấy lần SỚM hơn.
  static func onDay(_ time: Clock, ref: EpochMillis, dayOffset: Int, in tz: TimeZone) -> EpochMillis {
    let day = LocalDate(ref, in: tz).adding(days: dayOffset)
    return localToUTC(day, hour: time.hour, minute: time.minute, in: tz)
  }

  /// Giờ địa phương → thời điểm, theo `UTC(t)` của ECMAScript: ứng viên là hai
  /// độ lệch quanh đó; hợp lệ cả hai → sớm hơn; không cái nào → độ lệch TRƯỚC
  /// lần đổi giờ.
  static func localToUTC(_ day: LocalDate, hour: Int, minute: Int, in tz: TimeZone) -> EpochMillis {
    let naive = (Int64(day.daysSinceEpoch) * 86_400 + Int64(hour) * 3600 + Int64(minute) * 60) * 1000
    func offset(_ ms: Int64) -> Int64 {
      Int64(tz.secondsFromGMT(for: Date(timeIntervalSince1970: TimeInterval(ms) / 1000))) * 1000
    }
    let before = offset(naive - 86_400_000)
    let after = offset(naive + 86_400_000)
    let candidates = [naive - before, naive - after].filter { u in
      offset(u) == naive - u
    }
    if let earliest = candidates.min() { return EpochMillis(earliest) }
    return EpochMillis(naive - before)
  }

  /// `sleepSpan(bedtime, waketime, ref)`.
  public static func span(bed: Clock, wake: Clock, ref: EpochMillis, in tz: TimeZone) -> Span {
    let wakeAt = onDay(wake, ref: ref, dayOffset: 0, in: tz)
    let bedSameDay = onDay(bed, ref: ref, dayOffset: 0, in: tz)
    let bedAt = wakeAt.millis <= bedSameDay.millis ? onDay(bed, ref: ref, dayOffset: -1, in: tz) : bedSameDay
    let minutes = Int(JS.max(0, JS.round(Double(wakeAt.millis - bedAt.millis) / 60_000)))
    return Span(bed: bedAt, wake: wakeAt, minutes: minutes)
  }

  // MARK: - Kiểm tra

  /// `!plausible('sleep_duration_min', durationMin)`.
  public static func durationBad(_ minutes: Int) -> Bool { !durationBounds.contains(Double(minutes)) }

  /// `plausibleText('sleep_stage_min', v)`: trống là được; không thì đúng dạng
  /// số thập phân và trong 0–1440.
  static func stageOK(_ text: String) -> Bool {
    let t = RepEntry.trimJS(text)
    return t.isEmpty || FitnessCalc.readStat(t, stageBounds) != nil
  }

  /// Lỗi ở hàng giai đoạn: ô sai, hay tổng vượt thời lượng.
  public enum StageProblem: Sendable, Hashable {
    case outOfRange
    /// `sleepStagesOverrun`: `{sum}` / `{total}`.
    case overrun(sum: Double, total: Int)
  }

  /// `stageSum`: ô có chữ → `Number(v)`, trống → 0; chỉ cộng số hữu hạn.
  public static func stageSum(_ texts: [String]) -> Double {
    texts.reduce(0.0) { acc, v in
      let n = RepEntry.trimJS(v).isEmpty ? 0 : JS.number(.string(v))
      return acc + (n.isFinite ? n : 0)
    }
  }

  /// `stageError`: ô sai thắng; không thì tổng vượt (khi thời lượng > 0).
  public static func stageProblem(_ texts: [String], minutes: Int) -> StageProblem? {
    if texts.contains(where: { !stageOK($0) }) { return .outOfRange }
    let sum = stageSum(texts)
    return minutes > 0 && sum > Double(minutes) ? .overrun(sum: sum, total: minutes) : nil
  }

  /// Cột của hàng ghi: `Number(x) || 0`.
  static func stageValue(_ text: String) -> Double {
    let n = JS.number(.string(text))
    return JS.truthy(n) ? n : 0
  }

  /// Hàng `sleep_logs` (`:248-256`). `id` chỉ có ở hàng outbox.
  public static func row(userId: String, span: Span, quality: Int, stages: [String]) -> [String: JSONValue] {
    let s = stages + Array(repeating: "", count: max(0, 3 - stages.count))
    return [
      "user_id": .string(userId),
      "bedtime": .string(WorkoutSessionRecord.iso8601(span.bed)),
      "waketime": .string(WorkoutSessionRecord.iso8601(span.wake)),
      "quality": .number(Double(quality)),
      "deep_min": .number(stageValue(s[0])),
      "rem_min": .number(stageValue(s[1])),
      "light_min": .number(stageValue(s[2])),
    ]
  }

  // MARK: - Đêm Apple Health ghi

  /// Ba giai đoạn, đúng thứ tự ô.
  public static let stageColumns = ["deep_min", "rem_min", "light_min"]

  /// `fromHealth(row)` — `HealthOwned`.
  public static func fromHealth(_ row: JSONValue?) -> Bool { HealthOwned.fromHealth(row) }

  /// `healthValues(row, stages)`: chỉ hàng của Health; số hữu hạn > 0.
  public static func healthStages(_ row: JSONValue?) -> [String: Double] {
    guard fromHealth(row), let row else { return [:] }
    var out: [String: Double] = [:]
    for f in stageColumns {
      let v = num(row[f])
      if v.isFinite, v > 0 { out[f] = v }
    }
    return out
  }

  /// `Number(x)` kể cả `undefined` (khoá vắng) → NaN.
  private static func num(_ v: JSONValue?) -> Double { v == nil ? .nan : JS.number(v) }

  /// `healthChanges()`: giai đoạn đã gõ khác số của Health (`overriddenFields`),
  /// cộng mỗi mốc giờ khác đi. Không phải đêm của Health → 0.
  public static func healthChanges(night: JSONValue?, typed: [String], span: Span) -> Int {
    guard fromHealth(night), let night else { return 0 }
    let owned = healthStages(night)
    var n = 0
    for (i, f) in stageColumns.enumerated() {
      guard let o = owned[f] else { continue }
      let text = i < typed.count ? typed[i] : ""
      guard !RepEntry.trimJS(text).isEmpty else { continue }
      let t = JS.number(.string(text))
      guard t.isFinite else { continue }
      if t != o { n += 1 }
    }
    if millis(night["bedtime"]) != span.bed.millis { n += 1 }
    if millis(night["waketime"]) != span.wake.millis { n += 1 }
    return n
  }

  /// `+new Date(String(x))`; không đọc được → `nil` (NaN — không bằng gì).
  public static func millis(_ v: JSONValue?) -> Int64? {
    guard case .string(let s)? = v else { return nil }
    return EpochMillis(iso8601: s)?.millis
  }

  /// Giờ địa phương (giờ, phút) của một mốc — để điền sẵn ô giờ.
  public static func clock(_ at: EpochMillis, in tz: TimeZone) -> Clock {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = tz
    let c = cal.dateComponents([.hour, .minute], from: at.date)
    return Clock(hour: c.hour ?? 0, minute: c.minute ?? 0)
  }

  /// Ô giai đoạn điền sẵn từ Health (`String(healthStages[f])`), trống khi không có.
  public static func prefill(_ stages: [String: Double]) -> [String] {
    stageColumns.map { f in stages[f].map(Units.text) ?? "" }
  }

  // MARK: - Ghi lại là sửa

  /// `useTodaySleep`: mọi giấc thức dậy trong ngày địa phương `day`.
  public static func todayQuery(userId: String, day: LocalDate, in tz: TimeZone) -> RowQuery {
    let r = DailyLog.dayRange(day, in: tz)
    return RowQuery(
      table: "sleep_logs", columns: "*",
      filters: [.eq("user_id", .string(userId)), .gte("waketime", .string(r.start)), .lt("waketime", .string(r.end))],
      order: .init(column: "waketime", ascending: false))
  }

  /// Truy vấn của `sleepRowToReplace`: hàng có `waketime` trong ngày địa phương
  /// của lần thức dậy mới.
  public static func replaceQuery(userId: String, wake: EpochMillis, in tz: TimeZone) -> RowQuery {
    let r = DailyLog.dayRange(LocalDate(wake, in: tz), in: tz)
    return RowQuery(
      table: "sleep_logs", columns: "id, bedtime, waketime",
      filters: [.eq("user_id", .string(userId)), .gte("waketime", .string(r.start)), .lt("waketime", .string(r.end))])
  }

  /// Phép chọn của `sleepRowToReplace`: hàng ĐẦU TIÊN có khoảng ngủ chồng lấn
  /// (`aStart < bEnd && bStart < aEnd`); hàng có mốc hỏng bị bỏ qua.
  public static func replaceId(bed: String, wake: String, rows: [JSONValue]) -> String? {
    guard let woke = EpochMillis(iso8601: wake)?.millis else { return nil }
    let bedAt = EpochMillis(iso8601: bed)?.millis
    for r in rows {
      guard let b = millis(r["bedtime"]), let w = millis(r["waketime"]) else { continue }
      guard let bedAt else { continue }
      if bedAt < w && b < woke { return r["id"].map(jsString) }
    }
    return nil
  }

  /// `String(x)` cho một id.
  static func jsString(_ v: JSONValue) -> String {
    switch v {
    case .string(let s): s
    case .number(let n): Units.text(n)
    default: ""
    }
  }

  // MARK: - Outbox

  /// Một lần ghi xếp hàng: hàng ghi + `id` cố định của lần chạm (`rowId`).
  public static func entry(id: String, userId: String, row: [String: JSONValue], createdAt: EpochMillis) -> OutboxEntry {
    var payload = row
    payload["id"] = .string(id.lowercased())
    return OutboxEntry(id: id.lowercased(), userId: userId, kind: kind, payload: .object(payload), createdAt: createdAt)
  }

  /// Hàng outbox `sleep` dùng được: của chính chủ, có id, hai mốc đọc được,
  /// chất lượng và ba giai đoạn là số hữu hạn.
  public static func isRow(_ e: OutboxEntry) -> Bool {
    guard e.kind == kind, case .object(let o) = e.payload,
      o["user_id"]?.stringValue?.lowercased() == e.userId.lowercased(),
      let id = o["id"]?.stringValue, !id.isEmpty,
      millis(o["bedtime"]) != nil, millis(o["waketime"]) != nil
    else { return false }
    for k in ["quality"] + stageColumns {
      guard let n = o[k]?.doubleValue, n.isFinite else { return false }
    }
    return true
  }

  /// `rebuildAfterReplay(userId, localDateStr(new Date(w.waketime)))`.
  public static func replayDay(_ e: OutboxEntry, in tz: TimeZone) -> LocalDate? {
    millis(e.payload["waketime"]).map { LocalDate(EpochMillis($0), in: tz) }
  }
}

/// Màn ghi giấc ngủ của MỘT người, trên `RowStore` (đọc / ghi `sleep_logs`,
/// dựng lại `daily_logs`) + outbox.
@MainActor @Observable
public final class SleepLogger {
  public enum Outcome: Sendable, Hashable {
    case saved
    case queued
    /// Thời lượng / giai đoạn sai — không gửi.
    case invalid
    /// Hàng cần sửa vừa biến mất (máy khác xoá) — `logSleepReplaceGone`.
    case replaceGone
    case failed
    case unavailable
  }

  public let userId: String
  /// Đêm hôm nay do Apple Health ghi (`fromHealth`); `nil` khi không có / chưa đọc.
  public private(set) var healthNight: JSONValue?
  public private(set) var loaded = false
  public private(set) var submitting = false
  public private(set) var done = false

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let outbox: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var closed = false

  public init(
    userId: String, store: any RowStore, outbox: (any PlanWriteStore)?,
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.store = store
    self.outbox = outbox
    self.clock = clock
    self.timeZone = timeZone
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  public func close() { closed = true }

  private var now: EpochMillis { clock.nowMillis() }
  private var today: LocalDate { LocalDate(now, in: timeZone) }

  /// `useTodaySleep` → `mainSleep`; chỉ giữ khi là đêm của Health. Đọc hỏng:
  /// như không có (màn vẫn ghi được, không điền sẵn).
  public func load() async {
    guard !closed else { return }
    let rows = try? await store.select(SleepLog.todayQuery(userId: userId, day: today, in: timeZone))
    guard !closed else { return }
    let main = rows.flatMap(DailyLog.mainSleep)
    healthNight = SleepLog.fromHealth(main) ? main : nil
    loaded = true
  }

  /// Khoảng ngủ của hai ô giờ, tính lúc này.
  public func span(bed: SleepLog.Clock, wake: SleepLog.Clock) -> SleepLog.Span {
    SleepLog.span(bed: bed, wake: wake, ref: now, in: timeZone)
  }

  /// Bao nhiêu thứ sẽ thay số của Health — > 0 thì màn hỏi lại trước khi lưu.
  public func healthChanges(span: SleepLog.Span, stages: [String]) -> Int {
    SleepLog.healthChanges(night: healthNight, typed: stages, span: span)
  }

  /// Nút Lưu. `online` đọc lúc chạm (`offlineNow()`).
  public func submit(span: SleepLog.Span, quality: Int, stages: [String], online: Bool) async -> Outcome {
    guard !closed, !submitting, !done else { return .unavailable }
    guard !SleepLog.durationBad(span.minutes), SleepLog.stageProblem(stages, minutes: span.minutes) == nil else {
      return .invalid
    }
    let row = SleepLog.row(userId: userId, span: span, quality: quality, stages: stages)
    if !online {
      guard let outbox else { return .unavailable }
      let entry = SleepLog.entry(id: makeId(), userId: userId, row: row, createdAt: now)
      do {
        try await outbox.enqueue([entry])
      } catch {
        return .failed
      }
      done = true
      onEnqueued(entry)
      return .queued
    }
    submitting = true
    defer { if !closed { submitting = false } }
    // Đọc hỏng → ghi như hàng mới (`if (error || !data) return null`).
    let candidates = try? await store.select(SleepLog.replaceQuery(userId: userId, wake: span.wake, in: timeZone))
    let replaceId = candidates.flatMap {
      SleepLog.replaceId(bed: WorkoutSessionRecord.iso8601(span.bed), wake: WorkoutSessionRecord.iso8601(span.wake), rows: $0)
    }
    do throws(RowStoreError) {
      if let replaceId {
        let touched = try await store.update(
          "sleep_logs", row, where: [.eq("id", .string(replaceId)), .eq("user_id", .string(userId))])
        if touched == 0 { return .replaceGone }
      } else {
        try await store.insert("sleep_logs", row)
      }
    } catch {
      // Lỗi server / mạng giữa chừng: không gì được ghi (RN `toast.fail(e)`).
      return .failed
    }
    // `recomputeDailyLog(user.id, localDateStr())` — hôm nay. Hỏng: giấc đã ghi.
    try? await DailyLog.recompute(userId: userId, date: today, store: store, now: now, in: timeZone)
    if !closed { done = true }
    return .saved
  }
}
