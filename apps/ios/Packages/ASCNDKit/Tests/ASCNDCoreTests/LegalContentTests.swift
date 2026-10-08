import Foundation
import Testing

/// Màn Pháp lý của Cài đặt (#527 Phase 8, `app/legal.tsx`) đọc BỐN tài liệu
/// từ `legal-content.json` — tệp chép máy từ RN (`tools/legal-content/gen.mjs
/// --check` giữ nó khớp). Ở đây: hình dạng mà `LegalContent` giải mã phải đủ
/// ở cả ba ngôn ngữ, để màn không bao giờ mở ra một tab trống hay hỏng giải mã
/// (khi ấy cả màn trống — `LegalContent.load` trả `nil`).
struct LegalContentTests {
  private struct Block: Decodable {
    let title: String
    let intro: String?
    let body: String?
    let bullets: [String]?
  }

  private struct Doc: Decodable {
    let title: String
    let blocks: [Block]
  }

  /// Cùng hình dạng với `LegalContent` của app.
  private struct Content: Decodable {
    let pageTitle: String
    let tabTerms: String
    let tabPrivacy: String
    let tabHealth: String
    let tabData: String
    let terms: Doc
    let privacy: Doc
    let health: Doc
    let data: Doc
  }

  private struct File: Decodable {
    let vi: Content
    let en: Content
    let es: Content
  }

  private func load() throws -> File {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // LegalContentTests.swift
      .deletingLastPathComponent()  // ASCNDCoreTests
      .deletingLastPathComponent()  // Tests
      .deletingLastPathComponent()  // ASCNDKit
      .deletingLastPathComponent()  // Packages
      .appendingPathComponent("ASCND/Resources/legal-content.json")
    return try JSONDecoder().decode(File.self, from: Data(contentsOf: url))
  }

  @Test func everyLanguageHasAllFourDocuments() throws {
    let file = try load()
    for (lang, c) in [("vi", file.vi), ("en", file.en), ("es", file.es)] {
      #expect(!c.pageTitle.isEmpty, "\(lang) pageTitle")
      let tabs = [c.tabTerms, c.tabPrivacy, c.tabHealth, c.tabData]
      #expect(tabs.allSatisfy { !$0.isEmpty }, "\(lang) tabs")
      #expect(Set(tabs).count == 4, "\(lang): bốn tab phải phân biệt được")
      for (name, doc) in [("terms", c.terms), ("privacy", c.privacy), ("health", c.health), ("data", c.data)] {
        #expect(!doc.title.isEmpty, "\(lang).\(name) title")
        #expect(!doc.blocks.isEmpty, "\(lang).\(name) không có khối nào")
        for b in doc.blocks {
          #expect(!b.title.isEmpty, "\(lang).\(name) khối không tiêu đề")
          // Một khối chỉ có tiêu đề là khối rỗng trên màn.
          #expect(b.body != nil || b.intro != nil || !(b.bullets ?? []).isEmpty, "\(lang).\(name): \(b.title)")
        }
      }
    }
  }

  /// Khối đầu của Sức khoẻ là lời cảnh báo y tế mà màn viền đỏ (RN `warnCard`).
  @Test func healthOpensWithTheMedicalWarning() throws {
    let file = try load()
    #expect(file.vi.health.blocks.first?.title.isEmpty == false)
    #expect(file.en.health.blocks.count == file.vi.health.blocks.count)
    #expect(file.es.health.blocks.count == file.vi.health.blocks.count)
  }
}
