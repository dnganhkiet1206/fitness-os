@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Testing

/// KOA-T53: ánh xạ lỗi kinh tế dò cụm chữ trong `RAISE EXCEPTION`. Test này đọc thẳng `supabase/migrations/`
/// và khẳng định mỗi cụm của `SupabaseMascotEconomy.raisePhrases` còn nằm trong ít nhất một câu `RAISE` —
/// sửa câu chữ SQL mà quên app thì đỏ ở đây, không lặng lẽ thành `.server`.
struct MascotRaiseContractTests {
  static var migrations: URL {
    // …/apps/ios/Packages/ASCNDBackend/Tests/ASCNDBackendTests/<tệp> → gốc repo
    URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("../../../../../../supabase/migrations").standardized
  }

  @Test func everyPhraseIsStillRaisedBySQL() throws {
    let dir = Self.migrations
    let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "sql" }
    #expect(files.count > 50, "không tìm thấy thư mục migration ở \(dir.path)")
    let raises = try files.flatMap { url -> [String] in
      let sql = try String(contentsOf: url, encoding: .utf8).lowercased()
      return sql.components(separatedBy: "raise exception").dropFirst().map { String($0.prefix(240)) }
    }
    for (phrase, failure) in SupabaseMascotEconomy.raisePhrases {
      #expect(raises.contains { $0.contains(phrase) }, "không câu RAISE nào còn chứa \"\(phrase)\" (\(failure))")
    }
  }

  @Test func everyPhraseMapsToItsFailure() {
    for (phrase, failure) in SupabaseMascotEconomy.raisePhrases {
      #expect(SupabaseMascotEconomy.failure(message: "ERROR: \(phrase.uppercased()) x", code: "P0001") == failure)
    }
    #expect(SupabaseMascotEconomy.failure(message: "something else", code: "XX000") == .server(code: "XX000"))
  }
}
