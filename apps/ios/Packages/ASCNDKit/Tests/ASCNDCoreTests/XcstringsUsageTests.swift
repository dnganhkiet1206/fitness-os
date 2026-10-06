// Cổng i18n chiều ngược — bổ sung #249 (B, #523).
//
// `XcstringsTests` kiểm khoá ĐÃ CÓ trong Localizable.xcstrings đủ en/vi/es.
// Test này kiểm chiều còn lại: mọi khoá mà code app dùng
// (`String(localized: "a.b")`, `Text("a.b")`, `Tab("a.b", …)`, …) phải có
// trong file. Thiếu thì UI và VoiceOver hiện thẳng tên khoá — #345 từng
// thiếu 15 khoá mà cổng #249 vẫn xanh.
//
// Chạy trong CI `core-linux` — chỉ đọc file, không cần UIKit/SwiftUI.
import Foundation
import Testing

struct XcstringsUsageTests {
  /// Khoá dạng `area.name` đứng một mình trong chuỗi literal (dấu `"` đóng
  /// ngay sau): `"lab.remaining \(n)"` không khớp — khoá thật của nó là
  /// `lab.remaining %lld`, do Xcode sinh từ interpolation.
  static let patterns = [
    #"localized:\s*"([A-Za-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]+)""#,
    #"\b(?:Text|Tab|Label|Button)\(\s*"([a-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]+)""#,
  ]

  /// Khoá dùng trong một file nguồn. Bỏ dòng chú thích (`//`, `///`).
  static func keys(in source: String) throws -> Set<String> {
    let code = source.split(separator: "\n", omittingEmptySubsequences: false)
      .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
      .joined(separator: "\n")
    let ns = NSString(string: code)
    var out = Set<String>()
    for p in patterns {
      let re = try NSRegularExpression(pattern: p)
      for m in re.matches(in: code, range: NSRange(location: 0, length: ns.length)) {
        out.insert(ns.substring(with: m.range(at: 1)))
      }
    }
    return out
  }

  /// apps/ios/
  private func iosDir() -> URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent() // XcstringsUsageTests.swift
      .deletingLastPathComponent() // ASCNDCoreTests
      .deletingLastPathComponent() // Tests
      .deletingLastPathComponent() // ASCNDKit
      .deletingLastPathComponent() // Packages
  }

  private func swiftFiles(under dir: URL) -> [URL] {
    guard let e = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)
    else { return [] }
    return e.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
  }

  private struct File: Decodable {
    struct Entry: Decodable {}
    let strings: [String: Entry]
  }

  @Test func scannerFindsKeysAndSkipsWhatIsNotAKey() throws {
    let sample = #"""
      Text(String(localized: "today.start"))
      Tab("tab.today", systemImage: "house", value: AppTab.today)
      Text("auth.title").font(.body)
      Button(String(localized: "async.retry")) {}
      Text(String(localized: "lab.remaining \(n)"))
      Image(systemName: "wifi.slash")
      Text("ASCND")
      // Text("zz.comment")
      """#
    let found = try Self.keys(in: sample)
    #expect(found == Set(["today.start", "tab.today", "auth.title", "async.retry"]))
  }

  @Test func everyKeyUsedInCodeExistsInXcstrings() throws {
    let ios = iosDir()
    let url = ios.appendingPathComponent("ASCND/Resources/Localizable.xcstrings")
    let known = Set(try JSONDecoder().decode(File.self, from: Data(contentsOf: url)).strings.keys)
    let roots = [
      ios.appendingPathComponent("ASCND"),
      ios.appendingPathComponent("Packages/ASCNDKit/Sources/ASCNDDesignSystem"),
    ]
    var files = 0
    var missing: [String: Set<String>] = [:]
    for root in roots {
      for f in swiftFiles(under: root) {
        files += 1
        for k in try Self.keys(in: String(contentsOf: f, encoding: .utf8)) where !known.contains(k) {
          missing[k, default: []].insert(f.lastPathComponent)
        }
      }
    }
    try #require(files > 0, "không tìm thấy file Swift nào dưới apps/ios/ASCND")
    for (k, names) in missing.sorted(by: { $0.key < $1.key }) {
      Issue.record("khoá '\(k)' dùng trong \(names.sorted().joined(separator: ", ")) nhưng không có trong Localizable.xcstrings")
    }
  }
}
