// Cổng i18n cho bản iOS — C sở hữu (#249).
//
// Bản RN có bước cổng i18n (namespace, đủ ngôn ngữ); test này là bản iOS:
// đọc `apps/ios/ASCND/Resources/Localizable.xcstrings` và đỏ khi
// một khoá thiếu en/vi/es, bản dịch rỗng/chưa dịch, hoặc khoá không
// theo dạng `area.name`.
//
// Chạy trong CI `core-linux` (swift test trên Linux) — chỉ đọc JSON,
// không cần UIKit/SwiftUI.
import Foundation
import Testing

struct XcstringsTests {
  private static let requiredLocales = ["en", "vi", "es"]

  private func xcstringsURL() throws -> URL {
    // Tests/ASCNDCoreTests/ → ../../../../.. = apps/ios/
    let thisFile = URL(fileURLWithPath: #filePath)
    let iosDir = thisFile
      .deletingLastPathComponent() // XcstringsTests.swift
      .deletingLastPathComponent() // ASCNDCoreTests
      .deletingLastPathComponent() // Tests
      .deletingLastPathComponent() // ASCNDKit
      .deletingLastPathComponent() // Packages
    return iosDir.appendingPathComponent("ASCND/Resources/Localizable.xcstrings")
  }

  private struct Entry: Decodable {
    struct Localization: Decodable {
      struct StringUnit: Decodable {
        let state: String
        let value: String
      }
      let stringUnit: StringUnit?
    }
    let localizations: [String: Localization]?
  }

  private struct File: Decodable {
    let strings: [String: Entry]
  }

  private func load() throws -> [String: Entry] {
    let url = try xcstringsURL()
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(File.self, from: data).strings
  }

  @Test func everyKeyHasEnViEs() throws {
    let strings = try load()
    #require(!strings.isEmpty, "không đọc được khoá nào từ Localizable.xcstrings")
    for (key, entry) in strings.sorted(by: { $0.key < $1.key }) {
      let locales = entry.localizations ?? [:]
      for locale in Self.requiredLocales {
        #expect(locales[locale] != nil, "khoá '\(key)' thiếu bản dịch '\(locale)'")
      }
    }
  }

  @Test func noEmptyOrUntranslated() throws {
    let strings = try load()
    for (key, entry) in strings.sorted(by: { $0.key < $1.key }) {
      for (locale, loc) in (entry.localizations ?? [:]).sorted(by: { $0.key < $1.key }) {
        guard let unit = loc.stringUnit else {
          Issue.record("khoá '\(key)' [\(locale)]: không có stringUnit")
          continue
        }
        #expect(!unit.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                "khoá '\(key)' [\(locale)]: bản dịch rỗng")
        #expect(unit.state == "translated",
                "khoá '\(key)' [\(locale)]: state '\(unit.state)' ≠ translated")
      }
    }
  }

  @Test func keysFollowAreaNameFormat() throws {
    let strings = try load()
    for key in strings.keys.sorted() {
      let parts = key.split(separator: ".")
      #expect(parts.count >= 2 && parts.allSatisfy({ !$0.isEmpty }),
              "khoá '\(key)' không theo dạng area.name")
    }
  }
}
