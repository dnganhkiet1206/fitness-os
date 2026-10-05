import ASCNDCore
import Foundation
import Testing

/// Hồ sơ (#425) — `useProfile` + `app/edit-profile.tsx` @ fac9ac2.

private let today = LocalDate("2026-10-05")!

private let storedRow: JSONValue = .object([
  "user_id": .string("U1"), "name": .string("Kiệt"), "dob": .string("1995-06-15"), "sex": .string("male"),
  "activity_level": .string("high"), "training_level": .string("advanced"), "dietary_preference": .null,
  "height_cm": .number(176), "weight_kg": .string("78.5"), "goal": .string("cut"),
  "tdee_target_kcal": .number(2300), "macro_protein_g": .null, "water_target_ml": .number(2700),
  "units_weight": .string("lbs"), "units_height": .null, "sleep_target_bedtime": .string("22:30:00"),
  "allergies": .array([.string("Sữa"), .string("Peanuts"), .string("Mango")]),
  "disliked_foods": .array([.string("okra"), .string("liver")]), "onboarding_completed": .bool(true),
])

struct ProfileModelTests {
  /// Đọc khoan dung (số dạng chuỗi), cột null là nil — không có số bịa.
  @Test func rowDecodes() throws {
    let p = try #require(Profile(row: storedRow))
    #expect(p.userId == "u1" && p.weightKg == 78.5 && p.heightCm == 176 && p.macroProteinG == nil)
    #expect(p.dob == LocalDate("1995-06-15") && p.unitsHeight == nil && p.onboardingCompleted == true)
    #expect(Profile(row: .object(["name": .string("x")])) == nil, "không có user_id")
  }

  /// Form mở trên hồ sơ: mặc định của RN chỉ cho cột trống; số trống là ô
  /// trống; giờ cắt về HH:MM; dị ứng nhãn Việt về khoá.
  @Test func formSeedsFromProfile() throws {
    let f = ProfileForm(try #require(Profile(row: storedRow)))
    #expect(f.weightKg == "78.5" && f.heightCm == "176" && f.macroProteinG == "")
    #expect(f.dietaryPreference == "omnivore" && f.unitsHeight == "cm" && f.unitsWeight == "lbs")
    #expect(f.sleepTargetBedtime == "22:30" && f.sleepTargetWaketime == "07:00")
    #expect(f.allergies == ["Dairy", "Peanuts", "Mango"])
    #expect(f.dislikes == "okra, liver")
  }

  /// Chiều cao / cân nặng: trống ghi null, sai dạng / ngoài cận khoá nút Lưu.
  @Test func statsBlankOrValidOrRefused() {
    var f = ProfileForm()
    #expect(!f.statsBad && f.updateRow()?["height_cm"] == .null && f.updateRow()?["weight_kg"] == .null)
    for bad in ["17", "251", "1e2", "17O", "-170"] {
      f.heightCm = bad
      #expect(f.statsBad && f.updateRow() == nil, "\(bad)")
    }
    f.heightCm = " 182.5 "
    f.weightKg = "401"
    #expect(f.statsBad)
    f.weightKg = "80"
    #expect(f.updateRow()?["height_cm"]?.doubleValue == 182.5 && f.updateRow()?["weight_kg"]?.doubleValue == 80)
  }

  /// Mục tiêu theo `Number(x) || null`: trống / 0 / chữ → null.
  @Test func targetsWriteNumberOrNull() throws {
    var f = ProfileForm()
    f.tdeeTargetKcal = "2400"
    f.macroProteinG = "0"
    f.macroCarbsG = "abc"
    f.macroFatG = " 70 "
    let row = try #require(f.updateRow())
    #expect(row["tdee_target_kcal"]?.doubleValue == 2400 && row["macro_fat_g"]?.doubleValue == 70)
    #expect(row["macro_protein_g"] == .null && row["macro_carbs_g"] == .null && row["water_target_ml"] == .null)
    #expect(row["dob"] == .null && row["sleep_target_bedtime_set"]?.boolValue == true)
    #expect(row["user_id"] == nil, "update theo eq('user_id'), không ghi user_id")
  }

  /// "Tính lại": thiếu số đo thì từ chối và nói đúng ô thiếu, không đụng mục
  /// tiêu đang có (từng ra 2539 kcal cho một hồ sơ trống).
  @Test func recalcRefusesWithoutStats() {
    var f = ProfileForm()
    f.tdeeTargetKcal = "2100"
    #expect(f.recalcTargets(today: today) == [.heightCm, .weightKg, .dob])
    #expect(f.tdeeTargetKcal == "2100")
    f.heightCm = "176"
    f.weightKg = "78"
    f.dob = "1995-06-15"
    f.goal = "cut"
    #expect(f.recalcTargets(today: today).isEmpty)
    let plan = FitnessCalc.planFromEntry(
      heightText: "176", weightText: "78", dob: LocalDate("1995-06-15"), sex: .male, goal: "cut",
      activityLevel: "moderate", today: today
    ).plan
    #expect(f.tdeeTargetKcal == plan.map { String($0.targetKcal) } && f.waterTargetMl == plan.map { String($0.waterMl) })
  }

  @Test func dislikesAndAllergies() {
    #expect(FoodPreferences.parseDislikes(" okra, ,liver ,") == ["okra", "liver"])
    #expect(FoodPreferences.canonicalAllergy("hải sản") == "Shellfish")
    #expect(FoodPreferences.canonicalAllergy("Kiwi") == "Kiwi")
  }

  @Test func units() {
    #expect(Units.displayWeight(80, unit: "lbs") == 176.4)
    #expect(Units.displayWeight(80, unit: "kg") == 80)
    #expect(abs(Units.weightToKg(176.4, unit: "lbs") - 80.01) < 0.01)
    #expect(Units.displayHeight(180, unit: "in") == 70.9)
    #expect(Units.heightToCm(70, unit: "in") == 177.8)
  }
}

private actor Source: ProfileSource {
  var row: JSONValue?
  var down = false
  init(_ r: JSONValue?) { row = r }
  func setDown(_ d: Bool) { down = d }
  func profile(userId: String) async throws -> JSONValue? {
    if down { throw URLError(.notConnectedToInternet) }
    return row
  }
}
private actor Writer: ProfileWriter {
  var rows: [JSONValue] = []
  var fail: (any Error)?
  func setFail(_ e: (any Error)?) { fail = e }
  func update(userId: String, row: JSONValue) async throws {
    if let f = fail { throw f }
    rows.append(row)
  }
}
private actor Cache: ProfileCache {
  var store: [String: Profile] = [:]
  func load(userId: String) async throws -> Profile? { store[userId] }
  func save(userId: String, _ profile: Profile) async throws { store[userId] = profile }
}

@MainActor
struct ProfileBookTests {
  @Test func loadsAndCachesPerUser() async throws {
    let source = Source(storedRow)
    let cache = Cache()
    let book = ProfileBook(userId: "u1", source: source, writer: Writer(), cache: cache)
    await book.load()
    #expect(book.profile?.weightKg == 78.5)
    await source.setDown(true)
    let again = ProfileBook(userId: "u1", source: source, writer: Writer(), cache: cache)
    await again.load()
    #expect(again.profile?.weightKg == 78.5 && again.failure == .offline)
    let other = ProfileBook(userId: "u2", source: source, writer: Writer(), cache: cache)
    await other.load()
    #expect(other.profile == nil, "người khác không thấy hồ sơ trên máy")
  }

  /// Hàng của người khác (RLS hỏng) không thành hồ sơ của mình.
  @Test func foreignRowIsIgnored() async {
    let book = ProfileBook(userId: "u2", source: Source(storedRow), writer: Writer(), cache: Cache())
    await book.load()
    #expect(book.profile == nil)
  }

  /// Lưu: đúng hàng của form; hồ sơ trên máy theo ngay.
  @Test func saveUpdatesTheLocalProfile() async throws {
    let writer = Writer()
    let book = ProfileBook(userId: "u1", source: Source(storedRow), writer: writer, cache: Cache())
    await book.load()
    var f = book.makeForm()
    f.weightKg = "80"
    f.goal = "bulk"
    try await book.save(f)
    #expect(await writer.rows.count == 1)
    #expect(book.profile?.weightKg == 80 && book.profile?.goal == "bulk" && book.profile?.onboardingCompleted == true)
  }

  @Test func saveFailuresAreNamed() async {
    let writer = Writer()
    let book = ProfileBook(userId: "u1", source: Source(storedRow), writer: writer, cache: Cache())
    await book.load()
    var bad = book.makeForm()
    bad.heightCm = "17"
    await #expect(throws: ProfileSaveFailure.invalidStats) { try await book.save(bad) }
    await writer.setFail(ProfileSaveFailure.nothingWritten)
    await #expect(throws: ProfileSaveFailure.nothingWritten) { try await book.save(book.makeForm()) }
    await writer.setFail(URLError(.notConnectedToInternet))
    await #expect(throws: ProfileSaveFailure.offline) { try await book.save(book.makeForm()) }
    #expect(book.profile?.weightKg == 78.5, "lưu hỏng không đổi hồ sơ trên máy")
  }
}
