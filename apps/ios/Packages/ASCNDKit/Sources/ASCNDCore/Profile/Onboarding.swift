public import Foundation
public import Observation

/// Onboarding (#424) — `components/ascnd/onboarding-flow.tsx` + cổng
/// `app/_layout.tsx:292` @ fac9ac2. Chỉ tầng dữ liệu / ứng dụng: thứ tự màn,
/// luật bỏ màn, luật mở nút Tiếp, câu ghi cuối. Lời văn, hình, thước là của C.
///
/// RN behavior:
/// - cổng: đã đăng nhập, hồ sơ đọc được mà `onboarding_completed` chưa bật →
///   luồng onboarding; đọc hỏng mà không có bản nhớ → "không đọc được" + thử
///   lại + đăng xuất;
/// - 12 màn theo thứ tự cố định; bỏ màn `goal` khi nhánh là "giữ đều" (nhánh
///   một giá trị), bỏ màn `health` khi máy không có HealthKit — bỏ ở CẢ HAI
///   chiều Tiếp / Quay lại; thanh tiến độ đếm màn thật sự hiện;
/// - nút Tiếp mở khi câu của màn ấy đã trả lời; màn cân nặng khoá thêm theo
///   cổng số đo (`planFromEntry`), màn cuối cũng vậy;
/// - xong: MỘT lần `upsert profiles … onConflict user_id` với số đo, mục tiêu,
///   kế hoạch tính từ cổng, đơn vị đã chọn và `onboarding_completed: true`
///   (không ghi `name` — trigger đăng ký đã ghi tên thật); cần mạng;
/// - trạng thái nằm trong bộ nhớ: app bị kill là làm lại từ màn đầu.
/// Native behavior: như trên; bản nháp bền THEO NGƯỜI DÙNG — kill rồi mở lại
///   về đúng màn và đúng câu trả lời (#424 "resume after kill"); tài khoản khác
///   không bao giờ thấy nháp của người trước.
public struct OnboardingDraft: Sendable, Hashable, Codable {
  public enum Step: String, Sendable, Hashable, Codable, CaseIterable {
    case welcome, intention, goal, sex, dob, height, weight, activity, experience, plan, health, ready
  }

  /// Màn 02: nhánh; màn 03 chọn mục tiêu trong nhánh (`BRANCHES`).
  public enum Branch: String, Sendable, Hashable, Codable, CaseIterable {
    case body, capacity, maintain

    public var goals: [String] {
      switch self {
      case .body: ["bulk", "cut", "recomp"]
      case .capacity: ["strength", "endurance"]
      case .maintain: ["maintain"]
      }
    }
  }

  /// `ACTIVITY` (`:1356`), `LEVELS` (`:1377`).
  public static let activityLevels = ["sedentary", "light", "moderate", "high", "athlete"]
  public static let trainingLevels = ["beginner", "intermediate", "advanced"]
  /// `DEFAULT_CM`, `DEFAULT_KG`; ngày sinh mặc định 2000-01-01 — chỗ đứng
  /// của thước khi chưa biết gì, không phải phép đoán.
  public static let defaultHeight = "170"
  public static let defaultWeight = "70"
  public static let defaultDob = LocalDate("2000-01-01")!

  public var step: Step = .welcome
  public var branch: Branch?
  public var goal: String?
  public var sex: FitnessCalc.Sex?
  public var dob: LocalDate = OnboardingDraft.defaultDob
  /// Chữ của thước, luôn theo cm / kg (đơn vị chỉ đổi cách hiển thị).
  public var heightCm: String = OnboardingDraft.defaultHeight
  public var weightKg: String = OnboardingDraft.defaultWeight
  public var activityLevel: String?
  public var trainingLevel: String?
  /// Đơn vị người dùng chọn; `nil` = theo cài đặt hiện tại.
  public var heightUnit: String?
  public var weightUnit: String?

  public init() {}
}

/// Luật của luồng — thuần, để test đủ mọi hoán vị.
public enum OnboardingRules {
  /// `skip`: màn vắng mặt.
  public static func skips(_ step: OnboardingDraft.Step, _ d: OnboardingDraft, healthAvailable: Bool) -> Bool {
    (step == .goal && d.branch == .maintain) || (step == .health && !healthAvailable)
  }

  /// Các màn thật sự hiện, theo thứ tự.
  public static func shown(_ d: OnboardingDraft, healthAvailable: Bool) -> [OnboardingDraft.Step] {
    OnboardingDraft.Step.allCases.filter { !skips($0, d, healthAvailable: healthAvailable) }
  }

  /// Cổng số đo (`planFromEntry`) với đúng các giá trị dự phòng của RN cho
  /// phần chưa trả lời (`sex || 'other'`, `goal || 'maintain'`,
  /// `activity_level || 'moderate'`) — để màn kế hoạch có số trước khi xong.
  public static func attempt(_ d: OnboardingDraft, today: LocalDate) -> FitnessCalc.Attempt {
    FitnessCalc.planFromEntry(
      heightText: d.heightCm, weightText: d.weightKg, dob: d.dob, sex: d.sex ?? .other, goal: d.goal ?? "maintain",
      activityLevel: d.activityLevel ?? "moderate", today: today)
  }

  /// `unanswered`: màn này hỏi một điều mà chưa có câu trả lời.
  public static func unanswered(_ d: OnboardingDraft, today: LocalDate) -> Bool {
    switch d.step {
    case .intention: d.branch == nil
    case .goal: d.goal == nil
    case .sex: d.sex == nil
    case .dob: attempt(d, today: today).missing.contains(.dob)
    case .activity: d.activityLevel == nil
    case .experience: d.trainingLevel == nil
    default: false
    }
  }

  /// Nút chính tắt: màn cân nặng / màn cuối khoá theo cổng số đo.
  public static func blocked(_ d: OnboardingDraft, today: LocalDate) -> Bool {
    let statsBad = attempt(d, today: today).plan == nil
    if d.step == .weight || d.step == .ready, statsBad { return true }
    return unanswered(d, today: today)
  }

  /// `hop`: sang màn kế theo chiều `by`, bước qua màn vắng mặt, kẹp ở hai đầu.
  public static func hop(_ d: OnboardingDraft, by: Int, healthAvailable: Bool) -> OnboardingDraft.Step {
    let all = OnboardingDraft.Step.allCases
    guard let i = all.firstIndex(of: d.step) else { return d.step }
    var n = i + by
    while n >= 0, n < all.count, skips(all[n], d, healthAvailable: healthAvailable) { n += by }
    return all[max(0, min(all.count - 1, n))]
  }
}

/// Ghi hồ sơ khi xong (`ASCNDBackend.SupabaseProfileWriter`).
public protocol OnboardingWriter: Sendable {
  /// `upsert profiles … onConflict: 'user_id'`. Ném `OnboardingFailure`.
  func completeOnboarding(userId: String, row: JSONValue) async throws
}

/// Đọc cờ `profiles.onboarding_completed` (`ASCNDBackend.SupabaseProfileSource`).
public protocol OnboardingStatusSource: Sendable {
  /// `nil` khi không có hàng hồ sơ.
  func onboardingCompleted(userId: String) async throws -> Bool?
}

/// Nháp và cờ đã xong trên máy, theo người dùng (`ASCNDStore`).
public protocol OnboardingStore: Sendable {
  func loadDraft(userId: String) async throws -> OnboardingDraft?
  func saveDraft(userId: String, _ draft: OnboardingDraft) async throws
  func clearDraft(userId: String) async throws
  func loadCompleted(userId: String) async throws -> Bool?
  func saveCompleted(userId: String, _ done: Bool) async throws
}

public enum OnboardingFailure: Error, Sendable, Hashable {
  /// Số đo không qua cổng — nút đã khoá; đây là chốt thứ hai của câu ghi.
  case statsRequired
  case offline
  case server(code: String?)
}

/// Cổng sau đăng nhập: vào luồng onboarding hay vào app.
@MainActor @Observable
public final class OnboardingGate {
  public enum State: Sendable, Hashable {
    case checking
    case needsOnboarding
    case completed
    /// Không đọc được và không có bản nhớ — "thử lại" + "đăng xuất".
    case failed(TodayController.RefreshFailure)
  }

  public let userId: String
  public private(set) var state: State = .checking
  @ObservationIgnored private let source: any OnboardingStatusSource
  @ObservationIgnored private let store: any OnboardingStore

  public init(userId: String, source: any OnboardingStatusSource, store: any OnboardingStore) {
    self.userId = userId
    self.source = source
    self.store = store
  }

  /// Bản nhớ trên máy trước (người quay lại không bao giờ thấy màn chờ khi
  /// offline), rồi server. Không có hàng hồ sơ: vào app — như RN (`profile &&
  /// !profile.onboarding_completed`).
  public func check() async {
    if let cached = try? await store.loadCompleted(userId: userId) {
      state = cached ? .completed : .needsOnboarding
    }
    do {
      let done = try await source.onboardingCompleted(userId: userId) ?? true
      state = done ? .completed : .needsOnboarding
      try? await store.saveCompleted(userId: userId, done)
    } catch {
      if state == .checking || isFailed { state = .failed(TodayController.failure([error]) ?? .unavailable) }
    }
  }

  private var isFailed: Bool {
    if case .failed = state { return true }
    return false
  }

  /// Luồng vừa ghi xong.
  public func completed() async {
    state = .completed
    try? await store.saveCompleted(userId: userId, true)
  }
}

/// Luồng onboarding của một người dùng: một nguồn sự thật cho màn của C.
@MainActor @Observable
public final class OnboardingController {
  public let userId: String
  public let healthAvailable: Bool
  public private(set) var draft = OnboardingDraft()
  public private(set) var loaded = false
  public private(set) var finishing = false
  public private(set) var finished = false
  public private(set) var failure: OnboardingFailure?

  @ObservationIgnored private let store: any OnboardingStore
  @ObservationIgnored private let writer: any OnboardingWriter
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let timeZone: TimeZone
  /// Đơn vị của hồ sơ (`useUnits`): áp khi người dùng CHƯA chọn trong luồng.
  /// Hồ sơ về muộn hơn lần vẽ đầu, nên đổi được sau khi dựng — như `hPick ??
  /// units.height` của RN đọc lại hồ sơ mỗi lần vẽ.
  public private(set) var defaultUnits: (height: String, weight: String)
  @ObservationIgnored private let onFinished: @MainActor () async -> Void
  @ObservationIgnored private var saves: Task<Void, Never>?

  public init(
    userId: String, store: any OnboardingStore, writer: any OnboardingWriter, healthAvailable: Bool,
    defaultUnits: (height: String, weight: String) = ("cm", "kg"), clock: any WallClock = SystemWallClock(),
    timeZone: TimeZone = .current, onFinished: @escaping @MainActor () async -> Void = {}
  ) {
    self.userId = userId
    self.store = store
    self.writer = writer
    self.healthAvailable = healthAvailable
    self.defaultUnits = defaultUnits
    self.clock = clock
    self.timeZone = timeZone
    self.onFinished = onFinished
  }

  private var today: LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// Mở lại đúng chỗ đã dừng (nếu có nháp của CHÍNH người này).
  public func load() async {
    if let saved = try? await store.loadDraft(userId: userId) {
      draft = saved
      // Màn đã lưu có thể vắng mặt bây giờ (máy đổi, HealthKit tắt): lùi về
      // màn hiện gần nhất.
      if OnboardingRules.skips(draft.step, draft, healthAvailable: healthAvailable) {
        draft.step = OnboardingRules.hop(draft, by: -1, healthAvailable: healthAvailable)
      }
    }
    loaded = true
  }

  // MARK: - Đọc

  public var shown: [OnboardingDraft.Step] { OnboardingRules.shown(draft, healthAvailable: healthAvailable) }
  /// Số thứ tự của màn đang hiện trong các màn thật sự hiện (1…); màn chào là 0.
  public var progress: (step: Int, total: Int) {
    (draft.step == .welcome ? 0 : (shown.firstIndex(of: draft.step) ?? 0) + 1, shown.count)
  }
  public var attempt: FitnessCalc.Attempt { OnboardingRules.attempt(draft, today: today) }
  /// Đơn vị đang hiện: người dùng chọn rồi thì theo lựa chọn, chưa thì theo hồ sơ.
  public var heightUnit: String { draft.heightUnit ?? defaultUnits.height }
  public var weightUnit: String { draft.weightUnit ?? defaultUnits.weight }
  public var heightScale: OnboardingRuler.Scale { OnboardingRuler.scale(.height, unit: heightUnit) }
  public var weightScale: OnboardingRuler.Scale { OnboardingRuler.scale(.weight, unit: weightUnit) }
  public var canAdvance: Bool { !finished && !OnboardingRules.blocked(draft, today: today) }
  public var canGoBack: Bool { draft.step != .welcome && !finished }
  /// Ngày sinh không hợp lệ (tương lai / quá 130 tuổi) — câu báo ở màn 06.
  public var dobInvalid: Bool { attempt.missing.contains(.dob) }

  // MARK: - Trả lời

  public func pickBranch(_ b: OnboardingDraft.Branch) {
    edit {
      $0.branch = b
      // Nhánh một giá trị: chọn nhánh CHÍNH LÀ chọn mục tiêu.
      $0.goal = b.goals.count == 1 ? b.goals[0] : nil
    }
  }

  @discardableResult
  public func pickGoal(_ goal: String) -> Bool {
    guard let b = draft.branch, b.goals.contains(goal) else { return false }
    edit { $0.goal = goal }
    return true
  }

  public func pickSex(_ s: FitnessCalc.Sex) { edit { $0.sex = s } }
  public func setDob(_ d: LocalDate) { edit { $0.dob = d } }
  public func setHeightCm(_ text: String) { edit { $0.heightCm = text } }
  public func setWeightKg(_ text: String) { edit { $0.weightKg = text } }
  /// Hồ sơ vừa đọc được: `units_height` / `units_weight` (`useUnits`: lạ /
  /// thiếu là hệ mét). Không đụng lựa chọn đã có trong nháp.
  public func setDefaultUnits(height: String?, weight: String?) {
    defaultUnits = (height == "in" ? "in" : "cm", weight == "lbs" ? "lbs" : "kg")
  }

  /// Thước báo một vạch (`commit`): ghi đúng câu RN ghi cho vạch ấy. Màn gọi
  /// cả lúc thước vừa được đặt vào hạt giống — RN cũng ghi ở lượt cuộn của cú
  /// `scrollTo` mở màn, nên số lưu luôn nằm trên vạch của đơn vị đang hiện.
  public func commitRuler(_ q: OnboardingRuler.Quantity, index: Int) {
    let scale = q == .height ? heightScale : weightScale
    let i = max(0, min(scale.count - 1, index))
    if q == .height { setHeightCm(scale.text(at: i)) } else { setWeightKg(scale.text(at: i)) }
  }

  /// Vạch đang đứng của thước `q` (hạt giống từ số đang lưu).
  public func rulerIndex(_ q: OnboardingRuler.Quantity) -> Int {
    q == .height ? heightScale.seed(draft.heightCm) : weightScale.seed(draft.weightKg)
  }

  public func setUnits(height: String? = nil, weight: String? = nil) {
    edit {
      if let height { $0.heightUnit = height }
      if let weight { $0.weightUnit = weight }
    }
  }

  @discardableResult
  public func pickActivity(_ level: String) -> Bool {
    guard OnboardingDraft.activityLevels.contains(level) else { return false }
    edit { $0.activityLevel = level }
    return true
  }

  @discardableResult
  public func pickTraining(_ level: String) -> Bool {
    guard OnboardingDraft.trainingLevels.contains(level) else { return false }
    edit { $0.trainingLevel = level }
    return true
  }

  // MARK: - Đi

  @discardableResult
  public func next() -> Bool {
    guard canAdvance, draft.step != .ready else { return false }
    edit { $0.step = OnboardingRules.hop($0, by: 1, healthAvailable: healthAvailable) }
    return true
  }

  @discardableResult
  public func back() -> Bool {
    guard canGoBack else { return false }
    edit { $0.step = OnboardingRules.hop($0, by: -1, healthAvailable: healthAvailable) }
    return true
  }

  /// Hàng ghi cuối (`finish`, `onboarding-flow.tsx:410`).
  public func profileRow() -> JSONValue? {
    guard case .ok(let plan, let h, let w, _) = attempt else { return nil }
    let d = draft
    var o: [String: JSONValue] = [:]
    o["user_id"] = .string(userId)
    o["sex"] = .string(d.sex?.rawValue ?? "")
    o["dob"] = .string(d.dob.description)
    o["height_cm"] = .number(h)
    o["weight_kg"] = .number(w)
    o["goal"] = .string(d.goal ?? "")
    o["activity_level"] = .string(d.activityLevel ?? "")
    o["training_level"] = .string(d.trainingLevel ?? "")
    let numbers: [(String, Int)] = [
      ("tdee_target_kcal", plan.targetKcal), ("macro_protein_g", plan.proteinG), ("macro_carbs_g", plan.carbsG),
      ("macro_fat_g", plan.fatG), ("macro_fiber_g", plan.fiberG), ("water_target_ml", plan.waterMl),
    ]
    for (k, v) in numbers { o[k] = .number(Double(v)) }
    o["units_height"] = .string(heightUnit)
    o["units_weight"] = .string(weightUnit)
    o["onboarding_completed"] = .bool(true)
    return .object(o)
  }

  /// Màn cuối: ghi hồ sơ. Xong thì bỏ nháp, báo cổng. Bấm lại khi đang ghi /
  /// đã xong không ghi lần hai.
  @discardableResult
  public func finish() async -> Bool {
    guard draft.step == .ready, !finishing, !finished else { return false }
    guard let row = profileRow() else {
      failure = .statsRequired
      return false
    }
    finishing = true
    failure = nil
    defer { finishing = false }
    do {
      try await writer.completeOnboarding(userId: userId, row: row)
    } catch let f as OnboardingFailure {
      failure = f
      return false
    } catch {
      failure = NetworkFailure.isOffline(error) ? .offline : .server(code: nil)
      return false
    }
    finished = true
    await saves?.value
    try? await store.clearDraft(userId: userId)
    await onFinished()
    return true
  }

  private func edit(_ change: (inout OnboardingDraft) -> Void) {
    guard loaded, !finished else { return }
    change(&draft)
    let snapshot = draft, store = self.store, userId = self.userId, previous = saves
    saves = Task {
      await previous?.value
      try? await store.saveDraft(userId: userId, snapshot)
    }
  }

  /// Chờ các lần lưu nháp xong (test; màn không cần).
  public func settled() async { await saves?.value }
}

/// Câu báo khi câu ghi cuối thất bại — `Alert.alert('ASCND', errorText(e))` của
/// `finish` qua `useOnlineMutation` (`lib/error-copy.ts` @ fac9ac2).
public enum OnboardingFailureCopy: String, Sendable, Hashable {
  /// `errOnlineOnly`: mất mạng — không gửi, không giữ lại để gửi sau.
  case onlineOnly
  case duplicate, invalid, signedOut, notFound, server, unknown
  /// `statsRequired`: câu của chính app (chốt thứ hai của cổng số đo).
  case statsRequired
}

extension OnboardingFailure {
  /// `SQLSTATE` của `error-copy.ts`; mã lạ / không có mã là `unknown` — không
  /// bao giờ đưa chữ thô của server ra màn.
  public var copy: OnboardingFailureCopy {
    switch self {
    case .statsRequired: .statsRequired
    case .offline: .onlineOnly
    case .server(let code): code.flatMap { Self.sqlstate[$0] } ?? .unknown
    }
  }

  static let sqlstate: [String: OnboardingFailureCopy] = [
    "23505": .duplicate, "23503": .invalid, "23502": .invalid, "23514": .invalid, "22001": .invalid,
    "22003": .invalid, "22007": .invalid, "22P02": .invalid, "42501": .signedOut, "42703": .server,
    "42P01": .server, "PGRST116": .notFound, "PGRST301": .signedOut,
  ]
}
