import ASCNDCore
import Foundation
import Testing

/// Golden của nhắc nhở (#427): sinh bằng CHÍNH `reminder-plan.ts` /
/// `reminder-timing.ts` @ fac9ac2 biên dịch, ở Asia/Ho_Chi_Minh và
/// America/New_York (qua hai lần đổi giờ) — `tools/insights-golden/gen-reminders.mjs`.
struct ReminderGoldenTests {
  struct Golden: Decodable {
    let prefs: [String: JSONValue]
    let plans: [PlanCase]
    let timing: Timing
  }
  struct PlanCase: Decodable {
    let name: String
    let tz: String
    let now: Double
    let prefs: String
    let ctx: JSONValue
    let plan: [String]
    let text: [[String]]
    let signature: String
  }
  struct Clock: Decodable, Equatable {
    let hour: Int
    let minute: Int
  }
  struct Timing: Decodable {
    struct Parse: Decodable {
      let s: String?
      let out: Int?
    }
    struct ToClock: Decodable {
      let m: Double
      let out: Clock
    }
    struct Suggested: Decodable {
      let key: String
      let known: JSONValue
      let out: Clock?
    }
    struct Worth: Decodable {
      let current: Clock
      let suggested: Clock
      let out: Bool
    }
    let parse: [Parse]
    let toClock: [ToClock]
    let suggested: [Suggested]
    let worth: [Worth]
  }

  static let golden: Golden = {
    let url = Bundle.module.url(forResource: "reminder-golden", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSONDecoder().decode(Golden.self, from: Data(contentsOf: url))
  }()

  static func prefs(_ v: JSONValue) -> ReminderPrefs {
    let data = try! JSONEncoder().encode(v)
    return ReminderPrefs.decode(String(data: data, encoding: .utf8))
  }

  static func context(_ v: JSONValue) -> ReminderContext {
    var c = ReminderContext()
    c.workedOutToday = v["workedOutToday"]?.boolValue ?? false
    c.weighedToday = v["weighedToday"]?.boolValue ?? false
    c.supplementsDone = v["supplementsDone"]?.boolValue ?? false
    c.mealLoggedToday = v["mealLoggedToday"]?.boolValue ?? false
    c.bioLoggedToday = v["bioLoggedToday"]?.boolValue ?? false
    c.sleepLoggedToday = v["sleepLoggedToday"]?.boolValue ?? false
    c.waterDone = v["waterDone"]?.boolValue ?? false
    if case .array(let days)? = v["trainingDays"] { c.trainingDays = days.compactMap(\.intValue) }
    if case .array(let claims)? = v["pendingClaims"] {
      c.pendingClaims = claims.map {
        PendingClaim(
          id: $0["id"]!.stringValue!, title: $0["title"]!.stringValue!, claimBy: $0["claimBy"]!.stringValue!,
          rewardCoins: $0["rewardCoins"]!.intValue!, body: $0["body"]!.stringValue!)
      }
    }
    return c
  }

  /// Golden của RN, bỏ hai lời nhắc đã gỡ (Koa Ecosystem V2, 02/11: "giữ chuỗi", "thưởng sắp hết
  /// hạn"). Phần còn lại phải giữ nguyên thứ tự và giờ; ca nào RN có lời nhắc đã gỡ thì kế hoạch mới
  /// chỉ được thêm lời nhắc muộn hơn vào cuối (chỗ trống do giới hạn số lời nhắc).
  @Test func plansMatchRN() {
    let g = Self.golden
    #expect(g.plans.count == 288)
    let retired = ["streak@", "challengeClaim@"]
    for c in g.plans {
      var cal = Calendar(identifier: .gregorian)
      cal.timeZone = TimeZone(identifier: c.tz)!
      let now = Date(timeIntervalSince1970: c.now / 1000)
      let plan = ReminderPlan.plan(Self.prefs(g.prefs[c.prefs]!), Self.context(c.ctx), now: now, calendar: cal)
      let got = plan.map { "\($0.key.rawValue)@\(Int64(($0.at.timeIntervalSince1970 * 1000).rounded()))" }
      #expect(!got.contains { g in retired.contains { g.hasPrefix($0) } }, "\(c.name)")
      let kept = c.plan.filter { p in !retired.contains { p.hasPrefix($0) } }
      if kept.count == c.plan.count {
        #expect(got == c.plan, "\(c.name)")
        #expect(plan.compactMap { p in p.title.map { [$0, p.body ?? ""] } } == c.text, "\(c.name)")
        #expect(ReminderPlan.signature(plan) == c.signature, "\(c.name)")
      } else {
        #expect(Array(got.prefix(kept.count)) == kept, "\(c.name)")
      }
    }
  }

  @Test func timingMatchesRN() {
    let t = Self.golden.timing
    for p in t.parse { #expect(ReminderTiming.parseClock(p.s) == p.out, "\(p.s ?? "nil")") }
    for c in t.toClock {
      let got = ReminderTiming.toClock(c.m)
      #expect(Clock(hour: got.hour, minute: got.minute) == c.out, "\(c.m)")
    }
    #expect(t.suggested.count == 35)
    for s in t.suggested {
      let hour: Double? = switch s.known["workoutHour"] {
      case .number(let n)?: n
      case .string("NaN")?: .nan
      default: nil
      }
      let known = ReminderTiming.Known(
        bedtime: s.known["bedtime"]?.stringValue, waketime: s.known["waketime"]?.stringValue, workoutHour: hour)
      let got = ReminderTiming.suggested(ReminderKey(rawValue: s.key)!, known).map { Clock(hour: $0.hour, minute: $0.minute) }
      #expect(got == s.out, "\(s.key) \(s.known)")
    }
    for w in t.worth {
      let a = ReminderClock(hour: w.current.hour, minute: w.current.minute)
      let b = ReminderClock(hour: w.suggested.hour, minute: w.suggested.minute)
      #expect(ReminderTiming.worthOffering(a, b) == w.out)
    }
  }
}
