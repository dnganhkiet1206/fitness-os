@testable import ASCNDCore
import Foundation
import Testing

/// Koa đợt 1 (19/10): nét mặt theo ngày thật.
struct KoaMoodTests {
  static func day(
    kcal: Double? = nil, workout: Bool = false, sleepMin: Double? = nil, waterMl: Double = 0, steps: Double? = nil
  ) -> DailySignals {
    DailySignals(
      kcal: kcal, workoutCount: workout ? 1 : 0, sleepMinutes: sleepMin, steps: steps, hasSleepRow: sleepMin != nil,
      waterMl: waterMl, waterTargetMl: 2000, stepsEverRecorded: steps != nil)
  }

  static func read(_ s: DailySignals?, hour: Int, streak: Int = 0, logged: Bool = true, target: Double? = 2000)
    -> KoaMood.Read
  {
    KoaMood.read(.init(signals: s, hour: hour, streak: streak, loggedToday: logged, kcalTarget: target))
  }

  @Test func unreadIsNeverASadFace() {
    #expect(Self.read(nil, hour: 20, streak: 9, logged: false) == .init(emotion: .idle, reason: .unread))
  }

  @Test func nightSleepsAndBirthdayWearsTheHat() {
    #expect(Self.read(Self.day(), hour: 23).emotion == .sleep)
    #expect(Self.read(Self.day(), hour: 5).emotion == .sleep)
    let bday = KoaMood.read(.init(signals: Self.day(), hour: 23, isBirthday: true))
    #expect(bday.emotion == .hat)
  }

  @Test func worryOnlyForARealStreakInTheirEvening() {
    let empty = Self.day()
    #expect(Self.read(empty, hour: 19, streak: 5, logged: false).reason == .worry)
    #expect(Self.read(empty, hour: 10, streak: 5, logged: false).reason != .worry, "không lo buổi sáng")
    #expect(Self.read(empty, hour: 19, streak: 2, logged: false).reason != .worry, "chuỗi < 3 ngày")
    #expect(Self.read(empty, hour: 19, streak: 5, logged: true).reason != .worry)
    // Giờ muộn của người này là 21h → 19h chưa lo.
    let late = KoaMood.read(.init(signals: empty, hour: 19, streak: 5, loggedToday: false, riskHour: 21))
    #expect(late.reason != .worry)
  }

  @Test func allDoneCelebratesAndStepsCountOnlyWithASource() {
    let all = Self.day(kcal: 1800, workout: true, sleepMin: 450, waterMl: 2000)
    #expect(Self.read(all, hour: 15) == .init(emotion: .celebrate, reason: .allDone))
    let noSteps = Self.day(kcal: 1800, workout: true, sleepMin: 450, waterMl: 2000, steps: 2000)
    #expect(Self.read(noSteps, hour: 15).reason != .allDone, "có nguồn bước mà chưa đủ bước")
  }

  /// "Ăn quá" dùng CÙNG luật với vòng kcal: quá +10 % mục tiêu.
  @Test func overeatingMatchesTheKcalRing() {
    #expect(Self.read(Self.day(kcal: 2300), hour: 14).reason == .overate)
    #expect(Self.read(Self.day(kcal: 2200), hour: 14).reason != .overate, "đúng +10 % vẫn trong dải")
    #expect(Self.read(Self.day(kcal: 2300), hour: 14, target: nil).reason != .overate)
    #expect(KoaMood.kcalPercent(kcal: 2480, target: 2000) == 124)
  }

  @Test func morningReadsLastNight() {
    #expect(Self.read(Self.day(sleepMin: 460), hour: 8) == .init(emotion: .rested, reason: .rested))
    #expect(Self.read(Self.day(sleepMin: 300), hour: 8) == .init(emotion: .tired, reason: .shortSleep))
    #expect(Self.read(Self.day(sleepMin: 390), hour: 8).reason == .calm)
    #expect(Self.read(Self.day(sleepMin: 460), hour: 13).reason != .rested, "chỉ buổi sáng")
  }

  @Test func theDayIsMirroredGently() {
    #expect(Self.read(Self.day(workout: true), hour: 17).emotion == .proud)
    #expect(Self.read(Self.day(kcal: 600), hour: 19).emotion == .happy, "đã ăn, tối chưa tập: không mệt")
    #expect(Self.read(Self.day(), hour: 14).emotion == .tired)
    #expect(Self.read(Self.day(), hour: 9).emotion == .idle)
  }

  /// Mọi cảm xúc Koa nói ra đều có hình đã vẽ.
  @Test func everyEmotionHasArt() {
    for e in [KoaEmotion.Emotion.idle, .sleep, .hat, .worry, .celebrate, .oops, .rested, .tired, .proud, .happy] {
      #expect(KoaEmotion.states[e] != nil, "\(e)")
    }
  }
}

/// Tự nhận thưởng nhiệm vụ (Koa đợt 1).
@MainActor
struct QuestAutoClaimTests {
  typealias Fake = MascotRoomControllerTests.FakeSource
  typealias Clock = QuestHabitProducerTests.Clock

  final class Got: @unchecked Sendable {
    let lock = NSLock()
    var all: [QuestObserver.Claimed] = []
    func add(_ c: QuestObserver.Claimed) { lock.withLock { all.append(c) } }
  }

  static func observer(_ s: Fake, _ e: MascotRoomControllerTests.FakeEconomy, clock: Clock, got: Got) -> QuestObserver {
    QuestObserver(
      userId: "u1", source: s, clock: clock, timeZone: TimeZone(identifier: "UTC")!, economy: e,
      onClaimed: { got.add($0) }, onQuestDone: { _, _ in })
  }

  static func settle(_ cond: () -> Bool) async {
    for _ in 0..<200 where !cond() { try? await Task.sleep(for: .milliseconds(5)) }
  }

  @Test func doneQuestsLandOnTheFirstReadingWithoutACelebration() async {
    let s = Fake()
    s.ledgerRows = MascotRoomControllerTests.welcomed
    s.signals = QuestHabitProducerTests.signals(workout: true, meal: true)
    let e = MascotRoomControllerTests.FakeEconomy(source: s)
    let got = Got()
    let o = Self.observer(s, e, clock: Clock("2026-10-08T09:00:00Z"), got: got)
    await o.refresh()
    await Self.settle { got.all.count == 2 }
    #expect(Set(e.claims) == ["d:2026-10-08:meal", "d:2026-10-08:workout"])
    #expect(got.all.allSatisfy { !$0.seen }, "đã xong lúc app mở: nhận nhưng không ăn mừng")
    await o.refresh()
    try? await Task.sleep(for: .milliseconds(30))
    #expect(e.claims.count == 2, "đã có trong sổ: không gửi lại")
  }

  @Test func aSeenTransitionIsClaimedAndCelebrated() async {
    let s = Fake()
    s.ledgerRows = MascotRoomControllerTests.welcomed
    s.signals = QuestHabitProducerTests.signals()
    let e = MascotRoomControllerTests.FakeEconomy(source: s)
    let got = Got()
    let o = Self.observer(s, e, clock: Clock("2026-10-08T09:00:00Z"), got: got)
    await o.refresh()
    s.signals = QuestHabitProducerTests.signals(meal: true)
    await o.refresh()
    await Self.settle { got.all.count == 1 }
    #expect(got.all.map(\.quest) == [.meal])
    #expect(got.all.first?.seen == true)
    #expect(got.all.first?.allDone == false, "mới xong bữa, chưa xong hết")
    #expect(got.all.first?.amount == 25)
  }

  @Test func aRefusedClaimIsRetriedOnTheNextReadingEvenAfterMidnight() async {
    let s = Fake()
    s.ledgerRows = MascotRoomControllerTests.welcomed
    s.signals = QuestHabitProducerTests.signals(meal: true)
    let e = MascotRoomControllerTests.FakeEconomy(source: s)
    e.claimError = MascotFailure.offline
    let got = Got()
    let clock = Clock("2026-10-08T23:50:00Z")
    let o = Self.observer(s, e, clock: clock, got: got)
    await o.refresh()
    await Self.settle { e.claims.count == 1 }
    try? await Task.sleep(for: .milliseconds(20))
    #expect(got.all.isEmpty)
    e.claimError = nil
    clock.set("2026-10-09T00:10:00Z")
    s.signals = QuestHabitProducerTests.signals()
    await o.refresh()
    await Self.settle { got.all.count == 1 }
    #expect(got.all.map(\.refKey) == ["d:2026-10-08:meal"], "khoá hôm qua còn nợ vẫn được nhận")
  }

  @Test func closedObserverClaimsNothing() async {
    let s = Fake()
    s.ledgerRows = MascotRoomControllerTests.welcomed
    s.signals = QuestHabitProducerTests.signals(meal: true)
    let e = MascotRoomControllerTests.FakeEconomy(source: s)
    let o = Self.observer(s, e, clock: Clock("2026-10-08T09:00:00Z"), got: Got())
    o.close()
    await o.refresh()
    try? await Task.sleep(for: .milliseconds(20))
    #expect(e.claims.isEmpty)
  }
}

/// Koa ló lên ở mọi tab (đợt 2A): hạn mức "ít mà đáng".
struct KoaPeekTests {
  let day = LocalDate("2026-10-19")!

  @Test func firstPeekOfTheDayIsAllowed() {
    #expect(KoaPeek.allow(nil, nowMs: 0, day: day, allDone: false))
    let old = KoaPeek.Ledger(day: "2026-10-18", shown: 4, lastMs: 0)
    #expect(KoaPeek.allow(old, nowMs: 1, day: day, allDone: false), "sổ hôm qua không tính")
  }

  @Test func cooldownAndDailyCap() {
    var l = KoaPeek.record(nil, nowMs: 1_000, day: day)
    #expect(!KoaPeek.allow(l, nowMs: 60_000, day: day, allDone: false), "chưa đủ 90 giây")
    #expect(KoaPeek.allow(l, nowMs: 91_000, day: day, allDone: false))
    for i in 2...KoaPeek.dailyCap { l = KoaPeek.record(l, nowMs: Double(i) * 200_000, day: day) }
    #expect(l.shown == KoaPeek.dailyCap)
    #expect(!KoaPeek.allow(l, nowMs: 9_000_000, day: day, allDone: false), "đủ trần ngày")
    #expect(KoaPeek.allow(l, nowMs: 9_000_000, day: day, allDone: true), "xong hết luôn được hiện")
  }

  @Test func faceFitsTheQuest() {
    #expect(KoaPeek.emotion(.workout, allDone: false) == .proud)
    #expect(KoaPeek.emotion(.sleep, allDone: false) == .rested)
    #expect(KoaPeek.emotion(.meal, allDone: true) == .celebrate)
    #expect(KoaPeek.emotion(nil, allDone: false) == .celebrate)
  }
}

/// Widget Koa (đợt 2C): khi nào nói tâm trạng, khi nào Koa ngủ, khi nào mời mở app.
struct KoaWidgetDataTests {
  static let cal: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    return c
  }()
  static func at(_ day: Int, _ hour: Int) -> Date {
    cal.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour))!
  }
  let data = KoaWidgetData(
    day: "2026-10-19", line: "Ngủ 7 giờ 40 phút", next: "Ghi bữa ăn", done: 2, total: 4, streak: 12,
    nightLine: "Koa đi ngủ đây", imageVersion: 1)

  @Test func phaseFollowsTheClockAndTheDay() {
    #expect(data.phase(now: Self.at(19, 9), calendar: Self.cal) == .day)
    #expect(data.phase(now: Self.at(19, 22), calendar: Self.cal) == .night)
    #expect(data.phase(now: Self.at(19, 5), calendar: Self.cal) == .night)
    #expect(data.phase(now: Self.at(20, 9), calendar: Self.cal) == .stale, "hôm sau: không nói tâm trạng cũ")
  }

  @Test func storeRoundTripsAndClears() {
    let suite = "koa-widget-test-\(UUID().uuidString)"
    let store = WidgetDataStore(suite: suite)
    store.writeKoa(data)
    #expect(store.koa() == data)
    store.clear()
    #expect(store.koa() == nil)
    UserDefaults().removePersistentDomain(forName: suite)
  }
}

/// Nút "+1 ly" trên widget (đợt 2C): ô Nước sáng ngay, chỉ cho ngày của dữ liệu.
struct KoaWidgetWaterTests {
  @Test func tapLightsTheWaterTubeOnceAndCountsGlasses() {
    let suite = "koa-widget-water-\(UUID().uuidString)"
    let store = WidgetDataStore(suite: suite)
    store.writeKoa(KoaWidgetData(
      day: "2026-10-20", line: "", next: nil, done: 1, total: 4, streak: 3, nightLine: "", imageVersion: 1,
      checks: ["done", "todo", "todo", "todo"]))
    #expect(store.markKoaWaterLogged(today: LocalDate("2026-10-20")!))
    #expect(store.koa()?.checks == ["done", "todo", "done", "todo"])
    #expect(store.koa()?.done == 2)
    #expect(store.markKoaWaterLogged(today: LocalDate("2026-10-20")!))
    #expect(store.koa()?.done == 2, "ly thứ hai không đếm lại việc")
    #expect(store.koa()?.waterTaps == 2)
    #expect(!store.markKoaWaterLogged(today: LocalDate("2026-10-21")!), "dữ liệu hôm qua: để nguyên")
    UserDefaults().removePersistentDomain(forName: suite)
  }

  @Test func oldPayloadDecodes() throws {
    let old = #"{"day":"2026-10-20","line":"x","done":1,"total":4,"streak":2,"nightLine":"n","imageVersion":1}"#
    let d = try JSONDecoder().decode(KoaWidgetData.self, from: Data(old.utf8))
    #expect(d.checks.isEmpty && d.waterTaps == 0 && d.short.isEmpty && d.nextQuest == nil)
  }
}

/// Koa ngủ theo giờ người dùng đặt trong hồ sơ (Kiệt 30/10).
@Suite struct KoaSleepWindowTests {
  typealias Window = KoaMood.SleepWindow

  @Test func acrossMidnight() {
    let w = Window(bed: "23:30", wake: "07:15")!
    #expect(!w.contains(hour: 23, minute: 29))
    #expect(w.contains(hour: 23, minute: 30))
    #expect(w.contains(hour: 3))
    #expect(w.contains(hour: 7, minute: 14))
    #expect(!w.contains(hour: 7, minute: 15))
    #expect(!w.contains(hour: 12))
  }

  /// Người làm ca đêm ngủ ban ngày: Koa cũng ngủ ban ngày.
  @Test func daySleeper() {
    let w = Window(bed: "08:00:00", wake: "15:00:00")!
    #expect(w.contains(hour: 10))
    #expect(!w.contains(hour: 22))
    let r = KoaMood.read(.init(signals: DailySignals(), hour: 10, sleep: w))
    #expect(r.emotion == .sleep)
    #expect(KoaMood.read(.init(signals: DailySignals(), hour: 23, sleep: w)).reason != .night)
  }

  @Test func badTimesAreRejected() {
    #expect(Window(bed: "25:00", wake: "07:00") == nil)
    #expect(Window(bed: "abc", wake: "07:00") == nil)
    #expect(Window(bed: "07:00", wake: "07:00") == nil)
  }

  /// Giờ không có cờ `_set` là mặc định của DB, không phải giờ của người dùng.
  @Test func onlyTimesTheUserSet() throws {
    let row: JSONValue = .object([
      "user_id": .string("u"), "sleep_target_bedtime": .string("01:00:00"), "sleep_target_waketime": .string("09:00:00"),
      "sleep_target_bedtime_set": .bool(true), "sleep_target_waketime_set": .bool(true),
    ])
    var p = try #require(Profile(row: row))
    #expect(Window(profile: p) == Window(bed: "01:00", wake: "09:00"))
    p.sleepTargetWaketimeSet = false
    #expect(Window(profile: p) == .standard)
    #expect(Window(profile: nil) == .standard)
  }

  @Test func windsDownBeforeBed() {
    let w = Window(bed: "23:00", wake: "07:00")!
    #expect(w.winding(hour: 22, minute: 10))
    #expect(!w.winding(hour: 21, minute: 50))
    #expect(w.winding(hour: 2))
  }

  @Test func scheduleWaitsOutTheUsersNight() {
    let w = Window(bed: "20:00", wake: "05:00")!
    let phase = KoaSchedule.phase(
      gains: .zero, lastSessionAt: nil, now: EpochMillis(0), trainedToday: false, plannedToday: true, hour: 21,
      habitHour: 18, sleep: w)
    #expect(phase == nil)
  }

  @Test func widgetFollowsTheWindowAndReadsOldData() throws {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    let at = cal.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 23))!
    var data = KoaWidgetData(
      day: "2026-10-30", line: "", next: nil, done: 0, total: 4, streak: 0, nightLine: "", imageVersion: 1)
    #expect(data.phase(now: at, calendar: cal) == .night)
    data.sleep = Window(bed: "23:30", wake: "07:00")
    #expect(data.phase(now: at, calendar: cal) == .day)
    let back = try JSONDecoder().decode(KoaWidgetData.self, from: JSONEncoder().encode(data))
    #expect(back.sleep == data.sleep)
  }
}
