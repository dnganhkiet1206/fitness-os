@testable import ASCNDCore
import Foundation
import Testing

/// "Koa để ý" giờ tập (#527 A-NEXT-7 · S2 + S3) = CHÍNH RN @ fac9ac2 —
/// `Fixtures/quest-habit-golden.json` (`gen-quest-habit.mjs`): khối quan sát của
/// `use-quest-autoclaim.ts` và chuỗi quan sát → `habit` → `SOURCE.workout` →
/// `offer` của `app/reminders.tsx`.
struct QuestHabitGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "quest-habit-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func quests(_ v: JSONValue?) -> [MascotRules.Quest] {
    array(v).compactMap { $0.stringValue.flatMap(MascotRules.Quest.init(rawValue:)) }
  }

  @Test func watchSeesWhatTheHookSees() throws {
    let cases = Self.array(try Self.golden()["watch"])
    #expect(cases.count == 150)
    var notes = 0
    for c in cases {
      var w = QuestWatch()
      for r in Self.array(c["readings"]) {
        let expected = Self.array(r["notes"]).compactMap {
          $0["quest"]?.stringValue.flatMap(MascotRules.Quest.init(rawValue:))
        }
        notes += expected.count
        // `if (!quests.ready) return;` — lần đọc chưa sẵn sàng không chạm mốc.
        guard r["ready"].map({ JS.truthyValue($0) }) == true else {
          #expect(expected.isEmpty)
          continue
        }
        var done: [MascotRules.Quest: Bool] = [:]
        if case .object(let o)? = r["done"] {
          for (k, v) in o { if let q = MascotRules.Quest(rawValue: k) { done[q] = JS.truthyValue(v) } }
        }
        let got = w.read(today: r["today"]?.stringValue ?? "", done: done, unclaimed: Self.quests(r["unclaimed"]))
        #expect(got == expected, "\(r)")
      }
    }
    #expect(notes > 100)  // golden thật sự có bước chuyển để so
  }

  @Test func offerIsRNs() throws {
    let cases = Self.array(try Self.golden()["offer"])
    #expect(cases.count == 160)
    for c in cases {
      let h = HabitHours(store: HabitHoursTests.Store())
      for x in Self.array(c["hours"]).compactMap(\.doubleValue) { h.noteDone(.workout, hour: x, userId: "u1") }
      let habit = h.habit(.workout, userId: "u1")
      if let want = c["habit"]?.doubleValue {
        let got = try #require(habit, "\(c)")
        #expect(abs(got.hour - want) < 1e-6, "\(c)")
      } else {
        #expect(habit == nil, "\(c)")
      }
      // SOURCE.workout: `formatClock({ hour: Math.round(h), minute: 0 })`.
      let source = ReminderTiming.workoutHabitClock(habit?.hour).map(ReminderTiming.format)
      #expect(source == c["source"]?.stringValue, "\(c)")
      // offer = r.enabled && suggested && SOURCE && worthOffering.
      let row = c["row"]
      var prefs = ReminderPrefs.defaults
      prefs.workout = .init(
        enabled: row?["enabled"].map { JS.truthyValue($0) } ?? false,
        hour: Int(row?["hour"]?.doubleValue ?? 0), minute: Int(row?["minute"]?.doubleValue ?? 0))
      let known = ReminderTiming.Known(profile: nil, workoutHour: habit?.hour)
      let offer = source == nil ? nil : ReminderTiming.offer(.workout, prefs: prefs, known: known)
      if case .object(let o)? = c["offer"] {
        #expect(offer?.hour == o["hour"]?.doubleValue.map { Int($0) }, "\(c)")
        #expect(offer?.minute == o["minute"]?.doubleValue.map { Int($0) }, "\(c)")
      } else {
        #expect(offer == nil, "\(c)")
      }
    }
  }

  @Test func roundingIsMathRound() {
    #expect(ReminderTiming.workoutHabitClock(nil) == nil)
    #expect(ReminderTiming.workoutHabitClock(.nan) == nil)
    #expect(ReminderTiming.workoutHabitClock(17.5) == ReminderClock(hour: 18, minute: 0))
    #expect(ReminderTiming.workoutHabitClock(17.49) == ReminderClock(hour: 17, minute: 0))
    // `Math.round` không quấn quanh ngày: 23:40 nói "24:00", như RN.
    #expect(ReminderTiming.workoutHabitClock(23.7).map(ReminderTiming.format) == "24:00")
  }
}

/// Producer (S2 + cấp app): MỘT bộ quan sát mỗi tài khoản — phiên (Hôm nay)
/// và phòng linh vật cùng đưa lượt đọc vào → `HabitHours`.
@MainActor
struct QuestHabitProducerTests {
  typealias Fake = MascotRoomControllerTests.FakeSource

  final class Clock: WallClock, @unchecked Sendable {
    let lock = NSLock()
    var date: Date
    init(_ iso: String) { date = ISO8601DateFormatter().date(from: iso)! }
    func now() -> Date { lock.withLock { date } }
    func set(_ iso: String) { lock.withLock { date = ISO8601DateFormatter().date(from: iso)! } }
  }

  final class Notes: @unchecked Sendable {
    let lock = NSLock()
    var all: [(quest: MascotRules.Quest, hour: Int)] = []
    func add(_ q: MascotRules.Quest, _ h: Int) { lock.withLock { all.append((q, h)) } }
    var quests: [MascotRules.Quest] { lock.withLock { all.map(\.quest) } }
  }

  static let welcomed = MascotRoomControllerTests.welcomed
  static let utc = TimeZone(identifier: "UTC")!

  static func observer(_ s: Fake, clock: Clock, user: String = "u1", notes: Notes) -> QuestObserver {
    QuestObserver(userId: user, source: s, clock: clock, timeZone: utc) { q, h in notes.add(q, h) }
  }

  static func room(_ s: Fake, day: String = "2026-10-08", observer: QuestObserver) -> MascotRoomController {
    MascotRoomController(
      userId: observer.userId, today: LocalDate(day)!, source: s,
      economy: MascotRoomControllerTests.FakeEconomy(source: s), questObserver: observer)
  }

  static func signals(workout: Bool = false, meal: Bool = false, steps: Double? = nil) -> DailySignals {
    DailySignals(
      kcal: meal ? 300 : nil, workoutCount: workout ? 1 : 0, steps: steps, stepsEverRecorded: steps != nil)
  }

  @Test func firstReadingOnlySetsTheBaseline() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals(workout: true, meal: true)
    let notes = Notes()
    let o = Self.observer(s, clock: Clock("2026-10-08T18:20:00Z"), notes: notes)
    await o.refresh()  // đã xong khi app mở: giờ lúc này là giờ mở app
    await o.refresh()  // làm mới: không có gì đổi
    #expect(notes.all.isEmpty)
  }

  /// Hoàn thành khi đang ở Hôm nay, KHÔNG mở phòng linh vật: nhịp của phiên
  /// (hàng đợi gửi xong) thấy và ghi đúng giờ địa phương lúc thấy.
  @Test func aTransitionSeenFromTodayIsNotedOnceWithTheLocalHour() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals()
    let notes = Notes()
    let clock = Clock("2026-10-08T07:05:00Z")
    let o = Self.observer(s, clock: clock, notes: notes)
    await o.refresh()
    s.signals = Self.signals(workout: true)
    clock.set("2026-10-08T07:40:00Z")
    await o.refresh()
    #expect(notes.quests == [.workout])
    #expect(notes.all.first?.hour == 7)
    await o.refresh()  // refetch không đổi: không ghi lần hai
    #expect(notes.all.count == 1)
    // Mở phòng linh vật SAU đó: cùng mốc → không ghi trùng.
    let c = Self.room(s, observer: o)
    await c.load()
    await c.load()
    #expect(notes.all.count == 1)
  }

  /// Phòng linh vật cũng là một lượt đọc: thấy ở phòng thì nhịp phiên sau đó
  /// không ghi lại.
  @Test func theRoomFeedsTheSameBaseline() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals()
    let notes = Notes()
    let o = Self.observer(s, clock: Clock("2026-10-08T18:00:00Z"), notes: notes)
    await o.refresh()
    s.signals = Self.signals(meal: true)
    let c = Self.room(s, observer: o)
    await c.load()
    #expect(notes.quests == [.meal])
    await o.refresh()
    #expect(notes.quests == [.meal])
  }

  @Test func claimedOrUnreadableReadingsAreNotObservations() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed + [LedgerRow(amount: 25, refKey: "d:2026-10-08:workout")]
    s.signals = Self.signals()
    let notes = Notes()
    let o = Self.observer(s, clock: Clock("2026-10-08T12:00:00Z"), notes: notes)
    await o.refresh()
    s.signals = Self.signals(workout: true, meal: true)
    await o.refresh()
    #expect(notes.quests == [.meal])  // tập đã nhận thưởng ở nơi khác: không nằm trong `unclaimed`
    // Tín hiệu ngày đọc hỏng = chưa `ready`: không ghi, không dời mốc.
    s.signals = Self.signals()
    s.signalsError = URLError(.notConnectedToInternet)
    await o.refresh()
    s.signalsError = nil
    s.signals = Self.signals(workout: true, meal: true)
    await o.refresh()
    #expect(notes.quests == [.meal])
    // Sổ xu hỏng = chưa biết đã nhận gì: vẫn quan sát (như `claimedList(undefined)`).
    s.ledgerError = URLError(.timedOut)
    s.signals = Self.signals()
    await o.refresh()
    s.signals = Self.signals(workout: true)
    await o.refresh()
    #expect(notes.quests == [.meal, .workout])
  }

  @Test func aNewDayOnlySetsANewBaselineAndOldDaysAreIgnored() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals()
    let notes = Notes()
    let clock = Clock("2026-10-08T22:00:00Z")
    let o = Self.observer(s, clock: clock, notes: notes)
    await o.refresh()
    // Qua nửa đêm; ngày mới mở ra với bữa đã ghi: chỉ là mốc.
    clock.set("2026-10-09T08:00:00Z")
    s.signals = Self.signals(meal: true)
    await o.refresh()
    #expect(notes.all.isEmpty)
    // Phòng linh vật dựng từ hôm qua về muộn với lượt của ngày cũ: bỏ.
    let stale = Self.room(s, day: "2026-10-08", observer: o)
    s.signals = Self.signals()
    await stale.load()
    s.signals = Self.signals(meal: true)
    await o.refresh()
    #expect(notes.all.isEmpty)  // mốc không bị lượt cũ kéo lùi rồi ghi lặp
  }

  @Test func aLateOlderReadingNeverRewindsTheBaseline() {
    let notes = Notes()
    let o = Self.observer(Fake(), clock: Clock("2026-10-08T09:00:00Z"), notes: notes)
    let day = LocalDate("2026-10-08")!
    let first = o.begin(), older = o.begin(), newer = o.begin()
    o.observe(token: first, day: day, signals: Self.signals(), claimed: [])
    o.observe(token: newer, day: day, signals: Self.signals(workout: true), claimed: [])
    #expect(notes.quests == [.workout])
    // Lượt bắt đầu trước về sau (còn "chưa xong"): bỏ — nếu không, lượt kế
    // tiếp sẽ ghi tập lần hai.
    o.observe(token: older, day: day, signals: Self.signals(), claimed: [])
    o.observe(token: o.begin(), day: day, signals: Self.signals(workout: true), claimed: [])
    #expect(notes.quests == [.workout])
  }

  @Test func aClosedObserverWritesNothing() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals()
    let notes = Notes()
    let o = Self.observer(s, clock: Clock("2026-10-08T09:00:00Z"), notes: notes)
    await o.refresh()
    o.close()  // đăng xuất / đổi tài khoản
    s.signals = Self.signals(workout: true)
    await o.refresh()
    o.observe(token: o.begin(), day: LocalDate("2026-10-08")!, signals: s.signals, claimed: [])
    #expect(notes.all.isEmpty)
  }

  @Test func onlyClockTrustedQuestsBecomeHabitsAndOnlyForThisAccount() async {
    let hours = HabitHours(store: HabitHoursTests.Store())
    let s = Fake()
    s.ledgerRows = Self.welcomed
    let clock = Clock("2026-10-01T06:00:00Z")
    let o = QuestObserver(userId: "u1", source: s, clock: clock, timeZone: Self.utc) { q, h in
      hours.noteDone(q, hour: Double(h), userId: "u1")
    }
    // Sáu ngày, mỗi ngày thấy tập (và bước) xong lúc 18 giờ.
    for d in 1...6 {
      clock.set(String(format: "2026-10-%02dT06:00:00Z", d))
      s.signals = Self.signals(steps: 0)
      await o.refresh()
      clock.set(String(format: "2026-10-%02dT18:10:00Z", d))
      s.signals = Self.signals(workout: true, steps: 20_000)
      await o.refresh()
    }
    let habit = hours.habit(.workout, userId: "u1")
    #expect(habit.map { abs($0.hour - 18) < 1e-9 } == true)
    #expect(hours.habit(.steps, userId: "u1") == nil)  // giờ đếm bước không phải giờ đi bộ
    #expect(hours.habit(.workout, userId: "u2") == nil)  // không lọt sang tài khoản khác
    // S3: lời nhắc tập bật lúc 7:00 → mời "Nhắc lúc 17:00", nguồn "18:00".
    var prefs = ReminderPrefs.defaults
    prefs.workout = .init(enabled: true, hour: 7, minute: 0)
    let known = ReminderTiming.Known(profile: nil, workoutHour: habit?.hour)
    #expect(ReminderTiming.offer(.workout, prefs: prefs, known: known) == ReminderClock(hour: 17, minute: 0))
    #expect(ReminderTiming.workoutHabitClock(habit?.hour).map(ReminderTiming.format) == "18:00")
    // Tắt lời nhắc → không mời; đã ở 17:10 → lệch < 20 phút, không mời.
    prefs.workout = .init(enabled: false, hour: 7, minute: 0)
    #expect(ReminderTiming.offer(.workout, prefs: prefs, known: known) == nil)
    prefs.workout = .init(enabled: true, hour: 17, minute: 10)
    #expect(ReminderTiming.offer(.workout, prefs: prefs, known: known) == nil)
    // Đăng xuất (`resetPersonalModel`).
    hours.clear()
    #expect(hours.habit(.workout, userId: "u1") == nil)
  }

  @Test func fiveDaysOrScatteredHoursOfferNothing() async {
    let hours = HabitHours(store: HabitHoursTests.Store())
    for h in [18.0, 18, 18, 18, 18] { hours.noteDone(.workout, hour: h, userId: "u1") }
    #expect(hours.habit(.workout, userId: "u1") == nil)
    let scattered = HabitHours(store: HabitHoursTests.Store())
    for h in [0.0, 4, 8, 12, 16, 20, 2, 10] { scattered.noteDone(.workout, hour: h, userId: "u1") }
    var prefs = ReminderPrefs.defaults
    prefs.workout = .init(enabled: true, hour: 7, minute: 0)
    let known = ReminderTiming.Known(profile: nil, workoutHour: scattered.habit(.workout, userId: "u1")?.hour)
    #expect(ReminderTiming.offer(.workout, prefs: prefs, known: known) == nil)
  }
}
