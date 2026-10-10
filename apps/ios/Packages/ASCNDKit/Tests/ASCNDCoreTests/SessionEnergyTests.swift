@testable import ASCNDCore
import Foundation
import Testing

/// Kcal ước lượng mỗi buổi (#527, bước Core). Golden THẬT: `lib/energy.ts` +
/// `activity.ts` + `prescription.ts` + `fitness-calc.ts` + `plausible.ts` @
/// fac9ac2 biên dịch (`Fixtures/session-energy-golden.json`,
/// `gen-session-energy.mjs`, `Date` ghim theo `today` của từng ca).
///
/// So CHÍNH XÁC: chỉ có cộng / nhân / chia, cùng thứ tự phép tính với RN —
/// không có hàm siêu việt nào để lệch ulp.
struct SessionEnergyGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "session-energy-golden", withExtension: "json", subdirectory: "Fixtures"))
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

  static func same(_ a: Double, _ b: Double?) -> Bool {
    guard let b else { return false }
    return a == b || (a.isNaN && b.isNaN)
  }

  static func sex(_ v: JSONValue?) -> FitnessCalc.Sex? {
    switch v {
    case .string("male")?: return .male
    case .string("female")?: return .female
    case .string("other")?: return .other
    default: return nil
    }
  }

  /// Một `EnergyProfile` của golden (`null` → `nil`).
  static func body(_ v: JSONValue?) -> SessionEnergy.Body? {
    guard let v, v != .null, let w = num(v["weight_kg"]), let h = num(v["height_cm"]), let a = num(v["age"]),
      let s = sex(v["sex"])
    else { return nil }
    return SessionEnergy.Body(weightKg: w, heightCm: h, age: Int(a), sex: s)
  }

  /// Kcal mong đợi: số nguyên hữu hạn → số ấy; `null` / không hữu hạn / ngoài
  /// tầm `Int` → `nil` (khác RN có chủ đích: không hiện `~∞ kcal`).
  static func expectedKcal(_ v: JSONValue?) -> Int? {
    guard let d = num(v), d.isFinite else { return nil }
    return Int(exactly: d)
  }

  @Test func rtMetMatchesRN() throws {
    let m = try Self.golden()["RT_MET"]
    #expect(SessionEnergy.RTMet.light == Self.num(m?["light"]))
    #expect(SessionEnergy.RTMet.moderate == Self.num(m?["moderate"]))
    #expect(SessionEnergy.RTMet.vigorous == Self.num(m?["vigorous"]))
    #expect(SessionEnergy.RTMet.bodyweight == Self.num(m?["bodyweight"]))
    #expect(SessionEnergy.RTMet.bodyweightHard == Self.num(m?["bodyweightHard"]))
  }

  /// RPE 5 / 8, có tạ / không tạ, set không làm việc, ô dạng chuỗi / mảng / hỏng.
  @Test func metForSessionMatchesRN() throws {
    let cases = Self.array(try Self.golden()["met"])
    #expect(cases.count >= 200)
    for c in cases {
      let got = SessionEnergy.met(sets: Self.array(c["sets"]), rpe: c["rpe"])
      #expect(Self.same(got, Self.num(c["expected"])), "\(c)")
    }
  }

  /// Kể cả `restSeconds: "abc"` → `NaN` phút, và không có set có rep → 0.
  @Test func trainingMinutesMatchesRN() throws {
    let cases = Self.array(try Self.golden()["minutes"])
    #expect(cases.contains { $0["expected"] == .string("NaN") })
    #expect(cases.contains { $0["expected"] == .number(0) })
    for c in cases {
      let got = SessionEnergy.trainingMinutes(Self.array(c["sets"]))
      #expect(Self.same(got, Self.num(c["expected"])), "\(c)")
    }
  }

  /// Cận `plausible` (20–400 kg, 100–250 cm), tuổi 0…130, BMR ≤ 0.
  @Test func restingKcalPerMinMatchesRN() throws {
    let cases = Self.array(try Self.golden()["resting"])
    #expect(cases.contains { $0["expected"] == .null })
    #expect(cases.contains { $0["expected"] != .null })
    for c in cases {
      let w = try #require(Self.num(c["weight_kg"]))
      let h = try #require(Self.num(c["height_cm"]))
      let a = try #require(Self.num(c["age"]))
      let s = try #require(Self.sex(c["sex"]))
      let got = SessionEnergy.restingKcalPerMin(weightKg: w, heightCm: h, age: Int(a), sex: s)
      if c["expected"] == .null {
        #expect(got == nil, "\(c)")
      } else {
        #expect(got == Self.num(c["expected"]), "\(c)")
      }
    }
  }

  /// Hồ sơ thiếu / ngoài cận, phút 0 / âm / NaN.
  @Test func sessionActiveKcalMatchesRN() throws {
    let cases = Self.array(try Self.golden()["active"])
    #expect(cases.contains { $0["expected"] == .null })
    #expect(cases.contains { Self.expectedKcal($0["expected"]) != nil })
    for c in cases {
      let minutes = try #require(Self.num(c["minutes"]))
      let got = SessionEnergy.activeKcal(
        sets: Self.array(c["sets"]), rpe: c["rpe"], minutes: minutes, body: Self.body(c["profile"]))
      #expect(got == Self.expectedKcal(c["expected"]), "\(c)")
    }
  }

  /// Ngày sinh tương lai / hỏng / tràn tháng (`2001-02-29` → 1/3), tuổi 130 /
  /// 131, `sex` lạ → `other`, cân / cao dạng chuỗi, thiếu cột.
  @Test func energyProfileFromMatchesRN() throws {
    let cases = Self.array(try Self.golden()["profileFrom"])
    #expect(cases.contains { $0["expected"] == .null })
    #expect(cases.contains { $0["expected"] != .null })
    for c in cases {
      guard case .string(let t)? = c["today"], let today = LocalDate(t) else {
        Issue.record("today hỏng: \(c)")
        continue
      }
      let got = SessionEnergy.body(row: c["row"], today: today)
      #expect(got == Self.body(c["expected"]), "\(c)")
    }
  }

  /// 200 hàng seed + `sets` không phải mảng, hàng `null`, hồ sơ `null`.
  @Test func sessionKcalOfMatchesRN() throws {
    let cases = Self.array(try Self.golden()["rows"])
    #expect(cases.count >= 200)
    #expect(cases.filter { Self.expectedKcal($0["expected"]) != nil }.count >= 50)
    for c in cases {
      let row = c["row"]
      let body = Self.body(c["profile"])
      let got: Int? = (row == nil || row == .null) ? nil : SessionEnergy.kcal(sets: row?["sets"], rpe: row?["session_rpe"], body: body)
      #expect(got == Self.expectedKcal(c["expected"]), "\(c)")
    }
  }
}

/// Phần native thêm quanh luật RN: hàng lịch sử, mô hình `Profile`, và hai
/// khác biệt có chủ đích.
struct SessionEnergyNativeTests {
  static let man = SessionEnergy.Body(weightKg: 70, heightCm: 175, age: 30, sex: .male)

  static func set(_ reps: Double, _ weight: Double, rest: Double = 90) -> JSONValue {
    .object(["reps": .number(reps), "weight": .number(weight), "restSeconds": .number(rest)])
  }

  /// Ví dụ đọc được của báo cáo audit: 3×10 @60 kg, nghỉ 90 giây = 6 phút.
  @Test func auditExample() {
    let loaded: JSONValue = .array([Self.set(10, 60), Self.set(10, 60), Self.set(10, 60)])
    let bodyweight: JSONValue = .array([Self.set(10, 0), Self.set(10, 0), Self.set(10, 0)])
    #expect(SessionEnergy.kcal(sets: loaded, rpe: .number(7), body: Self.man) == 27)
    #expect(SessionEnergy.kcal(sets: loaded, rpe: .number(8), body: Self.man) == 34)
    #expect(SessionEnergy.kcal(sets: bodyweight, rpe: .number(9), body: Self.man) == 38)
  }

  /// Hàng lịch sử: `sessionRpe` đã là số nguyên (null → 0) cho cùng MET với
  /// RN; hàng cache không có `sets` → `nil`, không bịa.
  @Test func historyEntry() {
    let sets: JSONValue = .array([Self.set(10, 60), Self.set(10, 60), Self.set(10, 60)])
    func entry(rpe: Int, sets: JSONValue?) -> HistoryEntry {
      HistoryEntry(
        id: "s", at: EpochMillis(Date(timeIntervalSince1970: 0)), templateName: "W", sessionRpe: rpe, volumeKg: 1800,
        prDetected: false, completedSets: 3, exerciseCount: 1, sets: sets)
    }
    #expect(SessionEnergy.kcal(of: entry(rpe: 7, sets: sets), body: Self.man) == 27)
    #expect(SessionEnergy.kcal(of: entry(rpe: 8, sets: sets), body: Self.man) == 34)
    // `Number(null)` = 0 ở RN: nhánh "nhẹ" — cùng số với RPE 0.
    #expect(
      SessionEnergy.kcal(of: entry(rpe: 0, sets: sets), body: Self.man)
        == SessionEnergy.kcal(sets: sets, rpe: .null, body: Self.man))
    #expect(SessionEnergy.kcal(of: entry(rpe: 7, sets: nil), body: Self.man) == nil)
    #expect(SessionEnergy.kcal(of: entry(rpe: 7, sets: sets), body: nil) == nil)
  }

  /// `Profile` đã đọc → cùng luật `energyProfileFrom`; thiếu một cột là không có.
  @Test func fromProfileModel() throws {
    let today = try #require(LocalDate("2026-10-10"))
    var p = Profile(userId: "u1")
    p.weightKg = 70
    p.heightCm = 175
    p.dob = LocalDate("1996-10-11")
    p.sex = "male"
    #expect(SessionEnergy.body(profile: p, today: today) == SessionEnergy.Body(weightKg: 70, heightCm: 175, age: 29, sex: .male))
    p.sex = nil
    #expect(SessionEnergy.body(profile: p, today: today)?.sex == .other)
    p.dob = nil
    #expect(SessionEnergy.body(profile: p, today: today) == nil)
    p.dob = LocalDate("2027-01-01")
    #expect(SessionEnergy.body(profile: p, today: today) == nil, "ngày sinh tương lai")
    #expect(SessionEnergy.body(profile: nil, today: today) == nil)
  }

  /// Khác RN có chủ đích: phần tử `null` trong `sets` (RN: TypeError, màn đỏ)
  /// là một set không có rep — bỏ qua, các set còn lại vẫn tính.
  @Test func nullSetElementIsSkipped() {
    let clean: JSONValue = .array([Self.set(10, 60), Self.set(10, 60), Self.set(10, 60)])
    let dirty: JSONValue = .array([.null, Self.set(10, 60), Self.set(10, 60), .null, Self.set(10, 60)])
    #expect(SessionEnergy.kcal(sets: dirty, rpe: .number(7), body: Self.man) == 27)
    #expect(
      SessionEnergy.kcal(sets: dirty, rpe: .number(7), body: Self.man)
        == SessionEnergy.kcal(sets: clean, rpe: .number(7), body: Self.man))
    #expect(SessionEnergy.kcal(sets: .array([.null]), rpe: .number(7), body: Self.man) == nil)
  }

  /// Khác RN có chủ đích: rep `"Infinity"` → RN `~∞ kcal`; ở đây không có số.
  /// Một con số không biểu diễn được thành số nguyên cũng vậy.
  @Test func nonFiniteIsNoNumber() {
    let inf: JSONValue = .array([.object(["reps": .string("Infinity"), "weight": .number(60)])])
    #expect(SessionEnergy.trainingMinutes(SessionEnergyGoldenTests.array(inf)) == .infinity)
    #expect(SessionEnergy.kcal(sets: inf, rpe: .number(7), body: Self.man) == nil)
    let huge: JSONValue = .array([.object(["reps": .number(1e300), "weight": .number(60)])])
    #expect(SessionEnergy.kcal(sets: huge, rpe: .number(7), body: Self.man) == nil)
  }

  /// Không bao giờ đọc kcal theo ngày: một hàng có `active_kcal` mà không có
  /// `sets` dùng được thì vẫn là không có số.
  @Test func neverUsesDailyActiveKcal() {
    let row: JSONValue = .object(["active_kcal": .number(450), "session_rpe": .number(7)])
    #expect(SessionEnergy.kcal(sets: row["sets"], rpe: row["session_rpe"], body: Self.man) == nil)
  }
}
