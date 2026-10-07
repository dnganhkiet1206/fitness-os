public import Foundation
public import Observation

// Thư viện bài tập (#420) — đường ĐỌC của `app/exercises.tsx`, builder, ô gợi ý
// tên bài của màn ghi tay. Đường ghi (thêm / xoá bài) là A27.
//
// Nguồn baseline (`fac9ac2`):
// - `useExercises` (`use-library.ts:200`): `id, user_id, name, muscle_group,
//   equipment, exercise_kind`, bài mẫu (`user_id` null, ai cũng thấy) + bài
//   của mình, xếp theo `muscle_group` rồi `name`;
// - `lib/muscle-group.ts`: cột `muscle_group` là chữ tự do (bản cũ lưu nhãn
//   "Ngực", bản mới lưu khoá "chest") — gập về 10 khoá hình cơ;
// - `exercises.tsx:95` (lọc theo nhóm + tìm theo tên, gộp theo NHÃN),
//   `workout-builder.tsx:310` (lọc), `log-workout.tsx:386` (5 gợi ý);
// - `use-exercise-insights.ts:63`: loại bài khai báo theo `exerciseKey`, bài
//   của mình thắng bài mẫu cùng tên.

/// Một hàng `exercises`.
public struct LibraryExercise: Sendable, Hashable, Codable, Identifiable {
  public let id: String
  /// `nil` = bài mẫu (ai cũng thấy, không ai sửa được).
  public let userId: String?
  public let name: String
  public let muscleGroup: String?
  public let equipment: String?
  /// `exercise_kind` như server lưu; `nil` = chưa khai báo (động cơ xu hướng tự suy).
  public let kind: String?

  public init(id: String, userId: String?, name: String, muscleGroup: String?, equipment: String?, kind: String?) {
    self.id = id
    self.userId = userId
    self.name = name
    self.muscleGroup = muscleGroup
    self.equipment = equipment
    self.kind = kind
  }

  /// Bài mẫu của app, không phải của người dùng.
  public var isBuiltIn: Bool { userId == nil }
  /// Các khoá hình cơ của bài (`muscleArtKeysFor`).
  public var muscles: [MuscleGroup] { MuscleGroup.keys(for: muscleGroup) }
}

/// `MuscleArtKey` + bảng đồng nghĩa (`lib/muscle-group.ts`).
public enum MuscleGroup: String, Sendable, Hashable, Codable, CaseIterable {
  case chest, back, shoulders, biceps, triceps, legs, glutes, calves, abs, cardio

  public enum Language: String, Sendable { case vi, en, es }

  static let aliases: [String: MuscleGroup] = [
    "chest": .chest, "back": .back, "shoulders": .shoulders, "biceps": .biceps, "triceps": .triceps,
    "quads": .legs, "hamstrings": .legs, "legs": .legs, "calves": .calves, "glutes": .glutes, "abs": .abs,
    "core": .abs, "full body": .cardio, "fullbody": .cardio, "cardio": .cardio,
    "nguc": .chest, "lung": .back, "vai": .shoulders, "tay truoc": .biceps, "tay sau": .triceps,
    "chan truoc": .legs, "chan sau": .legs, "chan": .legs, "bap chan": .calves, "bap tay truoc": .biceps,
    "bap tay sau": .triceps, "hamstring": .legs, "mong": .glutes, "bung": .abs, "toan than": .cardio,
    "tim mach": .cardio,
  ]

  /// Dài trước: "bap tay truoc" thắng "tay truoc" thắng "chan". Cùng độ dài thì
  /// theo thứ tự khai báo của RN (`Object.keys` + sort ổn định).
  static let byLength: [String] = {
    let declared = [
      "chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "legs", "calves", "glutes", "abs",
      "core", "full body", "fullbody", "cardio", "nguc", "lung", "vai", "tay truoc", "tay sau", "chan truoc",
      "chan sau", "chan", "bap chan", "bap tay truoc", "bap tay sau", "hamstring", "mong", "bung", "toan than",
      "tim mach",
    ]
    return declared.enumerated().sorted { a, b in
      a.element.count != b.element.count ? a.element.count > b.element.count : a.offset < b.offset
    }.map(\.element)
  }()

  /// `fold`: bỏ dấu (NFD, bỏ U+0300…U+036F), đ → d, chữ thường, gộp khoảng trắng.
  static func fold(_ s: String) -> String {
    let stripped = String(String.UnicodeScalarView(
      s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }))
      .replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
      .lowercased()
    return stripped.split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  /// `muscleArtKeysFor`: tách theo `/ , + &`, mỗi phần khớp đúng một bí danh
  /// hoặc chứa bí danh dài nhất; giữ thứ tự, không trùng.
  public static func keys(for group: String?) -> [MuscleGroup] {
    guard let group, !group.isEmpty else { return [] }
    var out: [MuscleGroup] = []
    for part in group.split(omittingEmptySubsequences: false, whereSeparator: { "/,+&".contains($0) }) {
      let f = fold(String(part))
      guard !f.isEmpty else { continue }
      let hit = aliases[f] ?? byLength.first { f.contains($0) }.flatMap { aliases[$0] }
      if let hit, !out.contains(hit) { out.append(hit) }
    }
    return out
  }

  /// `canonicalMuscleGroup`: khoá ghép bằng "/", `nil` khi không nhận ra.
  public static func canonical(_ group: String?) -> String? {
    let k = keys(for: group)
    return k.isEmpty ? nil : k.map(\.rawValue).joined(separator: "/")
  }

  public func label(_ lang: Language) -> String {
    switch (self, lang) {
    case (.chest, .vi): "Ngực"
    case (.chest, .en): "Chest"
    case (.chest, .es): "Pecho"
    case (.back, .vi): "Lưng"
    case (.back, .en): "Back"
    case (.back, .es): "Espalda"
    case (.legs, .vi): "Chân"
    case (.legs, .en): "Legs"
    case (.legs, .es): "Piernas"
    case (.shoulders, .vi): "Vai"
    case (.shoulders, .en): "Shoulders"
    case (.shoulders, .es): "Hombros"
    case (.biceps, .vi): "Tay trước"
    case (.biceps, .en): "Biceps"
    case (.biceps, .es): "Bíceps"
    case (.triceps, .vi): "Tay sau"
    case (.triceps, .en): "Triceps"
    case (.triceps, .es): "Tríceps"
    case (.abs, .vi): "Bụng"
    case (.abs, .en): "Abs"
    case (.abs, .es): "Abdominales"
    case (.glutes, .vi): "Mông"
    case (.glutes, .en): "Glutes"
    case (.glutes, .es): "Glúteos"
    case (.calves, .vi): "Bắp chân"
    case (.calves, .en): "Calves"
    case (.calves, .es): "Pantorrillas"
    case (.cardio, .vi): "Tim mạch"
    case (.cardio, .en): "Cardio"
    case (.cardio, .es): "Cardio"
    }
  }

  /// `muscleGroupLabel`: nhãn theo ngôn ngữ; không nhận ra thì chữ gốc (cắt).
  public static func label(_ group: String?, _ lang: Language) -> String {
    let k = keys(for: group)
    if !k.isEmpty { return k.map { $0.label(lang) }.joined(separator: " / ") }
    return (group ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

/// Các phép đọc trên danh sách — thuần, cùng luật với ba màn của RN.
public enum ExerciseCatalog {
  /// Tìm theo tên: chứa, không phân biệt hoa thường (`name.toLowerCase().includes(q)`).
  static func matches(_ e: LibraryExercise, _ q: String) -> Bool {
    q.isEmpty || e.name.lowercased().contains(q)
  }

  /// `workout-builder.tsx:310`: lọc theo nhóm cơ và tên, giữ thứ tự server.
  public static func filter(_ list: [LibraryExercise], query: String, muscle: MuscleGroup? = nil) -> [LibraryExercise] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return list.filter { e in (muscle.map { e.muscles.contains($0) } ?? true) && matches(e, q) }
  }

  public struct Section: Sendable, Hashable, Identifiable {
    public var id: String { title }
    /// Nhãn nhóm theo ngôn ngữ; "—" khi bài không có nhóm.
    public let title: String
    public let exercises: [LibraryExercise]
  }

  /// `exercises.tsx:95`: lọc rồi gộp theo NHÃN — "Ngực" cũ và "chest" mới vào
  /// cùng một mục. Mục theo thứ tự xuất hiện đầu tiên.
  public static func sections(
    _ list: [LibraryExercise], query: String, muscle: MuscleGroup? = nil, lang: MuscleGroup.Language
  ) -> [Section] {
    var order: [String] = []
    var groups: [String: [LibraryExercise]] = [:]
    for e in filter(list, query: query, muscle: muscle) {
      let label = MuscleGroup.label(e.muscleGroup, lang)
      let title = label.isEmpty ? "—" : label
      if groups[title] == nil { order.append(title) }
      groups[title, default: []].append(e)
    }
    return order.map { Section(title: $0, exercises: groups[$0] ?? []) }
  }

  /// `suggestionsFor` (`log-workout.tsx:386`): tối đa 5 bài; ô trống thì gợi ý
  /// cả thư viện; bài trùng đúng chữ đã gõ thì không gợi ý lại.
  public static let suggestionLimit = 5
  public static func suggestions(_ list: [LibraryExercise], for text: String) -> [LibraryExercise] {
    let q = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return Array(list.filter { matches($0, q) && $0.name.lowercased() != q }.prefix(suggestionLimit))
  }

  /// Loại bài khai báo theo `exerciseKey` (`use-exercise-insights.ts:63`): bài
  /// không khai báo bỏ qua; hai hàng cùng tên thì bài của mình thắng.
  public static func declaredKinds(_ list: [LibraryExercise]) -> [String: String] {
    var out: [String: String] = [:]
    for e in list {
      let key = PersonalRecords.exerciseKey(e.name)
      guard !key.isEmpty, let kind = e.kind else { continue }
      if out[key] == nil || e.userId != nil { out[key] = kind }
    }
    return out
  }
}

/// Đọc thư viện từ server (`ASCNDBackend.SupabaseExerciseSource`).
public protocol ExerciseSource: Sendable {
  func exercises(userId: String) async throws -> [LibraryExercise]
}

public protocol ExerciseCache: Sendable {
  func load(userId: String) async throws -> [LibraryExercise]?
  func save(userId: String, _ list: [LibraryExercise]) async throws
}

/// Thư viện bài tập, local-first — cùng mẫu với `HistoryBook`.
///
/// RN behavior: đọc mỗi lần mở màn (cache của React Query); offline lần đầu
///   thì không có bài nào để chọn.
/// Native behavior: bản trên máy hiện ngay, kể cả offline; theo người dùng.
@MainActor @Observable
public final class ExerciseLibrary {
  public let userId: String
  /// Thứ tự của server (`muscle_group`, `name`).
  public private(set) var exercises: [LibraryExercise] = []
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?
  /// Gọi sau mỗi lần danh sách đổi — `WorkoutFlow` đưa loại bài khai báo cho
  /// phân tích và "lần trước".
  @ObservationIgnored public var onChange: (@MainActor ([LibraryExercise]) -> Void)?

  @ObservationIgnored private let source: any ExerciseSource
  @ObservationIgnored private let cache: any ExerciseCache

  public init(userId: String, source: any ExerciseSource, cache: any ExerciseCache) {
    self.userId = userId
    self.source = source
    self.cache = cache
  }

  public func exercise(id: String) -> LibraryExercise? { exercises.first { $0.id == id } }

  public var declaredKinds: [String: String] { ExerciseCatalog.declaredKinds(exercises) }

  public func load() async {
    if !loaded, let cached = try? await cache.load(userId: userId) {
      set(cached)
    }
    await refresh()
  }

  public func refresh() async {
    do {
      let fresh = try await source.exercises(userId: userId)
      // RLS đã lọc; lọc lại để cache không bao giờ giữ bài riêng của người khác.
      set(fresh.filter { $0.userId == nil || $0.userId == userId })
      failure = nil
      try? await cache.save(userId: userId, exercises)
    } catch {
      failure = TodayController.failure([error])
    }
  }

  private func set(_ list: [LibraryExercise]) {
    var seen = Set<String>()
    exercises = list.filter { seen.insert($0.id).inserted }
    loaded = true
    onChange?(exercises)
  }
}
