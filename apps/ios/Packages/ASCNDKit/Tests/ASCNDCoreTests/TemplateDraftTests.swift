@testable import ASCNDCore
import Foundation
import Testing

/// Builder buổi tập (#527 Phase 2) so với `app/workout-builder.tsx` @ fac9ac2
/// (`Fixtures/builder-golden.json`, sinh bằng `tools/insights-golden/gen-builder.mjs`).
struct TemplateDraftGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "builder-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func groups(_ v: JSONValue?) -> [MuscleGroup] {
    guard case .array(let a)? = v else { return [] }
    return a.compactMap { $0.stringValue.flatMap(MuscleGroup.init(rawValue:)) }
  }

  /// `inferType` trên đủ 1024 tổ hợp nhóm cơ.
  @Test func inferTypeMatchesRN() throws {
    guard case .array(let cases)? = try Self.golden()["types"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 1024)
    for c in cases {
      let set = Set(Self.groups(c["groups"]))
      #expect(TemplateDraft.inferType(set).rawValue == c["type"]?.stringValue, "\(set.map(\.rawValue).sorted())")
    }
  }

  /// Xếp hạng nhóm cơ cho tên gợi ý + dạng tên + loại gợi ý.
  @Test func rankingAndNameShapeMatchRN() throws {
    guard case .array(let cases)? = try Self.golden()["rankings"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 18)
    for c in cases {
      guard case .array(let raw)? = c["groups"] else { continue }
      let input = raw.map(\.stringValue)
      let ranked = TemplateDraft.ranking(input)
      #expect(ranked == Self.groups(c["ranked"]), "\(input)")
      let shape: String = switch TemplateDraft.nameShape(itemCount: input.count, ranked: ranked) {
      case .none: "none"
      case .title: "title"
      case .fullBody: "fullBody"
      case .one: "one"
      case .two: "two"
      }
      #expect(shape == c["shape"]?.stringValue, "\(input)")
      #expect(TemplateDraft.inferType(Set(ranked)).rawValue == c["type"]?.stringValue, "\(input)")
    }
  }

  /// `estimatedMinutes` (`prescription.ts:86`), kể cả trường thiếu.
  @Test func estimatedMinutesMatchesRN() throws {
    guard case .array(let cases)? = try Self.golden()["minutes"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 9)
    for c in cases {
      guard case .array(let items)? = c["items"] else { continue }
      let rows = items.map { ($0["sets"]?.intValue, $0["reps"]?.intValue, $0["restSeconds"]?.intValue) }
      #expect(TemplateDraft.estimatedMinutes(rows) == c["minutes"]?.intValue)
    }
  }

  /// Lọc thư viện theo nhóm + chữ tìm.
  @Test func visibleMatchesRN() throws {
    let g = try Self.golden()
    guard case .array(let rawLib)? = g["library"], case .array(let cases)? = g["filters"] else {
      throw CocoaError(.fileReadCorruptFile)
    }
    let lib = rawLib.map {
      LibraryExercise(
        id: $0["id"]?.stringValue ?? "", userId: nil, name: $0["name"]?.stringValue ?? "",
        muscleGroup: $0["muscle_group"]?.stringValue, equipment: nil, kind: nil)
    }
    #expect(cases.count == 66)
    for c in cases {
      let group = c["group"]?.stringValue.flatMap(MuscleGroup.init(rawValue:))
      let search = c["search"]?.stringValue ?? ""
      let ids = TemplateDraft.visible(lib, group: group, search: search).map(\.id)
      guard case .array(let want)? = c["ids"] else { continue }
      #expect(ids == want.compactMap(\.stringValue), "\(String(describing: group)) '\(search)'")
    }
  }
}

struct TemplateDraftTests {
  /// Chạm thêm với mặc định `DEFAULTS`; chạm lần nữa thì bỏ.
  @Test func toggleAddsWithDefaultsThenRemoves() {
    var d = TemplateDraft()
    d.toggle(id: "a", name: "Bench")
    d.toggle(id: "b", name: "Row")
    #expect(d.items.map(\.exerciseName) == ["Bench", "Row"])
    let e = d.items[0]
    #expect(e.sets == 3 && e.reps == 10 && e.weightKg == 0 && e.rpe == 7 && e.restSeconds == 90)
    d.toggle(id: "a", name: "Bench")
    #expect(d.items.map(\.exerciseId) == ["b"])
    #expect(d.totalSets == 3)
  }

  @Test func patchMoveRemove() {
    var d = TemplateDraft()
    for (id, n) in [("a", "A"), ("b", "B"), ("c", "C")] { d.toggle(id: id, name: n) }
    d.patch(1, sets: 5, weightKg: 62.5)
    #expect(d.items[1].sets == 5 && d.items[1].weightKg == 62.5 && d.items[1].reps == 10)
    d.move(from: 0, to: 2)
    #expect(d.items.map(\.exerciseName) == ["B", "C", "A"])
    d.move(from: 0, to: 3)
    #expect(d.items.map(\.exerciseName) == ["B", "C", "A"], "ngoài danh sách: không làm gì")
    d.remove(at: 1)
    #expect(d.items.map(\.exerciseName) == ["B", "A"])
    d.patch(9, sets: 1)
    #expect(d.totalSets == 8)
  }

  /// Tên gõ thắng gợi ý; để trống (hay chỉ khoảng trắng) thì về gợi ý.
  @Test func finalNameFallsBackToSuggestion() {
    var d = TemplateDraft()
    #expect(d.finalName(suggested: "Ngực") == "Ngực")
    d.nameTouched = true
    d.name = "  Push A "
    #expect(d.finalName(suggested: "Ngực") == "Push A")
    d.name = "   "
    #expect(d.finalName(suggested: "Ngực") == "Ngực")
  }

  /// Chọn loại tay thắng loại gợi ý.
  @Test func pickedTypeWins() {
    var d = TemplateDraft()
    #expect(d.type(ranked: [.chest]) == .push)
    d.pickedType = .strength
    #expect(d.type(ranked: [.chest]) == .strength)
  }

  /// Nút ± của ô tạ: bước theo đơn vị đang hiện, lưu kg 2 chữ số lẻ.
  @Test func loadStepsInTheShownUnit() {
    #expect(TemplateDraft.stepLoad(60, unit: .kg, up: true) == 62.5)
    #expect(TemplateDraft.stepLoad(0, unit: .kg, up: false) == 0, "không âm")
    #expect(TemplateDraft.stepLoad(500, unit: .kg, up: true) == 500)
    #expect(TemplateDraft.stepLoad(60, unit: .lbs, up: true) == 62.28, "132.3 + 5 = 137.3 lb → 62.278… → 62.28 kg")
  }

  /// Danh sách buổi tập (`templates.tsx:57`): mới trước, tìm theo tên hoặc loại.
  @Test func listSearchesNameOrTypeNewestFirst() {
    let t = [
      WorkoutTemplate(id: "a", name: "Push A", exercises: [], type: "push", createdAt: EpochMillis(1)),
      WorkoutTemplate(id: "b", name: "Legs", exercises: [], type: "legs", createdAt: EpochMillis(3)),
      WorkoutTemplate(id: "c", name: "Arms", exercises: [], type: "upper", createdAt: EpochMillis(2)),
    ]
    #expect(TemplateDraft.listed(t, search: "").map(\.id) == ["b", "c", "a"])
    #expect(TemplateDraft.listed(t, search: " PUSH ").map(\.id) == ["a"])
    #expect(TemplateDraft.listed(t, search: "upp").map(\.id) == ["c"], "khớp theo loại")
    #expect(TemplateDraft.listed(t, search: "zzz").isEmpty)
  }
}
