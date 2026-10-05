import ASCNDCore
import Foundation
import Testing

/// Cài đặt nhắc nhở + lịch hệ điều hành (#427) — `use-reminders.ts`,
/// `notifications.ts` @ fac9ac2.

private final class MemoryStore: KeyValueStore, @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String: String]
  init(_ values: [String: String] = [:]) { self.values = values }
  func string(forKey key: String) -> String? { lock.withLock { values[key] } }
  func set(_ value: String, forKey key: String) { lock.withLock { values[key] = value } }
  func remove(_ key: String) { lock.withLock { _ = values.removeValue(forKey: key) } }
}

/// Trung tâm thông báo giả: giữ đúng những gì đang chờ, có trần, có thể từ
/// chối từ yêu cầu thứ n, và nhường luồng giữa mỗi bước (như API thật).
private actor FakeCenter: ReminderScheduler {
  nonisolated let isAvailable: Bool
  var granted: Bool
  var grantOnRequest: Bool
  var pending: [ScheduledReminder] = []
  var writes = 0
  var requests = 0
  var refuseFrom: Int?
  var cap = 64

  init(available: Bool = true, granted: Bool = false, grantOnRequest: Bool = true) {
    isAvailable = available
    self.granted = granted
    self.grantOnRequest = grantOnRequest
  }

  func set(refuseFrom: Int?) { self.refuseFrom = refuseFrom }
  func hasPermission() async -> Bool { granted }
  func requestPermission() async -> Bool {
    requests += 1
    granted = granted || grantOnRequest
    return granted
  }
  func replaceAll(_ items: [ScheduledReminder]) async -> ScheduleOutcome {
    writes += 1
    pending = []
    await Task.yield()
    var n = 0
    for (i, item) in items.enumerated() {
      await Task.yield()
      if let r = refuseFrom, i + 1 >= r { continue }
      if pending.count >= cap { continue }
      pending.append(item)
      n += 1
    }
    return ScheduleOutcome(requested: items.count, scheduled: n, supported: true)
  }
  func cancelAll() async { pending = [] }
}

private struct FixedClock: WallClock {
  let date: Date
  func now() -> Date { date }
}

private let hcm: Calendar = {
  var c = Calendar(identifier: .gregorian)
  c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  return c
}()
/// Thứ Hai 05/10/2026 06:00 giờ Việt Nam.
private let monday6am = hcm.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 6))!
private let copy: ReminderCopy = Dictionary(
  uniqueKeysWithValues: ReminderKey.allCases.map { ($0, ReminderText(title: "t-\($0.rawValue)", body: "b-\($0.rawValue)")) })

@MainActor
private func center(
  _ store: MemoryStore = MemoryStore(), _ os: FakeCenter = FakeCenter(), at now: Date = monday6am
) -> ReminderCenter {
  ReminderCenter(store: store, scheduler: os, copy: copy, clock: FixedClock(date: now), calendar: hcm)
}

struct ReminderPrefsStorageTests {
  /// Bộ cũ (trước `meal` / `biometrics` / `sleepLog` / `challengeClaim`) trộn
  /// lên mặc định — khoá thiếu là mặc định, không phải lỗi.
  @Test func legacyStoredSetMergesOntoDefaults() {
    let old = #"{"water":{"enabled":true,"everyHours":3},"bedtime":{"enabled":true,"hour":23},"workout":{"enabled":true,"hour":18,"minute":15}}"#
    let p = ReminderPrefs.decode(old)
    #expect(p.water == .init(enabled: true, everyHours: 3))
    #expect(p.bedtime == .init(enabled: true, hour: 23, minute: 30), "phút thiếu → phút mặc định")
    #expect(p.workout.clock == ReminderClock(hour: 18, minute: 15))
    #expect(p.meal == ReminderPrefs.defaults.meal && p.sleepLog == ReminderPrefs.defaults.sleepLog)
    #expect(p.challengeClaim == true, "khoá mới mặc định BẬT")
  }

  @Test func corruptStorageIsDefaults() {
    for raw in [nil, "", "{", "[]", "null", "42", #""x""#] {
      #expect(ReminderPrefs.decode(raw) == .defaults, "\(raw ?? "nil")")
    }
  }

  /// Lịch sai (giờ 25, phút 75, `enabled` không phải bool, khoảng nước âm /
  /// sai kiểu) = như thiếu trường ấy. RN để giờ 25 thành 01:00 hôm sau.
  @Test func invalidScheduleFieldsFallBackPerField() {
    let raw = #"{"bedtime":{"enabled":true,"hour":25,"minute":75},"meal":{"enabled":"yes","hour":19,"minute":5},"weighIn":{"enabled":true,"hour":6.5,"minute":-1},"water":{"enabled":true,"everyHours":-2}}"#
    let p = ReminderPrefs.decode(raw)
    #expect(p.bedtime == .init(enabled: true, hour: 22, minute: 30))
    #expect(p.meal == .init(enabled: false, hour: 19, minute: 5))
    #expect(p.weighIn == .init(enabled: true, hour: 7, minute: 0))
    #expect(p.water == .init(enabled: true, everyHours: 2))
    let plan = ReminderPlan.plan(p, .unknown, now: monday6am, calendar: hcm)
    #expect(plan.filter { $0.key == .bedtime }.allSatisfy { hcm.component(.hour, from: $0.at) == 22 })
  }

  /// Ghi ra cùng hình dạng RN, khoá sắp xếp; đọc lại ra đúng nó.
  @Test func encodingIsDeterministicAndRoundTrips() {
    var p = ReminderPrefs.defaults
    p.water = .init(enabled: true, everyHours: 3)
    p.sleepLog = .init(enabled: true, hour: 8, minute: 45)
    p.challengeClaim = false
    let s = p.encoded()
    #expect(s == p.encoded())
    #expect(ReminderPrefs.decode(s) == p)
    #expect(s.hasPrefix(#"{"bedtime":{"enabled":false,"hour":22,"minute":30},"biometrics":"#))
    #expect(s.contains(#""challengeClaim":{"enabled":false}"#))
  }
}

@MainActor
struct ReminderCenterTests {
  @Test func defaultsAreOffExceptClaims() {
    let c = center()
    #expect(c.prefs == .defaults && c.prefs.anyEnabled, "challengeClaim bật sẵn")
    #expect(ReminderKey.allCases.filter { c.prefs.isEnabled($0) } == [.challengeClaim])
  }

  /// Bật cái đầu tiên → xin quyền → đặt lịch; lưu dưới đúng khoá RN.
  @Test func enablingAsksPermissionThenSchedules() async {
    let store = MemoryStore()
    let os = FakeCenter()
    let c = center(store, os)
    await c.setEnabled(.bedtime, true)
    #expect(await os.requests == 1 && c.permission)
    let pending = await os.pending
    #expect(pending.count == 7 && pending.allSatisfy { $0.key == .bedtime && $0.text.title == "t-bedtime" })
    #expect(ReminderPrefs.decode(store.string(forKey: "ascnd_reminders")).bedtime.enabled)
    #expect(store.string(forKey: "ascnd_reminder_plan")?.hasPrefix("bedtime@") == true)
    // Mở lại app: đọc đúng cài đặt đã lưu.
    #expect(center(store, os).prefs.bedtime.enabled)
  }

  /// Từ chối quyền: cài đặt vẫn lưu (công tắc là lựa chọn của người dùng),
  /// không gì tới OS, và màn hình có cờ gợi ý.
  @Test func deniedPermissionSchedulesNothing() async {
    let os = FakeCenter(grantOnRequest: false)
    let c = center(MemoryStore(), os)
    await c.setEnabled(.workout, true)
    #expect(c.prefs.workout.enabled && !c.permission && c.needsPermissionHint)
    #expect(await os.writes == 0)
    await c.sync(ReminderContext())
    #expect(await os.writes == 0)
  }

  /// Đồng bộ chỉ ghi khi kế hoạch đổi; đã tập hôm nay thì lời nhắc tập hôm
  /// nay biến mất.
  @Test func syncRewritesOnlyWhenThePlanChanges() async {
    let os = FakeCenter(granted: true)
    let c = center(MemoryStore(), os)
    await c.refreshPermission()
    await c.setEnabled(.workout, true)
    #expect(await os.writes == 1)
    #expect(await os.pending.count == 7)
    await c.sync(ReminderContext())
    await c.sync(ReminderContext())
    #expect(await os.writes == 1, "kế hoạch không đổi → không huỷ-đặt lại")
    var done = ReminderContext()
    done.workedOutToday = true
    await c.sync(done)
    #expect(await os.writes == 2)
    #expect(await os.pending.count == 6)
    var week = ReminderContext()
    week.trainingDays = [0, 2, 4]
    await c.sync(week)
    #expect(await os.pending.count == 3, "Thứ Hai, Tư, Sáu")
  }

  /// Đặt hụt (OS từ chối từ yêu cầu thứ 5) không ghi chữ ký → lần đồng bộ
  /// sau thử lại. RN từng ghi trước: một lần từ chối là không bao giờ đặt lại.
  @Test func partialWriteIsRetried() async {
    let store = MemoryStore()
    let os = FakeCenter(granted: true)
    await os.set(refuseFrom: 5)
    let c = center(store, os)
    await c.refreshPermission()
    await c.setEnabled(.bedtime, true)
    #expect(await os.pending.count == 4)
    #expect(store.string(forKey: ReminderCenter.planKey) == nil)
    await os.set(refuseFrom: nil)
    await c.sync(ReminderContext())
    #expect(await os.writes == 2)
    #expect(await os.pending.count == 7)
    #expect(store.string(forKey: ReminderCenter.planKey) != nil)
  }

  /// Hai lượt ghi chồng nhau không để lại thông báo trùng (RN: 56 → 112).
  @Test func overlappingWritesNeverDuplicate() async {
    let os = FakeCenter(granted: true)
    let c = center(MemoryStore(), os)
    await c.refreshPermission()
    await c.setEnabled(.water, true)
    async let a: Void = c.setEnabled(.bedtime, true)
    async let b: Void = c.setEnabled(.meal, true)
    _ = await (a, b)
    let pending = await os.pending
    let expected = ReminderPlan.plan(c.prefs, .unknown, now: monday6am, calendar: hcm)
    #expect(pending.count == expected.count)
    #expect(Set(pending.map { "\($0.key)@\($0.at)" }).count == pending.count)
  }

  /// Bật hết với nước mỗi giờ: kế hoạch cắt ở 64 — đúng số OS giữ — nên lần
  /// đặt là "đủ" và chữ ký được ghi.
  @Test func planIsCappedAtWhatTheOSHolds() async {
    let store = MemoryStore()
    let os = FakeCenter(granted: true)
    let c = center(store, os)
    await c.refreshPermission()
    for k in ReminderKey.allCases { await c.setEnabled(k, true) }
    await c.setWaterInterval(1)
    #expect(await os.pending.count == 64)
    #expect(store.string(forKey: ReminderCenter.planKey)?.split(separator: "|").count == 64)
  }

  /// RN BUG (xem `ReminderPlan.plan`): lời nhắc nhận thưởng "nửa tiếng nữa"
  /// đổi chữ ký ở mỗi lần dựng → huỷ-đặt lại liên tục và đẩy lùi giờ bắn.
  /// Native: đặt một lần, các lần đồng bộ sau (phút sau) không ghi lại.
  @Test func lateClaimNudgeIsLaidDownOnce() async {
    let store = MemoryStore()
    let os = FakeCenter(granted: true)
    let noon = hcm.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12))!
    var ctx = ReminderContext()
    ctx.pendingClaims = [PendingClaim(id: "c1", title: "Thử thách", claimBy: "2026-10-05", rewardCoins: 100, body: "Nhận 100 xu")]
    let first = center(store, os, at: noon)
    await first.refreshPermission()
    await first.sync(ctx)
    let laid = await os.pending
    #expect(laid.count == 1 && laid[0].at == noon.addingTimeInterval(1800) && laid[0].text.title == "Thử thách")
    let later = center(store, os, at: noon.addingTimeInterval(60))
    await later.refreshPermission()
    await later.sync(ctx)
    #expect(await os.writes == 1)
    #expect(await os.pending.first?.at == noon.addingTimeInterval(1800), "không bị đẩy lùi")
  }

  /// Giờ thông minh: áp MỘT LẦN, chỉ lên giờ mặc định gõ tay, chỉ khi người
  /// dùng đã tự lưu giờ ngủ / dậy.
  @Test func smartTimingAppliesOnceToUntouchedDefaults() async {
    let store = MemoryStore()
    let c = center(store)
    #expect(await c.applySmartTiming(bedtime: "00:15:00", waketime: "06:00"))
    #expect(c.prefs.bedtime.clock == ReminderClock(hour: 23, minute: 45))
    #expect(c.prefs.weighIn.clock == ReminderClock(hour: 6, minute: 15))
    #expect(c.prefs.sleepLog == ReminderPrefs.defaults.sleepLog, "như RN: chỉ bedtime và weighIn")
    #expect(!(await c.applySmartTiming(bedtime: "21:00", waketime: nil)), "chốt đã đặt")

    let chosen = MemoryStore()
    var p = ReminderPrefs.defaults
    p.bedtime.hour = 23
    chosen.set(p.encoded(), forKey: ReminderCenter.prefsKey)
    let c2 = center(chosen)
    #expect(!(await c2.applySmartTiming(bedtime: "00:15", waketime: nil)), "giờ tự chọn không bị dời")
    #expect(c2.prefs.bedtime.hour == 23)

    let none = MemoryStore()
    #expect(!(await center(none).applySmartTiming(bedtime: nil, waketime: nil)))
    #expect(none.string(forKey: ReminderCenter.smartTimeKey) == "1", "không biết gì cũng chốt")
  }

  /// Đăng xuất: huỷ thông báo đang chờ, xoá ba khoá theo tài khoản, cài đặt
  /// về mặc định; quyền (của máy) và khoá theo máy giữ nguyên.
  @Test func signOutForgetsTheAccount() async {
    let store = MemoryStore(["ascnd_lang": "vi"])
    let os = FakeCenter(granted: true)
    let c = center(store, os)
    await c.refreshPermission()
    await c.setEnabled(.bedtime, true)
    _ = await c.applySmartTiming(bedtime: nil, waketime: nil)
    #expect(await os.pending.count == 7)
    await c.clearUserScoped()
    #expect(await os.pending.isEmpty)
    #expect(c.prefs == .defaults && c.permission)
    for k in ReminderCenter.userKeys { #expect(store.string(forKey: k) == nil, "\(k)") }
    #expect(store.string(forKey: "ascnd_lang") == "vi")
    // Người sau bật đúng lời nhắc ấy: chữ ký cũ đã đi, nên lịch được đặt thật.
    await c.setEnabled(.bedtime, true)
    #expect(await os.pending.count == 7)
  }

  @Test func offersOnlyWorthwhileSuggestionsForEnabledRows() {
    var p = ReminderPrefs.defaults
    let known = ReminderTiming.Known(bedtime: "23:00", waketime: "07:10", workoutHour: 18)
    #expect(ReminderTiming.offer(.bedtime, prefs: p, known: known) == nil, "đang tắt")
    p.bedtime.enabled = true
    p.weighIn.enabled = true
    p.workout.enabled = true
    p.supplements.enabled = true
    #expect(ReminderTiming.offer(.bedtime, prefs: p, known: known) == nil, "gợi ý 22:30 = đang đặt")
    #expect(ReminderTiming.offer(.weighIn, prefs: p, known: known) == ReminderClock(hour: 7, minute: 25))
    #expect(ReminderTiming.offer(.workout, prefs: p, known: known) == nil, "17:00 = gợi ý, không lệch")
    #expect(ReminderTiming.offer(.supplements, prefs: p, known: known) == nil, "không đoán")
    #expect(ReminderTiming.offer(.water, prefs: p, known: known) == nil)
    #expect(ReminderTiming.format(ReminderClock(hour: 7, minute: 5)) == "7:05")
  }
}

struct ReminderCopyTableTests {
  /// Mọi khoá có chữ ở cả ba ngôn ngữ, không còn chỗ trống chưa điền.
  @Test func everyKeyHasCopyInEveryLanguage() {
    for lang in [AppPreferences.Lang.vi, .en, .es] {
      let copy = ReminderCopyTable.copy(lang)
      #expect(Set(copy.keys) == Set(ReminderKey.allCases), "\(lang)")
      #expect(copy.values.allSatisfy { !$0.title.isEmpty && !$0.body.isEmpty && !$0.body.contains("{") }, "\(lang)")
    }
    #expect(ReminderCopyTable.copy(.vi)[.bedtime]?.title == "Chuẩn bị ngủ")
  }
}
