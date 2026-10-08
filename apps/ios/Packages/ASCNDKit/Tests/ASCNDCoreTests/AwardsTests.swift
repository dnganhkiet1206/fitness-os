@testable import ASCNDCore
import Foundation
import Testing

/// Huy chương (#527) so với CHÍNH `lib/award-grant.ts` + biểu thức của
/// `app/awards.tsx` / `medal.tsx` @ fac9ac2 (`Fixtures/awards-golden.json`,
/// `gen-awards.mjs`).
struct AwardsGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "awards-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) throws -> [JSONValue] {
    guard case .array(let a)? = v else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  static func sources(_ v: JSONValue?) -> Awards.Sources {
    func n(_ k: String) -> Double? { v?[k]?.doubleValue }
    return Awards.Sources(
      streak: n("streak"), workoutCount: n("workoutCount"), prCount: n("prCount"), steps: n("steps"),
      mealCount: n("mealCount"), waterDays: n("waterDays"), sleepCount: n("sleepCount"), weighCount: n("weighCount"))
  }

  @Test func catalogueIsRNs() throws {
    let rows = try Self.array(Self.golden()["catalogue"])
    #expect(rows.count == Awards.catalogue.count)
    for (row, d) in zip(rows, Awards.catalogue) {
      #expect(row["key"]?.stringValue == d.key)
      #expect(row["type"]?.stringValue == d.type)
      #expect(row["icon"]?.stringValue == d.icon)
      #expect(row["tier"]?.stringValue == d.tier.rawValue)
      #expect(row["requirement"]?.doubleValue.map { Int($0) } == d.requirement, "\(d.key)")
    }
  }

  /// `awardsToGrant`: 18 bộ nguồn (gồm nguồn hỏng = null, số lẻ) × 3 tập đã có.
  @Test func grantDecisionMatchesRN() throws {
    let cases = try Self.array(Self.golden()["grant"])
    #expect(cases.count == 54)
    for c in cases {
      let earned = Set(try Self.array(c["earned"]).compactMap(\.stringValue))
      let want = try Self.array(c["grant"]).compactMap(\.stringValue)
      #expect(Awards.toGrant(Self.sources(c["sources"]), earned: earned).map(\.key) == want, "\(c)")
    }
  }

  @Test func duplicateIsSQLStateNotWording() throws {
    for c in try Self.array(Self.golden()["duplicate"]) {
      #expect(Awards.isDuplicate(code: c["code"]?.stringValue) == (c["duplicate"] == .bool(true)))
    }
  }

  /// Một cái hỏng ở giữa không chạm hai bên.
  @Test func grantAllKeepsGoingPastAFailure() async throws {
    let g = try #require(Self.golden()["grantAll"])
    let keys = try Self.array(g["keys"]).compactMap(\.stringValue)
    let failOn = Set(try Self.array(g["failOn"]).compactMap(\.stringValue))
    struct Refused: Error {}
    let out = await Awards.grantAll(keys.compactMap(Awards.def)) { d in
      if failOn.contains(d.key) { throw Refused() }
    }
    #expect(out.granted == (try Self.array(g["granted"]).compactMap(\.stringValue)))
    #expect(out.failed == (try Self.array(g["failed"]).compactMap(\.stringValue)))
  }

  /// Thanh tiến độ chỉ khi biết cả hai đầu; giá trị kẹp 0…1.
  @Test func progressMatchesRN() throws {
    for c in try Self.array(Self.golden()["progress"]) {
      let d = try #require(c["key"]?.stringValue.flatMap(Awards.def))
      let p = Awards.progress(d, earned: c["earned"] == .bool(true), current: c["current"]?.doubleValue)
      #expect((p != nil) == (c["showCount"] == .bool(true)), "\(c)")
      #expect((p ?? 0) == c["pct"]?.doubleValue, "\(c)")
    }
  }

  @Test func currentPercentAndMarkMatchRN() throws {
    let g = try Self.golden()
    let full = Awards.Sources(
      streak: 14, workoutCount: 50, prCount: 7, steps: 20000, mealCount: 50, waterDays: 30, sleepCount: 7, weighCount: 10)
    for c in try Self.array(g["current"]) {
      let type = try #require(c["type"]?.stringValue)
      #expect(Awards.current(type, full) == c["value"]?.doubleValue, "\(type)")
      #expect(Awards.current(type, nil) == nil)
    }
    for c in try Self.array(g["percent"]) {
      #expect(Double(Awards.percent(earned: Int(c["earned"]?.doubleValue ?? -1))) == c["pct"]?.doubleValue)
    }
    for c in try Self.array(g["mark"]) {
      #expect(Awards.mark(c["requirement"]?.doubleValue.map { Int($0) }) == c["mark"]?.stringValue)
    }
  }

  /// Mỗi nhóm trên màn = đúng các type của `DOMAINS`; đủ 29, không trùng.
  @Test func domainsCoverTheCatalogueOnce() {
    let keys = Awards.Domain.allCases.flatMap { $0.awards.map(\.key) }
    #expect(keys.count == Awards.catalogue.count)
    #expect(Set(keys).count == keys.count)
    #expect(Awards.Domain.workouts.awards.map(\.key) == ["first_workout", "workouts_10", "workouts_50", "workouts_100"])
  }

  /// Nguồn thô → nguồn: chuỗi tính có băng; nước đếm NGÀY; hỏng = nil, không phải 0.
  @Test func rawSourcesReadLikeRN() {
    let today = LocalDate("2026-10-08")!
    let r = Awards.Raw(
      loggedDates: [LocalDate("2026-10-08")!, LocalDate("2026-10-07")!, LocalDate("2026-10-05")!],
      frozen: [LocalDate("2026-10-06")!], workoutCount: 3, prCount: nil, steps: nil, mealCount: 0,
      waterDates: ["2026-10-01", "2026-10-01", "2026-10-02", ""], sleepCount: nil, weighCount: 2)
    let s = Awards.sources(r, today: today)
    #expect(s.streak == 4)
    #expect(s.workoutCount == 3 && s.prCount == nil && s.steps == nil && s.mealCount == 0)
    #expect(s.waterDays == 2)
    #expect(s.sleepCount == nil && s.weighCount == 2)
    let unread = Awards.sources(
      Awards.Raw(
        loggedDates: nil, frozen: [], workoutCount: nil, prCount: nil, steps: nil, mealCount: nil, waterDates: nil,
        sleepCount: nil, weighCount: nil), today: today)
    #expect(Awards.toGrant(unread, earned: []).isEmpty)
  }

  @Test func metadataRecordsTheMoment() {
    let s = Awards.Sources(streak: 7, workoutCount: 10, prCount: 5, steps: 12000)
    #expect(Awards.metadata(Awards.def("streak_7")!, s) == ["streak": .number(7)])
    #expect(Awards.metadata(Awards.def("steps_10k")!, s) == ["steps": .number(12000)])
    #expect(Awards.metadata(Awards.def("workouts_10")!, s) == ["count": .number(10)])
    #expect(Awards.metadata(Awards.def("pr_5")!, s) == ["count": .number(5)])
    #expect(Awards.metadata(Awards.def("first_meal")!, s).isEmpty)
  }
}

/// `AwardsBook`: đúng tài khoản, đọc hỏng không trao, trao từng cái, trùng không phải lỗi.
@MainActor
struct AwardsBookTests {
  final class FakeSource: AwardsSource, @unchecked Sendable {
    let lock = NSLock()
    var earnedRows: [EarnedAward] = []
    var earnedError: (any Error)?
    var raw = Awards.Raw(
      loggedDates: nil, frozen: [], workoutCount: nil, prCount: nil, steps: nil, mealCount: nil, waterDates: nil,
      sleepCount: nil, weighCount: nil)
    var refuse: [String: String?] = [:]
    var users: [String] = []
    var grants: [(String, String, String, [String: JSONValue])] = []

    func earned(userId: String) async throws -> [EarnedAward] {
      lock.withLock { users.append(userId) }
      if let earnedError { throw earnedError }
      return earnedRows
    }
    func raw(userId: String, today: LocalDate) async -> Awards.Raw {
      lock.withLock { users.append(userId) }
      return raw
    }
    func grant(userId: String, award: Awards.Def, title: String, description: String, metadata: [String: JSONValue])
      async throws(AwardGrantError)
    {
      lock.withLock { users.append(userId) }
      if let code = refuse[award.key] { throw AwardGrantError(code: code) }
      lock.withLock {
        grants.append((award.key, title, description, metadata))
        earnedRows.append(EarnedAward(key: award.key, earnedAt: nil))
      }
    }
  }

  func book(_ s: FakeSource) -> AwardsBook {
    AwardsBook(
      userId: "acct-A", source: s, today: { LocalDate("2026-10-08")! },
      englishText: { key in ("EN \(key)", "desc \(key)") })
  }

  @Test func grantsWhatIsEarnedOnceAndOnlyForThisAccount() async {
    let s = FakeSource()
    s.raw.workoutCount = 10
    s.earnedRows = [EarnedAward(key: "first_workout", earnedAt: nil)]
    let b = book(s)
    await b.load()
    #expect(b.phase == .ready)
    #expect(s.grants.map(\.0) == ["workouts_10"])
    #expect(s.grants[0].1 == "EN workouts_10" && s.grants[0].3 == ["count": .number(10)])
    #expect(b.newlyGranted == ["workouts_10"])
    #expect(b.earned.keys.sorted() == ["first_workout", "workouts_10"])
    #expect(Set(s.users) == ["acct-A"])
    // Mở lại trong cùng phiên: không xét lại.
    await b.load()
    #expect(s.grants.count == 1)
  }

  /// Không đọc được cái đã có → lỗi, và KHÔNG trao gì (xét trên tập rỗng sẽ trao lại mọi thứ).
  @Test func unreadableEarnedListGrantsNothing() async {
    let s = FakeSource()
    s.raw.workoutCount = 100
    s.earnedError = CocoaError(.fileReadUnknown)
    let b = book(s)
    await b.load()
    #expect(b.phase == .failed(.unavailable))
    #expect(s.grants.isEmpty)
  }

  /// Một cái bị từ chối không kéo cái khác; trùng (23505) không phải "vừa trao".
  @Test func refusalAndDuplicateStandAlone() async {
    let s = FakeSource()
    s.raw.loggedDates = [LocalDate("2026-10-08")!, LocalDate("2026-10-07")!, LocalDate("2026-10-06")!]
    s.raw.workoutCount = 1
    s.raw.steps = 10500
    s.refuse = ["streak_3": "42501", "first_workout": "23505"]
    let b = book(s)
    await b.load()
    #expect(s.grants.map(\.0) == ["steps_10k"])
    #expect(b.newlyGranted == ["steps_10k"])
  }

  /// Nguồn hỏng = không biết: không trao, không vẽ tiến độ.
  @Test func unreadSourcesAreNotZero() async {
    let s = FakeSource()
    let b = book(s)
    await b.load()
    #expect(s.grants.isEmpty)
    #expect(b.sources?.workoutCount == nil)
    #expect(Awards.progress(Awards.def("workouts_10")!, earned: false, current: b.sources?.workoutCount) == nil)
  }

  @Test func closedBookIgnoresLateResults() async {
    let s = FakeSource()
    s.raw.workoutCount = 1
    let b = book(s)
    b.close()
    await b.load()
    #expect(b.phase == .loading)
    #expect(s.grants.isEmpty)
  }
}
