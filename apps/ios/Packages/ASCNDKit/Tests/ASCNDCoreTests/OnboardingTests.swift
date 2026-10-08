import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Onboarding (#424) — `onboarding-flow.tsx` + cổng `_layout.tsx:292` @ fac9ac2.

private actor Store: OnboardingStore {
  var drafts: [String: OnboardingDraft] = [:]
  var completed: [String: Bool] = [:]
  func loadDraft(userId: String) async throws -> OnboardingDraft? { drafts[userId] }
  func saveDraft(userId: String, _ draft: OnboardingDraft) async throws { drafts[userId] = draft }
  func clearDraft(userId: String) async throws { drafts[userId] = nil }
  func loadCompleted(userId: String) async throws -> Bool? { completed[userId] }
  func saveCompleted(userId: String, _ done: Bool) async throws { completed[userId] = done }
}

private actor Writer: OnboardingWriter {
  var rows: [JSONValue] = []
  var failNext: (any Error)?
  func setFail(_ e: (any Error)?) { failNext = e }
  func completeOnboarding(userId: String, row: JSONValue) async throws {
    if let f = failNext {
      failNext = nil
      throw f
    }
    rows.append(row)
  }
}

private actor Status: OnboardingStatusSource {
  var value: Bool?
  var down = false
  init(_ v: Bool?) { value = v }
  func setDown(_ d: Bool) { down = d }
  func onboardingCompleted(userId: String) async throws -> Bool? {
    if down { throw URLError(.notConnectedToInternet) }
    return value
  }
}

/// 2026-10-05 14:00 Sài Gòn.
private let clock = ManualClock(EpochMillis(1_791_183_600_000))
private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

@MainActor
private func flow(_ store: Store, _ writer: Writer = Writer(), user: String = "u1", health: Bool = true) async -> OnboardingController {
  let c = OnboardingController(
    userId: user, store: store, writer: writer, healthAvailable: health, defaultUnits: ("cm", "kg"), clock: clock,
    timeZone: saigon)
  await c.load()
  return c
}

/// Đi hết luồng với các câu trả lời hợp lệ.
@MainActor
private func answerAll(_ c: OnboardingController, branch: OnboardingDraft.Branch = .body) {
  #expect(c.next())  // welcome → intention
  c.pickBranch(branch)
  #expect(c.next())
  if branch != .maintain {
    #expect(c.pickGoal(branch.goals[0]))
    #expect(c.next())
  }
  c.pickSex(.female)
  #expect(c.next())
  c.setDob(LocalDate("1995-06-15")!)
  #expect(c.next())
  c.setHeightCm("165")
  #expect(c.next())
  c.setWeightKg("58")
  #expect(c.next())
  #expect(c.pickActivity("light"))
  #expect(c.next())
  #expect(c.pickTraining("beginner"))
  #expect(c.next())  // → plan
  #expect(c.next())  // → health / ready
  if c.draft.step == .health { #expect(c.next()) }
}

@MainActor
struct OnboardingFlowTests {
  @Test func stepsInOrderWithEveryQuestionGated() async {
    let c = await flow(Store())
    #expect(c.draft.step == .welcome && c.progress.step == 0 && c.progress.total == 12)
    #expect(!c.canGoBack)
    #expect(c.next())
    #expect(c.draft.step == .intention && !c.canAdvance, "chưa chọn nhánh")
    #expect(!c.next())
    c.pickBranch(.body)
    #expect(c.draft.goal == nil, "nhánh nhiều giá trị: chưa có mục tiêu")
    #expect(c.next())
    #expect(c.draft.step == .goal && !c.canAdvance)
    #expect(!c.pickGoal("endurance"), "mục tiêu ngoài nhánh")
    #expect(c.pickGoal("cut") && c.next())
    #expect(c.draft.step == .sex && !c.canAdvance)
    c.pickSex(.male)
    #expect(c.next() && c.draft.step == .dob && c.canAdvance, "ngày sinh mặc định hợp lệ")
    #expect(c.next() && c.draft.step == .height)
    #expect(c.next() && c.draft.step == .weight)
    #expect(c.next() && c.draft.step == .activity && !c.canAdvance)
    #expect(!c.pickActivity("couch"))
    #expect(c.pickActivity("high") && c.next())
    #expect(c.draft.step == .experience && !c.canAdvance)
    #expect(c.pickTraining("advanced") && c.next())
    #expect(c.draft.step == .plan && c.next())
    #expect(c.draft.step == .health && c.next())
    #expect(c.draft.step == .ready && c.progress == (12, 12))
    #expect(!c.next(), "màn cuối là Xong, không phải Tiếp")
  }

  /// "Giữ đều": chọn nhánh là chọn mục tiêu; màn 03 vắng mặt ở CẢ HAI chiều;
  /// tiến độ đếm màn thật sự hiện.
  @Test func maintainSkipsGoalBothWays() async {
    let c = await flow(Store())
    #expect(c.next())
    c.pickBranch(.maintain)
    #expect(c.draft.goal == "maintain" && c.progress.total == 11)
    #expect(c.next() && c.draft.step == .sex)
    #expect(c.back() && c.draft.step == .intention)
    // Đổi ý sang nhánh khác: màn 03 trở lại, mục tiêu cũ bỏ.
    c.pickBranch(.capacity)
    #expect(c.draft.goal == nil && c.next() && c.draft.step == .goal)
  }

  /// Máy không có HealthKit: không mời điều không nhận lời được.
  @Test func noHealthKitSkipsHealth() async {
    let c = await flow(Store(), health: false)
    answerAll(c)
    #expect(c.draft.step == .ready && c.progress.total == 11)
    #expect(c.back() && c.draft.step == .plan)
  }

  /// Ngày sinh tương lai: báo ngay ở màn 06, không đợi tới màn 08.
  @Test func futureDobBlocksAtTheDobStep() async {
    let c = await flow(Store())
    #expect(c.next())
    c.pickBranch(.maintain)
    #expect(c.next())
    c.pickSex(.other)
    #expect(c.next() && c.draft.step == .dob)
    c.setDob(LocalDate("2027-01-01")!)
    #expect(c.dobInvalid && !c.canAdvance)
    c.setDob(LocalDate("2026-10-05")!)
    #expect(!c.dobInvalid && c.canAdvance, "sinh hôm nay: 0 tuổi, hợp lệ")
  }

  /// Màn cân nặng khoá theo cổng số đo; số ngoài cận không qua.
  @Test func weightStepGatesOnBodyStats() async {
    let c = await flow(Store())
    #expect(c.next())
    c.pickBranch(.maintain)
    #expect(c.next())
    c.pickSex(.male)
    #expect(c.next() && c.next())
    c.setHeightCm("17")  // gõ nhầm
    #expect(c.canAdvance, "màn chiều cao chưa khoá — cổng đứng ở màn cân nặng")
    #expect(c.next() && c.draft.step == .weight && !c.canAdvance)
    #expect(c.attempt.missing == [.heightCm])
    c.setHeightCm("172")
    c.setWeightKg("401")
    #expect(!c.canAdvance && c.attempt.missing == [.weightKg])
    c.setWeightKg("72.5")
    #expect(c.canAdvance)
  }

  /// Câu ghi cuối: đúng các cột của RN, kế hoạch từ cổng, đơn vị đã chọn,
  /// không có `name`.
  @Test func finishWritesTheProfileRowOnce() async throws {
    let store = Store()
    let writer = Writer()
    var done = 0
    let c = OnboardingController(
      userId: "u1", store: store, writer: writer, healthAvailable: true, clock: clock, timeZone: saigon,
      onFinished: { done += 1 })
    await c.load()
    answerAll(c)
    c.setUnits(weight: "lbs")
    #expect(await c.finish())
    #expect(!(await c.finish()), "bấm lại không ghi lần hai")
    let rows = await writer.rows
    #expect(rows.count == 1 && done == 1)
    let row = try #require(rows.first)
    #expect(row["onboarding_completed"]?.boolValue == true)
    #expect(row["name"] == nil)
    #expect(row["goal"]?.stringValue == "bulk" && row["sex"]?.stringValue == "female")
    #expect(row["dob"]?.stringValue == "1995-06-15")
    #expect(row["height_cm"]?.doubleValue == 165 && row["weight_kg"]?.doubleValue == 58)
    #expect(row["units_height"]?.stringValue == "cm" && row["units_weight"]?.stringValue == "lbs")
    let plan = try #require(c.attempt.plan)
    #expect(row["tdee_target_kcal"]?.intValue == plan.targetKcal && row["water_target_ml"]?.intValue == plan.waterMl)
    #expect(await store.drafts["u1"] == nil, "xong thì bỏ nháp")
    #expect(c.finished && !c.next() && !c.back())
  }

  /// Ghi hỏng: báo lỗi có tên, ở lại màn cuối, thử lại được.
  @Test func finishFailureIsRetryable() async {
    let writer = Writer()
    let c = await flow(Store(), writer)
    answerAll(c)
    await writer.setFail(URLError(.notConnectedToInternet))
    #expect(!(await c.finish()))
    #expect(c.failure == .offline && !c.finished && c.draft.step == .ready)
    #expect(await c.finish())
    #expect(c.failure == nil)
  }
}

@MainActor
struct OnboardingPersistenceTests {
  /// Kill giữa chừng: mở lại đúng màn, đúng câu trả lời.
  @Test func resumesAfterKill() async {
    let store = Store()
    let c = await flow(store)
    #expect(c.next())
    c.pickBranch(.body)
    #expect(c.next())
    #expect(c.pickGoal("recomp"))
    await c.settled()
    let again = await flow(store)
    #expect(again.draft.step == .goal && again.draft.goal == "recomp" && again.draft.branch == .body)
    #expect(again.canAdvance)
  }

  /// Màn đã lưu vắng mặt lúc mở lại (HealthKit tắt): lùi về màn hiện gần nhất.
  @Test func resumeOnASkippedStepFallsBack() async {
    let store = Store()
    let c = await flow(store)
    answerAll(c)
    #expect(c.back() && c.draft.step == .health)
    await c.settled()
    let again = await flow(store, health: false)
    #expect(again.draft.step == .plan)
  }

  /// Đổi tài khoản: người sau không thấy nháp của người trước.
  @Test func draftsArePerAccount() async {
    let store = Store()
    let a = await flow(store, user: "u1")
    #expect(a.next())
    a.pickBranch(.capacity)
    await a.settled()
    let b = await flow(store, user: "u2")
    #expect(b.draft == OnboardingDraft() && b.draft.step == .welcome)
    let back = await flow(store, user: "u1")
    #expect(back.draft.branch == .capacity)
  }
}

@MainActor
struct OnboardingGateTests {
  @Test func gateFollowsTheProfileFlag() async {
    let store = Store()
    let notYet = OnboardingGate(userId: "u1", source: Status(false), store: store)
    await notYet.check()
    #expect(notYet.state == .needsOnboarding)
    let done = OnboardingGate(userId: "u1", source: Status(true), store: store)
    await done.check()
    #expect(done.state == .completed)
    // Không có hàng hồ sơ: vào app, như RN.
    let none = OnboardingGate(userId: "u2", source: Status(nil), store: Store())
    await none.check()
    #expect(none.state == .completed)
  }

  /// Người quay lại khi offline: cờ trên máy quyết, không màn chờ, không lỗi.
  @Test func offlineUsesTheLastKnownFlag() async {
    let store = Store()
    await OnboardingGate(userId: "u1", source: Status(true), store: store).check()
    let source = Status(true)
    await source.setDown(true)
    let gate = OnboardingGate(userId: "u1", source: source, store: store)
    await gate.check()
    #expect(gate.state == .completed)
  }

  /// Lần đầu, offline, không có bản nhớ: nói thật, không vào app với số mặc định.
  @Test func firstLaunchOfflineFails() async {
    let source = Status(false)
    await source.setDown(true)
    let gate = OnboardingGate(userId: "u1", source: source, store: Store())
    await gate.check()
    #expect(gate.state == .failed(.offline))
    await source.setDown(false)
    await gate.check()
    #expect(gate.state == .needsOnboarding)
  }

  /// Cổng và luồng nối như `AppServices.makeOnboarding` (#527 1.3): ghi xong
  /// thì cổng mở ra app; ghi hỏng thì cổng giữ người dùng ở lại luồng.
  @Test func finishingTheFlowOpensTheGate() async {
    let store = Store()
    let writer = Writer()
    let gate = OnboardingGate(userId: "u1", source: Status(false), store: store)
    await gate.check()
    #expect(gate.state == .needsOnboarding)
    let c = OnboardingController(
      userId: "u1", store: store, writer: writer, healthAvailable: false, clock: clock, timeZone: saigon,
      onFinished: { [weak gate] in await gate?.completed() })
    await c.load()
    answerAll(c)
    await writer.setFail(URLError(.notConnectedToInternet))
    #expect(!(await c.finish()))
    #expect(c.failure == .offline && gate.state == .needsOnboarding)
    #expect(await c.finish())
    #expect(gate.state == .completed)
    #expect(await store.completed["u1"] == true)
  }

  /// Luồng xong → cổng mở, và nhớ cho lần mở sau offline.
  @Test func completingOpensTheGateForGood() async {
    let store = Store()
    let gate = OnboardingGate(userId: "u1", source: Status(false), store: store)
    await gate.check()
    await gate.completed()
    #expect(gate.state == .completed)
    let source = Status(false)
    await source.setDown(true)
    let next = OnboardingGate(userId: "u1", source: source, store: store)
    await next.check()
    #expect(next.state == .completed)
  }
}

/// Đơn vị và thước của màn 07 / 08 (#527 1.3).
@MainActor
struct OnboardingUnitsTests {
  /// `hPick ?? units.height`: chưa chọn thì theo hồ sơ — kể cả hồ sơ về muộn
  /// hơn lần dựng; chọn rồi thì hồ sơ thôi có tiếng nói.
  @Test func profileUnitsApplyUntilTheUserPicks() async {
    let c = await flow(Store())
    #expect(c.heightUnit == "cm" && c.weightUnit == "kg")
    c.setDefaultUnits(height: "in", weight: "lbs")
    #expect(c.heightUnit == "in" && c.weightUnit == "lbs")
    c.setUnits(height: "cm")
    c.setDefaultUnits(height: "in", weight: "kg")
    #expect(c.heightUnit == "cm", "đã chọn trong luồng")
    #expect(c.weightUnit == "kg", "chưa chọn: theo hồ sơ mới nhất")
    // Giá trị lạ trong hồ sơ: hệ mét (`useUnits`).
    c.setDefaultUnits(height: "ft", weight: nil)
    #expect(c.weightUnit == "kg")
  }

  /// Câu ghi cuối mang đơn vị đang HIỆN — kể cả khi nó đến từ hồ sơ.
  @Test func rowCarriesTheUnitsOnScreen() async throws {
    let c = await flow(Store())
    c.setDefaultUnits(height: "in", weight: "lbs")
    answerAll(c)
    let row = try #require(c.profileRow())
    #expect(row["units_height"]?.stringValue == "in" && row["units_weight"]?.stringValue == "lbs")
  }

  /// Thước ghi đúng câu của RN cho vạch; đổi đơn vị thì hạt giống đọc lại từ
  /// số đang lưu, và đặt thước vào hạt giống ghi số ấy về vạch của thang mới.
  @Test func rulerCommitsOnTheGrainOfTheUnitShown() async {
    let c = await flow(Store())
    #expect(c.draft.heightCm == "170" && c.rulerIndex(.height) == 700)
    c.commitRuler(.height, index: 700)
    #expect(c.draft.heightCm == "170", "vạch của chính số đang lưu: không đổi")
    c.setUnits(height: "in")
    #expect(c.rulerIndex(.height) == 275)
    c.commitRuler(.height, index: c.rulerIndex(.height))
    #expect(c.draft.heightCm == "169.9", "170 cm không nằm trên thước inch")
    c.setUnits(height: "cm")
    #expect(c.rulerIndex(.height) == 699)
    // Kẹp ở hai đầu, không bao giờ ghi số ngoài cận.
    c.commitRuler(.weight, index: 1_000_000)
    #expect(c.draft.weightKg == "400")
    c.commitRuler(.weight, index: -5)
    #expect(c.draft.weightKg == "20")
  }
}

struct OnboardingFailureCopyTests {
  /// `classifyError` + `FAILURE_KEY` của RN, trên những gì native mang về.
  @Test func failuresMapToTheSameSentenceAsRN() {
    #expect(OnboardingFailure.offline.copy == .onlineOnly)
    #expect(OnboardingFailure.statsRequired.copy == .statsRequired)
    #expect(OnboardingFailure.server(code: "42501").copy == .signedOut)
    #expect(OnboardingFailure.server(code: "PGRST301").copy == .signedOut)
    #expect(OnboardingFailure.server(code: "23514").copy == .invalid)
    #expect(OnboardingFailure.server(code: "23505").copy == .duplicate)
    #expect(OnboardingFailure.server(code: "42P01").copy == .server)
    #expect(OnboardingFailure.server(code: "XX000").copy == .unknown, "mã lạ: không đưa chữ thô ra màn")
    #expect(OnboardingFailure.server(code: nil).copy == .unknown)
  }
}
