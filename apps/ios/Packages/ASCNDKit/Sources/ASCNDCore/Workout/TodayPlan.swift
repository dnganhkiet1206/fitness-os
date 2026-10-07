import Foundation

/// Kế hoạch tập của một ngày, đọc từ dữ liệu thật của người dùng (#270).
///
/// Nguồn baseline (`fac9ac2`):
/// - `routine_days` (`use-library.ts:349`): bảy hàng, `UNIQUE(user_id, day_of_week)`,
///   Thứ Hai = 0 (`routineIndex`, `local-date.ts:188`). Kế hoạch là một mẫu
///   LẶP theo tuần, không có cột ngày.
/// - `workout_templates.exercises`: JSONB tự do (`template-list.tsx:62`).
/// - `expand()` (`day-plan.tsx:547`): bài → các hàng set.
/// - `dayStateOf` (`week-strip.tsx:137`): trạng thái của một ngày.

/// Một bài trong template, đã làm sạch.
public struct TemplateExercise: Sendable, Hashable, Codable {
  public let exerciseId: String?
  public let exerciseName: String
  public let sets: Int
  public let reps: Int
  public let weightKg: Double
  public let rpe: Int
  public let restSeconds: Int

  public init(
    exerciseId: String? = nil, exerciseName: String, sets: Int, reps: Int, weightKg: Double,
    rpe: Int = WorkoutPlanning.defaultRpe, restSeconds: Int = WorkoutPlanning.defaultRest
  ) {
    self.exerciseId = exerciseId
    self.exerciseName = exerciseName
    self.sets = sets
    self.reps = reps
    self.weightKg = weightKg
    self.rpe = rpe
    self.restSeconds = restSeconds
  }

  /// Đọc một phần tử của `workout_templates.exercises`, khoan dung như baseline:
  /// thiếu trường nào thì lấy mặc định của trường ấy.
  ///
  /// `sets` không đọc được: baseline ra `NaN`, `Math.max(1, Math.min(20, NaN))`
  /// vẫn là `NaN`, vòng `n < NaN` chạy 0 lần — **bài biến mất khỏi buổi tập**
  /// mà không có lỗi nào. Native lấy 1, như khi trường bị thiếu.
  /// (RN BUG FOUND → test `unreadableSetCountKeepsTheExercise`.)
  public init(json: JSONValue) {
    let id = json["exerciseId"]?.stringValue ?? ""
    exerciseId = id.isEmpty ? nil : id  // `exerciseId || undefined`
    exerciseName = json["exerciseName"]?.stringValue ?? ""
    sets = min(WorkoutPlanning.maxSets, max(1, Self.jsRound(Self.number(json["sets"]) ?? 1)))
    reps = Self.jsRound(Self.number(json["reps"]) ?? 0)
    weightKg = Self.number(json["weight"]) ?? 0
    rpe = Self.jsRound(Self.number(json["rpe"]) ?? Double(WorkoutPlanning.defaultRpe))
    restSeconds = Self.jsRound(Self.number(json["restSeconds"]) ?? Double(WorkoutPlanning.defaultRest))
  }

  /// Một phần tử của `exercises` như builder ghi (`TemplateExercise` của
  /// `use-library.ts:279`). `exerciseId` thiếu thì bỏ trường — đọc lại ra `nil`
  /// như `exerciseId || undefined`. Đọc lại bằng `init(json:)` ra đúng giá trị này.
  public var json: JSONValue {
    var o: [String: JSONValue] = [
      "exerciseName": .string(exerciseName),
      "sets": .number(Double(sets)),
      "reps": .number(Double(reps)),
      "weight": .number(WorkoutMath.round2(weightKg)),
      "rpe": .number(Double(rpe)),
      "restSeconds": .number(Double(restSeconds)),
    ]
    if let exerciseId { o["exerciseId"] = .string(exerciseId) }
    return .object(o)
  }

  /// Số từ JSON: số hữu hạn, hoặc chuỗi số (JS ép kiểu chuỗi khi làm toán).
  /// `null`, thiếu, hay chữ không phải số → `nil` (dùng mặc định).
  static func number(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)? where n.isFinite: return n
    case .string(let s)?:
      let t = s.trimmingCharacters(in: .whitespaces)
      guard let n = Double(t), n.isFinite else { return nil }
      return n
    default: return nil
    }
  }

  /// `Math.round` của JS: nửa làm tròn LÊN (−2.5 → −2), khác `.rounded()`.
  static func jsRound(_ x: Double) -> Int {
    let r = (x + 0.5).rounded(.down)
    guard r.isFinite, abs(r) < 1e15 else { return 0 }
    return Int(r)
  }
}

public struct WorkoutTemplate: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  public let name: String
  public let exercises: [TemplateExercise]
  /// `workout_templates.type` (`'custom'` khi thiếu, `use-library.ts:311`).
  /// Tuỳ chọn để cache cũ (trước #401) vẫn đọc được.
  public let type: String?
  /// `created_at` — danh sách template xếp mới trước (`newestFirst`,
  /// `template-list.tsx:155`). `nil`: cache cũ, hoặc template vừa tạo trên
  /// máy chưa có giờ của server.
  public let createdAt: EpochMillis?

  public init(
    id: String, name: String, exercises: [TemplateExercise], type: String? = nil, createdAt: EpochMillis? = nil
  ) {
    self.id = id
    self.name = name
    self.exercises = exercises
    self.type = type
    self.createdAt = createdAt
  }

  /// `exercises` không phải mảng → không có bài nào (`Array.isArray`, `day-plan.tsx:722`).
  public init(
    id: String, name: String, exercisesJSON: JSONValue?, type: String? = nil, createdAt: EpochMillis? = nil
  ) {
    var list: [TemplateExercise] = []
    if case .array(let a)? = exercisesJSON {
      list = a.map(TemplateExercise.init(json:))
    }
    self.init(id: id, name: name, exercises: list, type: type, createdAt: createdAt)
  }
}

/// Một hàng `routine_days`.
public struct RoutineDay: Sendable, Hashable, Codable {
  /// 0 = Thứ Hai … 6 = Chủ Nhật.
  public let dayOfWeek: Int
  public let isRest: Bool
  public let isDeload: Bool
  public let templateId: String?

  public init(dayOfWeek: Int, isRest: Bool, isDeload: Bool = false, templateId: String?) {
    self.dayOfWeek = dayOfWeek
    self.isRest = isRest
    self.isDeload = isDeload
    self.templateId = templateId
  }
}

/// Trạng thái của một ngày (`dayStateOf`).
public enum DayStatus: String, Sendable, Hashable, Codable {
  /// Có buổi, chưa tập, chưa qua.
  case todo
  case done
  /// Có buổi, ngày đã qua, không có buổi nào được ghi.
  case missed
  /// Ngày nghỉ người dùng đã chọn.
  case rest
  /// Chưa lên lịch. KHÁC ngày nghỉ: chưa quyết định (#215).
  case unplanned
}

/// Kế hoạch của một ngày — thứ màn Today (C-4) hiển thị và màn tập mở ra.
public struct TodayPlan: Sendable, Hashable {
  public let date: LocalDate
  public let status: DayStatus
  /// `nil` ⇔ `rest` / `unplanned`.
  public let template: WorkoutTemplate?
  /// Chỉ là huy hiệu ở baseline — không đổi tạ hay số set.
  public let isDeload: Bool

  /// Kế hoạch cho `WorkoutSessionController`, `nil` khi không có buổi.
  public var sessionPlan: WorkoutSessionController.Plan? {
    guard let template else { return nil }
    return .init(
      date: date, templateId: template.id, templateName: template.name,
      rows: WorkoutPlanning.rows(template.exercises))
  }
}

/// Bộ dữ liệu đọc từ server, lưu nguyên vào cache để mở app offline vẫn có kế
/// hoạch (read model local-first).
public struct TemplateSnapshot: Sendable, Hashable, Codable {
  public let routine: [RoutineDay]
  public let templates: [WorkoutTemplate]
  public let fetchedAt: EpochMillis

  public init(routine: [RoutineDay], templates: [WorkoutTemplate], fetchedAt: EpochMillis) {
    self.routine = routine
    self.templates = templates
    self.fetchedAt = fetchedAt
  }

  public func plan(for date: LocalDate, today: LocalDate, trained: Set<LocalDate> = []) -> TodayPlan {
    WorkoutPlanning.plan(for: date, today: today, routine: routine, templates: templates, trained: trained)
  }
}

public enum WorkoutPlanning {
  /// `DEFAULT_REST`, `DEFAULT_RPE` (`prescription.ts:29`).
  public static let defaultRest = 90
  public static let defaultRpe = 7
  /// Trần số set mỗi bài (`expand`): JSON tự do có thể chứa 4000.
  public static let maxSets = 20

  /// Thứ Hai = 0 (`(getDay() + 6) % 7`). 1970-01-01 là Thứ Năm (= 3).
  public static func routineIndex(_ date: LocalDate) -> Int {
    ((date.daysSinceEpoch + 3) % 7 + 7) % 7
  }

  /// `expand()`: mỗi bài thành `sets` hàng; khoá `"<bài>-<hiệp>"` theo VỊ TRÍ
  /// như baseline, để điểm quay lại ghi bởi bản nào cũng trỏ đúng hàng.
  public static func rows(_ exercises: [TemplateExercise]) -> [PlannedSet] {
    var rows: [PlannedSet] = []
    for (i, ex) in exercises.enumerated() {
      for n in 0..<ex.sets {
        rows.append(PlannedSet(
          key: "\(i)-\(n)", exerciseId: ex.exerciseId, exerciseName: ex.exerciseName,
          ordinal: n + 1, of: ex.sets, weightKg: ex.weightKg, reps: ex.reps,
          plannedRest: ex.restSeconds, plannedRpe: ex.rpe))
      }
    }
    return rows
  }

  /// Hàng của các bài thêm trong ngày (`adHocRows`, `day-plan.tsx:509`): cùng
  /// hình dạng với hàng theo kế hoạch, nên tick, điểm quay lại, chốt, nối
  /// thêm nhận chúng mà không cần biết chúng tồn tại. Tạ và rep kế hoạch là 0
  /// — "kế hoạch không yêu cầu" — nên ô mở trống; nghỉ / RPE theo mặc định.
  /// Khoá `"x<id>-<hiệp>"`; số hiệp kẹp [1, 20] như `expand`.
  public static func adHocRows(_ list: [AdHocExercise]) -> [PlannedSet] {
    var rows: [PlannedSet] = []
    for e in list {
      let count = min(maxSets, max(1, e.sets))
      for n in 0..<count {
        rows.append(PlannedSet(
          key: "x\(e.id)-\(n)", exerciseName: e.name, ordinal: n + 1, of: count, weightKg: 0, reps: 0,
          plannedRest: defaultRest, plannedRpe: defaultRpe, adHoc: e.id))
      }
    }
    return rows
  }

  /// Kế hoạch của `date`. `trained`: các ngày đã có buổi được ghi.
  ///
  /// Có buổi ⇔ ngày có `template_id`, template ấy CÒN tồn tại, và ngày không
  /// đánh dấu nghỉ — `is_rest` thắng `template_id` (`week-plan.tsx:313`).
  public static func plan(
    for date: LocalDate, today: LocalDate, routine: [RoutineDay], templates: [WorkoutTemplate],
    trained: Set<LocalDate> = []
  ) -> TodayPlan {
    let day = routine.first { $0.dayOfWeek == routineIndex(date) }
    let isRest = day?.isRest ?? false
    let template = isRest ? nil : day?.templateId.flatMap { id in templates.first { $0.id == id } }
    let status: DayStatus
    if template == nil {
      status = isRest ? .rest : .unplanned
    } else if trained.contains(date) {
      status = .done
    } else {
      status = date < today ? .missed : .todo
    }
    return TodayPlan(date: date, status: status, template: template, isDeload: day?.isDeload ?? false)
  }
}

/// Đọc kế hoạch từ server (`ASCNDBackend.SupabaseTemplateSource`).
public protocol TemplateSource: Sendable {
  func fetch(userId: String) async throws -> TemplateSnapshot
}

/// Cache trên máy, theo người dùng (`ASCNDStore`). Đổi tài khoản không bao giờ
/// thấy kế hoạch của người trước.
public protocol TemplateCache: Sendable {
  func load(userId: String) async throws -> TemplateSnapshot?
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws
}

/// Read model local-first: `cached` trả ngay thứ đang có trên máy (kể cả lúc
/// offline); `refresh` hỏi server rồi ghi đè cache. Server hỏng thì cache cũ
/// vẫn nguyên — màn vẫn mở được buổi tập.
///
/// Cache chỉ giữ bản của SERVER. Lệnh sửa kế hoạch chưa gửi (#401) sống ở
/// outbox và được áp lên mỗi lần đọc (`pendingEdits`) — một nguồn sự thật cho
/// "máy này đã sửa gì", không có bản lạc quan thứ hai trong cache để lệch.
public struct TodayRepository: Sendable {
  private let source: any TemplateSource
  private let cache: any TemplateCache
  private let edits: (any PlanWriteStore)?

  public init(source: any TemplateSource, cache: any TemplateCache, edits: (any PlanWriteStore)? = nil) {
    self.source = source
    self.cache = cache
    self.edits = edits
  }

  /// Lệnh sửa kế hoạch còn chờ gửi, theo thứ tự hàng đợi. `nil` khi không đọc
  /// được (đĩa hỏng) — người gọi giữ thứ đang có, không coi là "không có gì".
  public func pendingEdits(userId: String) async -> [OutboxEntry]? {
    guard let edits else { return [] }
    guard let all = try? await edits.pending(userId: userId) else { return nil }
    return all.filter { $0.userId == userId && PlanEdit.kinds.contains($0.kind) }
  }

  public func cached(userId: String) async -> TemplateSnapshot? {
    try? await cache.load(userId: userId)
  }

  public func refresh(userId: String) async throws -> TemplateSnapshot {
    let fresh = try await source.fetch(userId: userId)
    try? await cache.save(userId: userId, fresh)
    return fresh
  }
}
