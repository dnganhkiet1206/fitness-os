public import Foundation
public import Observation

// Hướng dẫn bài tập (#422) — sheet `app/exercise-guide.tsx`, chỉ ĐỌC.
//
// Nguồn baseline (`fac9ac2`), port nguyên hợp đồng nội dung, không thêm chữ nào:
// - `hooks/use-exercise-guide.ts`: tra bài theo id (bài của mình trước), không
//   thấy thì theo tên (`exerciseKey`), không thấy nữa thì "không có bài này";
//   lượt hai đọc `exercise_guide_content` + `exercise_media` song song;
// - `lib/guide-content.ts`: chọn ngôn ngữ (đúng tiếng → vi → không có), cắt
//   dòng trống; tiếng Tây Ban Nha đọc nội dung tiếng Anh;
// - `lib/exercise-media.ts`: một bộ là một kiểu (hàng đầu theo `position`
//   quyết), video chỉ một, ảnh một hay nhiều; không có hàng nào thì đọc cột
//   cũ `video_url` (đuôi ảnh → ảnh, còn lại → video);
// - `lib/guide-related.ts`: tab "Cùng thiết bị" / "Cùng nhóm cơ".
//
// Golden: `Fixtures/guide-golden.json` sinh bằng chính mã RN biên dịch
// (`apps/ios/tools/insights-golden/gen-guide.mjs`).

/// Ngôn ngữ của nội dung: chỉ có vi / en (es đọc en, `guideLang`).
public enum GuideLang: String, Sendable, Hashable, Codable {
  case vi, en

  /// es (và mọi ngôn ngữ khác vi) đọc nội dung en (`guideLang`).
  public init(_ lang: MuscleGroup.Language) {
    switch lang {
    case .vi: self = .vi
    case .en, .es: self = .en
    }
  }
}

/// Một hàng `exercise_guide_content`.
public struct GuideContentRow: Sendable, Hashable, Codable {
  public let locale: String
  public let instructions: [String]?
  public let formCues: [String]?
  public let commonMistakes: [String]?

  public init(locale: String, instructions: [String]?, formCues: [String]?, commonMistakes: [String]?) {
    self.locale = locale
    self.instructions = instructions
    self.formCues = formCues
    self.commonMistakes = commonMistakes
  }
}

public struct GuideContent: Sendable, Hashable, Codable {
  public let locale: GuideLang
  public let instructions: [String]
  public let formCues: [String]
  public let commonMistakes: [String]

  static func clean(_ xs: [String]?) -> [String] {
    (xs ?? []).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
  }

  /// `pickLocale`: đúng tiếng có nội dung → tiếng Việt có nội dung → không có.
  static func pickLocale<T>(_ rows: [T], _ lang: GuideLang, locale: (T) -> String, has: (T) -> Bool) -> T? {
    rows.first { locale($0) == lang.rawValue && has($0) } ?? rows.first { locale($0) == "vi" && has($0) }
  }

  /// `pickContent`.
  public static func pick(_ rows: [GuideContentRow], _ lang: GuideLang) -> GuideContent? {
    guard let row = pickLocale(rows, lang, locale: \.locale, has: {
      !clean($0.instructions).isEmpty || !clean($0.formCues).isEmpty || !clean($0.commonMistakes).isEmpty
    }), let locale = GuideLang(rawValue: row.locale)
    else { return nil }
    return GuideContent(
      locale: locale, instructions: clean(row.instructions), formCues: clean(row.formCues),
      commonMistakes: clean(row.commonMistakes))
  }
}

/// Chú thích của một tấm (`exercise_media_content`).
public struct MediaCaptionRow: Sendable, Hashable, Codable {
  public let locale: String
  public let title: String?
  public let description: String?

  public init(locale: String, title: String?, description: String?) {
    self.locale = locale
    self.title = title
    self.description = description
  }
}

/// Một hàng `exercise_media`.
public struct MediaRow: Sendable, Hashable, Codable {
  public let kind: String?
  public let uri: String?
  /// `nil` = không phải số (vị trí 0, như `typeof … === 'number'`).
  public let position: Double?
  /// `duration_s` (số, hoặc chuỗi số).
  public let durationS: Double?
  public let posterUri: String?
  public let alt: String?
  public let captions: [MediaCaptionRow]?

  public init(
    kind: String?, uri: String?, position: Double?, durationS: Double?, posterUri: String?, alt: String?,
    captions: [MediaCaptionRow]?
  ) {
    self.kind = kind
    self.uri = uri
    self.position = position
    self.durationS = durationS
    self.posterUri = posterUri
    self.alt = alt
    self.captions = captions
  }
}

public struct MediaItem: Sendable, Hashable, Codable {
  public enum Kind: String, Sendable, Hashable, Codable { case image, video }
  public let kind: Kind
  public let uri: String
  public let durationS: Double?
  public let posterUri: String?
  public let alt: String?
  public let title: String?
  public let description: String
}

/// `MediaState`: không có / một ảnh / bộ ảnh / một video.
public struct MediaState: Sendable, Hashable, Codable {
  public enum Shape: String, Sendable, Hashable, Codable {
    case none, imageSingle = "image_single", imageGallery = "image_gallery", video
  }
  public let shape: Shape
  public let items: [MediaItem]

  public static let none = MediaState(shape: .none, items: [])

  public var hasMedia: Bool { shape != .none }
  /// Chấm phân trang chỉ cho bộ ảnh.
  public var showsDots: Bool { shape == .imageGallery }
  public var displayDuration: Double? { shape == .video ? items.first?.durationS : nil }
  public var captionedItems: [MediaItem] { items.filter { $0.title != nil } }

  static func text(_ v: String?) -> String? {
    let t = (v ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }

  static let legacyImage = try! NSRegularExpression(
    pattern: #"\.(gif|webp|png|jpe?g|avif|heic|bmp)(\?|#|$)"#, options: [.caseInsensitive])

  /// `resolveExerciseMedia`.
  public static func resolve(_ rows: [MediaRow]?, legacy: String?, lang: GuideLang) -> MediaState {
    let usable = (rows ?? []).enumerated().compactMap { i, r -> (Int, MediaRow, MediaItem.Kind, Double)? in
      guard let kind = r.kind.flatMap(MediaItem.Kind.init(rawValue:)), text(r.uri) != nil else { return nil }
      let pos = r.position.flatMap { $0.isFinite ? $0 : nil } ?? 0
      return (i, r, kind, pos)
    }
    // Thứ tự tất định: `position`, rồi `uri` (thô, so từng đơn vị UTF-16 như `<` của JS).
    let sorted = usable.sorted { a, b in
      if a.3 != b.3 { return a.3 < b.3 }
      let x = Array((a.1.uri ?? "").utf16), y = Array((b.1.uri ?? "").utf16)
      if x != y { return x.lexicographicallyPrecedes(y) }
      return a.0 < b.0
    }
    let clean = sorted.map { _, r, kind, _ -> MediaItem in
      let caption = GuideContent.pickLocale(r.captions ?? [], lang, locale: \.locale, has: { text($0.title) != nil })
      return MediaItem(
        kind: kind, uri: text(r.uri)!,
        durationS: kind == .video ? r.durationS.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } : nil,
        posterUri: kind == .video ? text(r.posterUri) : nil, alt: text(r.alt),
        title: caption.flatMap { text($0.title) }, description: caption.flatMap { text($0.description) } ?? "")
    }
    if let first = clean.first {
      // Một bộ là một kiểu: hàng đầu quyết, hàng khác kiểu bị bỏ.
      let items = clean.filter { $0.kind == first.kind }
      if first.kind == .video { return MediaState(shape: .video, items: [items[0]]) }
      return MediaState(shape: items.count > 1 ? .imageGallery : .imageSingle, items: items)
    }
    guard let url = text(legacy) else { return .none }
    let isImage = legacyImage.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)) != nil
    let item = MediaItem(
      kind: isImage ? .image : .video, uri: url, durationS: nil, posterUri: nil, alt: nil, title: nil, description: "")
    return MediaState(shape: isImage ? .imageSingle : .video, items: [item])
  }

  /// `clockLabel`: "m:ss", tối thiểu 0:01 (`Math.round` của JS).
  public static func clockLabel(_ seconds: Double) -> String {
    let t = max(1, Int((seconds + 0.5).rounded(.down)))
    let s = t % 60
    return "\(t / 60):\(s < 10 ? "0" : "")\(s)"
  }
}

extension Equipment {
  /// `equipmentMatchKey`: khoá thiết bị để so "cùng thiết bị" — khoá chuẩn khi
  /// nhận ra, không thì `raw:<chữ đã gập>` (Kettlebell vẫn khớp kettlebell).
  public static func matchKey(_ raw: String?) -> String? {
    if let key = canonical(raw) { return key.rawValue }
    let f = fold(raw ?? "")
    return f.isEmpty ? nil : "raw:\(f)"
  }
}

/// Một hàng `exercises` như sheet hướng dẫn đọc (thêm `video_url`).
public struct GuideExerciseRow: Sendable, Hashable, Codable {
  public let id: String
  public let userId: String?
  public let name: String
  public let muscleGroup: String?
  public let equipment: String?
  public let videoUrl: String?

  public init(id: String, userId: String?, name: String, muscleGroup: String?, equipment: String?, videoUrl: String?) {
    self.id = id
    self.userId = userId
    self.name = name
    self.muscleGroup = muscleGroup
    self.equipment = equipment
    self.videoUrl = videoUrl
  }
}

/// Nội dung sheet hướng dẫn (`ExerciseGuide`).
public struct ExerciseGuide: Sendable, Hashable, Codable {
  public enum Match: String, Sendable, Hashable, Codable { case id, name, none }
  public struct Muscle: Sendable, Hashable, Codable {
    public let key: MuscleGroup
    public let label: String
  }

  /// `nil` khi không tìm thấy bài.
  public let id: String?
  public let name: String
  /// Nhãn theo ngôn ngữ, `nil` khi trống.
  public let muscleGroup: String?
  public let equipment: String?
  public let muscles: [Muscle]
  public let equipmentKey: String?
  public let instructions: [String]
  public let formCues: [String]
  public let commonMistakes: [String]
  public let media: MediaState
  public let matchedBy: Match
  public let contentLocale: GuideLang?
  public let hasContent: Bool
  public let hasMetadata: Bool

  /// Không có bài này: sheet vẫn mở với tên đã truyền, không bịa chữ nào.
  public static func unknown(name: String) -> ExerciseGuide {
    ExerciseGuide(
      id: nil, name: name, muscleGroup: nil, equipment: nil, muscles: [], equipmentKey: nil, instructions: [],
      formCues: [], commonMistakes: [], media: .none, matchedBy: .none, contentLocale: nil, hasContent: false,
      hasMetadata: false)
  }

  /// `shape` (`use-exercise-guide.ts`).
  public static func shape(
    _ row: GuideExerciseRow, matchedBy: Match, fallbackName: String, content: [GuideContentRow], media: [MediaRow],
    lang: MuscleGroup.Language
  ) -> ExerciseGuide {
    let guideLang = GuideLang(lang)
    let picked = GuideContent.pick(content, guideLang)
    let equipment = MediaState.text(Equipment.label(row.equipment, lang))
    let muscleGroup = MediaState.text(MuscleGroup.label(row.muscleGroup, lang))
    let instructions = picked?.instructions ?? []
    let formCues = picked?.formCues ?? []
    let mistakes = picked?.commonMistakes ?? []
    return ExerciseGuide(
      id: row.id, name: MediaState.text(row.name) ?? fallbackName, muscleGroup: muscleGroup, equipment: equipment,
      muscles: MuscleGroup.keys(for: row.muscleGroup).map { Muscle(key: $0, label: $0.label(lang)) },
      equipmentKey: Equipment.matchKey(row.equipment), instructions: instructions, formCues: formCues,
      commonMistakes: mistakes, media: MediaState.resolve(media, legacy: row.videoUrl, lang: guideLang),
      matchedBy: matchedBy, contentLocale: picked?.locale,
      hasContent: !instructions.isEmpty || !formCues.isEmpty || !mistakes.isEmpty,
      hasMetadata: equipment != nil || muscleGroup != nil)
  }
}

/// Đọc từ server (`ASCNDBackend.SupabaseExerciseGuideSource`).
public protocol ExerciseGuideSource: Sendable {
  /// Bài mẫu + bài của mình; `id` khác `nil` thì chỉ hàng có id ấy.
  func guideRows(userId: String, id: String?) async throws -> [GuideExerciseRow]
  func guideContent(exerciseId: String) async throws -> [GuideContentRow]
  func guideMedia(exerciseId: String) async throws -> [MediaRow]
}

public protocol ExerciseGuideCache: Sendable {
  func load(userId: String, key: String) async throws -> ExerciseGuide?
  func save(userId: String, key: String, _ guide: ExerciseGuide) async throws
}

public enum ExerciseGuides {
  /// Hai dòng cùng khớp (bài mẫu và bản sao của mình): của mình thắng.
  static func pick(_ rows: [GuideExerciseRow]) -> GuideExerciseRow? {
    rows.first { $0.userId != nil } ?? rows.first
  }

  /// `queryFn` của `useExerciseGuide`: id → tên → không có. Id không còn
  /// (bài bị xoá, dữ liệu cũ) KHÔNG ném — rơi xuống đường tên.
  public static func fetch(
    _ source: any ExerciseGuideSource, userId: String, exerciseId: String?, name: String, lang: MuscleGroup.Language
  ) async throws -> ExerciseGuide {
    func withContent(_ row: GuideExerciseRow, _ match: ExerciseGuide.Match) async throws -> ExerciseGuide {
      async let content = source.guideContent(exerciseId: row.id)
      async let media = source.guideMedia(exerciseId: row.id)
      return ExerciseGuide.shape(
        row, matchedBy: match, fallbackName: name, content: try await content, media: try await media, lang: lang)
    }
    if let exerciseId, !exerciseId.isEmpty,
      let row = pick(try await source.guideRows(userId: userId, id: exerciseId.lowercased()))
    {
      return try await withContent(row, .id)
    }
    let key = PersonalRecords.exerciseKey(name)
    if !key.isEmpty,
      let row = pick(try await source.guideRows(userId: userId, id: nil).filter { PersonalRecords.exerciseKey($0.name) == key })
    {
      return try await withContent(row, .name)
    }
    return .unknown(name: name)
  }

  /// Khoá cache: người, bài (id hoặc tên), ngôn ngữ — đổi tiếng là nội dung khác.
  public static func cacheKey(exerciseId: String?, name: String, lang: MuscleGroup.Language) -> String {
    "\(exerciseId?.lowercased() ?? "-")|\(PersonalRecords.exerciseKey(name))|\(lang.rawValue)"
  }
}

/// Bài liên quan (`lib/guide-related.ts`).
public enum GuideRelated {
  public static let limit = 8

  public struct Subject: Sendable, Hashable {
    public let id: String?
    public let name: String
    public let muscleKeys: [MuscleGroup]
    public let equipmentKey: String?

    public init(id: String?, name: String, muscleKeys: [MuscleGroup], equipmentKey: String?) {
      self.id = id
      self.name = name
      self.muscleKeys = muscleKeys
      self.equipmentKey = equipmentKey
    }

    public init(_ guide: ExerciseGuide) {
      self.init(id: guide.id, name: guide.name, muscleKeys: guide.muscles.map(\.key), equipmentKey: guide.equipmentKey)
    }
  }

  public struct Item: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let muscleKeys: [MuscleGroup]
    public let muscleLabel: String
    /// Số nhóm cơ chung với bài đang xem.
    public let shared: Int
  }

  /// Bỏ chính nó (theo id và theo tên), bỏ hàng không tên, mỗi tên một lần.
  static func others(_ rows: [LibraryExercise], _ subject: Subject) -> [LibraryExercise] {
    let selfKey = PersonalRecords.exerciseKey(subject.name)
    var seen = Set<String>()
    var out: [LibraryExercise] = []
    for r in rows {
      guard !r.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
      if let id = subject.id, r.id == id { continue }
      let k = PersonalRecords.exerciseKey(r.name)
      if !selfKey.isEmpty, k == selfKey { continue }
      if !k.isEmpty, !seen.insert(k).inserted { continue }
      out.append(r)
    }
    return out
  }

  /// Theo tên đã gập, so từng đơn vị UTF-16 (`<` của JS); bằng nhau giữ thứ tự.
  static func byName(_ rows: [LibraryExercise]) -> [LibraryExercise] {
    rows.enumerated().sorted { a, b in
      let x = Array(PersonalRecords.exerciseKey(a.element.name).utf16)
      let y = Array(PersonalRecords.exerciseKey(b.element.name).utf16)
      if x != y { return x.lexicographicallyPrecedes(y) }
      return a.offset < b.offset
    }.map(\.element)
  }

  static func item(_ r: LibraryExercise, _ subject: Subject, _ lang: MuscleGroup.Language) -> Item {
    let keys = MuscleGroup.keys(for: r.muscleGroup)
    let mine = Set(subject.muscleKeys)
    return Item(
      id: r.id, name: r.name.trimmingCharacters(in: .whitespacesAndNewlines), muscleKeys: keys,
      muscleLabel: MuscleGroup.label(r.muscleGroup, lang), shared: keys.filter { mine.contains($0) }.count)
  }

  /// Tab "Cùng thiết bị": cùng khoá thiết bị, theo tên.
  public static func sameEquipment(
    _ rows: [LibraryExercise], _ subject: Subject, lang: MuscleGroup.Language = .vi, limit: Int = limit
  ) -> [Item] {
    guard let key = subject.equipmentKey else { return [] }
    return byName(others(rows, subject).filter { Equipment.matchKey($0.equipment) == key })
      .prefix(max(0, limit)).map { item($0, subject, lang) }
  }

  /// Tab "Cùng nhóm cơ": có ít nhất một nhóm chung, chung nhiều trước, rồi theo tên.
  public static func sameMuscle(
    _ rows: [LibraryExercise], _ subject: Subject, lang: MuscleGroup.Language = .vi, limit: Int = limit
  ) -> [Item] {
    guard !subject.muscleKeys.isEmpty else { return [] }
    let items = byName(others(rows, subject)).map { item($0, subject, lang) }.filter { $0.shared > 0 }
    return Array(items.enumerated().sorted { a, b in
      a.element.shared != b.element.shared ? a.element.shared > b.element.shared : a.offset < b.offset
    }.map(\.element).prefix(max(0, limit)))
  }
}

/// Sheet hướng dẫn, local-first — `staleTime` 30 phút như baseline.
///
/// RN behavior: mỗi lần mở sheet (sau 30 phút) đọc lại; offline lần đầu thì
///   "không đọc được dữ liệu".
/// Native behavior: bản đã đọc (theo người, bài, ngôn ngữ) hiện ngay, kể cả
///   offline; làm mới khi cũ hơn 30 phút.
@MainActor @Observable
public final class ExerciseGuideBook {
  public static let staleAfterMillis: Int64 = 30 * 60 * 1000

  public let userId: String
  public private(set) var guide: ExerciseGuide?
  public private(set) var loading = false
  public private(set) var failure: TodayController.RefreshFailure?

  @ObservationIgnored private let source: any ExerciseGuideSource
  @ObservationIgnored private let cache: any ExerciseGuideCache
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var fetchedAt: [String: EpochMillis] = [:]
  @ObservationIgnored private var current: String?

  public init(userId: String, source: any ExerciseGuideSource, cache: any ExerciseGuideCache, clock: any WallClock = SystemWallClock()) {
    self.userId = userId
    self.source = source
    self.cache = cache
    self.clock = clock
  }

  /// Mở sheet cho một bài. Bản trên máy trước, rồi server nếu cũ.
  public func open(exerciseId: String?, name: String, lang: MuscleGroup.Language) async {
    let key = ExerciseGuides.cacheKey(exerciseId: exerciseId, name: name, lang: lang)
    current = key
    failure = nil
    guide = nil
    if let cached = try? await cache.load(userId: userId, key: key), current == key {
      guide = cached
    }
    if let at = fetchedAt[key], clock.nowMillis().millis - at.millis < Self.staleAfterMillis, guide != nil { return }
    loading = true
    defer { if current == key { loading = false } }
    do {
      let fresh = try await ExerciseGuides.fetch(source, userId: userId, exerciseId: exerciseId, name: name, lang: lang)
      guard current == key else { return }
      guide = fresh
      fetchedAt[key] = clock.nowMillis()
      try? await cache.save(userId: userId, key: key, fresh)
    } catch {
      guard current == key else { return }
      failure = TodayController.failure([error])
    }
  }
}
