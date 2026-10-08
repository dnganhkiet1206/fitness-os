@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Hướng dẫn bài tập (#422). Phần thuần so với CHÍNH mã RN @ fac9ac2
/// (`Fixtures/guide-golden.json`); phần tra cứu / read model theo
/// `use-exercise-guide.ts`.
struct ExerciseGuideGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "guide-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }
  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }
  static func strings(_ v: JSONValue?) -> [String]? {
    guard case .array(let a)? = v else { return nil }
    return a.compactMap(\.stringValue)
  }
  static func s(_ v: String?) -> JSONValue { v.map(JSONValue.string) ?? .null }
  /// `Number(x)` của JS cho `duration_s` (số hoặc chuỗi số).
  static func jsNumber(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)?: return n
    case .string(let t)?: return Double(t.trimmingCharacters(in: .whitespaces))
    default: return nil
    }
  }

  @Test func contentMatchesRN() throws {
    let cases = Self.array(try Self.golden()["content"])
    #expect(cases.count == 10)
    for c in cases {
      let rows = Self.array(c["rows"]).map {
        GuideContentRow(
          locale: $0["locale"]?.stringValue ?? "", instructions: Self.strings($0["instructions"]),
          formCues: Self.strings($0["form_cues"]), commonMistakes: Self.strings($0["common_mistakes"]))
      }
      let lang = try #require(c["lang"]?.stringValue.flatMap(GuideLang.init(rawValue:)))
      let got: JSONValue = GuideContent.pick(rows, lang).map {
        .object([
          "locale": .string($0.locale.rawValue), "instructions": .array($0.instructions.map(JSONValue.string)),
          "formCues": .array($0.formCues.map(JSONValue.string)),
          "commonMistakes": .array($0.commonMistakes.map(JSONValue.string)),
        ])
      } ?? .null
      #expect(got == c["out"], "\(c["name"]?.stringValue ?? "?") · \(lang)")
    }
  }

  @Test func mediaMatchesRN() throws {
    let cases = Self.array(try Self.golden()["media"])
    #expect(cases.count == 16)
    for c in cases {
      let rows: [MediaRow]? = c["rows"] == .null ? nil : Self.array(c["rows"]).map { r in
        MediaRow(
          kind: r["kind"]?.stringValue, uri: r["uri"]?.stringValue, position: r["position"]?.doubleValue,
          durationS: Self.jsNumber(r["duration_s"]), posterUri: r["poster_uri"]?.stringValue, alt: r["alt"]?.stringValue,
          captions: Self.array(r["exercise_media_content"]).map {
            MediaCaptionRow(locale: $0["locale"]?.stringValue ?? "", title: $0["title"]?.stringValue, description: $0["description"]?.stringValue)
          })
      }
      let lang = try #require(c["lang"]?.stringValue.flatMap(GuideLang.init(rawValue:)))
      let m = MediaState.resolve(rows, legacy: c["legacy"]?.stringValue, lang: lang)
      let got: JSONValue = .object([
        "type": .string(m.shape.rawValue),
        "items": .array(m.items.map {
          .object([
            "kind": .string($0.kind.rawValue), "uri": .string($0.uri), "durationS": $0.durationS.map(JSONValue.number) ?? .null,
            "posterUri": Self.s($0.posterUri), "alt": Self.s($0.alt), "title": Self.s($0.title),
            "description": .string($0.description),
          ])
        }),
      ])
      #expect(got == c["out"], "\(c["name"]?.stringValue ?? "?") · \(lang)")
    }
  }

  @Test func clockAndEquipmentKeysMatchRN() throws {
    let g = try Self.golden()
    for c in Self.array(g["clocks"]) {
      #expect(MediaState.clockLabel(c["seconds"]?.doubleValue ?? -1) == c["label"]?.stringValue)
    }
    for c in Self.array(g["equipment"]) {
      #expect(Equipment.matchKey(c["raw"]?.stringValue) == c["key"]?.stringValue, "\(c["raw"]?.stringValue ?? "null")")
    }
  }

  @Test func relatedMatchesRN() throws {
    let g = try Self.golden()
    let library = Self.array(g["library"]).map {
      LibraryExercise(
        id: $0["id"]?.stringValue ?? "", userId: nil, name: $0["name"]?.stringValue ?? "",
        muscleGroup: $0["muscle_group"]?.stringValue, equipment: $0["equipment"]?.stringValue, kind: nil)
    }
    let cases = Self.array(g["related"])
    #expect(cases.count == 20)
    for c in cases {
      let sj = c["subject"]
      let subject = GuideRelated.Subject(
        id: sj?["id"]?.stringValue, name: sj?["name"]?.stringValue ?? "",
        muscleKeys: (Self.strings(sj?["muscleKeys"]) ?? []).compactMap(MuscleGroup.init(rawValue:)),
        equipmentKey: sj?["equipmentKey"]?.stringValue)
      let lang = try #require(c["lang"]?.stringValue.flatMap(MuscleGroup.Language.init(rawValue:)))
      let limit = c["limit"]?.intValue ?? 0
      func json(_ items: [GuideRelated.Item]) -> JSONValue {
        .array(items.map {
          .object([
            "id": .string($0.id), "name": .string($0.name), "muscleKeys": .array($0.muscleKeys.map { .string($0.rawValue) }),
            "muscleLabel": .string($0.muscleLabel), "shared": .number(Double($0.shared)),
          ])
        })
      }
      let label = "\(subject.name) · \(lang) · \(limit)"
      #expect(json(GuideRelated.sameEquipment(library, subject, lang: lang, limit: limit)) == c["sameEquipment"], "\(label)")
      #expect(json(GuideRelated.sameMuscle(library, subject, lang: lang, limit: limit)) == c["sameMuscle"], "\(label)")
    }
  }
}

private actor Source: ExerciseGuideSource {
  var rows: [GuideExerciseRow]
  var content: [String: [GuideContentRow]] = [:]
  var media: [String: [MediaRow]] = [:]
  var down = false
  private(set) var calls = 0
  init(_ rows: [GuideExerciseRow]) { self.rows = rows }
  func setDown(_ d: Bool) { down = d }
  func setContent(_ id: String, _ c: [GuideContentRow]) { content[id] = c }
  func guideRows(userId: String, id: String?) async throws -> [GuideExerciseRow] {
    calls += 1
    if down { throw URLError(.notConnectedToInternet) }
    return rows.filter { ($0.userId == nil || $0.userId == userId) && (id == nil || $0.id == id) }
  }
  func guideContent(exerciseId: String) async throws -> [GuideContentRow] {
    if down { throw URLError(.notConnectedToInternet) }
    return content[exerciseId] ?? []
  }
  func guideMedia(exerciseId: String) async throws -> [MediaRow] {
    if down { throw URLError(.notConnectedToInternet) }
    return media[exerciseId] ?? []
  }
}
/// Nguồn giữ câu trả lời cho một bài tới khi test thả.
private actor GatedGuideSource: ExerciseGuideSource {
  private var held: String?
  private var waiters: [CheckedContinuation<Void, Never>] = []
  var waiting: Bool { !waiters.isEmpty }
  func hold(_ id: String) { held = id }
  func releaseAll() {
    held = nil
    waiters.forEach { $0.resume() }
    waiters = []
  }
  func guideRows(userId: String, id: String?) async throws -> [GuideExerciseRow] {
    if let id, id == held { await withCheckedContinuation { waiters.append($0) } }
    return [seed, GuideExerciseRow(id: "other", userId: nil, name: "Row", muscleGroup: "back", equipment: nil, videoUrl: nil)]
      .filter { id == nil || $0.id == id }
  }
  func guideContent(exerciseId: String) async throws -> [GuideContentRow] { exerciseId == "seed" ? rows : [] }
  func guideMedia(exerciseId: String) async throws -> [MediaRow] { [] }
}
private actor Cache: ExerciseGuideCache {
  var store: [String: ExerciseGuide] = [:]
  func load(userId: String, key: String) async throws -> ExerciseGuide? { store["\(userId)#\(key)"] }
  func save(userId: String, key: String, _ guide: ExerciseGuide) async throws { store["\(userId)#\(key)"] = guide }
}

private let seed = GuideExerciseRow(id: "seed", userId: nil, name: "Bench Press", muscleGroup: "chest", equipment: "barbell", videoUrl: "https://x/bench.gif")
private let mine = GuideExerciseRow(id: "mine", userId: "u1", name: "bench  press", muscleGroup: "Ngực/Vai", equipment: "Kettlebell", videoUrl: nil)
private let theirs = GuideExerciseRow(id: "theirs", userId: "u2", name: "Secret", muscleGroup: "back", equipment: nil, videoUrl: nil)
private let rows = [
  GuideContentRow(locale: "vi", instructions: ["Nằm trên ghế", " "], formCues: ["Siết bả vai"], commonMistakes: nil),
  GuideContentRow(locale: "en", instructions: ["Lie on the bench"], formCues: [], commonMistakes: ["Bouncing"]),
]

@MainActor
struct ExerciseGuideLookupTests {
  /// Theo id: đúng bài, nội dung theo tiếng (es đọc en), nhãn theo tiếng.
  @Test func byIdWithContentAndLabels() async throws {
    let source = Source([seed, mine])
    await source.setContent("seed", rows)
    let vi = try await ExerciseGuides.fetch(source, userId: "u1", exerciseId: "SEED", name: "x", lang: .vi)
    #expect(vi.matchedBy == .id && vi.id == "seed" && vi.name == "Bench Press")
    #expect(vi.instructions == ["Nằm trên ghế"] && vi.formCues == ["Siết bả vai"] && vi.commonMistakes.isEmpty)
    #expect(vi.muscleGroup == "Ngực" && vi.equipment == "Tạ đòn" && vi.equipmentKey == "barbell")
    #expect(vi.media.shape == .imageSingle && vi.hasContent && vi.hasMetadata && vi.contentLocale == .vi)
    let es = try await ExerciseGuides.fetch(source, userId: "u1", exerciseId: "seed", name: "x", lang: .es)
    #expect(es.instructions == ["Lie on the bench"] && es.contentLocale == .en && es.equipment == "Barra")
  }

  /// Id không còn → theo tên; hai dòng cùng tên thì bài của mình thắng; thiết
  /// bị lạ giữ nguyên chữ.
  @Test func staleIdFallsBackToNameAndOwnRowWins() async throws {
    let g = try await ExerciseGuides.fetch(Source([seed, mine]), userId: "u1", exerciseId: "gone", name: "BENCH PRESS ", lang: .vi)
    #expect(g.matchedBy == .name && g.id == "mine")
    #expect(g.equipment == "Kettlebell" && g.equipmentKey == "raw:kettlebell")
    #expect(g.muscles.map(\.label) == ["Ngực", "Vai"])
    #expect(!g.hasContent && g.media == .none)
  }

  /// Không có bài: sheet mở với tên đã truyền, không bịa chữ nào; bài riêng
  /// của người khác không bao giờ được trả về.
  @Test func unknownExercise() async throws {
    let g = try await ExerciseGuides.fetch(Source([seed, theirs]), userId: "u1", exerciseId: nil, name: "Secret", lang: .vi)
    #expect(g == .unknown(name: "Secret"))
    let empty = try await ExerciseGuides.fetch(Source([seed]), userId: "u1", exerciseId: nil, name: "  ", lang: .vi)
    #expect(empty.matchedBy == .none)
  }

  /// Local-first: offline mở lại bài đã xem; khoá theo ngôn ngữ; 30 phút
  /// chưa cũ thì không gọi mạng lại.
  @Test func bookIsLocalFirstPerLanguage() async throws {
    let source = Source([seed])
    await source.setContent("seed", rows)
    let cache = Cache()
    let clock = ManualClock(EpochMillis(1_791_183_600_000))
    let book = ExerciseGuideBook(userId: "u1", source: source, cache: cache, clock: clock)
    await book.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(book.guide?.instructions == ["Nằm trên ghế"])
    let calls = await source.calls
    await book.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(await source.calls == calls, "chưa tới 30 phút: không gọi lại")

    await source.setDown(true)
    let again = ExerciseGuideBook(userId: "u1", source: source, cache: cache, clock: clock)
    await again.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(again.guide?.instructions == ["Nằm trên ghế"] && again.failure == .offline)
    await again.open(exerciseId: "seed", name: "Bench Press", lang: .en)
    #expect(again.guide == nil && again.failure == .offline, "tiếng khác là nội dung khác — không lấy bản tiếng Việt")
    let other = ExerciseGuideBook(userId: "u2", source: source, cache: cache, clock: clock)
    await other.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(other.guide == nil, "cache theo người")
  }

  /// Busy-probe (#527 A-NEXT 2): đang đọc bài A thì mở bài B đã có bản nhớ
  /// còn mới — `loading` phải hạ (trước đây kẹt `true` vì `defer` của A chỉ
  /// hạ khi A vẫn là bài hiện tại).
  @Test func switchingToAFreshGuideClearsLoading() async throws {
    let source = GatedGuideSource()
    let book = ExerciseGuideBook(userId: "u1", source: source, cache: Cache(),
                                 clock: ManualClock(EpochMillis(1_791_183_600_000)))
    await book.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(book.guide != nil && !book.loading)
    await source.hold("other")
    let a = Task { await book.open(exerciseId: "other", name: "Row", lang: .vi) }
    while !(await source.waiting) { await Task.yield() }
    #expect(book.loading)
    await book.open(exerciseId: "seed", name: "Bench Press", lang: .vi)
    #expect(!book.loading, "bài B có bản mới: không có gì đang tải")
    await source.releaseAll()
    await a.value
    #expect(!book.loading && book.guide?.instructions == ["Nằm trên ghế"], "kết quả của A không đè B")
  }

  @Test func relatedFromAGuide() async throws {
    let lib = [
      LibraryExercise(id: "seed", userId: nil, name: "Bench Press", muscleGroup: "chest", equipment: "barbell", kind: nil),
      LibraryExercise(id: "2", userId: nil, name: "Row", muscleGroup: "back", equipment: "Barbell", kind: nil),
      LibraryExercise(id: "3", userId: nil, name: "Fly", muscleGroup: "Ngực", equipment: "cable", kind: nil),
    ]
    let g = try await ExerciseGuides.fetch(Source([seed]), userId: "u1", exerciseId: "seed", name: "", lang: .vi)
    let subject = GuideRelated.Subject(g)
    #expect(GuideRelated.sameEquipment(lib, subject).map(\.id) == ["2"])
    #expect(GuideRelated.sameMuscle(lib, subject).map(\.id) == ["3"])
  }
}
