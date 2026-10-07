#if canImport(ObjectiveC)
  @testable import ASCNDCore
  import Foundation
  import Testing

  // THỬ NGHIỆM (nhánh probe, không merge), lượt 2.

  nonisolated(unsafe) var probeLocale = Locale(identifier: "vi")

  extension String {
    /// Che `String(localized:bundle:)` của Foundation: đi qua
    /// LocalizedStringResource có locale (cách D đã chứng minh).
    init(localized key: String.LocalizationValue, bundle: Bundle) {
      self.init(localized: LocalizedStringResource(key, locale: probeLocale, bundle: .atURL(bundle.bundleURL)))
    }
  }

  @Suite(.serialized)
  struct L10nProbeTests {
    static func bundle() throws -> Bundle {
      let url = try #require(Bundle.module.url(forResource: "l10n", withExtension: nil, subdirectory: "Fixtures"))
      return try #require(Bundle(path: url.path))
    }

    @Test func probeShadow() throws {
      let b = try Self.bundle()
      for code in ["vi", "es", "en"] {
        probeLocale = Locale(identifier: code)
        print("PROBE S shadow \(code):", String(localized: "hello", bundle: b))
        print("PROBE S2 shadow interp \(code):", String(localized: "sets \(3)", bundle: b))
        let res = LocalizedStringResource("sets \(4)", locale: Locale(identifier: code), bundle: .atURL(b.bundleURL))
        print("PROBE D2 resource interp \(code):", String(localized: res))
        // Đường Foundation gốc (đủ tham số) — để so.
        print("PROBE F foundation \(code):", String(localized: "hello", table: nil, bundle: b, locale: Locale(identifier: code), comment: nil))
      }
    }
  }
#endif
