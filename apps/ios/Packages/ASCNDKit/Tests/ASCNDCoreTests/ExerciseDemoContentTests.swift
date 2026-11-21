@testable import ASCNDCore
import Foundation
import Testing

/// Các khối nội dung 3D (20/11): tệp thật trong `Resources/ExerciseDemos` đọc được bằng đúng kiểu app dùng.
struct ExerciseDemoContentTests {
  static let folder: URL = {
    var u = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { u.deleteLastPathComponent() }  // Tests/ASCNDCoreTests/<file> → apps/ios
    return u.appending(path: "ASCND/Resources/ExerciseDemos")
  }()

  struct Index: Decodable { let schema: Int; let demos: [String]; let files: [String: String] }
  struct Core: Decodable { let id: String; let modules: [String: String] }

  static func data(_ name: String) throws -> Data { try Data(contentsOf: folder.appending(path: "\(name).json")) }

  @Test func everyListedModuleDecodesWithAllLanguages() throws {
    let index = try JSONDecoder().decode(Index.self, from: Self.data("demo3d_index"))
    #expect(index.schema == 2 && !index.demos.isEmpty)
    var seen = 0
    for id in index.demos {
      let core = try JSONDecoder().decode(Core.self, from: Self.data("\(id)_demo"))
      #expect(core.id == id)
      for (kind, file) in core.modules {
        #expect(index.files[file] != nil, "\(file) thiếu trong mục lục")
        let d = try Self.data(file)
        switch kind {
        case "tips":
          let f = try #require(ExerciseDemoContent.decode(ExerciseDemoContent.TipsFile.self, from: d))
          #expect(f.exercise == id && !f.tips.isEmpty)
          for t in f.tips { #expect(Set(t.text.keys) == Set(ExerciseDemoContent.languages), "\(id)/\(t.id)") }
        case "tempo":
          let f = try #require(ExerciseDemoContent.decode(ExerciseDemoContent.TempoFile.self, from: d))
          #expect(f.exercise == id && f.tempo.reps >= 1)
        case "mistakes":
          let f = try #require(ExerciseDemoContent.decode(ExerciseDemoContent.MistakesFile.self, from: d))
          for m in f.mistakes { #expect(Set(m.text.keys) == Set(ExerciseDemoContent.languages), "\(id)/\(m.id)") }
        default:
          Issue.record("khối lạ \(kind)")
        }
        seen += 1
      }
    }
    #expect(seen >= 10, "8 bài: 7 nhịp, 2 mẹo, 1 lỗi sai")
  }

  @Test func languageFallsBackToEnglish() {
    let byLang = ["en": "Hi", "vi": "Chào"]
    #expect(ExerciseDemoContent.pick(byLang, lang: "vi") == "Chào")
    #expect(ExerciseDemoContent.pick(byLang, lang: "es") == "Hi")
    #expect(ExerciseDemoContent.pick([String: String](), lang: "vi") == nil)
  }

  /// Tệp của bản nội dung mới hơn app: bỏ khối, không crash.
  @Test func newerSchemaIsSkipped() {
    let d = Data(#"{"schema":2,"exercise":"x","tips":[]}"#.utf8)
    #expect(ExerciseDemoContent.decode(ExerciseDemoContent.TipsFile.self, from: d) == nil)
    let ok = Data(#"{"schema":1,"exercise":"x","tips":[]}"#.utf8)
    #expect(ExerciseDemoContent.decode(ExerciseDemoContent.TipsFile.self, from: ok) != nil)
  }
}
