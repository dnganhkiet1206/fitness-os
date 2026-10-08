/// Bản nháp của builder buổi tập (#527 Phase 2) — phần thuần của
/// `app/workout-builder.tsx` @ fac9ac2. Ghi là việc của `PlanEditor.create`.
///
/// RN behavior (giữ nguyên):
/// - chạm một bài trong thư viện là thêm / bỏ nó (`toggle`), mặc định 3 × 10,
///   0 kg, RPE 7, nghỉ 90 giây (`DEFAULTS`);
/// - loại buổi GỢI Ý từ nhóm cơ đã chọn (`inferType`), người dùng chọn đè được;
/// - tên GỢI Ý từ hai nhóm cơ nhiều bài nhất ("Ngực & Tay sau"), bốn nhóm trở
///   lên là "Toàn thân"; gõ tên thì tên gõ thắng, để trống thì tên gợi ý;
/// - tổng số set và số phút ước tính (`estimatedMinutes`, `prescription.ts:86`).
public struct TemplateDraft: Sendable, Hashable {
  /// `TYPES` (`workout-builder.tsx:52`), đúng chuỗi lưu ở `workout_templates.type`.
  public enum Kind: String, Sendable, Hashable, CaseIterable {
    case push, pull, legs, upper, lower
    case fullBody = "full_body"
    case strength, hypertrophy, cardio, custom
  }

  /// Dạng tên gợi ý (`suggestedName`, `:345`); chữ là việc của màn.
  public enum NameShape: Sendable, Hashable {
    /// Chưa chọn bài nào: không gợi ý.
    case none
    /// Có bài nhưng không bài nào có nhóm cơ: tiêu đề builder (`nWbTitle`).
    case title
    /// Bốn nhóm trở lên (`nWbTypeFullBody`).
    case fullBody
    case one(MuscleGroup)
    case two(MuscleGroup, MuscleGroup)
  }

  /// `DEFAULTS` (`:150`).
  public static let defaultSets = 3
  public static let defaultReps = 10
  public static let defaultRpe = 7
  public static let defaultRest = 90

  public private(set) var items: [TemplateExercise] = []
  /// Tên người dùng gõ; chỉ dùng khi `nameTouched`.
  public var name = ""
  public var nameTouched = false
  /// Loại người dùng chọn; `nil` = theo gợi ý.
  public var pickedType: Kind?

  public init(items: [TemplateExercise] = []) {
    self.items = items
  }

  // MARK: - Sửa

  /// `toggle` (`:376`): có rồi thì bỏ, chưa có thì thêm cuối với mặc định.
  public mutating func toggle(id: String, name: String) {
    if items.contains(where: { $0.exerciseId == id }) {
      items.removeAll { $0.exerciseId == id }
    } else {
      items.append(TemplateExercise(
        exerciseId: id, exerciseName: name, sets: Self.defaultSets, reps: Self.defaultReps, weightKg: 0,
        rpe: Self.defaultRpe, restSeconds: Self.defaultRest))
    }
  }

  public func contains(_ id: String) -> Bool { items.contains { $0.exerciseId == id } }

  /// `patch` (`:390`): đổi các số của một bài; trường `nil` giữ nguyên.
  public mutating func patch(
    _ index: Int, sets: Int? = nil, reps: Int? = nil, weightKg: Double? = nil, rpe: Int? = nil, restSeconds: Int? = nil
  ) {
    guard items.indices.contains(index) else { return }
    let e = items[index]
    items[index] = TemplateExercise(
      exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: sets ?? e.sets, reps: reps ?? e.reps,
      weightKg: weightKg ?? e.weightKg, rpe: rpe ?? e.rpe, restSeconds: restSeconds ?? e.restSeconds)
  }

  /// `move` (`:394`): ngoài danh sách thì không làm gì.
  public mutating func move(from: Int, to: Int) {
    guard items.indices.contains(from), items.indices.contains(to) else { return }
    let moved = items.remove(at: from)
    items.insert(moved, at: to)
  }

  public mutating func remove(at index: Int) {
    guard items.indices.contains(index) else { return }
    items.remove(at: index)
  }

  // MARK: - Đọc

  /// Nhóm cơ xếp theo số bài, nhiều trước; bằng nhau thì nhóm gặp trước
  /// đứng trước (`groupCounts` theo thứ tự chèn của `Map`, `sort` ổn định).
  /// - Parameter muscleGroup: `muscle_group` của bài theo id (thư viện).
  public func ranking(muscleGroup: (String) -> String?) -> [MuscleGroup] {
    Self.ranking(items.map { $0.exerciseId.flatMap(muscleGroup) })
  }

  public static func ranking(_ muscleGroups: [String?]) -> [MuscleGroup] {
    var order: [MuscleGroup] = []
    var counts: [MuscleGroup: Int] = [:]
    for g in muscleGroups {
      for k in MuscleGroup.keys(for: g) {
        if counts[k] == nil { order.append(k) }
        counts[k, default: 0] += 1
      }
    }
    return order.enumerated()
      .sorted { a, b in
        let ca = counts[a.element] ?? 0, cb = counts[b.element] ?? 0
        return ca != cb ? ca > cb : a.offset < b.offset
      }
      .map(\.element)
  }

  public static func nameShape(itemCount: Int, ranked: [MuscleGroup]) -> NameShape {
    guard itemCount > 0 else { return .none }
    switch ranked.count {
    case 0: return .title
    case 1: return .one(ranked[0])
    case 2, 3: return .two(ranked[0], ranked[1])
    default: return .fullBody
    }
  }

  /// `inferType` (`:179`).
  public static func inferType(_ groups: Set<MuscleGroup>) -> Kind {
    let push: Set<MuscleGroup> = [.chest, .shoulders, .triceps]
    let pull: Set<MuscleGroup> = [.back, .biceps]
    let lower: Set<MuscleGroup> = [.legs, .glutes, .calves]
    if groups.isEmpty { return .custom }
    if groups.isSubset(of: [.cardio]) { return .cardio }
    if groups.isSubset(of: [.abs]) { return .custom }
    if groups.isSubset(of: push) { return .push }
    if groups.isSubset(of: pull) { return .pull }
    if groups.isSubset(of: lower) { return .legs }
    if groups.isSubset(of: lower.union([.abs])) { return .lower }
    if groups.isSubset(of: push.union(pull).union([.abs])) { return .upper }
    return .fullBody
  }

  /// Loại sẽ lưu: chọn tay thắng gợi ý (`tType`, `:341`).
  public func type(ranked: [MuscleGroup]) -> Kind {
    pickedType ?? Self.inferType(Set(ranked))
  }

  public var totalSets: Int { items.reduce(0) { $0 + $1.sets } }

  /// `estimatedMinutes` (`prescription.ts:86`): mỗi set = reps × 3 giây + nghỉ;
  /// làm tròn phút, tối thiểu 1.
  public static func estimatedMinutes(_ items: [(sets: Int?, reps: Int?, restSeconds: Int?)]) -> Int {
    let seconds = items.reduce(0) { s, it in
      s + (it.sets ?? 0) * ((it.reps ?? 0) * 3 + (it.restSeconds ?? defaultRest))
    }
    let minutes = (Double(seconds) / 60 + 0.5).rounded(.down)
    return max(1, Int(minutes))
  }

  public var estimatedMinutes: Int {
    Self.estimatedMinutes(items.map { ($0.sets, $0.reps, $0.restSeconds) })
  }

  /// `visible` (`:302`): nhóm đang chọn và chữ tìm (chứa, không phân biệt
  /// hoa thường); không cắt số lượng.
  public static func visible(_ library: [LibraryExercise], group: MuscleGroup?, search: String) -> [LibraryExercise] {
    let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return library.filter { e in
      (group.map { e.muscles.contains($0) } ?? true) && ExerciseCatalog.matches(e, q)
    }
  }

  /// Nút ± của ô tạ (`workout-set-sheet.tsx:163`): bước 2.5 kg / 5 lb, kẹp
  /// [0, 500 kg] / [0, 1100 lb] theo SỐ ĐANG HIỆN (`displayWeight`), lưu lại
  /// kg 2 chữ số lẻ (`tidy(weightToKg(n))`) — bước 2.5 không trôi thành
  /// 82.50000000000001.
  public static func stepLoad(_ kg: Double, unit: WeightUnit, up: Bool) -> Double {
    let step = unit == .kg ? 2.5 : 5
    let maxShown = unit == .kg ? 500.0 : 1100
    let shown = unit.display(kg)
    let next = min(maxShown, max(0, shown + (up ? step : -step)))
    return (unit.toKg(next) * 100 + 0.5).rounded(.down) / 100
  }

  /// Ô tìm của danh sách buổi tập (`templates.tsx:57`): tên hoặc loại chứa
  /// chữ tìm; mới trước (`newestFirst`).
  public static func listed(_ templates: [WorkoutTemplate], search: String) -> [WorkoutTemplate] {
    let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return templates.sorted(by: WorkoutTemplate.newestFirst).filter {
      q.isEmpty || $0.name.lowercased().contains(q) || ($0.type ?? "").lowercased().contains(q)
    }
  }

  /// Tên sẽ lưu (`shownName.trim() || suggestedName`, `:454`).
  public func finalName(suggested: String) -> String {
    let shown = (nameTouched ? name : suggested).trimmingCharacters(in: .whitespacesAndNewlines)
    return shown.isEmpty ? suggested : shown
  }
}
