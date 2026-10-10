@testable import ASCNDCore
import Foundation
import Testing

/// Giờ thói quen (#527 A-NEXT-7 · S1). Golden THẬT: `lib/user-rhythm.ts` @
/// fac9ac2 biên dịch (`Fixtures/user-rhythm-golden.json`, `gen-user-rhythm.mjs`).
///
/// Số thực so với dung sai 1e-9: `sin` / `cos` / `atan2` / `log` của V8 và của
/// libm có thể lệch ở chữ số cuối. Ngưỡng (`nil` / không `nil`) so chính xác.
///
/// Riêng `spread = √(−2·ln r)`: khi các giờ trùng nhau `r ≈ 1`, và căn bậc hai
/// khuếch đại một lệch 1 ulp của `r` (~1e-16) thành ~1e-8 (đo trên CI: Swift
/// `r` đúng 1 → `−0.0`, V8 `1 − ε` → `5.7e-8`). Nên so LƯỢNG DƯỚI CĂN
/// (`spread²`) với 1e-9, và `lateHour = hour + 2·spread` được phép lệch đúng
/// phần đã lan từ `spread` — golden giữ nguyên.
struct UserRhythmGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "user-rhythm-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  /// Số, hay `"NaN"` / `"Infinity"` / `"-Infinity"`.
  static func num(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)?: return n
    case .string("NaN")?: return .nan
    case .string("Infinity")?: return .infinity
    case .string("-Infinity")?: return -.infinity
    default: return nil
    }
  }

  static func close(_ a: Double, _ b: Double?) -> Bool {
    guard let b else { return false }
    return abs(a - b) <= 1e-9
  }

  @Test func constantsMatchRN() throws {
    let g = try Self.golden()
    #expect(UserRhythm.minObs == Self.num(g["MIN_OBS"]))
    #expect(UserRhythm.minR == Self.num(g["MIN_R"]))
  }

  @Test func observeHabitLateHourMatchRN() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 300)
    #expect(cases.contains { $0["habit"] != .null })
    #expect(cases.contains { $0["habit"] == .null })
    for c in cases {
      var st = UserRhythm.HourStat.empty
      for h in Self.array(c["hours"]) { st = UserRhythm.observeHour(st, try #require(Self.num(h))) }
      let ws = c["stat"]
      #expect(st.n == Self.num(ws?["n"]), "\(c)")
      #expect(Self.close(st.sin, Self.num(ws?["sin"])), "\(c)")
      #expect(Self.close(st.cos, Self.num(ws?["cos"])), "\(c)")
      let h = UserRhythm.habit(st)
      if c["habit"] == .null {
        #expect(h == nil, "\(c)")
      } else {
        let w = c["habit"]
        #expect(h != nil, "\(c)")
        if let h {
          #expect(Self.close(h.hour, Self.num(w?["hour"])), "\(c)")
          #expect(Self.close(h.strength, Self.num(w?["strength"])), "\(c)")
          let wantSpread = try #require(Self.num(w?["spread"]))
          #expect(abs(h.spread * h.spread - wantSpread * wantSpread) <= 1e-9, "\(c)")
        }
      }
      // Phần lệch `spread` đã lan vào `lateHour` (×2 = SLACK); 0 khi không có thói quen.
      let spreadDrift = h.map { mine in abs(mine.spread - (Self.num(c["habit"]?["spread"]) ?? mine.spread)) } ?? 0
      for l in Self.array(c["late"]) {
        let floor = try #require(Self.num(l["floor"]))
        let want = try #require(Self.num(l["expected"]))
        let got = UserRhythm.lateHour(h, floor: floor)
        #expect(abs(got - want) <= 1e-9 + UserRhythm.slack * spreadDrift, "\(c) \(l)")
      }
    }
  }

  @Test func corruptStatsAreNoHabit() throws {
    for c in Self.array(try Self.golden()["corrupt"]) {
      let s = c["stat"]
      let st = UserRhythm.HourStat(
        n: try #require(Self.num(s?["n"])), sin: try #require(Self.num(s?["sin"])), cos: try #require(Self.num(s?["cos"])))
      #expect(c["habit"] == .null)
      #expect(UserRhythm.habit(st) == nil, "\(c)")
    }
  }

  @Test func forwardMatchesRN() throws {
    for c in Self.array(try Self.golden()["forward"]) {
      let a = try #require(Self.num(c["a"])), b = try #require(Self.num(c["b"]))
      #expect(Self.close(UserRhythm.forward(a, b), Self.num(c["expected"])), "\(c)")
    }
  }
}

/// Kho giờ trên máy: chỉ `CLOCK_TRUSTED`, theo đúng người, xoá khi đăng xuất,
/// dữ liệu hỏng / chưa có là "chưa có thói quen" — không bao giờ là một giờ bịa.
struct HabitHoursTests {
  final class Store: KeyValueStore, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]
    func string(forKey key: String) -> String? { lock.withLock { values[key] } }
    func set(_ value: String, forKey key: String) { lock.withLock { values[key] = value } }
    func remove(_ key: String) { lock.withLock { _ = values.removeValue(forKey: key) } }
  }

  static func trained(_ h: HabitHours, _ quest: MascotRules.Quest, user: String = "u1", hours: [Double]) {
    for x in hours { h.noteDone(quest, hour: x, userId: user) }
  }

  /// Chưa có gì / chưa đủ 6 lần → `nil`; đủ và tập trung → giờ ấy.
  @Test func needsSixAgreeingObservations() {
    let h = HabitHours(store: Store())
    #expect(h.habit(.workout, userId: "u1") == nil)
    Self.trained(h, .workout, hours: [18, 18.25, 17.75, 18, 18.5])
    #expect(h.habit(.workout, userId: "u1") == nil, "5 lần: chưa đủ")
    h.noteDone(.workout, hour: 18, userId: "u1")
    let habit = h.habit(.workout, userId: "u1")
    #expect(habit != nil)
    #expect(abs((habit?.hour ?? 0) - 18.08) < 0.1)
  }

  /// Giờ tản mát khắp ngày: không có thói quen, không đoán.
  @Test func scatteredHoursAreNoHabit() {
    let h = HabitHours(store: Store())
    Self.trained(h, .workout, hours: [0, 4, 8, 12, 16, 20, 2, 14])
    #expect(h.habit(.workout, userId: "u1") == nil)
  }

  /// `steps` không trong `CLOCK_TRUSTED`; giờ không hữu hạn bị bỏ.
  @Test func onlyClockTrustedAndFiniteHours() {
    let h = HabitHours(store: Store())
    Self.trained(h, .steps, hours: Array(repeating: 9, count: 8))
    #expect(h.habit(.steps, userId: "u1") == nil)
    Self.trained(h, .meal, hours: [12, .nan, 12, .infinity, 12, 12, 12, 12])
    let meal = h.habit(.meal, userId: "u1")
    #expect(meal != nil, "6 giờ hữu hạn vẫn đủ — NaN / ∞ không làm hỏng tổng")
    #expect(abs((meal?.hour ?? 0) - 12) < 1e-9)
  }

  /// Đổi tài khoản: của người trước không lọt sang (kể cả khi chưa xoá); xoá thì sạch.
  @Test func accountsNeverShareHours() {
    let store = Store()
    let h = HabitHours(store: store)
    Self.trained(h, .workout, user: "u1", hours: Array(repeating: 7, count: 6))
    #expect(h.habit(.workout, userId: "u1") != nil)
    #expect(h.habit(.workout, userId: "u2") == nil, "blob là của u1")
    h.noteDone(.workout, hour: 20, userId: "u2")
    #expect(h.habit(.workout, userId: "u1") == nil, "u2 ghi đè — không trộn với u1")
    h.clear()
    #expect(store.string(forKey: HabitHours.storeKey) == nil)
    #expect(h.habit(.workout, userId: "u2") == nil)
  }

  /// Dữ liệu đã lưu hỏng (sửa tay / cắt cụt) → không có thói quen, ghi tiếp bình thường.
  @Test func corruptStorageIsEmpty() {
    let store = Store()
    store.set(#"{"user":"u1","hours":{"workout":"nope"}}"#, forKey: HabitHours.storeKey)
    let h = HabitHours(store: store)
    #expect(h.habit(.workout, userId: "u1") == nil)
    Self.trained(h, .workout, hours: Array(repeating: 6, count: 6))
    #expect(h.habit(.workout, userId: "u1") != nil)
  }

  /// Nối vào màn Nhắc nhở: có thói quen → `suggested(.workout)` = giờ ấy trừ khoảng
  /// báo trước; không có → `nil` (dòng giữ giờ của nó và không nói gì).
  @Test func knownWorkoutHourFeedsTheOffer() {
    #expect(ReminderTiming.suggested(.workout, ReminderTiming.Known(profile: nil)) == nil)
    let known = ReminderTiming.Known(profile: nil, workoutHour: 18)
    let s = ReminderTiming.suggested(.workout, known)
    #expect(s != nil)
    #expect(s.map { $0.hour * 60 + $0.minute } == 18 * 60 - ReminderTiming.workoutLeadMin)
  }
}
