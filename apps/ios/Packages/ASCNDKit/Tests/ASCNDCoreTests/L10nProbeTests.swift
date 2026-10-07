#if canImport(ObjectiveC)
  @testable import ASCNDCore
  import Foundation
  import ObjectiveC
  import Testing

  /// THỬ NGHIỆM (nhánh probe, không merge): cơ chế nào làm `String(localized:)`
  /// đổi ngôn ngữ trên Foundation thật. In kết quả từng cách.
  @Suite(.serialized)
  struct L10nProbeTests {
    final class PrefBundle: Bundle, @unchecked Sendable {
      nonisolated(unsafe) static var code = "vi"
      override var preferredLocalizations: [String] { [Self.code] }
      override var localizations: [String] { [Self.code] }
    }

    static func bundle() throws -> Bundle {
      let url = try #require(Bundle.module.url(forResource: "l10n", withExtension: nil, subdirectory: "Fixtures"))
      return try #require(Bundle(path: url.path))
    }

    @Test func probeAll() throws {
      let b = try Self.bundle()
      print("PROBE base:", String(localized: "hello", bundle: b), "| pref:", b.preferredLocalizations, "| locs:", b.localizations)
      for code in ["vi", "es", "en"] {
        let loc = Locale(identifier: code)
        print("PROBE A locale-param \(code):", String(localized: "hello", bundle: b, locale: loc))
        print("PROBE A2 locale-param interp \(code):", String(localized: "sets \(3)", bundle: b, locale: loc))
        let res = LocalizedStringResource("hello", locale: loc, bundle: .atURL(b.bundleURL))
        print("PROBE D resource \(code):", String(localized: res))
      }
      let b2 = try Self.bundle()
      object_setClass(b2, PrefBundle.self)
      for code in ["vi", "es"] {
        PrefBundle.code = code
        print("PROBE B preferredLocalizations-override \(code):", String(localized: "hello", bundle: b2), "| NSLocalized:", NSLocalizedString("hello", bundle: b2, comment: ""))
      }
    }
  }
#endif
