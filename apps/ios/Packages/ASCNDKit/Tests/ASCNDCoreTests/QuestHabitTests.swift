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

/// Producer (S2): phòng linh vật thấy nhiệm vụ vừa xong → `HabitHours`.
@MainActor
struct QuestHabitProducerTests {
  typealias Fake = MascotRoomControllerTests.FakeSource

  final class Notes: @unchecked Sendable {
    let lock = NSLock()
    var all: [(quest: MascotRules.Quest, hour: Int)] = []
    func add(_ q: MascotRules.Quest, _ h: Int) { lock.withLock { all.append((q, h)) } }
    var quests: [MascotRules.Quest] { lock.withLock { all.map(\.quest) } }
  }

  static let welcomed = MascotRoomControllerTests.welcomed

  static func room(
    _ s: Fake, day: String = "2026-10-08", user: String = "u1", hour: Int = 18, notes: Notes
  ) -> MascotRoomController {
    MascotRoomController(
      userId: user, today: LocalDate(day)!, source: s, economy: MascotRoomControllerTests.FakeEconomy(source: s),
      onQuestDone: { q, h in notes.add(q, h) }, hourNow: { hour })
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
    let c = Self.room(s, notes: notes)
    await c.load()  // đã xong khi app mở: giờ lúc này là giờ mở app
    await c.load()  // làm mới: không có gì đổi
    #expect(notes.all.isEmpty)
  }

  @Test func aSeenTransitionIsNotedWithTheLocalHour() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed
    s.signals = Self.signals()
    let notes = Notes()
    let c = Self.room(s, hour: 7, notes: notes)
    await c.load()
    s.signals = Self.signals(workout: true)
    await c.load()
    #expect(notes.quests == [.workout])
    #expect(notes.all.first?.hour == 7)
    await c.load()  // đọc lại cùng trạng thái: không ghi lần hai
    #expect(notes.all.count == 1)
  }

  @Test func claimedOrUnreadableReadingsAreNotObservations() async {
    let s = Fake()
    s.ledgerRows = Self.welcomed + [LedgerRow(amount: 25, refKey: "d:2026-10-08:workout")]
    s.signals = Self.signals()
    let notes = Notes()
    let c = Self.room(s, notes: notes)
    await c.load()
    s.signals = Self.signals(workout: true, meal: true)
    await c.load()
    #expect(notes.quests == [.meal])  // tập đã nhận thưởng ở nơi khác: không nằm trong `unclaimed`
    // Tín hiệu ngày đọc hỏng = chưa `ready`: không ghi, không dời mốc.
    s.signals = Self.signals()
    s.signalsError = URLError(.notConnectedToInternet)
    await c.load()
    s.signalsError = nil
    s.signals = Self.signals(workout: true, meal: true)
    await c.load()
    #expect(notes.quests == [.meal])
  }

  @Test func onlyClockTrustedQuestsBecomeHabitsAndOnlyForThisAccount() async {
    let store = HabitHoursTests.Store()
    let hours = HabitHours(store: store)
    // Sáu ngày, mỗi ngày thấy tập (và bước) xong lúc 18 giờ.
    for d in 1...6 {
      let s = Fake()
      s.ledgerRows = Self.welcomed
      s.signals = Self.signals(steps: 0)
      let c = MascotRoomController(
        userId: "u1", today: LocalDate(String(format: "2026-10-%02d", d))!, source: s,
        economy: MascotRoomControllerTests.FakeEconomy(source: s),
        onQuestDone: { q, h in hours.noteDone(q, hour: Double(h), userId: "u1") }, hourNow: { 18 })
      await c.load()
      s.signals = Self.signals(workout: true, steps: 20_000)
      await c.load()
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
    // Tắt lời nhắc → không mời; đã ở 17:00 → lệch < 20 phút, không mời.
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
