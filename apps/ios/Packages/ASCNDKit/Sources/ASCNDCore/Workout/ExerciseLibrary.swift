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

/// Thiết bị (`lib/equipment.ts`): năm khoá, bí danh khớp NGUYÊN chữ (không
/// bao giờ khớp một phần — "db" là tạ đơn chỉ khi đứng một mình).
public enum Equipment: String, Sendable, Hashable, Codable, CaseIterable {
  case barbell, bodyweight, cable, dumbbell, machine

  static let aliases: [String: Equipment] = [
    "barbell": .barbell, "bodyweight": .bodyweight, "body weight": .bodyweight, "cable": .cable,
    "dumbbell": .dumbbell, "dumbbells": .dumbbell, "db": .dumbbell, "machine": .machine,
  ]

  static func fold(_ s: String) -> String {
    s.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  /// `canonicalEquipment`.
  public static func canonical(_ raw: String?) -> Equipment? {
    let f = fold(raw ?? "")
    return f.isEmpty ? nil : aliases[f]
  }

  public func label(_ lang: MuscleGroup.Language) -> String {
    switch (self, lang) {
    case (.barbell, .vi): "Tạ đòn"
    case (.barbell, .en): "Barbell"
    case (.barbell, .es): "Barra"
    case (.bodyweight, .vi): "Không tạ"
    case (.bodyweight, .en): "Bodyweight"
    case (.bodyweight, .es): "Peso corporal"
    case (.cable, .vi): "Cáp"
    case (.cable, .en): "Cable"
    case (.cable, .es): "Cable"
    case (.dumbbell, .vi): "Tạ đơn"
    case (.dumbbell, .en): "Dumbbell"
    case (.dumbbell, .es): "Mancuerna"
    case (.machine, .vi): "Máy tập"
    case (.machine, .en): "Machine"
    case (.machine, .es): "Máquina"
    }
  }

  /// `equipmentLabel`: nhãn theo ngôn ngữ, không nhận ra thì chữ gốc (cắt).
  public static func label(_ stored: String?, _ lang: MuscleGroup.Language) -> String {
    canonical(stored)?.label(lang) ?? (stored ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

/// Ghi thư viện bài tập (#421) — `useAddExercise` / `useDeleteExercise`
/// (`use-library.ts:224`, `:241`).
public enum ExerciseEdit {
  /// Thêm bài: `insert` theo `id` máy sinh, bỏ trùng — phát lại là một hàng.
  public static let createKind = "exercise"
  /// Xoá bài: `delete` theo `id` + `user_id`; id hàng outbox `"<bài>@del-<op>"`.
  public static let deleteKind = "exercise-delete"
  public static let kinds: Set<String> = [createKind, deleteKind]
}

extension ExerciseCatalog {
  /// Danh sách sau khi các lệnh chưa tới server được áp lên, theo thứ tự — làm
  /// đúng việc server làm, nên áp lại lệnh đã nhận không đổi gì:
  /// - thêm: id đã có thì giữ bản của server (`ignoreDuplicates`); bài mới
  ///   đứng cuối tới lần làm mới sau (server mới xếp theo nhóm, tên);
  /// - xoá: chỉ xoá bài CỦA người ra lệnh (`.eq('user_id', …)` + RLS) — bài
  ///   mẫu và bài của người khác không bao giờ biến mất vì một lệnh xoá.
  public static func applying(_ list: [LibraryExercise], _ entries: [OutboxEntry]) -> [LibraryExercise] {
    var out = list
    for e in entries {
      guard let id = e.payload["id"]?.stringValue?.lowercased() else { continue }
      switch e.kind {
      case ExerciseEdit.createKind:
        guard !out.contains(where: { $0.id == id }), let name = e.payload["name"]?.stringValue else { continue }
        out.append(LibraryExercise(
          id: id, userId: e.userId, name: name, muscleGroup: e.payload["muscle_group"]?.stringValue,
          equipment: e.payload["equipment"]?.stringValue, kind: e.payload["exercise_kind"]?.stringValue))
      case ExerciseEdit.deleteKind:
        out.removeAll { $0.id == id && $0.userId?.lowercased() == e.userId.lowercased() }
      default:
        continue
      }
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
///   thì không có bài nào để chọn; thêm / xoá chỉ chạy online.
/// Native behavior: bản trên máy hiện ngay, kể cả offline; theo người dùng.
///   Thêm / xoá (#421) đi qua outbox — chạy cả offline, idempotent — và danh
///   sách = bản server ⊕ lệnh chưa gửi (cùng cách `TodayController.library`).
@MainActor @Observable
public final class ExerciseLibrary {
  public enum Refusal: Error, Sendable, Hashable {
    /// Tên rỗng sau khi cắt (`if (!name.trim()) return`, `exercises.tsx:116`).
    case emptyName
    /// `exercise_kind` ngoài bốn giá trị CHECK của server.
    case invalidKind
    case notFound
    /// Bài mẫu hay bài của người khác: màn chỉ hiện nút xoá cho bài của mình
    /// (`exercises.tsx:326`), server lọc `user_id` + RLS.
    case notOwn
    /// App không đưa chỗ ghi.
    case readOnly
    case storage(LocalWriteError)
  }

  public let userId: String
  /// Bản server ⊕ lệnh chưa gửi; thứ tự của server (`muscle_group`, `name`),
  /// bài vừa thêm ở cuối.
  public private(set) var exercises: [LibraryExercise] = []
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?
  /// Gọi sau mỗi lần danh sách đổi — `WorkoutFlow` đưa loại bài khai báo cho
  /// phân tích và "lần trước".
  @ObservationIgnored public var onChange: (@MainActor ([LibraryExercise]) -> Void)?

  @ObservationIgnored private let source: any ExerciseSource
  @ObservationIgnored private let cache: any ExerciseCache
  @ObservationIgnored private let store: (any PlanWriteStore)?
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let makeId: @Sendable () -> String
  @ObservationIgnored private let onEnqueued: @MainActor (OutboxEntry) -> Void
  @ObservationIgnored private var server: [LibraryExercise] = []
  @ObservationIgnored private var edits: [(seq: Int, entry: OutboxEntry)] = []
  @ObservationIgnored private var editSeq = 0

  /// - Parameters:
  ///   - store: nơi ghi lệnh (outbox); `nil` = chỉ đọc.
  ///   - onEnqueued: hàng vừa bền — app gọi `sync.kick()`.
  public init(
    userId: String, source: any ExerciseSource, cache: any ExerciseCache, store: (any PlanWriteStore)? = nil,
    clock: any WallClock = SystemWallClock(),
    makeId: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
    onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
  ) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.store = store
    self.clock = clock
    self.makeId = makeId
    self.onEnqueued = onEnqueued
  }

  public func exercise(id: String) -> LibraryExercise? { exercises.first { $0.id == id.lowercased() } }

  public var declaredKinds: [String: String] { ExerciseCatalog.declaredKinds(exercises) }

  public func load() async {
    let mark = editSeq
    let pending = await pendingEdits()
    if !loaded, let cached = try? await cache.load(userId: userId) {
      server = cached
      loaded = true
    }
    if let pending { merge(pending, since: mark, replacing: false) }
    if loaded || !edits.isEmpty { publish() }
    await refresh()
  }

  /// Đọc lệnh chưa gửi TRƯỚC khi hỏi server (xem `TodayController.refreshNow`).
  public func refresh() async {
    let mark = editSeq
    let pending = await pendingEdits()
    do {
      let fresh = try await source.exercises(userId: userId)
      // RLS đã lọc; lọc lại để cache không bao giờ giữ bài riêng của người khác.
      var seen = Set<String>()
      server = fresh.filter { ($0.userId == nil || $0.userId == userId) && seen.insert($0.id).inserted }
      loaded = true
      failure = nil
      if let pending { merge(pending, since: mark, replacing: true) }
      try? await cache.save(userId: userId, server)
    } catch {
      failure = TodayController.failure([error])
      if let pending { merge(pending, since: mark, replacing: false) }
    }
    publish()
  }

  // MARK: - Ghi (#421)

  /// Id cho một bài sắp thêm: form giữ nó, bấm Thêm lại là MỘT bài.
  public func newExerciseId() -> String { makeId() }

  /// Thêm bài của mình (`useAddExercise`): nhóm cơ và thiết bị lưu KHOÁ khi
  /// nhận ra (`canonicalMuscleGroup(g) ?? g`, `canonicalEquipment(e) ?? e`),
  /// thiết bị trống thì bỏ trường; loại bài chỉ gửi khi người dùng chọn — mặc
  /// định là một lời khẳng định không ai nói ra.
  @discardableResult
  public func create(
    id: String, name: String, muscleGroup: String, equipment: String = "", kind: ExerciseKind? = nil
  ) async throws(Refusal) -> LibraryExercise {
    guard let store else { throw .readOnly }
    let id = id.lowercased()
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw .emptyName }
    let group = MuscleGroup.canonical(muscleGroup) ?? muscleGroup
    let gear = Equipment.canonical(equipment)?.rawValue ?? equipment.trimmingCharacters(in: .whitespacesAndNewlines)
    var payload: [String: JSONValue] = [
      "id": .string(id), "user_id": .string(userId), "name": .string(trimmed), "muscle_group": .string(group),
    ]
    if !gear.isEmpty { payload["equipment"] = .string(gear) }
    if let kind { payload["exercise_kind"] = .string(kind.rawValue) }
    let entry = OutboxEntry(
      id: id, userId: userId, kind: ExerciseEdit.createKind, payload: .object(payload), createdAt: clock.nowMillis())
    try await commit(entry, to: store)
    return exercise(id: id)
      ?? LibraryExercise(id: id, userId: userId, name: trimmed, muscleGroup: group, equipment: gear.isEmpty ? nil : gear,
                         kind: kind?.rawValue)
  }

  /// Xoá bài của mình (`useDeleteExercise`). Template và buổi đã ghi trỏ vào
  /// bài này KHÔNG đổi: chúng mang tên bài trong JSON của chúng, như baseline
  /// (không xoá dây chuyền).
  public func delete(id: String) async throws(Refusal) {
    guard let store else { throw .readOnly }
    let id = id.lowercased()
    guard let target = exercise(id: id) else { throw .notFound }
    guard target.userId?.lowercased() == userId.lowercased() else { throw .notOwn }
    let entry = OutboxEntry(
      id: "\(id)@del-\(makeId())", userId: userId, kind: ExerciseEdit.deleteKind,
      payload: .object(["id": .string(id)]), createdAt: clock.nowMillis())
    try await commit(entry, to: store)
  }

  private func commit(_ entry: OutboxEntry, to store: any PlanWriteStore) async throws(Refusal) {
    do {
      try await store.enqueue([entry])
    } catch {
      throw .storage(LocalWriteError("\(error)"))
    }
    if !edits.contains(where: { $0.entry.id == entry.id }) {
      editSeq += 1
      edits.append((editSeq, entry))
    }
    publish()
    onEnqueued(entry)
  }

  // MARK: - Bản server ⊕ lệnh chưa gửi

  private func pendingEdits() async -> [OutboxEntry]? {
    guard let store else { return [] }
    guard let all = try? await store.pending(userId: userId) else { return nil }
    return all.filter { $0.userId == userId && ExerciseEdit.kinds.contains($0.kind) }
  }

  /// Như `TodayController.mergeEdits`: bản server vừa về thì lệnh đã gửi xong
  /// nằm trong nó — chỉ giữ thêm lệnh nhận SAU `mark`.
  private func merge(_ pending: [OutboxEntry], since mark: Int, replacing: Bool) {
    let kept = replacing ? edits.filter { $0.seq > mark } : edits
    var merged: [(seq: Int, entry: OutboxEntry)] = []
    var seen = Set<String>()
    for e in pending where seen.insert(e.id).inserted {
      merged.append((kept.first { $0.entry.id == e.id }?.seq ?? 0, e))
    }
    for k in kept where seen.insert(k.entry.id).inserted { merged.append(k) }
    edits = merged
  }

  private func publish() {
    exercises = ExerciseCatalog.applying(server, edits.map(\.entry))
    onChange?(exercises)
  }
}
